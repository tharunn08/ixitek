// /api/admin/monitoring — operational health for IXITEK staff: database,
// job queue, email outbox, payments/webhooks, backups & restore tests, and
// the system_events log (500s, DB errors, slow queries, failures).
const express = require("express");
const fs = require("fs");
const { query, one, ping } = require("../../core/db.js");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const settings = require("../../core/settings.js");
const jobs = require("../../core/jobs.js");
const { listBackups, runBackup, BACKUP_DIR } = require("../../utils/backup.js");
const { config } = require("../../core/config.js");
const { ah, badRequest, notFound } = require("../../core/errors.js");

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access"), requirePermission("monitoring.read"));

router.get("/", ah(async (req, res) => {
  const t0 = Date.now();
  let dbOk = false;
  try {
    dbOk = await ping();
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - t0;
  const [jobStats, oldest, emailStats, events24, events7, payFail, webhookFail] = await Promise.all([
    query("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status"),
    one("SELECT TIMESTAMPDIFF(SECOND, MIN(run_at), CURRENT_TIMESTAMP(3)) AS age FROM jobs WHERE status = 'queued' AND run_at <= CURRENT_TIMESTAMP(3)"),
    query("SELECT status, COUNT(*) AS n FROM email_messages WHERE created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY) GROUP BY status"),
    query("SELECT event_type, COUNT(*) AS n FROM system_events WHERE created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) GROUP BY event_type"),
    query("SELECT event_type, COUNT(*) AS n FROM system_events WHERE created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY) GROUP BY event_type"),
    one("SELECT COUNT(*) AS n FROM payments WHERE status = 'failed' AND created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)"),
    one("SELECT COUNT(*) AS n FROM payment_events WHERE status = 'failed'"),
  ]);
  const backups = listBackups();
  const latest = backups.find((b) => b.verified) || null;
  const lastRestoreTest = await settings.get("backup.last_restore_test", null);
  const obj = (rows, k = "status") => Object.fromEntries(rows.map((r) => [r[k], Number(r.n)]));
  let backupDirFree = null;
  try {
    const st = fs.statfsSync ? fs.statfsSync(BACKUP_DIR) : null;
    if (st) backupDirFree = Number(st.bavail) * Number(st.bsize);
  } catch {
    backupDirFree = null;
  }
  const mem = process.memoryUsage();
  res.set("Cache-Control", "no-store").json({
    app: { env: config.env, node: process.version, uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), pid: process.pid },
    database: { ok: dbOk, latencyMs: dbMs, slowQueryThresholdMs: config.db.slowQueryMs },
    jobs: { byStatus: obj(jobStats), oldestQueuedSec: oldest && oldest.age !== null ? Number(oldest.age) : null, workerEnabled: config.jobs.enabled },
    email: { last7Days: obj(emailStats), provider: require("../email/emailService.js").status() },
    payments: { failedLast24h: Number(payFail.n), webhookFailures: Number(webhookFail.n) },
    events: { last24h: obj(events24, "event_type"), last7d: obj(events7, "event_type") },
    backups: {
      dir: (await can(req.user, "backups.manage")) ? BACKUP_DIR : undefined,
      count: backups.length,
      latestVerified: latest ? { fileName: latest.fileName, label: latest.label, createdAt: latest.createdAt, sizeBytes: latest.sizeBytes, ageHours: Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 3.6e6) } : null,
      freeBytes: backupDirFree,
      restoreTestConfigured: Boolean(config.backups.restoreTestDb),
      lastRestoreTest,
    },
  });
}));

router.get("/events", ah(async (req, res) => {
  const where = ["1=1"];
  const p = {};
  if (req.query.type) (where.push("event_type = :t"), (p.t = String(req.query.type)));
  const lim = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = await query(`SELECT id, event_type, message, meta_json, created_at FROM system_events WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${lim}`, p);
  res.json({ events: rows.map((e) => ({ id: String(e.id), type: e.event_type, message: e.message, meta: typeof e.meta_json === "string" ? safeJson(e.meta_json) : e.meta_json, at: e.created_at })) });
}));
const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

router.get("/jobs", ah(async (req, res) => {
  const status = ["queued", "running", "dead", "succeeded"].includes(req.query.status) ? req.query.status : "dead";
  const pg = require("../../core/paging.js").paging(req);
  const rows = await query(`SELECT id, type, status, attempts, max_attempts, last_error, run_at, updated_at FROM jobs WHERE status = :s ORDER BY id DESC ${pg.sql}`, { s: status });
  const total = await one("SELECT COUNT(*) c FROM jobs WHERE status = :s", { s: status });
  res.json({ ...require("../../core/paging.js").meta(pg, total.c), jobs: rows.map((j) => ({ id: String(j.id), type: j.type, status: j.status, attempts: j.attempts, maxAttempts: j.max_attempts, lastError: j.last_error ? String(j.last_error).split("\n")[0].slice(0, 500) : null, runAt: j.run_at, updatedAt: j.updated_at })) });
}));

router.post("/jobs/:id/retry", ah(async (req, res) => {
  const r = await query("UPDATE jobs SET status = 'queued', attempts = 0, run_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = :id AND status = 'dead'", { id: req.params.id });
  if (!r.affectedRows) throw notFound("Only failed (dead) jobs can be retried.");
  await audit.record({ req, action: "job.retry", entityType: "job", entityId: req.params.id });
  res.json({ ok: true });
}));

router.post("/backups/run", requirePermission("backups.manage"), ah(async (req, res) => {
  const b = await runBackup({ label: "manual" });
  await audit.record({ req, action: "backup.create", entityType: "backup", entityId: b.fileName });
  res.status(201).json({ backup: { fileName: b.fileName, sizeBytes: b.sizeBytes, verified: b.verified } });
}));

router.post("/backups/restore-test", requirePermission("backups.manage"), ah(async (req, res) => {
  if (!config.backups.restoreTestDb) throw badRequest("Set BACKUP_RESTORE_TEST_DB to an empty database first (see the deployment guide).");
  const id = await jobs.enqueue("backup.restore_test", {}, { idempotencyKey: `restore-test:${new Date().toISOString().slice(0, 16)}`, maxAttempts: 1 });
  await audit.record({ req, action: "backup.restore_test", entityType: "backup", entityId: String(id) });
  res.status(202).json({ queued: true, jobId: String(id) });
}));

module.exports = router;
