// Operations routes:
//   account  → /api/account         (customer portal)
//   support  → /api/support         (public tickets with access token)
//   shipping → /api/admin/shipping  (carriers, shipments)
//   returns  → /api/admin/returns   (RMA)
//   tickets  → /api/admin/tickets
const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { query, one } = require("../../core/db.js");
const { paging, meta } = require("../../core/paging.js");
const { requireAuth, optionalAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const ship = require("./shipmentService.js");
const sup = require("./supportService.js");
const orders = require("../commerce/orderService.js");
const invoices = require("../documents/invoiceService.js");
const { ah, badRequest, notFound, conflict } = require("../../core/errors.js");

const s = (v, n) => String(v ?? "").trim().slice(0, n);
const safeEq = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const noStore = (req, res, next) => (res.set("Cache-Control", "private, no-store"), next());
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// Which orders a signed-in customer can see: own, plus company orders for company members.
function orderScope(user) {
  return user.company_id && user.company_role ? { sql: "(o.user_id = :u OR o.company_id = :c)", p: { u: user.id, c: user.company_id } } : { sql: "o.user_id = :u", p: { u: user.id } };
}

// ── Customer portal ──
const account = express.Router();
account.use(requireAuth, noStore);

account.get("/dashboard", ah(async (req, res) => {
  const sc = orderScope(req.user);
  const [o, unpaid, rfqs, quotes, rmas, tickets, recent] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM orders o WHERE ${sc.sql} AND o.status NOT IN ('delivered','cancelled','refunded','returned')`, sc.p),
    one(`SELECT COUNT(*) AS n FROM orders o WHERE ${sc.sql} AND o.payment_status IN ('unpaid','failed') AND o.status NOT IN ('cancelled')`, sc.p),
    one("SELECT COUNT(*) AS n FROM rfqs WHERE (user_id = :u OR (company_id IS NOT NULL AND company_id = :c)) AND status IN ('submitted','under_review','info_requested')", { u: req.user.id, c: req.user.company_id || 0 }),
    one("SELECT COUNT(*) AS n FROM quotes WHERE (user_id = :u OR customer_email = :e OR (company_id IS NOT NULL AND company_id = :c)) AND status = 'sent'", { u: req.user.id, e: req.user.email, c: req.user.company_id || 0 }),
    one("SELECT COUNT(*) AS n FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.user_id = :u AND r.status NOT IN ('completed','rejected','cancelled')", { u: req.user.id }),
    one("SELECT COUNT(*) AS n FROM tickets WHERE user_id = :u AND status NOT IN ('resolved','closed')", { u: req.user.id }),
    query(`SELECT o.order_number, o.status, o.payment_status, o.currency, o.total, o.placed_at FROM orders o WHERE ${sc.sql} ORDER BY o.placed_at DESC LIMIT 5`, sc.p),
  ]);
  res.json({
    counts: { openOrders: Number(o.n), awaitingPayment: Number(unpaid.n), openRfqs: Number(rfqs.n), quotesToReview: Number(quotes.n), openReturns: Number(rmas.n), openTickets: Number(tickets.n) },
    recentOrders: recent.map((r) => ({ orderNumber: r.order_number, status: r.status, paymentStatus: r.payment_status, currency: r.currency, total: r.total, placedAt: r.placed_at })),
  });
}));

account.put("/profile", ah(async (req, res) => {
  const name = s(req.body.name, 150);
  if (!name) throw badRequest("Name is required.");
  await query("UPDATE users SET name = :n, phone = :p, company = :c WHERE id = :id", { n: name, p: s(req.body.phone, 40), c: s(req.body.company, 200), id: req.user.id });
  await audit.record({ req, action: "account.profile", entityType: "user", entityId: String(req.user.id) });
  res.json({ ok: true });
}));

account.put("/password", writeLimiter, ah(async (req, res) => {
  const row = await one("SELECT password_hash FROM users WHERE id = :id", { id: req.user.id });
  if (!(await bcrypt.compare(String(req.body.currentPassword || ""), row.password_hash))) throw badRequest("Current password is incorrect.");
  const next = String(req.body.newPassword || "");
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) throw badRequest("New password: at least 8 characters with letters and numbers.");
  await query("UPDATE users SET password_hash = :h, password_changed_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { h: await bcrypt.hash(next, 12), id: req.user.id });
  await audit.record({ req, action: "account.password_change", entityType: "user", entityId: String(req.user.id) });
  res.json({ ok: true });
}));

// Addresses (own, or the company's shared book for company admins/buyers).
const ADDR_TYPES = ["billing", "shipping", "warehouse", "project_site", "branch", "customer_site"];
async function cleanAddr(b) {
  const a = orders.cleanAddress(b, "The");
  if (!(await one("SELECT code FROM countries WHERE code = :c", { c: a.country_code }))) throw badRequest("Unknown country.");
  if (a.country_code === "IN" && a.tax_id) {
    const v = require("../intl/gst.js").validateGstin(a.tax_id);
    if (!v.valid) throw badRequest(`GSTIN: ${v.reason}`);
    a.tax_id = v.gstin;
  }
  return { ...a, address_type: ADDR_TYPES.includes(b.type) ? b.type : "shipping", label: s(b.label, 100), is_default: b.isDefault ? 1 : 0 };
}
const addrJson = (a) => ({ id: String(a.id), type: a.address_type, label: a.label, contactName: a.contact_name, companyName: a.company_name, line1: a.line1, line2: a.line2, city: a.city, state: a.state, stateCode: a.state_code, postalCode: a.postal_code, countryCode: a.country_code, phone: a.phone, taxId: a.tax_id, isDefault: Boolean(a.is_default), shared: Boolean(a.company_id) });
account.get("/addresses", ah(async (req, res) => {
  const rows = await query("SELECT * FROM addresses WHERE (user_id = :u OR (company_id IS NOT NULL AND company_id = :c)) AND deleted_at IS NULL ORDER BY is_default DESC, id DESC", { u: req.user.id, c: req.user.company_id || 0 });
  res.json({ addresses: rows.map(addrJson) });
}));
account.post("/addresses", ah(async (req, res) => {
  const a = await cleanAddr(req.body || {});
  const shared = req.body.shared && req.user.company_id && ["admin", "buyer"].includes(req.user.company_role);
  if (a.is_default) await query(`UPDATE addresses SET is_default = 0 WHERE ${shared ? "company_id = :c" : "user_id = :u"} AND address_type = :t`, { u: req.user.id, c: req.user.company_id, t: a.address_type });
  const r = await query(`INSERT INTO addresses (${[...Object.keys(a), "user_id", "company_id"].join(", ")}) VALUES (${[...Object.keys(a), "user_id", "company_id"].map((k) => `:${k}`).join(", ")})`, { ...a, user_id: shared ? null : req.user.id, company_id: shared ? req.user.company_id : null });
  res.status(201).json({ address: addrJson(await one("SELECT * FROM addresses WHERE id = :id", { id: r.insertId })) });
}));
async function ownAddress(req, id) {
  const a = await one("SELECT * FROM addresses WHERE id = :id AND deleted_at IS NULL", { id });
  const ok = a && (Number(a.user_id) === Number(req.user.id) || (a.company_id && Number(a.company_id) === Number(req.user.company_id) && ["admin", "buyer"].includes(req.user.company_role)));
  if (!ok) throw notFound("Address not found.");
  return a;
}
account.put("/addresses/:id", ah(async (req, res) => {
  const cur = await ownAddress(req, req.params.id);
  const a = await cleanAddr(req.body || {});
  if (a.is_default) await query(`UPDATE addresses SET is_default = 0 WHERE ${cur.company_id ? "company_id = :c" : "user_id = :u"} AND address_type = :t`, { u: req.user.id, c: cur.company_id, t: a.address_type });
  await query(`UPDATE addresses SET ${Object.keys(a).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...a, id: cur.id });
  res.json({ address: addrJson(await one("SELECT * FROM addresses WHERE id = :id", { id: cur.id })) });
}));
account.delete("/addresses/:id", ah(async (req, res) => {
  const cur = await ownAddress(req, req.params.id);
  await query("UPDATE addresses SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: cur.id });
  res.json({ ok: true });
}));

// Invoices & payments (finance, admin, buyers see company documents).
account.get("/invoices", ah(async (req, res) => {
  const sc = orderScope(req.user);
  const pg = paging(req);
  const rows = await query(`SELECT i.*, o.order_number FROM invoices i JOIN orders o ON o.id = i.order_id WHERE ${sc.sql} AND i.invoice_type <> 'proforma' ORDER BY i.id DESC ${pg.sql}`, sc.p);
  const total = await one(`SELECT COUNT(*) c FROM invoices i JOIN orders o ON o.id = i.order_id WHERE ${sc.sql} AND i.invoice_type <> 'proforma'`, sc.p);
  res.json({ ...meta(pg, total.c), invoices: rows.map((r) => ({ ...invoices.invoiceJson(r), orderNumber: r.order_number, pdfUrl: `/api/pay/orders/${r.order_number}/invoices/${r.invoice_number}.pdf` })) });
}));
account.get("/payments", ah(async (req, res) => {
  const sc = orderScope(req.user);
  const pg = paging(req);
  const rows = await query(`SELECT p.provider, p.provider_payment_id, p.reference, p.status, p.amount, p.amount_refunded, p.currency, p.method, p.paid_at, p.created_at, o.order_number FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${sc.sql} ORDER BY p.id DESC ${pg.sql}`, sc.p);
  const total = await one(`SELECT COUNT(*) c FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${sc.sql}`, sc.p);
  res.json({ ...meta(pg, total.c), payments: rows.map((r) => ({ orderNumber: r.order_number, provider: r.provider, reference: r.provider_payment_id || r.reference, status: r.status, amount: r.amount, refunded: r.amount_refunded, currency: r.currency, method: r.method, at: r.paid_at || r.created_at })) });
}));

// Returns
account.get("/returns", ah(async (req, res) => {
  const pg = paging(req, { def: 25, max: 100 });
  const rows = await query(`SELECT r.id FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.user_id = :u OR o.user_id = :u ORDER BY r.id DESC ${pg.sql}`, { u: req.user.id });
  const total = await one("SELECT COUNT(*) c FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.user_id = :u OR o.user_id = :u", { u: req.user.id });
  const out = [];
  for (const r of rows) out.push(await sup.rmaJson(r.id));
  res.json({ ...meta(pg, total.c), returns: out, kinds: sup.RMA_KINDS, reasons: sup.RMA_REASONS });
}));
account.post("/orders/:number/returns", writeLimiter, ah(async (req, res) => {
  const o = await one("SELECT id, user_id, company_id, access_token FROM orders WHERE order_number = :n", { n: req.params.number });
  if (!o || !(await orders.canView(req, o))) throw notFound("Order not found.");
  res.status(201).json(await sup.createRma(req, o, req.body || {}));
}));
account.get("/returns/:number", ah(async (req, res) => {
  const r = await one("SELECT r.id FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.rma_number = :n AND (r.user_id = :u OR o.user_id = :u)", { n: req.params.number, u: req.user.id });
  if (!r) throw notFound("Return not found.");
  res.json({ return: await sup.rmaJson(r.id) });
}));

// Tickets (signed-in)
account.get("/tickets", ah(async (req, res) => {
  const pg = paging(req);
  const rows = await query(`SELECT ticket_number, subject, category, status, updated_at FROM tickets WHERE user_id = :u ORDER BY updated_at DESC, id DESC ${pg.sql}`, { u: req.user.id });
  const total = await one("SELECT COUNT(*) c FROM tickets WHERE user_id = :u", { u: req.user.id });
  res.json({ ...meta(pg, total.c), tickets: rows.map((t) => ({ ticketNumber: t.ticket_number, subject: t.subject, category: t.category, status: t.status, updatedAt: t.updated_at })) });
}));

// ── Public support (guests use the emailed access token) ──
const support = express.Router();
support.use(optionalAuth, noStore);
support.post("/tickets", writeLimiter, ah(async (req, res) => res.status(201).json(await sup.createTicket(req, req.body || {}))));
async function ticketFor(req) {
  const t = await one("SELECT id, user_id, access_token FROM tickets WHERE ticket_number = :n", { n: s(req.params.number, 20) });
  const ok = t && ((req.user && Number(t.user_id) === Number(req.user.id)) || safeEq(String(req.query.token || (req.body && req.body.token) || ""), t.access_token));
  if (!ok) throw notFound("Ticket not found.");
  return t;
}
support.get("/tickets/:number", ah(async (req, res) => res.json({ ticket: await sup.ticketJson((await ticketFor(req)).id) })));
support.post("/tickets/:number/messages", writeLimiter, ah(async (req, res) => {
  const t = await ticketFor(req);
  await sup.replyTicket(req, t.id, req.body || {});
  res.status(201).json({ ticket: await sup.ticketJson(t.id) });
}));
support.get("/meta", (req, res) => res.json({ categories: sup.CATS, returnKinds: sup.RMA_KINDS, returnReasons: sup.RMA_REASONS }));

// ── Admin: shipping ──
const shipping = express.Router();
shipping.use(requireAuth, requirePermission("admin.access"));
shipping.get("/carriers", requirePermission("orders.read"), ah(async (req, res) => {
  const rows = await query("SELECT * FROM carriers ORDER BY sort_order, name");
  res.json({ carriers: rows.map((c) => ({ code: c.code, name: c.name, adapter: c.adapter, trackingUrlTemplate: c.tracking_url_template, isActive: Boolean(c.is_active) })) });
}));
shipping.put("/carriers/:code", requirePermission("shipping.manage"), ah(async (req, res) => {
  const code = s(req.params.code, 30).toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(code)) throw badRequest("Invalid carrier code.");
  const name = s(req.body.name, 100);
  if (!name) throw badRequest("Name is required.");
  const tpl = s(req.body.trackingUrlTemplate, 500);
  if (tpl && (!/^https:\/\//.test(tpl) || !tpl.includes("{tracking}"))) throw badRequest("Tracking link template must start with https:// and contain {tracking}.");
  await query("INSERT INTO carriers (code, name, tracking_url_template, is_active) VALUES (:c, :n, :t, :a) ON DUPLICATE KEY UPDATE name = VALUES(name), tracking_url_template = VALUES(tracking_url_template), is_active = VALUES(is_active)", { c: code, n: name, t: tpl || null, a: req.body.isActive === false ? 0 : 1 });
  await audit.record({ req, action: "carrier.save", entityType: "carrier", entityId: code });
  res.json({ ok: true });
}));
shipping.get("/queue", requirePermission("orders.read"), ah(async (req, res) => {
  const pg = paging(req);
  const pgA = paging(req, { pageParam: "activePage" });
  // Orders with units still to ship or an open (preparing/packed) shipment — oldest first.
  const queueSql = `FROM orders o WHERE o.status IN ('confirmed','processing','packed','shipped','in_transit')
      AND (EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.qty > i.qty_shipped) OR EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.status IN ('preparing','packed')))`;
  const rows = await query(
    `SELECT o.order_number, o.status, o.customer_name, o.country_code, o.shipping_method, o.placed_at,
            (SELECT SUM(qty - qty_shipped) FROM order_items WHERE order_id = o.id) AS to_ship,
            (SELECT COUNT(*) FROM shipments s WHERE s.order_id = o.id AND s.status IN ('preparing','packed')) AS open_shipments
       ${queueSql} ORDER BY o.placed_at ${pg.sql}`
  );
  const toShipTotal = await one(`SELECT COUNT(*) c ${queueSql}`);
  const activeSql = "FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.status NOT IN ('delivered','cancelled','returned')";
  const active = await query(`SELECT s.shipment_number, s.status, s.carrier, s.tracking_number, s.updated_at, o.order_number ${activeSql} ORDER BY s.updated_at DESC ${pgA.sql}`);
  const activeTotal = await one(`SELECT COUNT(*) c ${activeSql}`);
  res.json({
    toShipPaging: meta(pg, toShipTotal.c),
    activePaging: meta(pgA, activeTotal.c),
    toShip: rows.map((r) => ({ orderNumber: r.order_number, status: r.status, customer: r.customer_name, country: r.country_code, method: r.shipping_method, placedAt: r.placed_at, unitsToShip: Number(r.to_ship), openShipments: Number(r.open_shipments) })),
    active: active.map((r) => ({ shipmentNumber: r.shipment_number, orderNumber: r.order_number, status: r.status, carrier: r.carrier, trackingNumber: r.tracking_number, updatedAt: r.updated_at })),
  });
}));
shipping.get("/orders/:number", requirePermission("orders.read"), ah(async (req, res) => {
  const o = await one("SELECT id FROM orders WHERE order_number = :n", { n: req.params.number });
  if (!o) throw notFound("Order not found.");
  const rem = await ship.remainingByItem(null, o.id);
  res.json({ shipments: await ship.listForOrder(o.id, { internal: true }), remaining: [...rem.values()].map((r) => ({ orderItemId: String(r.id), sku: r.sku, qty: r.qty, remaining: r.remaining })) });
}));
shipping.post("/orders/:number/shipments", requirePermission("shipping.manage"), ah(async (req, res) => res.status(201).json(await ship.create(req, req.params.number, req.body || {}))));
shipping.post("/shipments/:number/status", requirePermission("shipping.manage"), ah(async (req, res) => res.json(await ship.updateStatus(req, req.params.number, req.body || {}))));

// ── Admin: returns ──
const returns = express.Router();
returns.use(requireAuth, requirePermission("admin.access"), requirePermission("support.manage"));
returns.get("/", ah(async (req, res) => {
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("r.status = :s"), (p.s = String(req.query.status)));
  if (req.query.q) (where.push("(r.rma_number LIKE :q OR o.order_number LIKE :q OR o.customer_name LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
  const pg = paging(req);
  const rows = await query(`SELECT r.rma_number, r.kind, r.status, r.reason, r.within_warranty, r.created_at, o.order_number, o.customer_name FROM rmas r JOIN orders o ON o.id = r.order_id WHERE ${where.join(" AND ")} ORDER BY r.status = 'requested' DESC, r.id DESC ${pg.sql}`, p);
  const total = await one(`SELECT COUNT(*) c FROM rmas r JOIN orders o ON o.id = r.order_id WHERE ${where.join(" AND ")}`, p);
  res.json({ ...meta(pg, total.c), returns: rows.map((r) => ({ rmaNumber: r.rma_number, kind: r.kind, status: r.status, reason: r.reason, withinWarranty: r.within_warranty === null ? null : Boolean(r.within_warranty), orderNumber: r.order_number, customer: r.customer_name, createdAt: r.created_at })) });
}));
// Warehouses for restocking returned goods (support staff may not hold inventory.read).
returns.get("/meta/warehouses", ah(async (req, res) => {
  const rows = await query("SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, sort_order, name");
  res.json({ warehouses: rows.map((w) => ({ id: String(w.id), code: w.code, name: w.name })) });
}));
returns.get("/:number", ah(async (req, res) => {
  const r = await one("SELECT id FROM rmas WHERE rma_number = :n", { n: req.params.number });
  if (!r) throw notFound("Return not found.");
  res.json({ return: await sup.rmaJson(r.id, { internal: true }) });
}));
returns.post("/:number", ah(async (req, res) => {
  await sup.updateRma(req, req.params.number, req.body || {});
  const r = await one("SELECT id FROM rmas WHERE rma_number = :n", { n: req.params.number });
  res.json({ return: await sup.rmaJson(r.id, { internal: true }) });
}));

// ── Admin: tickets ──
const tickets = express.Router();
tickets.use(requireAuth, requirePermission("admin.access"), requirePermission("support.manage"));
tickets.get("/", ah(async (req, res) => {
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("t.status = :s"), (p.s = String(req.query.status)));
  else where.push("t.status NOT IN ('closed')");
  if (req.query.mine === "1") (where.push("t.assigned_to = :me"), (p.me = req.user.id));
  if (req.query.q) (where.push("(t.ticket_number LIKE :q OR t.subject LIKE :q OR t.email LIKE :q OR t.name LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
  const pg = paging(req);
  const rows = await query(`SELECT t.ticket_number, t.subject, t.category, t.priority, t.status, t.name, t.email, t.updated_at, u.email AS assignee FROM tickets t LEFT JOIN users u ON u.id = t.assigned_to WHERE ${where.join(" AND ")} ORDER BY FIELD(t.priority,'urgent','high','normal','low'), t.updated_at, t.id ${pg.sql}`, p);
  const total = await one(`SELECT COUNT(*) c FROM tickets t WHERE ${where.join(" AND ")}`, p);
  res.json({ ...meta(pg, total.c), tickets: rows.map((t) => ({ ticketNumber: t.ticket_number, subject: t.subject, category: t.category, priority: t.priority, status: t.status, name: t.name, email: t.email, assignee: t.assignee, updatedAt: t.updated_at })) });
}));
async function ticketId(n) {
  const t = await one("SELECT id FROM tickets WHERE ticket_number = :n", { n });
  if (!t) throw notFound("Ticket not found.");
  return t.id;
}
tickets.get("/:number", ah(async (req, res) => res.json({ ticket: await sup.ticketJson(await ticketId(req.params.number), { internal: true }) })));
tickets.post("/:number/messages", ah(async (req, res) => {
  const id = await ticketId(req.params.number);
  await sup.replyTicket(req, id, req.body || {}, { staff: true });
  res.status(201).json({ ticket: await sup.ticketJson(id, { internal: true }) });
}));
tickets.patch("/:number", ah(async (req, res) => {
  const id = await ticketId(req.params.number);
  const upd = {};
  if (req.body.status !== undefined) {
    if (!["open", "pending_customer", "pending_internal", "resolved", "closed"].includes(req.body.status)) throw badRequest("Invalid status.");
    upd.status = req.body.status;
  }
  if (req.body.priority !== undefined) {
    if (!["low", "normal", "high", "urgent"].includes(req.body.priority)) throw badRequest("Invalid priority.");
    upd.priority = req.body.priority;
  }
  if (req.body.assignedTo !== undefined) upd.assigned_to = await require("./staff.js").assertStaff(req.body.assignedTo);
  if (!Object.keys(upd).length) throw conflict("Nothing to change.");
  await query(`UPDATE tickets SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id });
  await audit.record({ req, action: "ticket.update", entityType: "ticket", entityId: req.params.number, after: upd });
  res.json({ ticket: await sup.ticketJson(id, { internal: true }) });
}));

module.exports = { account, support, shipping, returns, tickets };
