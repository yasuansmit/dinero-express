// server.js - Servidor de la Plataforma de Rifas Nequi
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Asegurar carpeta para comprobantes subidos
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Lista de conexiones activas Server-Sent Events (SSE)
const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Obtener configuración actual
function getConfig() {
  return db.prepare('SELECT * FROM config WHERE id = 1').get();
}

// Liberar automáticamente números vencidos (> 20 min)
function cleanExpiredReservations() {
  const cfg = getConfig();
  const limitTime = Date.now() - (cfg.reserve_minutes * 60 * 1000);

  // Buscar reservas que hayan caducado
  const expired = db.prepare(`
    SELECT num FROM numbers 
    WHERE status = 'reserved' AND reserved_at IS NOT NULL AND reserved_at < ?
  `).all(limitTime);

  if (expired.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE numbers 
      SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, proof_image = NULL 
      WHERE num = ?
    `);

    const releasedNumbers = [];
    for (const row of expired) {
      updateStmt.run(row.num);
      releasedNumbers.push(row.num);
    }

    // Notificar a todos los usuarios conectados en vivo
    broadcastEvent('numbers_released', {
      numbers: releasedNumbers,
      message: 'Algunas reservas expiraron y volvieron a estar disponibles.'
    });
  }
}

// Ejecutar limpieza cada 15 segundos
setInterval(cleanExpiredReservations, 15000);

// Endpoint SSE para actualizaciones en vivo
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': connected\n\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Middleware de autenticación de admin
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  const cfg = getConfig();
  if (!pin || String(pin).trim() !== String(cfg.admin_pin).trim()) {
    return res.status(401).json({ error: 'PIN de administrador no válido.' });
  }
  next();
}

// --- ENDPOINTS PÚBLICOS ---

// Obtener datos públicos de la rifa y estado de los números
app.get('/api/raffle', (req, res) => {
  cleanExpiredReservations();
  const cfg = getConfig();
  const rows = db.prepare('SELECT num, status, reserved_at FROM numbers ORDER BY num ASC').all();

  const now = Date.now();
  const ttlMs = cfg.reserve_minutes * 60 * 1000;

  const numbers = rows.map(r => {
    let timeLeft = 0;
    if (r.status === 'reserved' && r.reserved_at) {
      const expiresAt = r.reserved_at + ttlMs;
      timeLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
    }
    return {
      num: r.num,
      status: r.status,
      timeLeft: r.status === 'reserved' ? timeLeft : null
    };
  });

  res.json({
    config: {
      name: cfg.name,
      prize: cfg.prize,
      price: cfg.price,
      nequi: cfg.nequi,
      totalNumbers: cfg.total_numbers,
      reserveMinutes: cfg.reserve_minutes
    },
    numbers
  });
});

// Reservar números (atómico, seguro contra condiciones de carrera)
app.post('/api/reserve', (req, res) => {
  cleanExpiredReservations();

  const { numbers, name, phone } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos un número.' });
  }

  const cleanName = (name || '').trim();
  const cleanPhone = (phone || '').replace(/\D/g, '');

  if (!cleanName || cleanPhone.length < 7) {
    return res.status(400).json({ error: 'Por favor ingresa tu nombre y un celular válido.' });
  }

  const cfg = getConfig();
  if (!cfg.nequi) {
    return res.status(400).json({ error: 'La organizadora aún no ha configurado el número de Nequi.' });
  }

  // Transacción manual con SQLite
  db.exec('BEGIN TRANSACTION;');
  try {
    const checkStmt = db.prepare('SELECT num, status FROM numbers WHERE num = ?');
    const unavailable = [];

    for (const num of numbers) {
      const row = checkStmt.get(num);
      if (!row || row.status !== 'free') {
        unavailable.push(num);
      }
    }

    if (unavailable.length > 0) {
      db.exec('ROLLBACK;');
      return res.status(409).json({
        error: `Los siguientes números ya no están disponibles: ${unavailable.join(', ')}. Por favor elige otros.`,
        unavailable
      });
    }

    const now = Date.now();
    const reserveStmt = db.prepare(`
      UPDATE numbers 
      SET status = 'reserved', buyer_name = ?, buyer_phone = ?, reserved_at = ? 
      WHERE num = ?
    `);

    for (const num of numbers) {
      reserveStmt.run(cleanName, cleanPhone, now, num);
    }

    db.exec('COMMIT;');

    // Notificar a todos en tiempo real
    broadcastEvent('numbers_updated', {
      action: 'reserved',
      numbers: numbers,
      buyerName: cleanName
    });

    const totalAmount = numbers.length * cfg.price;
    const expiresAt = now + (cfg.reserve_minutes * 60 * 1000);
    const refCode = 'RF-' + Math.floor(1000 + Math.random() * 9000);

    // Mensaje de WhatsApp precargado y profesional
    const formattedNumbers = numbers.map(n => String(n).padStart(2, '0')).join(', ');
    const waText = `🎟️ *COMPROBANTE DE RESERVA - ${refCode}*\n\n` +
      `👤 *Participante:* ${cleanName}\n` +
      `📱 *Celular:* ${cleanPhone}\n` +
      `🎯 *Número(s) elegidos:* ${formattedNumbers}\n` +
      `💵 *Total transferido:* $${totalAmount.toLocaleString('es-CO')} COP\n` +
      `📌 *Rifa:* ${cfg.name}\n\n` +
      `Adjunto el comprobante de pago de mi app Nequi para confirmación. ¡Muchas gracias!`;
    const waUrl = `https://wa.me/57${cfg.nequi}?text=${encodeURIComponent(waText)}`;

    res.json({
      success: true,
      refCode,
      buyerName: cleanName,
      buyerPhone: cleanPhone,
      reservedNumbers: numbers,
      totalAmount,
      nequi: cfg.nequi,
      expiresAt,
      reserveMinutes: cfg.reserve_minutes,
      waUrl
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    console.error('Error al reservar:', err);
    res.status(500).json({ error: 'Hubo un error procesando tu reserva. Intenta de nuevo.' });
  }
});

// Subir comprobante de pago directo
app.post('/api/upload-proof', (req, res) => {
  const { numbers, imageBase64 } = req.body;
  if (!Array.isArray(numbers) || !numbers.length || !imageBase64) {
    return res.status(400).json({ error: 'Datos de comprobante incompletos.' });
  }

  try {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('png')) ext = 'png';
      else if (mime.includes('webp')) ext = 'webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const filename = `proof_${Date.now()}_${numbers[0]}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${filename}`;
    const stmt = db.prepare('UPDATE numbers SET proof_image = ? WHERE num = ?');
    for (const num of numbers) {
      stmt.run(relativeUrl, num);
    }

    broadcastEvent('numbers_updated', { action: 'proof_uploaded', numbers });
    res.json({ success: true, proofUrl: relativeUrl });
  } catch (err) {
    console.error('Error guardando comprobante:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen del comprobante.' });
  }
});

// --- ENDPOINTS ADMINISTRATIVOS ---

// Verificar PIN
app.post('/api/admin/verify', (req, res) => {
  const { pin } = req.body;
  const cfg = getConfig();
  if (pin && String(pin).trim() === String(cfg.admin_pin).trim()) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'PIN incorrecto' });
});

// Obtener datos completos para el panel
app.get('/api/admin/data', requireAdmin, (req, res) => {
  cleanExpiredReservations();
  const cfg = getConfig();
  const rows = db.prepare('SELECT * FROM numbers ORDER BY num ASC').all();

  let freeCount = 0;
  let reservedCount = 0;
  let paidCount = 0;

  const now = Date.now();
  const ttlMs = cfg.reserve_minutes * 60 * 1000;

  const buyers = [];

  for (const r of rows) {
    if (r.status === 'free') {
      freeCount++;
    } else if (r.status === 'reserved') {
      reservedCount++;
      const expiresAt = (r.reserved_at || now) + ttlMs;
      const timeLeftSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
      buyers.push({
        num: r.num,
        status: r.status,
        name: r.buyer_name,
        phone: r.buyer_phone,
        reservedAt: r.reserved_at,
        timeLeftSec,
        proofImage: r.proof_image
      });
    } else if (r.status === 'paid') {
      paidCount++;
      buyers.push({
        num: r.num,
        status: r.status,
        name: r.buyer_name,
        phone: r.buyer_phone,
        paidAt: r.paid_at,
        proofImage: r.proof_image
      });
    }
  }

  const collectedAmount = paidCount * cfg.price;
  const potentialAmount = (paidCount + reservedCount) * cfg.price;
  const totalGoal = cfg.total_numbers * cfg.price;

  res.json({
    config: {
      name: cfg.name,
      prize: cfg.prize,
      price: cfg.price,
      nequi: cfg.nequi,
      totalNumbers: cfg.total_numbers,
      reserveMinutes: cfg.reserve_minutes
    },
    stats: {
      free: freeCount,
      reserved: reservedCount,
      paid: paidCount,
      collectedAmount,
      potentialAmount,
      totalGoal,
      percentPaid: Math.round((paidCount / cfg.total_numbers) * 100)
    },
    buyers
  });
});

// Actualizar configuración de la rifa
app.put('/api/admin/config', requireAdmin, (req, res) => {
  const { name, prize, price, nequi, admin_pin, reserve_minutes } = req.body;

  const current = getConfig();
  const newName = (name || current.name).trim();
  const newPrize = (prize || current.prize).trim();
  const newPrice = parseInt(price, 10) || current.price;
  const newNequi = (nequi || current.nequi).replace(/\D/g, '');
  const newPin = (admin_pin || current.admin_pin).trim();
  const newReserveMinutes = parseInt(reserve_minutes, 10) || current.reserve_minutes;

  db.prepare(`
    UPDATE config 
    SET name = ?, prize = ?, price = ?, nequi = ?, admin_pin = ?, reserve_minutes = ?, updated_at = ?
    WHERE id = 1
  `).run(newName, newPrize, newPrice, newNequi, newPin, newReserveMinutes, Date.now());

  broadcastEvent('config_updated', {
    name: newName,
    prize: newPrize,
    price: newPrice,
    nequi: newNequi
  });

  res.json({ success: true, message: 'Configuración guardada correctamente.' });
});

// Cambiar estado de un número (pagado o liberar)
app.post('/api/admin/set-status', requireAdmin, (req, res) => {
  const { num, status } = req.body; // status: 'paid' | 'free'

  if (!num || !['paid', 'free'].includes(status)) {
    return res.status(400).json({ error: 'Parámetros no válidos.' });
  }

  if (status === 'paid') {
    db.prepare(`
      UPDATE numbers 
      SET status = 'paid', paid_at = ?
      WHERE num = ?
    `).run(Date.now(), num);
  } else if (status === 'free') {
    db.prepare(`
      UPDATE numbers 
      SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, paid_at = NULL, proof_image = NULL 
      WHERE num = ?
    `).run(num);
  }

  broadcastEvent('numbers_updated', {
    action: status,
    numbers: [num]
  });

  res.json({ success: true });
});

// Exportar lista de compradores a archivo CSV para Excel
app.get('/api/admin/export-csv', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT num, status, buyer_name, buyer_phone, reserved_at, paid_at 
    FROM numbers 
    WHERE status != 'free' 
    ORDER BY num ASC
  `).all();

  let csv = 'Numero,Estado,Comprador,Celular,Fecha_Reserva,Fecha_Pago\n';
  for (const r of rows) {
    const resDate = r.reserved_at ? new Date(r.reserved_at).toLocaleString('es-CO') : '';
    const paidDate = r.paid_at ? new Date(r.paid_at).toLocaleString('es-CO') : '';
    const cleanBuyer = (r.buyer_name || '').replace(/,/g, ' ');
    csv += `${String(r.num).padStart(2, '0')},${r.status === 'paid' ? 'PAGADO' : 'PENDIENTE'},"${cleanBuyer}",${r.buyer_phone || ''},"${resDate}","${paidDate}"\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rifa-compradores.csv"');
  res.send('\uFEFF' + csv); // BOM para que Excel abra acentos en UTF-8 perfectamente
});

// Sorteo digital entre números PAGADOS
app.post('/api/admin/draw-winner', requireAdmin, (req, res) => {
  const paidNumbers = db.prepare(`
    SELECT num, buyer_name, buyer_phone 
    FROM numbers 
    WHERE status = 'paid'
  `).all();

  if (paidNumbers.length === 0) {
    return res.status(400).json({ error: 'No hay boletos con estado PAGADO para realizar el sorteo.' });
  }

  const winnerIndex = Math.floor(Math.random() * paidNumbers.length);
  const winner = paidNumbers[winnerIndex];

  res.json({
    success: true,
    totalEligible: paidNumbers.length,
    winner: {
      num: winner.num,
      name: winner.buyer_name,
      phone: winner.buyer_phone
    }
  });
});

// Reiniciar rifa completa
app.post('/api/admin/reset-all', requireAdmin, (req, res) => {
  db.prepare(`
    UPDATE numbers 
    SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, paid_at = NULL
  `).run();

  broadcastEvent('raffle_reset', {});
  res.json({ success: true, message: 'Todos los números han sido liberados.' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de rifas corriendo exitosamente en http://localhost:${PORT}`);
});
