// db.js — the ONLY place this backend talks to a database.
//
// Database: SQLite, via better-sqlite3 — a single local file, no external
// database server, no account/cluster to set up. That directly matches
// "just use db.js": start the server and the database exists.
//
// Why this is still a solid choice for "store a large amount of data
// without losing it":
//   - SQLite comfortably holds many millions of rows / tens of GB — far
//     more than a business site's enquiries, applications and accounts
//     will ever produce — and every write here goes through prepared
//     statements with real column types and constraints (see models/*),
//     so you keep validation, not just "no schema at all".
//   - WAL (Write-Ahead Logging) journal mode is enabled below, which is
//     the durability setting SQLite itself recommends: writes are
//     committed to a log before the main file is touched, so a crash or
//     power loss mid-write can't corrupt existing data, and reads are
//     never blocked by a write in progress.
//   - `synchronous = FULL` makes SQLite fsync to disk on every commit —
//     slightly slower than the default, but it means a completed request
//     really is safely on disk, not just handed to the OS cache.
//   - That covers crash/power-loss safety. For the other half of "never
//     lose data" — surviving a deleted file, a full disk, or a bad
//     deploy — see src/utils/backup.js, which takes scheduled + on-demand
//     hot backups automatically (wired up in server.js).
//
// If you outgrow a single file later (multiple app servers writing at
// once, huge concurrent write load), everything that talks to the
// database goes through the small functions in src/models/*.js — you'd
// swap what's inside those two files for a client-server database
// (Postgres/MySQL/MongoDB) without touching the routes.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "ixitek.db");

let db = null;

function connectDB() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);

  // Durability + concurrency settings (see notes above).
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  console.log(`[db] Connected to SQLite → ${DB_PATH}`);
  return db;
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      phone         TEXT NOT NULL DEFAULT '',
      company       TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'owner')),
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      last_login_at INTEGER,
      last_login_ip TEXT,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS enquiries (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      type              TEXT NOT NULL CHECK (type IN ('enquiry', 'career')),
      name              TEXT NOT NULL,
      company           TEXT NOT NULL DEFAULT '',
      email             TEXT NOT NULL,
      phone             TEXT NOT NULL DEFAULT '',
      category          TEXT NOT NULL DEFAULT '',
      message           TEXT NOT NULL DEFAULT '',
      page              TEXT NOT NULL DEFAULT '',
      resume_file_name  TEXT NOT NULL DEFAULT '',
      resume_file_size  INTEGER NOT NULL DEFAULT 0,
      resume_data_url   TEXT NOT NULL DEFAULT '',
      user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'archived')),
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_enquiries_type ON enquiries(type);
    CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
    CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);
  `);
}

function getDB() {
  if (!db) throw new Error("Database not connected yet — call connectDB() first.");
  return db;
}

function disconnectDB() {
  if (db) {
    // Fold the WAL back into the main file before closing, so the .db file
    // on disk is fully self-contained (important if something later reads
    // it directly, e.g. copying it for a backup while the server is down).
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // best-effort — closing still happens below either way
    }
    db.close();
    db = null;
  }
}

module.exports = { connectDB, getDB, disconnectDB, DB_PATH };
