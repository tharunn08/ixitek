// companies.js — B2B company accounts.
// Customers apply (pending) → IXITEK approves and sets customer group,
// payment terms, credit limit and approval threshold. Company admins invite
// colleagues with roles: admin, buyer, finance, technical, approver, viewer.
const express = require("express");
const crypto = require("crypto");
const { query, one, tx } = require("../../core/db.js");
const { paging, meta } = require("../../core/paging.js");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const email = require("../email/emailService.js");
const { D } = require("../../core/money.js");
const { ah, badRequest, conflict, forbidden, notFound } = require("../../core/errors.js");

const ROLES = ["admin", "buyer", "finance", "technical", "approver", "viewer"];
const TERMS = ["prepaid", "net15", "net30", "net45", "net60"];
const s = (v, n) => String(v ?? "").trim().slice(0, n);
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

function companyJson(c, { internal = false } = {}) {
  return {
    id: String(c.id), legalName: c.legal_name, displayName: c.display_name, country: c.country_code, taxId: c.tax_id, registrationNo: c.registration_no, status: c.status,
    paymentTerms: c.payment_terms, creditLimitUsd: c.credit_limit_usd, orderApprovalThresholdUsd: c.order_approval_threshold_usd, customerGroup: internal ? c.customer_group : undefined,
    salespersonId: internal && c.salesperson_id ? String(c.salesperson_id) : undefined, createdAt: c.created_at,
  };
}

// ── Customer side (mounted under /api/account/company) ──
const account = express.Router();
account.use(requireAuth);

account.get("/", ah(async (req, res) => {
  if (!req.user.company_id) return res.json({ company: null });
  const c = await one("SELECT * FROM companies WHERE id = :id AND deleted_at IS NULL", { id: req.user.company_id });
  if (!c) return res.json({ company: null });
  const members = await query("SELECT id, name, email, company_role, last_login_at FROM users WHERE company_id = :c AND deleted_at IS NULL ORDER BY name", { c: c.id });
  const invites = req.user.company_role === "admin" ? await query("SELECT id, email, company_role, expires_at, accepted_at, revoked_at FROM company_invitations WHERE company_id = :c ORDER BY id DESC LIMIT 50", { c: c.id }) : [];
  let credit = null;
  if (["admin", "finance"].includes(req.user.company_role) && D(c.credit_limit_usd).gt(0)) {
    const open = await one("SELECT COALESCE(SUM(total_usd - amount_paid / exchange_rate), 0) AS v FROM orders WHERE company_id = :c AND payment_method = 'purchase_order' AND payment_status <> 'paid' AND status NOT IN ('cancelled','refunded')", { c: c.id });
    credit = { limitUsd: c.credit_limit_usd, usedUsd: D(open.v).toFixed(2), availableUsd: D(c.credit_limit_usd).minus(open.v).toFixed(2) };
  }
  res.json({
    company: companyJson(c), myRole: req.user.company_role, credit,
    members: members.map((m) => ({ id: String(m.id), name: m.name, email: m.email, role: m.company_role, lastLoginAt: m.last_login_at })),
    invitations: invites.map((i) => ({ id: String(i.id), email: i.email, role: i.company_role, expiresAt: i.expires_at, status: i.accepted_at ? "accepted" : i.revoked_at ? "revoked" : new Date(i.expires_at) < new Date() ? "expired" : "pending" })),
  });
}));

account.post("/", ah(async (req, res) => {
  if (req.user.company_id) throw conflict("You already belong to a company account.");
  const b = req.body || {};
  const legalName = s(b.legalName, 200);
  if (legalName.length < 2) throw badRequest("Enter the company's registered name.");
  const country = s(b.country, 2).toUpperCase();
  if (!(await one("SELECT code FROM countries WHERE code = :c", { c: country }))) throw badRequest("Choose the company's country.");
  const id = await tx(async (conn) => {
    const r = await query("INSERT INTO companies (legal_name, display_name, country_code, tax_id, registration_no, customer_group, status) VALUES (:n, :d, :c, :t, :r, 'business', 'pending')", { n: legalName, d: s(b.displayName, 200), c: country, t: s(b.taxId, 60) || null, r: s(b.registrationNo, 80) || null }, conn);
    await query("UPDATE users SET company_id = :c, company_role = 'admin' WHERE id = :u", { c: r.insertId, u: req.user.id }, conn);
    await audit.record({ req, action: "company.apply", entityType: "company", entityId: String(r.insertId), after: { legalName, country } }, conn);
    return r.insertId;
  });
  res.status(201).json({ companyId: String(id), status: "pending" });
}));

function requireCompanyAdmin(req) {
  if (!req.user.company_id || req.user.company_role !== "admin") throw forbidden("Only your company administrator can do that.");
}

account.post("/invitations", ah(async (req, res) => {
  requireCompanyAdmin(req);
  const c = await one("SELECT * FROM companies WHERE id = :id", { id: req.user.company_id });
  if (c.status !== "approved") throw conflict("Your company account is awaiting approval.");
  const to = s(req.body.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw badRequest("Enter a valid email.");
  const role = ROLES.includes(req.body.role) ? req.body.role : null;
  if (!role) throw badRequest("Choose a role.");
  const existing = await one("SELECT company_id FROM users WHERE email = :e AND deleted_at IS NULL", { e: to });
  if (existing && existing.company_id) throw conflict("That person already belongs to a company account.");
  const token = crypto.randomBytes(32).toString("base64url");
  const r = await query("INSERT INTO company_invitations (company_id, email, company_role, token_hash, invited_by, expires_at) VALUES (:c, :e, :r, :h, :u, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY))", { c: c.id, e: to, r: role, h: hash(token), u: req.user.id });
  const site = require("../email/templates.js").site();
  await email.queue("generic", to, { subject: `Invitation to join ${c.legal_name} on IXITEK`, title: `Join ${c.legal_name} on IXITEK`, message: `${req.user.name} invited you to buy on behalf of ${c.legal_name} (role: ${role}). Sign in or create an account with this email address, then open the link. The invitation expires in 7 days.`, cta: { label: "Accept invitation", url: `${site}/account/company/join?token=${token}` } }, { key: `invite:${r.insertId}`, related: { type: "company", id: c.id } });
  await audit.record({ req, action: "company.invite", entityType: "company", entityId: String(c.id), after: { email: to, role } });
  res.status(201).json({ ok: true });
}));

account.delete("/invitations/:id", ah(async (req, res) => {
  requireCompanyAdmin(req);
  const r = await query("UPDATE company_invitations SET revoked_at = CURRENT_TIMESTAMP(3) WHERE id = :id AND company_id = :c AND accepted_at IS NULL AND revoked_at IS NULL", { id: req.params.id, c: req.user.company_id });
  if (!r.affectedRows) throw notFound("Invitation not found.");
  res.json({ ok: true });
}));

account.post("/join", ah(async (req, res) => {
  const token = s(req.body.token, 100);
  const inv = token ? await one("SELECT * FROM company_invitations WHERE token_hash = :h", { h: hash(token) }) : null;
  if (!inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date()) throw badRequest("This invitation is invalid or has expired.");
  if (inv.email !== req.user.email) throw forbidden("This invitation was sent to a different email address.");
  if (req.user.company_id) throw conflict("You already belong to a company account.");
  await tx(async (conn) => {
    await query("UPDATE users SET company_id = :c, company_role = :r WHERE id = :u", { c: inv.company_id, r: inv.company_role, u: req.user.id }, conn);
    await query("UPDATE company_invitations SET accepted_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: inv.id }, conn);
    await audit.record({ req, action: "company.join", entityType: "company", entityId: String(inv.company_id), after: { role: inv.company_role } }, conn);
  });
  res.json({ ok: true });
}));

account.patch("/members/:id", ah(async (req, res) => {
  requireCompanyAdmin(req);
  const role = req.body.role;
  if (!ROLES.includes(role)) throw badRequest("Choose a role.");
  await tx(async (conn) => {
    const m = await one("SELECT id, company_role FROM users WHERE id = :id AND company_id = :c FOR UPDATE", { id: req.params.id, c: req.user.company_id }, conn);
    if (!m) throw notFound("Member not found.");
    if (m.company_role === "admin" && role !== "admin") {
      const admins = await one("SELECT COUNT(*) AS n FROM users WHERE company_id = :c AND company_role = 'admin' AND deleted_at IS NULL", { c: req.user.company_id }, conn);
      if (Number(admins.n) <= 1) throw conflict("A company needs at least one administrator.");
    }
    await query("UPDATE users SET company_role = :r WHERE id = :id", { r: role, id: m.id }, conn);
    await audit.record({ req, action: "company.member_role", entityType: "user", entityId: String(m.id), before: { role: m.company_role }, after: { role } }, conn);
  });
  res.json({ ok: true });
}));

account.delete("/members/:id", ah(async (req, res) => {
  requireCompanyAdmin(req);
  await tx(async (conn) => {
    const m = await one("SELECT id, company_role FROM users WHERE id = :id AND company_id = :c FOR UPDATE", { id: req.params.id, c: req.user.company_id }, conn);
    if (!m) throw notFound("Member not found.");
    if (m.company_role === "admin") {
      const admins = await one("SELECT COUNT(*) AS n FROM users WHERE company_id = :c AND company_role = 'admin' AND deleted_at IS NULL", { c: req.user.company_id }, conn);
      if (Number(admins.n) <= 1) throw conflict("A company needs at least one administrator.");
    }
    await query("UPDATE users SET company_id = NULL, company_role = NULL WHERE id = :id", { id: m.id }, conn);
    await audit.record({ req, action: "company.member_remove", entityType: "user", entityId: String(m.id) }, conn);
  });
  res.json({ ok: true });
}));

// ── Staff side (/api/admin/companies) ──
const admin = express.Router();
admin.use(requireAuth, requirePermission("admin.access"));

admin.get("/", requirePermission("users.read"), ah(async (req, res) => {
  const where = ["c.deleted_at IS NULL"];
  const p = {};
  if (req.query.status) (where.push("c.status = :s"), (p.s = String(req.query.status)));
  if (req.query.q) (where.push("(c.legal_name LIKE :q OR c.display_name LIKE :q OR c.tax_id LIKE :q)"), (p.q = `%${s(req.query.q, 80)}%`));
  const pg = paging(req);
  const rows = await query(`SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS members FROM companies c WHERE ${where.join(" AND ")} ORDER BY c.status = 'pending' DESC, c.id DESC ${pg.sql}`, p);
  const total = await one(`SELECT COUNT(*) c FROM companies c WHERE ${where.join(" AND ")}`, p);
  res.json({ ...meta(pg, total.c), companies: rows.map((c) => ({ ...companyJson(c, { internal: true }), members: Number(c.members) })) });
}));

admin.get("/:id", requirePermission("users.read"), ah(async (req, res) => {
  const c = await one("SELECT * FROM companies WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
  if (!c) throw notFound("Company not found.");
  const members = await query("SELECT id, name, email, company_role, last_login_at FROM users WHERE company_id = :c AND deleted_at IS NULL", { c: c.id });
  const crm = require("./crm.js");
  res.json({ company: companyJson(c, { internal: true }), members: members.map((m) => ({ id: String(m.id), name: m.name, email: m.email, role: m.company_role, lastLoginAt: m.last_login_at })), activities: await crm.activities("company", c.id), ...(await crm.customer360({ companyId: c.id })) });
}));

admin.patch("/:id", requirePermission("companies.manage"), ah(async (req, res) => {
  const b = req.body || {};
  const before = await one("SELECT * FROM companies WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
  if (!before) throw notFound("Company not found.");
  const upd = {};
  if (b.status !== undefined) {
    if (!["pending", "approved", "rejected", "suspended"].includes(b.status)) throw badRequest("Invalid status.");
    upd.status = b.status;
  }
  if (b.paymentTerms !== undefined) {
    if (!TERMS.includes(b.paymentTerms)) throw badRequest("Invalid payment terms.");
    upd.payment_terms = b.paymentTerms;
  }
  for (const [k, col] of [["creditLimitUsd", "credit_limit_usd"], ["orderApprovalThresholdUsd", "order_approval_threshold_usd"]]) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === "") {
      if (col === "credit_limit_usd") upd[col] = "0";
      else upd[col] = null;
      continue;
    }
    const d = D(b[k]);
    if (!d.isFinite() || d.isNegative()) throw badRequest(`${k} must be a positive number.`);
    upd[col] = d.toFixed(2);
  }
  if (b.customerGroup !== undefined) {
    if (!(await one("SELECT code FROM customer_groups WHERE code = :c", { c: b.customerGroup }))) throw badRequest("Unknown customer group.");
    upd.customer_group = b.customerGroup;
  }
  if (b.salespersonId !== undefined) upd.salesperson_id = await require("./staff.js").assertStaff(b.salespersonId);
  for (const [k, col, n] of [["legalName", "legal_name", 200], ["displayName", "display_name", 200], ["taxId", "tax_id", 60], ["registrationNo", "registration_no", 80]]) if (b[k] !== undefined) upd[col] = s(b[k], n) || (col === "legal_name" ? before.legal_name : null);
  if (!Object.keys(upd).length) throw badRequest("Nothing to change.");
  const sensitive = ["payment_terms", "credit_limit_usd", "status"].some((k) => k in upd);
  if (sensitive && s(b.reason, 500).length < 3) throw badRequest("Give a reason for changing status, terms or credit.");
  await query(`UPDATE companies SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id: before.id });
  await audit.record({ req, action: "company.update", entityType: "company", entityId: String(before.id), before: Object.fromEntries(Object.keys(upd).map((k) => [k, before[k]])), after: upd, reason: b.reason });
  if (upd.status && upd.status !== before.status && ["approved", "rejected"].includes(upd.status)) {
    const adminUser = await one("SELECT email FROM users WHERE company_id = :c AND company_role = 'admin' ORDER BY id LIMIT 1", { c: before.id });
    if (adminUser) await email.queue("generic", adminUser.email, { subject: `Your IXITEK company account was ${upd.status}`, title: `Company account ${upd.status}`, message: upd.status === "approved" ? `${before.legal_name} is now an approved business account. Business pricing and company features are active.` : `We could not approve the company account for ${before.legal_name}. ${s(b.reason, 500)}` }, { key: `company:${before.id}:${upd.status}:${Date.now()}`, related: { type: "company", id: before.id } });
  }
  res.json({ company: companyJson(await one("SELECT * FROM companies WHERE id = :id", { id: before.id }), { internal: true }) });
}));

module.exports = { account, admin, ROLES };
