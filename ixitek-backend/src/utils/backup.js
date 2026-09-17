// utils/backup.js — protects against the kind of data loss WAL mode can't
// cover: a deleted file, a corrupted disk, a bad deploy that wipes the
// data/ folder. WAL + `synchronous = FULL` (see db.js) already make sure a
// crash or power loss mid-write can't corrupt what's already committed —
// this file is the second half of "no data loss": a standing copy
// somewhere else.
//
// Uses better-sqlite3's built-in `.backup()`, which performs a safe
// *online* backup (it can run while the server is up and being written
// to — it does not lock out other requests) rather than a raw file copy,
// which could grab a half-written WAL and produce a broken copy.
//
// Three ways this runs:
//   1. Automatically on an interval while the server is running (wired up
//      in server.js) — set BACKUP_INTERVAL_HOURS in .env (default 6).
//   2. On demand: `npm run backup`.
//   3. On demand from the admin panel: POST /api/admin/backup (owner only).
//
// Old backups beyond BACKUP_RETENTION (default 30) are pruned automatically
// so this can't quietly fill the disk.

const path = require("path");
const fs = require("fs");
const { getDB, DB_PATH } = require("../db.js");

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(DB_PATH), "backups");

const RETENTION = Number(process.env.BACKUP_RETENTION) || 30;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const db = getDB();
  const fileName = `ixitek-${timestamp()}.db`;
  const destPath = path.join(BACKUP_DIR, fileName);

  await db.backup(destPath);
  console.log(`[backup] Wrote ${destPath}`);

  pruneOldBackups();
  return { fileName, path: destPath, createdAt: new Date().toISOString() };
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("ixitek-") && f.endsWith(".db"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const { f } of files.slice(RETENTION)) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`[backup] Pruned old backup ${f} (keeping the newest ${RETENTION})`);
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("ixitek-") && f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { fileName: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Wires up the recurring backup timer. Call once, after connectDB(). */
function scheduleBackups() {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS);
  const intervalHours = Number.isFinite(hours) && hours > 0 ? hours : 6;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const timer = setInterval(() => {
    runBackup().catch((err) => console.error("[backup] Scheduled backup failed:", err.message));
  }, intervalMs);
  timer.unref(); // don't keep the process alive just for this timer

  console.log(`[backup] Automatic backups every ${intervalHours}h → ${BACKUP_DIR}`);
  return timer;
}

// `npm run backup` — one-off backup from the command line.
if (require.main === module) {
  require("dotenv").config();
  const { connectDB, disconnectDB } = require("../db.js");
  connectDB();
  runBackup()
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runBackup, listBackups, scheduleBackups, BACKUP_DIR };
