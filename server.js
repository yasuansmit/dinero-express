// server.js - Servidor DINERO EXPRESS con Multi-Tabla y Pozo Acumulado
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// --- SSE ---
const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

// --- Helpers ---
function getConfig() {
  return db.prepare('SELECT * FROM config WHERE id = 1').get();
}

function getTables() {
  return db.prepare('SELECT * FROM raffle_tables ORDER BY id ASC').all();
}

function getTable(id) {
  return db.prepare('SELECT * FROM raffle_tables WHERE id = ?').get(id);
}

function getWaLink(phone, msg) {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  if (clean.startsWith('57') && clean.length > 10) clean = clean.slice(2);
  return `https://wa.me/57${clean}?text=${encodeURIComponent(msg)}`;
}

// --- Limpieza de reservas vencidas ---
function cleanExpiredReservations() {
  const cfg = getConfig();
  const limitTime = Date.now() - (cfg.reserve_minutes * 60 * 1000);
  const expired = db.prepare(`
    SELECT id, table_id, num FROM numbers 
    WHERE status = 'reserved' AND reserved_at IS NOT NULL AND reserved_at < ?
  `).all(limitTime);

  if (expired.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE numbers SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, proof_image = NULL 
      WHERE id = ?
    `);
    const releasedNumbers = [];
    for (const row of expired) {
      updateStmt.run(row.id);
      releasedNumbers.push({ tableId: row.table_id, num: row.num });
    }
    broadcastEvent('numbers_released', { numbers: releasedNumbers });
  }
}
setInterval(cleanExpiredReservations, 15000);

// --- SSE Endpoint ---
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// --- Control de Intentos de Acceso y Anti-Spam ---
const loginAttempts = new Map();
const reserveRateLimits = new Map();

function checkReserveRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 8;
  const timestamps = (reserveRateLimits.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  reserveRateLimits.set(ip, timestamps);
  return true;
}

// --- Admin Auth ---
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  const cfg = getConfig();
  if (!pin || String(pin).trim() !== String(cfg.admin_pin).trim()) {
    return res.status(401).json({ error: 'PIN de administrador no válido.' });
  }
  next();
}

// ===================== ENDPOINTS PÚBLICOS =====================

// GET /api/raffle - Datos públicos con todas las tablas
app.get('/api/raffle', (req, res) => {
  const cfg = getConfig();
  const tables = getTables();
  const now = Date.now();
  const ttlMs = cfg.reserve_minutes * 60 * 1000;

  const tablesData = tables.map(t => {
    const rows = db.prepare('SELECT num, status, reserved_at FROM numbers WHERE table_id = ? ORDER BY num ASC').all(t.id);
    const numbers = rows.map(r => {
      let timeLeft = 0;
      if (r.status === 'reserved' && r.reserved_at) {
        const expiresAt = r.reserved_at + ttlMs;
        timeLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
      }
      return { num: r.num, status: r.status, timeLeft: r.status === 'reserved' ? timeLeft : null };
    });

    let winners = null;
    if (t.winners_json) {
      try { winners = JSON.parse(t.winners_json); } catch {}
    }

    return {
      id: t.id,
      name: t.name,
      totalNumbers: t.total_numbers,
      isActive: !!t.is_active,
      pozoAmount: t.pozo_amount,
      pozoWon: !!t.pozo_won,
      pozoWinnerName: t.pozo_winner_name,
      winners,
      numbers
    };
  });

  res.json({
    config: {
      name: cfg.name,
      prize: cfg.prize,
      lotteryName: cfg.lottery_name || 'Lotería Chontico',
      price: cfg.price,
      nequi: cfg.nequi,
      totalNumbers: cfg.total_numbers,
      reserveMinutes: cfg.reserve_minutes,
      raffleStatus: cfg.raffle_status || 'active',
      flyerUrl: cfg.flyer_url || '/img/dinero-express-flyer.jpg'
    },
    tables: tablesData
  });
});

// GET /api/my-tickets - Buscar boletas por número de celular del comprador
app.get('/api/my-tickets', (req, res) => {
  let phone = (req.query.phone || '').replace(/\D/g, '');
  if (phone.startsWith('57') && phone.length === 12) phone = phone.slice(2);
  if (!phone || phone.length < 7) {
    return res.status(400).json({ error: 'Ingresa tu número de celular para buscar tus boletas.' });
  }

  const rows = db.prepare(`
    SELECT n.num, n.status, n.buyer_name, n.reserved_at, n.paid_at, n.table_id, t.name as table_name
    FROM numbers n
    JOIN raffle_tables t ON n.table_id = t.id
    WHERE n.buyer_phone = ? OR n.buyer_phone LIKE ?
    ORDER BY n.table_id ASC, n.num ASC
  `).all(phone, `%${phone}%`);

  res.json({
    phone,
    count: rows.length,
    tickets: rows.map(r => ({
      num: r.num,
      status: r.status,
      tableId: r.table_id,
      tableName: r.table_name,
      buyerName: r.buyer_name,
      reservedAt: r.reserved_at,
      paidAt: r.paid_at
    }))
  });
});

// POST /api/reserve - Reservar números en una tabla específica
app.post('/api/reserve', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkReserveRateLimit(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes de reserva en poco tiempo. Por favor espera un momento.' });
  }

  const cfg = getConfig();

  if (cfg.raffle_status === 'pre_launch') {
    return res.status(400).json({ error: '⚠️ La rifa aún no ha iniciado. Espera el aviso de la organizadora.' });
  }
  if (cfg.raffle_status === 'finished') {
    return res.status(400).json({ error: '⚠️ La rifa ya ha cerrado y finalizó su juego con la lotería.' });
  }

  const { tableId, numbers, name, phone } = req.body;
  const tId = tableId || 1;

  const table = getTable(tId);
  if (!table || !table.is_active) {
    return res.status(400).json({ error: 'Esta tabla no está disponible.' });
  }

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos un número.' });
  }

  if (numbers.length > 10) {
    return res.status(400).json({ error: 'Puedes apartar máximo 10 boletas por reserva para dar oportunidad a todos.' });
  }

  const cleanName = (name || '').trim();
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.startsWith('57') && cleanPhone.length === 12) {
    cleanPhone = cleanPhone.slice(2);
  }

  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: 'Por favor ingresa tu nombre completo.' });
  }

  if (!/^3\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Ingresa un número de celular colombiano válido (10 dígitos que empiece por 3, ej: 3216139972).' });
  }
  if (!cfg.nequi) {
    return res.status(400).json({ error: 'La organizadora aún no ha configurado el número de Nequi.' });
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const checkStmt = db.prepare('SELECT id, num, status FROM numbers WHERE table_id = ? AND num = ?');
    const unavailable = [];

    for (const num of numbers) {
      const row = checkStmt.get(tId, num);
      if (!row || row.status !== 'free') unavailable.push(num);
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
      UPDATE numbers SET status = 'reserved', buyer_name = ?, buyer_phone = ?, reserved_at = ? 
      WHERE table_id = ? AND num = ?
    `);

    for (const num of numbers) {
      reserveStmt.run(cleanName, cleanPhone, now, tId, num);
    }

    db.exec('COMMIT;');

    broadcastEvent('numbers_updated', { action: 'reserved', tableId: tId, numbers, buyerName: cleanName });

    const totalAmount = numbers.length * cfg.price;
    const expiresAt = now + (cfg.reserve_minutes * 60 * 1000);
    const refCode = 'RF-' + Math.floor(1000 + Math.random() * 9000);
    const formattedNumbers = numbers.map(n => String(n).padStart(2, '0')).join(', ');

    const waText = `🎟️ *COMPROBANTE DE RESERVA - ${refCode}*\n\n` +
      `👤 *Participante:* ${cleanName}\n` +
      `📱 *Celular:* ${cleanPhone}\n` +
      `🎯 *Número(s):* ${formattedNumbers} (${table.name})\n` +
      `💵 *Total:* $${totalAmount.toLocaleString('es-CO')} COP\n` +
      `📌 *Rifa:* ${cfg.name}\n\n` +
      `Adjunto la captura del comprobante de transferencia a tu Nequi para confirmación. ¡Gracias!`;
    const waUrl = `https://wa.me/57${cfg.nequi}?text=${encodeURIComponent(waText)}`;

    res.json({
      success: true, refCode, buyerName: cleanName, buyerPhone: cleanPhone,
      reservedNumbers: numbers, tableId: tId, tableName: table.name,
      totalAmount, nequi: cfg.nequi, expiresAt, reserveMinutes: cfg.reserve_minutes, waUrl
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    console.error('Error al reservar:', err);
    res.status(500).json({ error: 'Hubo un error procesando tu reserva. Intenta de nuevo.' });
  }
});

// POST /api/upload-proof
app.post('/api/upload-proof', (req, res) => {
  const { numbers, tableId, imageBase64 } = req.body;
  const tId = tableId || 1;
  if (!Array.isArray(numbers) || !numbers.length || !imageBase64) {
    return res.status(400).json({ error: 'Datos de comprobante incompletos.' });
  }

  try {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer, ext = 'jpg';
    if (matches && matches.length === 3) {
      if (matches[1].includes('png')) ext = 'png';
      else if (matches[1].includes('webp')) ext = 'webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const filename = `proof_${Date.now()}_t${tId}_${numbers[0]}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const relativeUrl = `/uploads/${filename}`;
    const stmt = db.prepare('UPDATE numbers SET proof_image = ? WHERE table_id = ? AND num = ?');
    for (const num of numbers) { stmt.run(relativeUrl, tId, num); }

    broadcastEvent('numbers_updated', { action: 'proof_uploaded', tableId: tId, numbers });
    res.json({ success: true, proofUrl: relativeUrl });
  } catch (err) {
    console.error('Error guardando comprobante:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen del comprobante.' });
  }
});

// ===================== ENDPOINTS ADMIN =====================

app.post('/api/admin/verify', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };

  if (attempt.blockedUntil > now) {
    const minsLeft = Math.ceil((attempt.blockedUntil - now) / 60000);
    return res.status(429).json({ error: `Demasiados intentos fallidos. Acceso bloqueado por seguridad. Espera ${minsLeft} minuto(s).` });
  }

  const { pin } = req.body;
  const cfg = getConfig();
  if (pin && String(pin).trim() === String(cfg.admin_pin).trim()) {
    loginAttempts.delete(ip);
    return res.json({ ok: true });
  }

  attempt.count++;
  if (attempt.count >= 5) {
    attempt.blockedUntil = now + 15 * 60 * 1000;
    loginAttempts.set(ip, attempt);
    return res.status(429).json({ error: 'Has fallado el PIN 5 veces. Acceso bloqueado por 15 minutos.' });
  }

  loginAttempts.set(ip, attempt);
  const remainingAttempts = 5 - attempt.count;
  res.status(401).json({ error: `PIN incorrecto. Te quedan ${remainingAttempts} intento(s) antes del bloqueo temporal.` });
});

// GET /api/admin/data
app.get('/api/admin/data', requireAdmin, (req, res) => {
  cleanExpiredReservations();
  const cfg = getConfig();
  const tables = getTables();
  const now = Date.now();
  const ttlMs = cfg.reserve_minutes * 60 * 1000;

  let totalFree = 0, totalReserved = 0, totalPaid = 0;

  const tablesData = tables.map(t => {
    const rows = db.prepare('SELECT * FROM numbers WHERE table_id = ? ORDER BY num ASC').all(t.id);
    let free = 0, reserved = 0, paid = 0;
    const buyers = [];

    for (const r of rows) {
      if (r.status === 'free') { free++; }
      else if (r.status === 'reserved') {
        reserved++;
        const expiresAt = (r.reserved_at || now) + ttlMs;
        buyers.push({
          num: r.num, status: r.status, name: r.buyer_name, phone: r.buyer_phone,
          reservedAt: r.reserved_at, timeLeftSec: Math.max(0, Math.floor((expiresAt - now) / 1000)),
          proofImage: r.proof_image
        });
      } else if (r.status === 'paid') {
        paid++;
        buyers.push({
          num: r.num, status: r.status, name: r.buyer_name, phone: r.buyer_phone,
          paidAt: r.paid_at, proofImage: r.proof_image
        });
      }
    }

    totalFree += free;
    totalReserved += reserved;
    totalPaid += paid;

    let winners = null;
    if (t.winners_json) {
      try {
        winners = JSON.parse(t.winners_json);
        if (Array.isArray(winners)) {
          winners.forEach(w => {
            if (!w.waUrl && w.phone) {
              const msg = `🎉 *¡FELICITACIONES ${(w.name || '').toUpperCase()}!* 🏆\n\n` +
                `¡Ganaste *${w.prize}* en *${t.name}* de *DINERO EXPRESS*! 💰\n` +
                `🎯 Tu boleta ganadora: *${w.num}* (${w.tier}).\n\n` +
                `Confírmame tu Nequi para transferirte el premio. ¡Felicidades! 🥳`;
              w.waUrl = getWaLink(w.phone, msg);
            }
          });
        }
      } catch {}
    }

    return {
      id: t.id, name: t.name, totalNumbers: t.total_numbers, isActive: !!t.is_active,
      pozoAmount: t.pozo_amount, pozoIncrement: t.pozo_increment,
      pozoWon: !!t.pozo_won, pozoWinnerName: t.pozo_winner_name,
      winners,
      stats: { free, reserved, paid,
        collectedAmount: paid * cfg.price,
        potentialAmount: (paid + reserved) * cfg.price,
        totalGoal: t.total_numbers * cfg.price,
        percentPaid: Math.round((paid / t.total_numbers) * 100)
      },
      buyers
    };
  });

  res.json({
    config: {
      name: cfg.name, prize: cfg.prize, lotteryName: cfg.lottery_name || 'Lotería Chontico',
      price: cfg.price, nequi: cfg.nequi, totalNumbers: cfg.total_numbers,
      reserveMinutes: cfg.reserve_minutes, raffleStatus: cfg.raffle_status || 'active',
      winningNumber: cfg.winning_number,
      flyerUrl: cfg.flyer_url || '/img/dinero-express-flyer.jpg'
    },
    tables: tablesData,
    stats: {
      free: totalFree, reserved: totalReserved, paid: totalPaid,
      collectedAmount: totalPaid * cfg.price,
      potentialAmount: (totalPaid + totalReserved) * cfg.price,
      totalGoal: tables.reduce((s, t) => s + t.total_numbers, 0) * cfg.price,
      percentPaid: tables.length ? Math.round((totalPaid / tables.reduce((s, t) => s + t.total_numbers, 0)) * 100) : 0
    }
  });
});

// GET /api/admin/backup-json - Descargar respaldo completo en JSON
app.get('/api/admin/backup-json', requireAdmin, (req, res) => {
  const cfg = getConfig();
  const tables = getTables();
  const allNumbers = db.prepare('SELECT * FROM numbers ORDER BY table_id ASC, num ASC').all();

  const backupData = {
    exportedAt: new Date().toISOString(),
    config: cfg,
    tables: tables,
    numbers: allNumbers
  };

  const filename = `dinero-express-backup-${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backupData, null, 2));
});

// POST /api/admin/add-table
app.post('/api/admin/add-table', requireAdmin, (req, res) => {
  const { name, pozoAmount, pozoIncrement } = req.body;
  const tables = getTables();
  const newName = (name || `Tabla ${tables.length + 1}`).trim();
  const pozo = parseInt(pozoAmount, 10) || 5000000;
  const increment = parseInt(pozoIncrement, 10) || 500000;

  const result = db.prepare(`
    INSERT INTO raffle_tables (name, total_numbers, is_active, pozo_amount, pozo_increment, created_at)
    VALUES (?, 100, 1, ?, ?, ?)
  `).run(newName, pozo, increment, Date.now());

  const newTableId = Number(result.lastInsertRowid);
  const insertNum = db.prepare("INSERT OR IGNORE INTO numbers (table_id, num, status) VALUES (?, ?, 'free')");
  for (let i = 1; i <= 100; i++) { insertNum.run(newTableId, i); }

  broadcastEvent('table_added', { id: newTableId, name: newName });
  res.json({ success: true, tableId: newTableId, name: newName });
});

// POST /api/admin/remove-table
app.post('/api/admin/remove-table', requireAdmin, (req, res) => {
  const { tableId } = req.body;
  if (!tableId || tableId === 1) {
    return res.status(400).json({ error: 'No se puede eliminar la Tabla 1.' });
  }
  db.prepare('DELETE FROM numbers WHERE table_id = ?').run(tableId);
  db.prepare('DELETE FROM raffle_tables WHERE id = ?').run(tableId);
  broadcastEvent('table_removed', { id: tableId });
  res.json({ success: true });
});

// POST /api/admin/update-table
app.post('/api/admin/update-table', requireAdmin, (req, res) => {
  const { tableId, name, pozoAmount, pozoIncrement } = req.body;
  if (!tableId) return res.status(400).json({ error: 'ID de tabla requerido.' });
  const t = getTable(tableId);
  if (!t) return res.status(404).json({ error: 'Tabla no encontrada.' });

  const newName = (name || t.name).trim();
  const newPozo = parseInt(pozoAmount, 10) || t.pozo_amount;
  const newInc = parseInt(pozoIncrement, 10) || t.pozo_increment;

  db.prepare('UPDATE raffle_tables SET name = ?, pozo_amount = ?, pozo_increment = ? WHERE id = ?')
    .run(newName, newPozo, newInc, tableId);

  broadcastEvent('config_updated', {});
  res.json({ success: true });
});

// POST /api/admin/upload-flyer
app.post('/api/admin/upload-flyer', requireAdmin, (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No se envió ninguna imagen.' });
  try {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer, ext = 'jpg';
    if (matches && matches.length === 3) {
      if (matches[1].includes('png')) ext = 'png';
      else if (matches[1].includes('webp')) ext = 'webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else { buffer = Buffer.from(imageBase64, 'base64'); }

    const filename = `flyer_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    const flyerUrl = `/uploads/${filename}`;
    db.prepare('UPDATE config SET flyer_url = ?, updated_at = ? WHERE id = 1').run(flyerUrl, Date.now());
    broadcastEvent('config_updated', { flyerUrl });
    res.json({ success: true, flyerUrl });
  } catch (err) {
    console.error('Error subiendo afiche:', err);
    res.status(500).json({ error: 'No se pudo guardar la imagen.' });
  }
});

// POST /api/admin/set-raffle-status
app.post('/api/admin/set-raffle-status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['pre_launch', 'active', 'finished'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  db.prepare('UPDATE config SET raffle_status = ?, updated_at = ? WHERE id = 1').run(status, Date.now());
  broadcastEvent('raffle_status_changed', { status });
  res.json({ success: true, status });
});

// POST /api/admin/set-lottery-winner - 3 ganadores POR CADA TABLA + pozo
app.post('/api/admin/set-lottery-winner', requireAdmin, (req, res) => {
  let { rawNumber } = req.body;
  if (!rawNumber) return res.status(400).json({ error: 'Ingresa el número que cayó en la lotería.' });

  const cleanDigits = String(rawNumber).replace(/\D/g, '');
  if (cleanDigits.length < 2) {
    return res.status(400).json({ error: 'Ingresa al menos 2 dígitos (preferiblemente las 4 cifras del Chontico).' });
  }

  function parseNumber(str) {
    let n = parseInt(str, 10);
    if (n === 0) n = 100;
    return n;
  }

  let tiers = [];
  if (cleanDigits.length >= 4) {
    const d4 = cleanDigits.slice(-4);
    tiers = [
      { tier: '2 PRIMERAS CIFRAS', num: parseNumber(d4.slice(0, 2)), prize: '$150.000 COP', prizeNum: 150000 },
      { tier: '2 CIFRAS DEL MEDIO', num: parseNumber(d4.slice(1, 3)), prize: '$150.000 COP', prizeNum: 150000 },
      { tier: '2 ÚLTIMAS CIFRAS', num: parseNumber(d4.slice(2, 4)), prize: '$400.000 COP', prizeNum: 400000 }
    ];
  } else {
    const n = parseNumber(cleanDigits.slice(-2));
    tiers = [{ tier: '2 ÚLTIMAS CIFRAS', num: n, prize: '$400.000 COP', prizeNum: 400000 }];
  }

  const tables = getTables().filter(t => t.is_active);
  const allResults = [];

  for (const table of tables) {
    const winners = [];
    const stmt = db.prepare('SELECT * FROM numbers WHERE table_id = ? AND num = ?');

    for (const t of tiers) {
      const ticket = stmt.get(table.id, t.num);
      const numFormatted = String(t.num).padStart(2, '0');
      let name = 'Sin Asignar (No comprado)', phone = '', status = 'free', waUrl = null;

      if (ticket && ticket.status !== 'free') {
        name = ticket.buyer_name || 'Comprador Anónimo';
        phone = ticket.buyer_phone || '';
        status = ticket.status;
        if (phone) {
          const msg = `🎉 *¡FELICITACIONES ${name.toUpperCase()}!* 🏆\n\n` +
            `¡Ganaste *${t.prize}* en *${table.name}* de *DINERO EXPRESS*! 💰\n` +
            `🎯 Tu boleta: *${numFormatted}* (${t.tier}) · Chontico: *${cleanDigits}*\n\n` +
            `Confírmame tu Nequi para transferirte el premio. ¡Felicidades! 🥳`;
          waUrl = getWaLink(phone, msg);
        }
      }

      winners.push({ tier: t.tier, num: numFormatted, prize: t.prize, name, phone, status, waUrl });
    }

    // Verificar POZO ACUMULADO: misma persona con primeras 2 Y últimas 2 cifras
    let pozoWon = false;
    let pozoWinnerName = null;

    if (cleanDigits.length >= 4) {
      const d4 = cleanDigits.slice(-4);
      const numFirst = parseNumber(d4.slice(0, 2));
      const numLast = parseNumber(d4.slice(2, 4));

      const ticketFirst = db.prepare('SELECT * FROM numbers WHERE table_id = ? AND num = ?').get(table.id, numFirst);
      const ticketLast = db.prepare('SELECT * FROM numbers WHERE table_id = ? AND num = ?').get(table.id, numLast);

      if (ticketFirst && ticketLast &&
          ticketFirst.status !== 'free' && ticketLast.status !== 'free' &&
          ticketFirst.buyer_phone && ticketLast.buyer_phone &&
          ticketFirst.buyer_phone.replace(/\D/g, '') === ticketLast.buyer_phone.replace(/\D/g, '')) {
        pozoWon = true;
        pozoWinnerName = ticketFirst.buyer_name || 'Ganador del Pozo';
      }
    }

    const winnersJson = JSON.stringify(winners);

    if (pozoWon) {
      db.prepare('UPDATE raffle_tables SET winners_json = ?, pozo_won = 1, pozo_winner_name = ? WHERE id = ?')
        .run(winnersJson, pozoWinnerName, table.id);
    } else {
      // Acumular pozo para la próxima
      db.prepare('UPDATE raffle_tables SET winners_json = ?, pozo_amount = pozo_amount + pozo_increment WHERE id = ?')
        .run(winnersJson, table.id);
    }

    allResults.push({
      tableId: table.id,
      tableName: table.name,
      winners,
      pozoWon,
      pozoWinnerName,
      pozoAmount: pozoWon ? table.pozo_amount : table.pozo_amount + table.pozo_increment
    });
  }

  db.prepare(`
    UPDATE config SET winning_number = ?, raffle_status = 'finished', updated_at = ? WHERE id = 1
  `).run(cleanDigits, Date.now());

  broadcastEvent('winner_announced', { lotteryDrawn: cleanDigits, results: allResults });

  res.json({ success: true, lotteryDrawn: cleanDigits, results: allResults });
});

// WhatsApp Templates
app.get('/api/admin/whatsapp-templates', requireAdmin, (req, res) => {
  const cfg = getConfig();
  const origin = req.headers.origin || req.headers.host || '';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const fullUrl = origin.startsWith('http') ? origin : `${protocol}://${origin}`;

  const freeRows = db.prepare("SELECT COUNT(*) as cnt FROM numbers WHERE status = 'free'").get();
  const freeCount = freeRows.cnt;

  const tables = getTables();
  let winnersFormatted = '';
  for (const t of tables) {
    if (t.winners_json) {
      try {
        const wList = JSON.parse(t.winners_json);
        winnersFormatted += `\n📋 *${t.name}:*\n`;
        winnersFormatted += wList.map(w =>
          `🏅 *${w.tier} (Boleta ${w.num})*\n👤 ${w.name}\n💵 ${w.prize}\n`
        ).join('\n');
        if (t.pozo_won && t.pozo_winner_name) {
          winnersFormatted += `\n🎰💰 *¡POZO ACUMULADO GANADO!*\n👤 ${t.pozo_winner_name} ganó $${(t.pozo_amount || 0).toLocaleString('es-CO')} COP\n`;
        }
      } catch {}
    }
  }
  if (!winnersFormatted) winnersFormatted = 'Aún no se han registrado ganadores.\n';

  const templates = {
    preLaunch: `🚨 *¡ATENCIÓN GRUPO! PREPÁRENSE!* 🚨\n\n` +
      `En contados minutos iniciaremos *${cfg.name.toUpperCase()}* 👑\n\n` +
      `🏆 *PREMIOS:* ${cfg.prize}\n🎰 *Juega con:* ${cfg.lottery_name}\n` +
      `💵 *Valor por número:* $${cfg.price.toLocaleString('es-CO')} COP\n📲 *Nequi:* ${cfg.nequi}\n\n` +
      `👇 Abre el enlace:\n${fullUrl}\n\n_¡Apenas demos la señal podrás escoger tu número!_ ⚡`,

    active: `🔥 *¡YA PUEDEN ESCOGER SUS NÚMEROS!* 🔥\n\n` +
      `Abierta la venta de *${cfg.name.toUpperCase()}* 🎟️\n\n` +
      `👉 *Entra ya:*\n${fullUrl}\n\n` +
      `💵 $${cfg.price.toLocaleString('es-CO')} COP · 📱 Nequi: ${cfg.nequi}\n\n` +
      `_¡Los números se van en segundos!_ 🏃‍♂️💨`,

    remaining: `⚡ *¡ÚLTIMOS ${freeCount} NÚMEROS DISPONIBLES!* ⚡\n\n` +
      `👉 *Entra y aparta el tuyo:*\n${fullUrl}\n\n` +
      `🎰 *Juega con:* ${cfg.lottery_name}\n¡No te quedes por fuera del pozo millonario! 💰`,

    winner: `🎉 🏆 *¡TENEMOS GANADORES OFICIALES!* 🏆 🎉\n\n` +
      `Resultado de la *${cfg.lottery_name}*: *${cfg.winning_number || 'XXXX'}*\n\n` +
      `${winnersFormatted}\n` +
      `¡Felicitaciones a todos los afortunados de *DINERO EXPRESS*! 👏🥳\n` +
      `*¡Jugamos unidos, ganamos todos!* 🤝✨`
  };

  res.json({ success: true, templates });
});

// PUT /api/admin/config
app.put('/api/admin/config', requireAdmin, (req, res) => {
  const { name, prize, lottery_name, price, nequi, admin_pin, reserve_minutes } = req.body;
  const current = getConfig();
  db.prepare(`
    UPDATE config SET name = ?, prize = ?, lottery_name = ?, price = ?, nequi = ?, admin_pin = ?, reserve_minutes = ?, updated_at = ?
    WHERE id = 1
  `).run(
    (name || current.name).trim(), (prize || current.prize).trim(),
    (lottery_name || current.lottery_name || 'Lotería Chontico').trim(),
    parseInt(price, 10) || current.price,
    (nequi || current.nequi).replace(/\D/g, ''),
    (admin_pin || current.admin_pin).trim(),
    parseInt(reserve_minutes, 10) || current.reserve_minutes,
    Date.now()
  );
  broadcastEvent('config_updated', {});
  res.json({ success: true, message: 'Configuración guardada correctamente.' });
});

// POST /api/admin/set-batch-status
app.post('/api/admin/set-batch-status', requireAdmin, (req, res) => {
  const { numbers, status, tableId } = req.body;
  const tId = tableId || 1;
  if (!Array.isArray(numbers) || !numbers.length || !['paid', 'free'].includes(status)) {
    return res.status(400).json({ error: 'Parámetros no válidos.' });
  }

  const now = Date.now();
  if (status === 'paid') {
    const stmt = db.prepare("UPDATE numbers SET status = 'paid', paid_at = ? WHERE table_id = ? AND num = ?");
    for (const num of numbers) { stmt.run(now, tId, num); }
  } else {
    const stmt = db.prepare("UPDATE numbers SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, paid_at = NULL, proof_image = NULL WHERE table_id = ? AND num = ?");
    for (const num of numbers) { stmt.run(tId, num); }
  }

  broadcastEvent('numbers_updated', { action: status, tableId: tId, numbers });
  res.json({ success: true, count: numbers.length });
});

// POST /api/admin/set-status
app.post('/api/admin/set-status', requireAdmin, (req, res) => {
  const { num, status, tableId } = req.body;
  const tId = tableId || 1;
  if (!num || !['paid', 'free'].includes(status)) {
    return res.status(400).json({ error: 'Parámetros no válidos.' });
  }

  if (status === 'paid') {
    db.prepare("UPDATE numbers SET status = 'paid', paid_at = ? WHERE table_id = ? AND num = ?").run(Date.now(), tId, num);
  } else {
    db.prepare("UPDATE numbers SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, paid_at = NULL, proof_image = NULL WHERE table_id = ? AND num = ?").run(tId, num);
  }

  broadcastEvent('numbers_updated', { action: status, tableId: tId, numbers: [num] });
  res.json({ success: true });
});

// GET /api/admin/export-csv
app.get('/api/admin/export-csv', requireAdmin, (req, res) => {
  const tables = getTables();
  let csv = 'Tabla,Numero,Estado,Comprador,Celular,Fecha_Reserva,Fecha_Pago\n';

  for (const t of tables) {
    const rows = db.prepare(`
      SELECT num, status, buyer_name, buyer_phone, reserved_at, paid_at 
      FROM numbers WHERE table_id = ? AND status != 'free' ORDER BY num ASC
    `).all(t.id);

    for (const r of rows) {
      const resDate = r.reserved_at ? new Date(r.reserved_at).toLocaleString('es-CO') : '';
      const paidDate = r.paid_at ? new Date(r.paid_at).toLocaleString('es-CO') : '';
      csv += `"${t.name}",${String(r.num).padStart(2, '0')},${r.status === 'paid' ? 'PAGADO' : 'PENDIENTE'},"${(r.buyer_name || '').replace(/,/g, ' ')}",${r.buyer_phone || ''},"${resDate}","${paidDate}"\n`;
    }
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rifa-compradores.csv"');
  res.send('\uFEFF' + csv);
});

// POST /api/admin/reset-all
app.post('/api/admin/reset-all', requireAdmin, (req, res) => {
  db.prepare(`UPDATE numbers SET status = 'free', buyer_name = NULL, buyer_phone = NULL, reserved_at = NULL, paid_at = NULL, proof_image = NULL`).run();
  db.prepare(`UPDATE raffle_tables SET winners_json = NULL, pozo_won = 0, pozo_winner_name = NULL`).run();
  db.prepare(`UPDATE config SET winning_number = NULL, winner_name = NULL, winner_phone = NULL, winners_json = NULL, raffle_status = 'active' WHERE id = 1`).run();

  // Eliminar tablas extra (dejar solo Tabla 1)
  db.prepare('DELETE FROM numbers WHERE table_id > 1').run();
  db.prepare('DELETE FROM raffle_tables WHERE id > 1').run();

  broadcastEvent('raffle_reset', {});
  res.json({ success: true, message: 'Rifa reiniciada completamente.' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor DINERO EXPRESS corriendo en http://localhost:${PORT}`);
});
