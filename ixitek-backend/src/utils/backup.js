// backup.js — portable MySQL logical backups (no mysqldump binary needed,
// so it works on Hostinger's Node.js hosting).
//
//  • Consistent snapshot: one connection, REPEATABLE READ +
//    START TRANSACTION WITH CONSISTENT SNAPSHOT.
//  • Output: BACKUP_DIR/ixitek-<ts>.sql.gz + ixitek-<ts>.manifest.json
//    (per-table row counts, file size, SHA-256).
//  • Verification (a file existing is not enough): the gzip is re-read,
//    fully decompressed, the SHA-256 recomputed and INSERT row counts
//    re-counted and compared with the manifest.
//  • Retention: keep BACKUP_RETENTION newest.
//
//   npm run backup            create + verify
//   node src/utils/backup.js --verify <file.sql.gz>
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const readline = require("readline");
const { getPool } = require("../core/db.js");
const { config } = require("../core/config.js");
const log = require("../core/logger.js");

const BACKUP_DIR = config.backups.dir;

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function sqlValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 23).replace("T", " ")}'`;
  if (Buffer.isBuffer(v)) return `X'${v.toString("hex")}'`;
  if (typeof v === "object") v = JSON.stringify(v);
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0")}'`;
}

async function runBackup({ label = "manual" } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const base = `ixitek-${stamp()}-${label}`;
  const file = path.join(BACKUP_DIR, `${base}.sql.gz`);
  const tmp = `${file}.partial`;
  const conn = await getPool().getConnection();
  const counts = {};
  const started = Date.now();
  try {
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [tables] = await conn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");

    const gzip = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(tmp);
    gzip.pipe(out);
    const write = (s) => (gzip.write(s) ? Promise.resolve() : new Promise((r) => gzip.once("drain", r)));

    await write(`-- IXITEK backup ${new Date().toISOString()} (${label})\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n`);
    for (const { t } of tables) {
      const [[create]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      await write(`\nDROP TABLE IF EXISTS \`${t}\`;\n${create["Create Table"]};\n`);
      counts[t] = 0;
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
      const pk = cols.filter((c) => c.Key === "PRI").map((c) => `\`${c.Field}\``).join(", ") || "1";
      // JSON columns: MySQL type "json"; MariaDB stores JSON as LONGTEXT with a json_valid() CHECK. Both arrive parsed.
      const jsonCols = new Set(cols.filter((c) => /^json$/i.test(c.Type)).map((c) => c.Field));
      try {
        const [checks] = await conn.query("SELECT CHECK_CLAUSE AS c FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?", [t]);
        for (const { c } of checks) {
          const m = /json_valid\(`?([\w]+)`?\)/i.exec(c || "");
          if (m) jsonCols.add(m[1]);
        }
      } catch {
        /* MySQL < 8.0.16 has no TABLE_NAME in CHECK_CONSTRAINTS — type-based detection above applies */
      }
      const chunk = 1000;
      for (let offset = 0; ; offset += chunk) {
        const [rows] = await conn.query({ sql: `SELECT * FROM \`${t}\` ORDER BY ${pk} LIMIT ${chunk} OFFSET ${offset}`, typeCast: true });
        if (!rows.length) break;
        const names = Object.keys(rows[0]).map((c) => `\`${c}\``).join(",");
        for (const row of rows) {
          // MySQL JSON columns arrive parsed (a JSON string scalar becomes a JS string) → always re-serialise them.
          const vals = Object.entries(row).map(([c, v]) => (jsonCols.has(c) && v !== null ? sqlValue(JSON.stringify(v)) : sqlValue(v)));
          await write(`INSERT INTO \`${t}\` (${names}) VALUES (${vals.join(",")});\n`);
        }
        counts[t] += rows.length;
        if (rows.length < chunk) break;
      }
    }
    await write("\nSET FOREIGN_KEY_CHECKS=1;\n-- END OF BACKUP\n");
    await new Promise((resolve, reject) => {
      out.on("finish", resolve);
      out.on("error", reject);
      gzip.end();
    });
    await conn.query("COMMIT");
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  } finally {
    conn.release();
  }
  fs.renameSync(tmp, file);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const manifest = { file: path.basename(file), createdAt: new Date().toISOString(), label, bytes: fs.statSync(file).size, sha256, tables: counts, durationMs: Date.now() - started };
  fs.writeFileSync(file.replace(/\.sql\.gz$/, ".manifest.json"), JSON.stringify(manifest, null, 2));
  const verification = await verifyBackup(file);
  manifest.verified = verification.ok;
  manifest.verification = verification;
  fs.writeFileSync(file.replace(/\.sql\.gz$/, ".manifest.json"), JSON.stringify(manifest, null, 2));
  if (!verification.ok) {
    require("../core/monitor.js").event("backup_failure", `Backup verification failed: ${verification.problems.join("; ")}`, { file: manifest.file });
    throw new Error(`Backup verification failed: ${verification.problems.join("; ")}`);
  }
  log.info("[backup] created and verified", { file: manifest.file, bytes: manifest.bytes, tables: Object.keys(counts).length });
  pruneOldBackups();
  return { fileName: manifest.file, path: file, createdAt: manifest.createdAt, sizeBytes: manifest.bytes, verified: true };
}

async function verifyBackup(file) {
  const problems = [];
  const manifestPath = file.replace(/\.sql\.gz$/, ".manifest.json");
  if (!fs.existsSync(file)) return { ok: false, problems: ["file missing"] };
  const stat = fs.statSync(file);
  if (stat.size < 100) problems.push("file suspiciously small");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  if (!manifest) problems.push("manifest missing");
  if (manifest) {
    const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (sha !== manifest.sha256) problems.push("checksum mismatch");
  }
  const counts = {};
  let ended = false;
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    for await (const line of rl) {
      const m = /^INSERT INTO `([^`]+)`/.exec(line);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
      if (line === "-- END OF BACKUP") ended = true;
    }
  } catch (err) {
    problems.push(`gzip/SQL unreadable: ${err.message}`);
  }
  if (!ended) problems.push("backup is truncated (end marker missing)");
  if (manifest) {
    for (const [t, n] of Object.entries(manifest.tables)) {
      if ((counts[t] || 0) !== n) problems.push(`row count mismatch in ${t}: manifest ${n}, file ${counts[t] || 0}`);
    }
  }
  return { ok: problems.length === 0, problems, checkedAt: new Date().toISOString() };
}

const TIERS = ["daily", "weekly", "monthly", "interval"];
const tierOf = (label) => (TIERS.includes(label) ? label : "other");

/** Tiered retention: keep the newest N of each tier (daily/weekly/monthly/interval/other). Never deletes the newest verified backup. */
function pruneOldBackups() {
  const files = listBackups();
  const newestVerified = files.find((b) => b.verified);
  const byTier = {};
  for (const b of files) (byTier[tierOf(b.label)] = byTier[tierOf(b.label)] || []).push(b);
  for (const [tier, list] of Object.entries(byTier)) {
    const keep = config.backups.keep[tier] ?? config.backups.retention;
    for (const b of list.slice(keep)) {
      if (newestVerified && b.fileName === newestVerified.fileName) continue;
      fs.rmSync(path.join(BACKUP_DIR, b.fileName), { force: true });
      fs.rmSync(path.join(BACKUP_DIR, b.fileName.replace(/\.sql\.gz$/, ".manifest.json")), { force: true });
      log.info(`[backup] pruned ${b.fileName} (${tier})`);
    }
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("ixitek-") && f.endsWith(".sql.gz"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f.replace(/\.sql\.gz$/, ".manifest.json")), "utf8"));
      } catch {
        /* no manifest */
      }
      const label = manifest ? manifest.label : (/-([a-z-]+)\.sql\.gz$/.exec(f) || [])[1] || "other";
      return { fileName: f, label, sizeBytes: stat.size, createdAt: manifest ? manifest.createdAt : stat.mtime.toISOString(), verified: Boolean(manifest && manifest.verified), tables: manifest ? Object.keys(manifest.tables).length : null, rows: manifest ? Object.values(manifest.tables).reduce((a, n) => a + n, 0) : null };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Automatic backups: one tiered backup per UTC day (monthly on the 1st, weekly on Sundays, daily otherwise)
 * plus optional interval backups every BACKUP_INTERVAL_HOURS (< 24). Checked hourly; a restart never skips a day.
 */
function scheduleBackups() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const list = listBackups();
      const hasToday = list.some((b) => ["daily", "weekly", "monthly"].includes(b.label) && b.createdAt.slice(0, 10) === today);
      if (!hasToday) {
        const label = now.getUTCDate() === 1 ? "monthly" : now.getUTCDay() === 0 ? "weekly" : "daily";
        await runBackup({ label });
      } else if (config.backups.intervalHours < 24) {
        const last = list[0];
        if (!last || Date.now() - new Date(last.createdAt).getTime() >= config.backups.intervalHours * 3.6e6) await runBackup({ label: "interval" });
      }
    } catch (err) {
      log.error("[backup] scheduled backup FAILED", { err });
      require("../core/monitor.js").event("backup_failure", `Scheduled backup failed: ${err.message}`, {});
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60 * 1000).unref();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  const inside = path.resolve(BACKUP_DIR).startsWith(path.resolve(__dirname, "..", ".."));
  if (inside && config.isProd) {
    log.warn(`[backup] BACKUP_DIR (${BACKUP_DIR}) is inside the application directory — a redeploy could delete it. Set BACKUP_DIR outside the app folder.`);
    require("../core/monitor.js").event("backup_failure", "BACKUP_DIR is inside the application directory; set it outside the deployment folder.", {});
  }
  log.info(`[backup] tiered verified backups (daily/weekly/monthly${config.backups.intervalHours < 24 ? ` + every ${config.backups.intervalHours}h` : ""}) → ${BACKUP_DIR}`);
  return timer;
}

if (require.main === module) {
  const db = require("../core/db.js");
  const i = process.argv.indexOf("--verify");
  const job = i > -1 ? verifyBackup(path.resolve(process.argv[i + 1])).then((r) => console.log(r)) : runBackup({ label: process.argv[2] || "manual" }).then((r) => console.log(r));
  job
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { runBackup, verifyBackup, listBackups, scheduleBackups, BACKUP_DIR };
