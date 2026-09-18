// db.js — the ONLY place this backend talks to a database.
//
// Database: SQLite, via node-sqlite3-wasm — a single local file, no
// external database server, no account/cluster to set up. That directly
// matches "just use db.js": start the server and the database exists.
//
// Why node-sqlite3-wasm (and not better-sqlite3): this backend previously
// used better-sqlite3, a native addon that must be compiled (or download a
// prebuilt binary) for the exact host it runs on. Hostinger's shared/VPS
// Node.js hosts run an older glibc (< 2.29) than better-sqlite3's prebuilt
// binaries are built against, AND don't provide a C/C++ toolchain (`make`)
// to compile it from source — so `npm install` fails there no matter which
// better-sqlite3 version is pinned. node-sqlite3-wasm compiles SQLite3 to
// WebAssembly instead: it's pure JS + a .wasm file, runs inside Node's own
// WASM runtime, and needs no native compilation and no particular glibc
// version — so it installs and runs identically on Hostinger, in local
// dev, and everywhere else. It still gives real on-disk file persistence
// (via a custom SQLite VFS backed by Node's `fs` module), not an
// in-memory-only database — same single `data/ixitek.db` file as before.
//
// Why this is still a solid choice for "store a large amount of data
// without losing it":
//   - SQLite comfortably holds many millions of rows / tens of GB — far
//     more than a business site's enquiries, applications and accounts
//     will ever produce — and every write here goes through prepared
//     statements with real column types and constraints (see models/*),
//     so you keep validation, not just "no schema at all".
//   - `synchronous = FULL` makes SQLite fsync to disk on every commit —
//     slightly slower than the default, but it means a completed request
//     really is safely on disk, not just handed to the OS cache.
//   - We still request WAL (Write-Ahead Logging) journal mode below, but
//     note: node-sqlite3-wasm's filesystem VFS has no shared-memory
//     support, so SQLite silently keeps its default rollback-journal
//     ("DELETE") mode instead — this is a no-op, not an error. Rollback
//     journal mode is just as crash-safe as WAL (still fsync'd on every
//     commit via `synchronous = FULL`); the only thing it doesn't give you
//     is WAL's "readers are never blocked by an in-progress writer" perk,
//     which isn't meaningful here anyway since this app is a single Node
//     process handling one synchronous DB call at a time.
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
const { Database: SqliteWasmDatabase } = require("node-sqlite3-wasm");

// ---------------------------------------------------------------------
// better-sqlite3 compatibility shim
// ---------------------------------------------------------------------
// models/User.js and models/Enquiry.js were written against
// better-sqlite3's calling convention, which is slightly more forgiving
// than node-sqlite3-wasm's:
//
//   1. better-sqlite3 accepts several positional `?` values either as
//      separate arguments (`stmt.run(a, b, c)`) or as a single array
//      (`stmt.run([a, b, c])`). node-sqlite3-wasm only accepts the array
//      form — passing separate arguments silently binds nothing.
//   2. better-sqlite3 lets you bind a named parameter (`@name` in the
//      SQL) using the bare key `{ name: ... }`. node-sqlite3-wasm requires
//      the same sigil in the object key: `{ "@name": ... }`.
//
// Rather than rewrite every db.prepare(...).get/.all/.run(...) call in
// models/*.js (and risk missing one), this wrapper normalizes arguments
// to the shape node-sqlite3-wasm expects, so every existing call site
// keeps working unchanged.
function normalizeBindArgs(sql, args) {
  if (args.length === 0) return [];

  if (args.length > 1) {
    // Multiple positional args, e.g. .run(role, Date.now(), id)
    return [args];
  }

  const [value] = args;
  const isPlainObject =
    value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array);

  if (!isPlainObject) {
    // A single scalar, array, or Uint8Array (BLOB) — pass through as-is.
    return [value];
  }

  const keys = Object.keys(value);
  if (keys.length === 0 || keys.every((k) => /^[@:$]/.test(k))) {
    // Empty object, or already sigil-prefixed (e.g. someone passes
    // { "@name": ... } directly) — pass through untouched.
    return [value];
  }

  // Map each bare key (e.g. "name") to the sigil-prefixed token that
  // actually appears in the SQL text (e.g. "@name", ":name", "$name").
  const tokenByName = {};
  const paramRe = /[@:$]([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = paramRe.exec(sql))) {
    tokenByName[match[1]] = match[0];
  }

  const rebound = {};
  for (const key of keys) {
    rebound[tokenByName[key] || `@${key}`] = value[key];
  }
  return [rebound];
}

// Note: this returns a statement-*shaped* wrapper (get/all/run), but under
// the hood it calls node-sqlite3-wasm's Database-level get/all/run
// convenience methods rather than db.prepare(sql) + a long-lived Statement
// handle. Reason: node-sqlite3-wasm requires prepared statements to be
// manually finalized or they're treated as still "in progress" — and every
// call site in models/User.js and models/Enquiry.js follows the
// prepare-once-execute-once pattern (no statement is ever reused across
// multiple .run()/.get() calls), so there's nothing to gain from holding a
// Statement open, and doing so leaks memory and — worse — blocks
// VACUUM INTO (the backup mechanism below) with a "cannot VACUUM - SQL
// statements in progress" error. The Database-level convenience methods
// prepare, execute and finalize internally in one call, exactly matching
// better-sqlite3's "prepare returns something you immediately call once"
// usage here.
function wrapStatement(rawDb, sql) {
  return {
    get(...args) {
      return rawDb.get(sql, ...normalizeBindArgs(sql, args));
    },
    all(...args) {
      return rawDb.all(sql, ...normalizeBindArgs(sql, args));
    },
    run(...args) {
      return rawDb.run(sql, ...normalizeBindArgs(sql, args));
    },
    finalize() {
      // No-op: each get/all/run call above finalizes its own internal
      // statement automatically. Kept only for API-shape compatibility.
    },
  };
}

function wrapDatabase(rawDb) {
  return {
    prepare(sql) {
      return wrapStatement(rawDb, sql);
    },
    exec(sql) {
      return rawDb.exec(sql);
    },
    pragma(pragmaString) {
      // node-sqlite3-wasm has no .pragma() method — translate to a plain
      // PRAGMA statement (see the WAL note in the file header above).
      return rawDb.exec(`PRAGMA ${pragmaString}`);
    },
    // node-sqlite3-wasm has no .backup(); used by src/utils/backup.js
    // instead of better-sqlite3's db.backup(destPath). See that file for
    // why VACUUM INTO is the right replacement.
    backupTo(destPath) {
      rawDb.run("VACUUM INTO ?", [destPath]);
    },
    close() {
      return rawDb.close();
    },
  };
}

// Resolve a relative DB_PATH against this backend's own directory
// (ixitek-backend/), not the process's current working directory. This
// matters because the root package.json's `start` script runs
// `node ixitek-backend/src/server.js` from the REPO ROOT, so a plain
// path.resolve(process.env.DB_PATH) would otherwise write the database to
// an unintended <repo-root>/data/ixitek.db instead of
// ixitek-backend/data/ixitek.db. An absolute DB_PATH (e.g. a persistent
// volume path on a host) still works as-is — path.resolve ignores the
// base when the final segment is already absolute.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "ixitek.db");

let db = null;

function connectDB() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = wrapDatabase(new SqliteWasmDatabase(DB_PATH));

  // Durability + concurrency settings (see notes above).
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  console.log(`[db] Connected to SQLite (node-sqlite3-wasm) → ${DB_PATH}`);
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
