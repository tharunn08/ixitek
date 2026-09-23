// audit.js — append-only audit trail. Pass `conn` to write inside the same
// transaction as the change (so an audit row exists iff the change committed).
const { query } = require("./db.js");
const log = require("./logger.js");

function actorFrom(req) {
  if (!req) return {};
  return { actorId: req.user?.id || null, actorEmail: req.user?.email || null, ip: req.ip || null, requestId: req.id || null };
}

async function record({ req, actorId, actorEmail, action, entityType, entityId, before, after, reason, ip, requestId }, conn = null) {
  const a = { ...actorFrom(req), ...(actorId !== undefined ? { actorId } : {}), ...(actorEmail ? { actorEmail } : {}) };
  const clean = (v) => (v === undefined ? null : JSON.stringify(log.redact(v)));
  await query(
    `INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, before_json, after_json, reason, ip, request_id)
     VALUES (:actorId, :actorEmail, :action, :entityType, :entityId, :before, :after, :reason, :ip, :requestId)`,
    {
      actorId: a.actorId || null,
      actorEmail: a.actorEmail || null,
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      before: clean(before),
      after: clean(after),
      reason: reason || null,
      ip: ip || a.ip || null,
      requestId: requestId || a.requestId || null,
    },
    conn
  );
}

module.exports = { record };
