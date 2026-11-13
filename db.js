// db.js - Conexión SQLite nativa (Node v22.5+) con soporte Multi-Tabla
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'raffle.db');
const db = new DatabaseSync(dbPath);

function initDB() {
  // 1. Tabla de Configuración Global
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
      raffle_status TEXT NOT NULL DEFAULT 'active',
      winning_number TEXT,
      winner_name TEXT,
      winner_phone TEXT,
      winners_json TEXT,
      flyer_url TEXT NOT NULL DEFAULT '/img/dinero-express-flyer.jpg',
      updated_at INTEGER NOT NULL
    );
  `);

  // Migraciones seguras para config
  try { db.exec('ALTER TABLE config ADD COLUMN lottery_name TEXT NOT NULL DEFAULT "Lotería Chontico Día y Noche";'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN raffle_status TEXT NOT NULL DEFAULT "active";'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winning_number TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winner_name TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winner_phone TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN winners_json TEXT;'); } catch {}
  try { db.exec('ALTER TABLE config ADD COLUMN flyer_url TEXT NOT NULL DEFAULT "/img/dinero-express-flyer.jpg";'); } catch {}

  // 2. Tabla de Tablas (Multi-Tabla)
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Tabla 1',
      total_numbers INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      pozo_amount INTEGER NOT NULL DEFAULT 5000000,
      pozo_increment INTEGER NOT NULL DEFAULT 500000,
      winners_json TEXT,
      pozo_winner_name TEXT,
      pozo_won INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER
    );
  `);

  // 3. Tabla de Números (con table_id)
  // Verificar si la tabla numbers ya existe y si tiene table_id
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='numbers'").get();

  if (tableExists) {
    const cols = db.prepare("PRAGMA table_info(numbers)").all();
    const hasTableId = cols.some(c => c.name === 'table_id');
    if (!hasTableId) {
      // Migración desde tabla vieja sin table_id
      db.exec(`
        CREATE TABLE IF NOT EXISTS numbers_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_id INTEGER NOT NULL DEFAULT 1,
          num INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'free',
          buyer_name TEXT,
          buyer_phone TEXT,
          reserved_at INTEGER,
          paid_at INTEGER,
          proof_image TEXT,
          UNIQUE(table_id, num)
        );
      `);

      try {
        db.exec(`
          INSERT OR IGNORE INTO numbers_migrated (table_id, num, status, buyer_name, buyer_phone, reserved_at, paid_at, proof_image)
          SELECT 1, num, status, buyer_name, buyer_phone, reserved_at, paid_at, proof_image FROM numbers;
        `);
      } catch {
        try {
          db.exec(`
            INSERT OR IGNORE INTO numbers_migrated (table_id, num, status, buyer_name, buyer_phone, reserved_at, paid_at)
            SELECT 1, num, status, buyer_name, buyer_phone, reserved_at, paid_at FROM numbers;
          `);
        } catch {}
      }

      db.exec('DROP TABLE numbers;');
      db.exec('ALTER TABLE numbers_migrated RENAME TO numbers;');
    }
  } else {
    // Crear tabla numbers nueva desde cero
    db.exec(`
      CREATE TABLE IF NOT EXISTS numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL DEFAULT 1,
        num INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'free',
        buyer_name TEXT,
        buyer_phone TEXT,
        reserved_at INTEGER,
        paid_at INTEGER,
        proof_image TEXT,
        UNIQUE(table_id, num)
      );
    `);
  }

  // 4. Sembrar Configuración si está vacía
  const configRow = db.prepare('SELECT * FROM config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(`
      INSERT INTO config (id, name, prize, lottery_name, price, nequi, admin_pin, total_numbers, reserve_minutes, raffle_status, updated_at)
      VALUES (1, 'DINERO EXPRESS', 'Pozo $5.000.000 · 150k, 150k y 400k', 'Lotería Chontico Día y Noche', 12000, '3001234567', '1234', 100, 20, 'active', ?)
    `).run(Date.now());
  } else if (configRow.name === 'Gran Rifa Nequi') {
    db.prepare(`
      UPDATE config 
      SET name = 'DINERO EXPRESS', 
          prize = 'Pozo $5.000.000 · 150k, 150k y 400k',
          price = 12000,
          lottery_name = 'Lotería Chontico Día y Noche'
      WHERE id = 1
    `).run();
  }

  // 5. Sembrar Tabla 1 si no hay tablas
  const tableCount = db.prepare('SELECT COUNT(*) as count FROM raffle_tables').get();
  if (tableCount.count === 0) {
    db.prepare(`
      INSERT INTO raffle_tables (name, total_numbers, is_active, pozo_amount, pozo_increment, created_at)
      VALUES ('Tabla 1', 100, 1, 5000000, 500000, ?)
    `).run(Date.now());
  }

  // 6. Asegurar números del 1 al 100 para cada tabla
  const tables = db.prepare('SELECT id, total_numbers FROM raffle_tables').all();
  const insertNum = db.prepare("INSERT OR IGNORE INTO numbers (table_id, num, status) VALUES (?, ?, 'free')");

  for (const t of tables) {
    const numCount = db.prepare('SELECT COUNT(*) as count FROM numbers WHERE table_id = ?').get(t.id);
    if (numCount.count < t.total_numbers) {
      for (let i = 1; i <= t.total_numbers; i++) {
        insertNum.run(t.id, i);
      }
    }
  }
}

initDB();

module.exports = db;
