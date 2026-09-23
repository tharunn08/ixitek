// restore.js — restore a verified IXITEK backup, and automated restore testing.
//
//   node src/utils/restore.js <backup.sql.gz> --into <database> --yes
//       Verifies the file, then replays it into <database> (all tables in the
//       backup are dropped and recreated there). Refuses to target the live
//       DB_NAME unless --i-understand-this-overwrites-production is also given.
//
//   node src/utils/restore.js --test [backup.sql.gz]
//       Restores the newest (or given) backup into BACKUP_RESTORE_TEST_DB (an
//       empty database created for this purpose in hPanel), compares every
//       table's row count with the manifest, then drops the restored tables.
//       Proves the backups can actually be restored.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const mysql = require("mysql2/promise");
const { config } = require("../core/config.js");
const { verifyBackup, listBackups, BACKUP_DIR } = require("./backup.js");
const log = require("../core/logger.js");

async function connectTo(database) {
  return mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database, charset: "utf8mb4", timezone: "Z", multipleStatements: false, ssl: config.db.ssl });
}

/** Stream statements out of a backup: INSERTs are one per line; CREATE TABLE spans lines until a line ending with ';'. */
async function* statements(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let buf = "";
  for await (const line of rl) {
    if (!buf && (line.startsWith("--") || !line.trim())) continue;
    buf += (buf ? "\n" : "") + line;
    if (line.endsWith(";")) {
      yield buf;
      buf = "";
    }
  }
  if (buf.trim()) throw new Error("Backup ends with an incomplete statement.");
}

async function restore(file, database, { onProgress } = {}) {
  const v = await verifyBackup(file);
  if (!v.ok) throw new Error(`Refusing to restore an unverified backup: ${v.problems.join("; ")}`);
  const conn = await connectTo(database);
  let n = 0;
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("SET UNIQUE_CHECKS = 0");
    await conn.beginTransaction();
    for await (const stmt of statements(file)) {
      if (/^SET (NAMES|FOREIGN_KEY_CHECKS)/.test(stmt)) continue;
      // DDL commits implicitly in MySQL; INSERT batches are committed per table.
      if (/^(DROP|CREATE) TABLE/.test(stmt)) {
        await conn.commit();
        await conn.query(stmt);
        await conn.beginTransaction();
      } else await conn.query(stmt);
      n++;
      if (onProgress && n % 5000 === 0) onProgress(n);
    }
    await conn.commit();
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.query("SET UNIQUE_CHECKS = 1");
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    await conn.end();
  }
  return { statements: n };
}

/** Restore into the configured scratch database, compare row counts with the manifest, clean up. */
async function restoreTest(file = null) {
  const target = config.backups.restoreTestDb;
  if (!target) return { ok: false, skipped: true, reason: "BACKUP_RESTORE_TEST_DB is not set (create an empty database for restore tests and set it)." };
  if (target === config.db.database) return { ok: false, skipped: true, reason: "BACKUP_RESTORE_TEST_DB must not be the live database." };
  const latest = file ? { fileName: path.basename(file) } : listBackups().find((b) => b.verified);
  if (!latest) return { ok: false, reason: "No verified backup found." };
  const full = file || path.join(BACKUP_DIR, latest.fileName);
  const manifest = JSON.parse(fs.readFileSync(full.replace(/\.sql\.gz$/, ".manifest.json"), "utf8"));
  const started = Date.now();
  const problems = [];
  try {
    await restore(full, target);
    const conn = await connectTo(target);
    try {
      for (const [t, expected] of Object.entries(manifest.tables)) {
        const [[r]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
        if (Number(r.c) !== expected) problems.push(`${t}: expected ${expected}, restored ${r.c}`);
      }
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of Object.keys(manifest.tables)) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
    } finally {
      await conn.end();
    }
  } catch (err) {
    problems.push(err.message);
  }
  const result = { ok: problems.length === 0, file: latest.fileName, tables: Object.keys(manifest.tables).length, durationMs: Date.now() - started, problems, testedAt: new Date().toISOString() };
  await require("../core/settings.js").set("backup.last_restore_test", result).catch(() => {});
  if (!result.ok) require("../core/monitor.js").event("backup_failure", `Restore test FAILED for ${latest.fileName}: ${problems.slice(0, 3).join("; ")}`, {});
  else log.info("[backup] restore test passed", { file: latest.fileName, tables: result.tables });
  return result;
}
require("../core/jobs.js").register("backup.restore_test", () => restoreTest());

if (require.main === module) {
  const args = process.argv.slice(2);
  const db = require("../core/db.js");
  const done = (p) =>
    p
      .then((r) => (console.log(JSON.stringify(r, null, 2)), db.close()))
      .then(() => process.exit(0))
      .catch((err) => (console.error(err.message), process.exit(1)));
  if (args[0] === "--test") done(restoreTest(args[1] ? path.resolve(args[1]) : null));
  else {
    const file = args[0] && path.resolve(args[0]);
    const into = args[args.indexOf("--into") + 1];
    if (!file || args.indexOf("--into") < 0 || !into || !args.includes("--yes")) {
      console.error("Usage: node src/utils/restore.js <backup.sql.gz> --into <database> --yes");
      process.exit(2);
    }
    if (into === config.db.database && !args.includes("--i-understand-this-overwrites-production")) {
      console.error(`Refusing to overwrite the live database "${into}". Restore into another database first, or add --i-understand-this-overwrites-production.`);
      process.exit(2);
    }
    done(restore(file, into, { onProgress: (n) => console.log(`… ${n} statements`) }));
  }
}

module.exports = { restore, restoreTest, statements };
