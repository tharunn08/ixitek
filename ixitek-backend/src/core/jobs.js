// jobs.js — durable background jobs stored in MySQL.
// Heavy or failure-prone work (imports, image checks, email, exports,
// backups) runs here, never inside an HTTP request. Jobs survive restarts,
// retry with exponential backoff, and are de-duplicated by idempotency key.
// The adapter can later be swapped for Redis/BullMQ without touching callers.
const os = require("os");
const { query, one, tx } = require("./db.js");
const { config } = require("./config.js");
const log = require("./logger.js");

const handlers = new Map();
const WORKER_ID = `${os.hostname()}:${process.pid}`;
let timer = null;
let running = false;

function register(type, handler) {
  handlers.set(type, handler);
}

async function enqueue(type, payload = {}, { runAt = null, idempotencyKey = null, maxAttempts = 5 } = {}, conn = null) {
  if (idempotencyKey) {
    const existing = await one("SELECT id FROM jobs WHERE idempotency_key = :k", { k: idempotencyKey }, conn);
    if (existing) return existing.id;
  }
  const res = await query(
    `INSERT INTO jobs (type, payload, run_at, idempotency_key, max_attempts)
     VALUES (:type, :payload, COALESCE(:runAt, CURRENT_TIMESTAMP(3)), :k, :max)`,
    { type, payload: JSON.stringify(payload), runAt, k: idempotencyKey, max: maxAttempts },
    conn
  );
  return res.insertId;
}

async function claim() {
  return tx(async (conn) => {
    const rows = await query(
      `SELECT id, type, payload, attempts, max_attempts FROM jobs
        WHERE status = 'queued' AND run_at <= CURRENT_TIMESTAMP(3)
        ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      {},
      conn
    );
    if (!rows.length) return null;
    const job = rows[0];
    await query(
      "UPDATE jobs SET status='running', attempts=attempts+1, locked_at=CURRENT_TIMESTAMP(3), locked_by=:w WHERE id=:id",
      { id: job.id, w: WORKER_ID },
      conn
    );
    job.attempts += 1;
    return job;
  });
}

async function runOne() {
  const job = await claim();
  if (!job) return false;
  const handler = handlers.get(job.type);
  const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    const result = await handler(payload, job);
    await query("UPDATE jobs SET status='succeeded', result=:r, last_error=NULL WHERE id=:id", {
      id: job.id,
      r: JSON.stringify(result === undefined ? null : result),
    });
  } catch (err) {
    const dead = job.attempts >= job.max_attempts;
    const backoffSec = Math.min(3600, 2 ** job.attempts * 15);
    log.error("job failed", { jobId: job.id, type: job.type, attempt: job.attempts, dead, err });
    await query(
      `UPDATE jobs SET status=:s, last_error=:e, run_at=DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL :b SECOND) WHERE id=:id`,
      { id: job.id, s: dead ? "dead" : "queued", e: String(err && err.stack ? err.stack : err).slice(0, 4000), b: backoffSec }
    );
  }
  return true;
}

/** Process queued jobs until the queue is empty (used by tests and CLI). */
async function drain(max = 1000) {
  let n = 0;
  while (n < max && (await runOne())) n++;
  return n;
}

async function recoverStale() {
  // Jobs left 'running' by a crashed process are re-queued after 15 minutes.
  await query("UPDATE jobs SET status='queued', locked_at=NULL, locked_by=NULL WHERE status='running' AND locked_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 15 MINUTE)");
}

function start() {
  if (!config.jobs.enabled || timer) return;
  recoverStale().catch((err) => log.error("job recovery failed", { err }));
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while (await runOne()) {
        /* keep draining */
      }
    } catch (err) {
      log.error("job worker error", { err });
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, config.jobs.pollMs);
  timer.unref();
  log.info(`[jobs] worker started (${WORKER_ID}), polling every ${config.jobs.pollMs}ms`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { register, enqueue, drain, start, stop, runOne };
