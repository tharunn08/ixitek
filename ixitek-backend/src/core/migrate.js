// migrate.js — versioned SQL migrations for MySQL/MariaDB.
//
//   node src/core/migrate.js            apply pending migrations
//   node src/core/migrate.js --status   list applied/pending
//
// • Files: src/migrations/NNNN_name.sql, applied in filename order.
// • Each applied file is recorded in schema_migrations with a SHA-256
//   checksum; editing an already-applied file is refused (write a new one).
// • GET_LOCK guarantees two app instances never migrate concurrently.
// • Statements are separated by a line containing only `-- ;;` OR by `;`
//   at end of line (no stored procedures/triggers are used).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { poolOptions } = require("./db.js");
const log = require("./logger.js");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

function listFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
}

function splitStatements(sql) {
  const noComments = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  return noComments
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function connect() {
  const opts = poolOptions();
  return mysql.createConnection({
    host: opts.host, port: opts.port, user: opts.user, password: opts.password, database: opts.database,
    ssl: opts.ssl, charset: opts.charset, timezone: "Z", multipleStatements: false,
  });
}

async function ensureTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(190) NOT NULL PRIMARY KEY,
    checksum   CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    duration_ms INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function status() {
  const conn = await connect();
  try {
    await ensureTable(conn);
    const [rows] = await conn.query("SELECT version, checksum, applied_at FROM schema_migrations");
    const applied = new Map(rows.map((r) => [r.version, r]));
    return listFiles().map((f) => ({ version: f, applied: applied.has(f), appliedAt: applied.get(f)?.applied_at || null }));
  } finally {
    await conn.end();
  }
}

async function migrate({ quiet = false } = {}) {
  const conn = await connect();
  const applied = [];
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('ixitek_migrations', 60) AS got");
    if (Number(lock.got) !== 1) throw new Error("Could not acquire migration lock (another instance is migrating).");
    await ensureTable(conn);
    const [rows] = await conn.query("SELECT version, checksum FROM schema_migrations");
    const done = new Map(rows.map((r) => [r.version, r.checksum]));

    // Pre-migration backup: before changing an existing database, take and verify a backup (DDL is not transactional in MySQL).
    const pending = listFiles().filter((f) => !done.has(f));
    const { config } = require("./config.js");
    if (pending.length && rows.length && config.backups.preMigration && !config.isTest) {
      log.info(`[migrate] ${pending.length} pending migration(s) — taking a verified pre-migration backup first`);
      const { runBackup } = require("../utils/backup.js");
      const b = await runBackup({ label: "pre-migration" });
      log.info(`[migrate] pre-migration backup ${b.fileName} verified`);
    }

    for (const file of listFiles()) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      if (done.has(file)) {
        if (done.get(file) !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied. Create a new migration instead.`);
        }
        continue;
      }
      const started = Date.now();
      if (!quiet) log.info(`[migrate] applying ${file}`);
      for (const stmt of splitStatements(sql)) {
        try {
          await conn.query(stmt);
        } catch (err) {
          err.message = `[${file}] ${err.message}\n--- statement ---\n${stmt.slice(0, 500)}`;
          throw err;
        }
      }
      await conn.query("INSERT INTO schema_migrations (version, checksum, duration_ms) VALUES (?, ?, ?)", [file, checksum, Date.now() - started]);
      applied.push(file);
    }
    await conn.query("SELECT RELEASE_LOCK('ixitek_migrations')");
    if (!quiet) log.info(applied.length ? `[migrate] applied ${applied.length} migration(s)` : "[migrate] schema is up to date");
    return applied;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const run = process.argv.includes("--status") ? status().then((s) => console.table(s)) : migrate();
  run.then(() => process.exit(0)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { migrate, status, splitStatements };
