// monitor.js — lightweight operational event log (5xx, payment failures,
// email failures, webhook failures, backup failures, FX failures, slow
// queries, import failures). Surfaced in Admin → Monitoring. Never stores
// secrets (messages go through the logger's redaction first).
const log = require("./logger.js");

let dbQuery = null;
function db() {
  if (!dbQuery) dbQuery = require("./db.js").query;
  return dbQuery;
}

async function event(type, message, meta = null) {
  try {
    await db()(
      "INSERT INTO system_events (event_type, message, meta_json) VALUES (:t, :m, :j)",
      { t: String(type).slice(0, 60), m: String(message || "").slice(0, 1000), j: meta ? JSON.stringify(log.redact(meta)) : null }
    );
  } catch (err) {
    // Monitoring must never break the request it is observing.
    log.warn("monitor event not stored", { type, err: err.message });
  }
}

module.exports = { event };
