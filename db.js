'use strict';
// Base de données SQLite (module intégré à Node, aucune dépendance à installer).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');
const seed = require('./seed-data');
const { hashPassword } = require('./security');

fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(cfg.DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(cfg.DATA_DIR, 'carlos.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  fullname TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('product','training')),
  cat TEXT,
  name_json TEXT NOT NULL,
  desc_json TEXT,
  lessons_json TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  tag TEXT,
  rating REAL NOT NULL DEFAULT 4.5,
  emoji TEXT,
  color TEXT,
  image TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY,
  discount REAL NOT NULL,
  label_json TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  method TEXT,
  promo_code TEXT,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reservation_id INTEGER
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER,
  name TEXT,
  price INTEGER,
  qty INTEGER,
  image TEXT
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  duration_hours INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  pay_method TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_resv_user ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
`);

// ---------- helpers ----------
const nz = v => (v === undefined ? null : v);
function q(sql, ...p) { return db.prepare(sql).all(...p.map(nz)); }
function one(sql, ...p) { return db.prepare(sql).get(...p.map(nz)); }
function run(sql, ...p) { return db.prepare(sql).run(...p.map(nz)); }
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

// ---------- réglages de la boutique ----------
const SETTINGS_DEFAULT = { storeName: 'CARLOS SHOP', email: '', phone: '', address: '', hours: '', description: '',
  shippingFee: 500, freeShippingFrom: 10000, deliveryDays: 3 };
function getSettings() {
  const out = Object.assign({}, SETTINGS_DEFAULT);
  for (const r of q('SELECT key, value FROM settings')) {
    if (r.key in SETTINGS_DEFAULT) { try { out[r.key] = JSON.parse(r.value); } catch (e) {} }
  }
  return out;
}
function saveSettings(v) {
  tx(() => {
    for (const k of Object.keys(SETTINGS_DEFAULT)) {
      if (v[k] !== undefined) run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v[k]));
    }
  });
  return getSettings();
}

// ---------- premier lancement : catalogue d'exemple ----------
function seedIfEmpty() {
  if (one("SELECT value FROM settings WHERE key='seeded'")) return;
  tx(() => {
    const ins = db.prepare(`INSERT INTO items(id,kind,cat,name_json,desc_json,lessons_json,price,old_price,stock,min_stock,tag,rating,emoji,color,image,demo,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`);
    const now = new Date().toISOString();
    for (const p of seed.PRODUCTS_SEED) ins.run(p.id, 'product', p.cat, JSON.stringify(p.name), JSON.stringify(p.desc || p.name), null, p.price, p.oldPrice || 0, p.stock, 5, p.tag || null, p.rating || 4.5, p.emoji || '', null, p.image || '', now);
    for (const t of seed.TRAINING_SEED) ins.run(t.id, 'training', null, JSON.stringify(t.name), JSON.stringify(t.desc), JSON.stringify(t.lessons), t.price, t.oldPrice || 0, t.stock || 999, 5, null, 4.5, t.emoji || '', t.color || '', t.image || '', now);
    const pi = db.prepare('INSERT OR IGNORE INTO promos(code,discount,label_json) VALUES(?,?,?)');
    for (const c of seed.PROMO_SEED) pi.run(c.code, c.discount, JSON.stringify(c.label));
    run("INSERT INTO settings(key,value) VALUES('seeded','1')");
  });
}

// ---------- compte administrateur ----------
async function ensureAdmin() {
  if (one("SELECT id FROM users WHERE role='admin' LIMIT 1")) return null;
  let pwd = cfg.ADMIN_PASSWORD, generated = false;
  if (!pwd) { pwd = crypto.randomBytes(9).toString('base64url'); generated = true; }
  if (pwd.length < 8) throw new Error('ADMIN_PASSWORD doit contenir au moins 8 caractères.');
  run('INSERT INTO users(email,fullname,phone,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    cfg.ADMIN_EMAIL, 'Administrateur', '', await hashPassword(pwd), 'admin', new Date().toISOString());
  return { email: cfg.ADMIN_EMAIL, password: pwd, generated };
}

function purgeSessions() { run('DELETE FROM sessions WHERE expires_at < ?', Date.now()); }

module.exports = { db, q, one, run, tx, getSettings, saveSettings, seedIfEmpty, ensureAdmin, purgeSessions, SETTINGS_DEFAULT };
