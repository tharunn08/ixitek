// core/db.js — the MySQL data layer (replaces the SQLite db.js).
//
//  • One mysql2 connection pool, utf8mb4, UTC, prepared statements only.
//  • DECIMAL columns come back as strings (never JS floats) — money maths
//    happens in core/money.js with decimal.js.
//  • tx(fn) runs fn(conn) inside a transaction: COMMIT on success,
//    ROLLBACK on any throw, so no partial business data is ever left behind.
//  • Queries slower than DB_SLOW_QUERY_MS are logged (slow-query monitoring).
//  • Works with MySQL 8 and MariaDB 10.6+ (Hostinger).
const mysql = require("mysql2/promise");
const { config } = require("./config.js");
const log = require("./logger.js");

let pool = null;

function poolOptions(overrides = {}) {
  return {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl,
    connectionLimit: config.db.connectionLimit,
    waitForConnections: true,
    queueLimit: 0,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    dateStrings: false,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    namedPlaceholders: true,
    enableKeepAlive: true,
    ...overrides,
  };
}

function getPool() {
  if (!pool) {
    if (!config.db.user || !config.db.database) {
      throw new Error("MySQL is not configured. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME.");
    }
    pool = mysql.createPool(poolOptions());
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
      conn.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    });
  }
  return pool;
}

async function timed(runner, sql, params) {
  const started = Date.now();
  try {
    return await runner.execute(sql, params);
  } finally {
    const ms = Date.now() - started;
    if (ms >= config.db.slowQueryMs) {
      const text = sql.replace(/\s+/g, " ").slice(0, 300);
      log.warn("slow query", { ms, sql: text });
      if (!/system_events/.test(sql)) require("./monitor.js").event("slow_query", `${ms} ms`, { sql: text });
    }
  }
}

/** Run a statement and return rows (SELECT) or the ResultSetHeader (writes). */
async function query(sql, params = {}, conn = null) {
  const [rows] = await timed(conn || getPool(), sql, params);
  return rows;
}

/** Like query() but uses the text protocol — needed for IN (?) list expansion and LIMIT placeholders on some servers. */
async function queryText(sql, params = [], conn = null) {
  const runner = conn || getPool();
  const started = Date.now();
  const [rows] = await runner.query(sql, params);
  const ms = Date.now() - started;
  if (ms >= config.db.slowQueryMs) log.warn("slow query", { ms, sql: sql.replace(/\s+/g, " ").slice(0, 300) });
  return rows;
}

async function one(sql, params = {}, conn = null) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/** Run fn(conn) in a transaction. Retries once on deadlock. */
async function tx(fn, { retries = 1 } = {}) {
  const conn = await getPool().getConnection();
  try {
    for (let attempt = 0; ; attempt++) {
      await conn.beginTransaction();
      try {
        const result = await fn(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback().catch(() => {});
        if (attempt < retries && (err.code === "ER_LOCK_DEADLOCK" || err.errno === 1213 || err.code === "ER_LOCK_WAIT_TIMEOUT")) {
          await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  } finally {
    conn.release();
  }
}

/** Parse a JSON column (MariaDB returns JSON as a string, MySQL as an object). */
function json(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

async function ping() {
  const row = await one("SELECT 1 AS ok");
  return row && Number(row.ok) === 1;
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { getPool, poolOptions, query, queryText, one, tx, json, ping, close };
