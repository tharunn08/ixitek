// scheduler.js — periodic jobs on top of the MySQL job queue. Each period
// enqueues at most one job (idempotency key = job + period), so several app
// instances can run the scheduler without duplicate work.
const jobs = require("./jobs.js");
const log = require("./logger.js");

const timers = [];

/**
 * every("quotes.expiry", { periodHours: 24 }) — enqueue `type` once per period.
 * The check runs every `checkMinutes` (default 15) so a restart never skips a period.
 */
function every(type, { periodHours = 24, checkMinutes = 15, payload = {} } = {}) {
  const tick = () => {
    const period = Math.floor(Date.now() / (periodHours * 3.6e6));
    jobs.enqueue(type, payload, { idempotencyKey: `sched:${type}:${period}`, maxAttempts: 3 }).catch((err) => log.warn(`[scheduler] could not enqueue ${type}`, { err: err.message }));
  };
  tick();
  const t = setInterval(tick, checkMinutes * 60 * 1000);
  t.unref();
  timers.push(t);
}

function stopAll() {
  timers.splice(0).forEach(clearInterval);
}

module.exports = { every, stopAll };
