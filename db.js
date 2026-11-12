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
      name TEXT NOT NULL DEFAULT 'Gran Rifa Nequi',
      prize TEXT NOT NULL DEFAULT 'Premio Sorpresa / Efectivo',
      price INTEGER NOT NULL DEFAULT 15000,
      nequi TEXT NOT NULL DEFAULT '3001234567',
      admin_pin TEXT NOT NULL DEFAULT '1234',
      total_numbers INTEGER NOT NULL DEFAULT 100,
      reserve_minutes INTEGER NOT NULL DEFAULT 20,
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

  // Migración segura por si ya existía la tabla sin la columna proof_image
  try {
    db.exec('ALTER TABLE numbers ADD COLUMN proof_image TEXT;');
  } catch {}

  // Asegurar fila de configuración por defecto
  const configRow = db.prepare('SELECT * FROM config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(`
      INSERT INTO config (id, name, prize, price, nequi, admin_pin, total_numbers, reserve_minutes, updated_at)
      VALUES (1, 'Gran Rifa Nequi', 'Premio en Efectivo', 15000, '3001234567', '1234', 100, 20, ?)
    `).run(Date.now());
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
