// crm.js — leads, pipeline, activities/follow-ups and a customer 360 view.
// Leads are created automatically from website enquiries and RFQs (via
// events) and manually by sales staff. Mounted at /api/admin/crm.
const express = require("express");
const { query, one, tx } = require("../../core/db.js");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const { D } = require("../../core/money.js");
const { ah, badRequest, notFound } = require("../../core/errors.js");

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
const s = (v, n) => String(v ?? "").trim().slice(0, n);

// ── Automatic lead capture ──
events.on("enquiry.created", async ({ enquiryId }) => {
  const e = await one("SELECT * FROM enquiries WHERE id = :id", { id: enquiryId });
  if (!e || e.type !== "enquiry") return;
  await query(
    "INSERT IGNORE INTO crm_leads (source, name, email, phone, company_name, enquiry_id, user_id, notes) VALUES ('enquiry', :n, :e, :p, :c, :id, :u, :m)",
    { n: e.name, e: e.email, p: e.phone, c: e.company, id: e.id, u: e.user_id, m: [e.category, e.message].filter(Boolean).join("\n\n").slice(0, 5000) }
  );
});
events.on("rfq.submitted", async ({ rfqId }) => {
  const r = await one("SELECT * FROM rfqs WHERE id = :id", { id: rfqId });
  if (!r) return;
  await query(
    "INSERT IGNORE INTO crm_leads (source, name, email, phone, company_name, country_code, rfq_id, user_id, company_id, stage, owner_id) VALUES ('rfq', :n, :e, :p, :c, :cc, :id, :u, :co, 'qualified', :o)",
    { n: r.contact_name, e: r.contact_email, p: r.contact_phone, c: r.company_name, cc: r.country_code, id: r.id, u: r.user_id, co: r.company_id, o: r.assigned_to }
  );
});

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access"), requirePermission("crm.manage"));

function leadJson(l) {
  return {
    id: String(l.id), source: l.source, name: l.name, email: l.email, phone: l.phone, company: l.company_name, country: l.country_code, stage: l.stage, lostReason: l.lost_reason,
    valueUsd: l.value_usd, owner: l.owner_id ? { id: String(l.owner_id), email: l.owner_email || null } : null, companyId: l.company_id ? String(l.company_id) : null, userId: l.user_id ? String(l.user_id) : null,
    enquiryId: l.enquiry_id ? String(l.enquiry_id) : null, rfqId: l.rfq_id ? String(l.rfq_id) : null, rfqNumber: l.rfq_number || null, nextFollowUp: l.next_follow_up, notes: l.notes, createdAt: l.created_at, updatedAt: l.updated_at,
  };
}

router.get("/pipeline", ah(async (req, res) => {
  const rows = await query("SELECT stage, COUNT(*) AS n, SUM(COALESCE(value_usd, 0)) AS v FROM crm_leads WHERE deleted_at IS NULL GROUP BY stage");
  const by = new Map(rows.map((r) => [r.stage, r]));
  const due = await query(
    `SELECT a.id, a.entity_type, a.entity_id, a.kind, a.subject, a.due_at, u.email AS owner FROM crm_activities a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.completed_at IS NULL AND a.due_at IS NOT NULL AND a.due_at < DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY) ${req.query.mine === "1" ? "AND a.owner_id = :me" : ""} ORDER BY a.due_at LIMIT 100`,
    { me: req.user.id }
  );
  const followUps = await query(`SELECT id, name, company_name, stage, next_follow_up FROM crm_leads WHERE deleted_at IS NULL AND stage NOT IN ('won','lost') AND next_follow_up IS NOT NULL AND next_follow_up <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY) ${req.query.mine === "1" ? "AND owner_id = :me" : ""} ORDER BY next_follow_up LIMIT 100`, { me: req.user.id });
  res.json({
    stages: STAGES.map((st) => ({ stage: st, count: Number((by.get(st) || {}).n || 0), valueUsd: D((by.get(st) || {}).v || 0).toFixed(2) })),
    dueActivities: due.map((a) => ({ id: String(a.id), entityType: a.entity_type, entityId: String(a.entity_id), kind: a.kind, subject: a.subject, dueAt: a.due_at, owner: a.owner })),
    followUps: followUps.map((l) => ({ id: String(l.id), name: l.name, company: l.company_name, stage: l.stage, nextFollowUp: l.next_follow_up })),
  });
}));

router.get("/leads", ah(async (req, res) => {
  const where = ["l.deleted_at IS NULL"];
  const p = {};
  if (req.query.stage) (where.push("l.stage = :st"), (p.st = String(req.query.stage)));
  if (req.query.owner === "me") (where.push("l.owner_id = :me"), (p.me = req.user.id));
  if (req.query.source) (where.push("l.source = :src"), (p.src = String(req.query.source)));
  if (req.query.q) (where.push("(l.name LIKE :q OR l.email LIKE :q OR l.company_name LIKE :q)"), (p.q = `%${s(req.query.q, 80)}%`));
  const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const off = (Math.max(Number(req.query.page) || 1, 1) - 1) * lim;
  const rows = await query(`SELECT l.*, u.email AS owner_email, r.rfq_number FROM crm_leads l LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN rfqs r ON r.id = l.rfq_id WHERE ${where.join(" AND ")} ORDER BY l.updated_at DESC LIMIT ${lim} OFFSET ${off}`, p);
  const total = await one(`SELECT COUNT(*) c FROM crm_leads l WHERE ${where.join(" AND ")}`, p);
  res.json({ total: Number(total.c), leads: rows.map(leadJson) });
}));

function cleanLead(b, partial = false) {
  const out = {};
  const set = (k, v) => (v !== undefined ? (out[k] = v) : null);
  if (!partial || b.name !== undefined) {
    const n = s(b.name, 150);
    if (!n) throw badRequest("Name is required.");
    out.name = n;
  }
  if (b.email !== undefined) {
    const e = s(b.email, 254).toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest("Invalid email.");
    out.email = e;
  }
  set("phone", b.phone !== undefined ? s(b.phone, 40) : undefined);
  set("company_name", b.company !== undefined ? s(b.company, 200) : undefined);
  set("country_code", b.country !== undefined ? s(b.country, 2).toUpperCase() || null : undefined);
  if (b.stage !== undefined) {
    if (!STAGES.includes(b.stage)) throw badRequest("Invalid stage.");
    out.stage = b.stage;
    if (b.stage === "lost" && !s(b.lostReason, 300)) throw badRequest("Give a reason for losing this lead.");
  }
  set("lost_reason", b.lostReason !== undefined ? s(b.lostReason, 300) || null : undefined);
  if (b.valueUsd !== undefined) {
    if (b.valueUsd === null || b.valueUsd === "") out.value_usd = null;
    else {
      const d = D(b.valueUsd);
      if (!d.isFinite() || d.isNegative()) throw badRequest("Value must be a positive number.");
      out.value_usd = d.toFixed(2);
    }
  }
  if (b.ownerId !== undefined) out.owner_id = b.ownerId || null; // validated as staff by the caller
  set("next_follow_up", b.nextFollowUp !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(b.nextFollowUp || "") ? b.nextFollowUp : null) : undefined);
  set("notes", b.notes !== undefined ? s(b.notes, 10000) : undefined);
  set("source", b.source !== undefined && ["manual", "website", "referral", "event"].includes(b.source) ? b.source : undefined);
  return out;
}

router.post("/leads", ah(async (req, res) => {
  const l = cleanLead(req.body || {});
  if (l.owner_id) await require("./staff.js").assertStaff(l.owner_id);
  const r = await query(`INSERT INTO crm_leads (${[...Object.keys(l), "created_by"].join(", ")}) VALUES (${[...Object.keys(l), "created_by"].map((k) => `:${k}`).join(", ")})`, { ...l, created_by: req.user.id });
  await audit.record({ req, action: "crm.lead.create", entityType: "lead", entityId: String(r.insertId), after: l });
  res.status(201).json({ lead: leadJson(await one("SELECT * FROM crm_leads WHERE id = :id", { id: r.insertId })) });
}));

router.get("/leads/:id", ah(async (req, res) => {
  const l = await one("SELECT l.*, u.email AS owner_email, r.rfq_number FROM crm_leads l LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN rfqs r ON r.id = l.rfq_id WHERE l.id = :id AND l.deleted_at IS NULL", { id: req.params.id });
  if (!l) throw notFound("Lead not found.");
  const acts = await activities("lead", l.id);
  const related = l.email ? await customer360({ email: l.email }) : null;
  res.json({ lead: leadJson(l), activities: acts, related });
}));

router.patch("/leads/:id", ah(async (req, res) => {
  const before = await one("SELECT * FROM crm_leads WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
  if (!before) throw notFound("Lead not found.");
  const l = cleanLead(req.body || {}, true);
  if (!Object.keys(l).length) throw badRequest("Nothing to change.");
  if (l.owner_id) await require("./staff.js").assertStaff(l.owner_id);
  await tx(async (conn) => {
    await query(`UPDATE crm_leads SET ${Object.keys(l).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...l, id: before.id }, conn);
    if (l.stage && l.stage !== before.stage) await query("INSERT INTO crm_activities (entity_type, entity_id, kind, subject, created_by) VALUES ('lead', :id, 'note', :s, :u)", { id: before.id, s: `Stage: ${before.stage} → ${l.stage}`, u: req.user.id }, conn);
    await audit.record({ req, action: "crm.lead.update", entityType: "lead", entityId: String(before.id), before: { stage: before.stage, owner: before.owner_id }, after: l }, conn);
  });
  res.json({ lead: leadJson(await one("SELECT * FROM crm_leads WHERE id = :id", { id: before.id })) });
}));

router.delete("/leads/:id", ah(async (req, res) => {
  const r = await query("UPDATE crm_leads SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
  if (!r.affectedRows) throw notFound("Lead not found.");
  await audit.record({ req, action: "crm.lead.delete", entityType: "lead", entityId: req.params.id });
  res.json({ ok: true });
}));

async function activities(type, id) {
  const rows = await query("SELECT a.*, u.email AS owner_email, c.email AS created_by_email FROM crm_activities a LEFT JOIN users u ON u.id = a.owner_id LEFT JOIN users c ON c.id = a.created_by WHERE a.entity_type = :t AND a.entity_id = :id ORDER BY a.id DESC LIMIT 200", { t: type, id });
  return rows.map((a) => ({ id: String(a.id), kind: a.kind, subject: a.subject, body: a.body, dueAt: a.due_at, completedAt: a.completed_at, owner: a.owner_email, createdBy: a.created_by_email, createdAt: a.created_at }));
}

router.post("/activities", ah(async (req, res) => {
  const b = req.body || {};
  if (!["lead", "company", "user"].includes(b.entityType) || !b.entityId) throw badRequest("Attach the activity to a lead, company or customer.");
  if (!["note", "call", "email", "meeting", "task"].includes(b.kind || "note")) throw badRequest("Invalid activity type.");
  const subject = s(b.subject, 200);
  const body = s(b.body, 10000);
  if (!subject && !body) throw badRequest("Write something.");
  const due = b.dueAt && !Number.isNaN(Date.parse(b.dueAt)) ? new Date(b.dueAt) : null;
  const r = await query("INSERT INTO crm_activities (entity_type, entity_id, kind, subject, body, due_at, owner_id, created_by) VALUES (:t, :id, :k, :s, :b, :d, :o, :u)", { t: b.entityType, id: b.entityId, k: b.kind || "note", s: subject, b: body, d: due, o: b.ownerId || req.user.id, u: req.user.id });
  res.status(201).json({ id: String(r.insertId) });
}));

router.post("/activities/:id/complete", ah(async (req, res) => {
  const r = await query("UPDATE crm_activities SET completed_at = CURRENT_TIMESTAMP(3) WHERE id = :id AND completed_at IS NULL", { id: req.params.id });
  if (!r.affectedRows) throw notFound("Activity not found or already done.");
  res.json({ ok: true });
}));

/** Everything IXITEK knows about a customer (by user, company or email). */
async function customer360({ userId = null, companyId = null, email = null }) {
  const p = { u: userId || 0, c: companyId || 0, e: email || "" };
  const w = "(user_id = :u OR (company_id IS NOT NULL AND company_id = :c) OR customer_email = :e)";
  const ordersRows = await query(`SELECT order_number, status, payment_status, currency, total, total_usd, placed_at FROM orders WHERE ${w} ORDER BY placed_at DESC LIMIT 50`, p);
  const rfqs = await query("SELECT rfq_number, status, created_at FROM rfqs WHERE user_id = :u OR (company_id IS NOT NULL AND company_id = :c) OR contact_email = :e ORDER BY id DESC LIMIT 50", p);
  const quotes = await query("SELECT quote_number, status, current_version, created_at FROM quotes WHERE user_id = :u OR (company_id IS NOT NULL AND company_id = :c) OR customer_email = :e ORDER BY id DESC LIMIT 50", p);
  const lifetime = await one(`SELECT COALESCE(SUM(total_usd), 0) AS v, COUNT(*) AS n FROM orders WHERE ${w} AND status NOT IN ('cancelled','pending_payment','payment_failed','pending_approval')`, p);
  return {
    lifetimeValueUsd: D(lifetime.v).toFixed(2), orderCount: Number(lifetime.n),
    orders: ordersRows.map((o) => ({ orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status, currency: o.currency, total: o.total, placedAt: o.placed_at })),
    rfqs: rfqs.map((r) => ({ rfqNumber: r.rfq_number, status: r.status, createdAt: r.created_at })),
    quotes: quotes.map((q) => ({ quoteNumber: q.quote_number, status: q.status, version: q.current_version, createdAt: q.created_at })),
  };
}

router.get("/customers/:userId", ah(async (req, res) => {
  const u = await one("SELECT id, name, email, phone, company, company_id, company_role, customer_group, created_at, last_login_at FROM users WHERE id = :id AND deleted_at IS NULL", { id: req.params.userId });
  if (!u) throw notFound("Customer not found.");
  res.json({
    customer: { id: String(u.id), name: u.name, email: u.email, phone: u.phone, company: u.company, companyId: u.company_id ? String(u.company_id) : null, companyRole: u.company_role, customerGroup: u.customer_group, createdAt: u.created_at, lastLoginAt: u.last_login_at },
    activities: await activities("user", u.id),
    ...(await customer360({ userId: u.id, companyId: u.company_id, email: u.email })),
  });
}));

module.exports = { router, customer360, activities, STAGES };
