const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./profiles.db");

db.serialize(() => {
  // ── Stage 2 table (unchanged) ──────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      gender TEXT,
      gender_probability REAL,
      age INTEGER,
      age_group TEXT,
      country_id TEXT,
      country_name TEXT,
      country_probability REAL,
      created_at TEXT
    )
  `);

  // ── Stage 3: users ─────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'analyst',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Stage 3: refresh tokens ────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── Stage 3: request logs ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      method TEXT,
      path TEXT,
      status_code INTEGER,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Wipe users and tokens so first OAuth login gets admin ──────────────
  db.run(`DELETE FROM refresh_tokens`);
  db.run(`DELETE FROM users`);
});

module.exports = db;