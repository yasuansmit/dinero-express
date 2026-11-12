// db.js - Conexión SQLite nativa (Node v22+)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'raffle.db');
const db = new DatabaseSync(dbPath);

// Inicializar esquema
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'DINERO EXPRESS',
      prize TEXT NOT NULL DEFAULT 'Pozo $5.000.000 · 150k, 150k y 400k',
      lottery_name TEXT NOT NULL DEFAULT 'Lotería Chontico Día y Noche',
      price INTEGER NOT NULL DEFAULT 12000,
      nequi TEXT NOT NULL DEFAULT '3001234567',
      admin_pin TEXT NOT NULL DEFAULT '1234',
      total_numbers INTEGER NOT NULL DEFAULT 100,
      reserve_minutes INTEGER NOT NULL DEFAULT 20,
      raffle_status TEXT NOT NULL DEFAULT 'active', -- 'pre_launch', 'active', 'finished'
      winning_number TEXT,
      winner_name TEXT,
      winner_phone TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS numbers (
      num INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'free', -- 'free', 'reserved', 'paid'
      buyer_name TEXT,
      buyer_phone TEXT,
      reserved_at INTEGER,
      paid_at INTEGER,
      proof_image TEXT
    );
  `);

  // Migración segura por si ya existía la tabla sin las nuevas columnas de Dinero Express
  try { db.exec('ALTER TABLE config ADD COLUMN lottery_name TEXT NOT NULL DEFAULT "Lotería Chontico Día y Noche";'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN raffle_status TEXT NOT NULL DEFAULT "active";'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winning_number TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winner_name TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winner_phone TEXT;'); } catch {}
  try { db.exec('ALTER TABLE numbers ADD COLUMN proof_image TEXT;'); } catch {}

  // Asegurar fila de configuración por defecto
  const configRow = db.prepare('SELECT * FROM config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(`
      INSERT INTO config (id, name, prize, lottery_name, price, nequi, admin_pin, total_numbers, reserve_minutes, raffle_status, updated_at)
      VALUES (1, 'DINERO EXPRESS', 'Pozo $5.000.000 · 150k, 150k y 400k', 'Lotería Chontico Día y Noche', 12000, '3001234567', '1234', 100, 20, 'active', ?)
    `).run(Date.now());
  } else {
    // Actualizar nombre a DINERO EXPRESS y precio a 12.000 si tenía los de prueba
    if (configRow.name === 'Gran Rifa Nequi') {
      db.prepare(`
        UPDATE config 
        SET name = 'DINERO EXPRESS', 
            prize = 'Pozo $5.000.000 · 150k, 150k y 400k',
            price = 12000,
            lottery_name = 'Lotería Chontico Día y Noche'
        WHERE id = 1
      `).run();
    }
  }

  // Asegurar los 100 números iniciales (1 al 100)
  const countRow = db.prepare('SELECT COUNT(*) as count FROM numbers').get();
  if (countRow.count === 0) {
    const insertStmt = db.prepare("INSERT INTO numbers (num, status) VALUES (?, 'free')");
    for (let i = 1; i <= 100; i++) {
      insertStmt.run(i);
    }
  }
}

initDB();

module.exports = db;
