// /api/admin/commerce — orders, RFQs and quotations for staff.
const express = require("express");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const { query, one, tx } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const orders = require("./orderService.js");
const rq = require("./rfqQuoteService.js");
const { ah, badRequest, notFound } = require("../../core/errors.js");

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access"));

const lim = (req, max = 100) => Math.min(Math.max(Number(req.query.limit) || 50, 1), max);
const off = (req) => (Math.max(Number(req.query.page) || 1, 1) - 1) * lim(req);

// ── Orders ──
router.get(
  "/orders",
  requirePermission("orders.read"),
  ah(async (req, res) => {
    const where = ["1=1"];
    const p = {};
    if (req.query.status) (where.push("o.status = :s"), (p.s = String(req.query.status)));
    if (req.query.paymentStatus) (where.push("o.payment_status = :ps"), (p.ps = String(req.query.paymentStatus)));
    if (req.query.q) (where.push("(o.order_number LIKE :q OR o.customer_email LIKE :q OR o.customer_name LIKE :q OR o.company_name LIKE :q OR o.po_number LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
    if (req.query.country) (where.push("o.country_code = :c"), (p.c = String(req.query.country)));
    const w = where.join(" AND ");
    const rows = await query(
      `SELECT o.order_number, o.status, o.payment_status, o.payment_method, o.customer_name, o.customer_email, o.company_name, o.country_code, o.currency, o.total, o.total_usd, o.placed_at
         FROM orders o WHERE ${w} ORDER BY o.placed_at DESC LIMIT ${lim(req)} OFFSET ${off(req)}`,
      p
    );
    const total = await one(`SELECT COUNT(*) c FROM orders o WHERE ${w}`, p);
    res.json({ total: Number(total.c), orders: rows.map((r) => ({ orderNumber: r.order_number, status: r.status, paymentStatus: r.payment_status, paymentMethod: r.payment_method, customer: r.customer_name, email: r.customer_email, company: r.company_name, country: r.country_code, currency: r.currency, total: r.total, totalUsd: r.total_usd, placedAt: r.placed_at })) });
  })
);

async function orderIdByNumber(n) {
  const o = await one("SELECT id FROM orders WHERE order_number = :n", { n });
  if (!o) throw notFound("Order not found.");
  return o.id;
}

router.get("/orders/:number", requirePermission("orders.read"), ah(async (req, res) => {
  const id = await orderIdByNumber(req.params.number);
  const order = await orders.orderJson(id, { includeInternal: true });
  const reservations = await query("SELECT r.qty, r.status, p.sku, w.code AS warehouse FROM stock_reservations r JOIN products p ON p.id = r.product_id JOIN warehouses w ON w.id = r.warehouse_id WHERE r.order_id = :id", { id });
  res.json({ order, reservations, transitions: orders.TRANSITIONS[order.status] || [] });
}));

router.post(
  "/orders/:number/status",
  requirePermission("orders.manage"),
  ah(async (req, res) => {
    const id = await orderIdByNumber(req.params.number);
    const to = String(req.body.status || "");
    if (to === "cancelled") {
      const { can } = require("../../core/rbac.js");
      if (!(await can(req.user, "orders.cancel"))) throw require("../../core/errors.js").forbidden("You do not have permission to cancel orders.");
    }
    if (["confirmed"].includes(to)) {
      const o = await one("SELECT payment_status, payment_method FROM orders WHERE id = :id", { id });
      if (o.payment_method !== "purchase_order" && o.payment_status !== "paid") throw badRequest("Record or verify the payment first — an unpaid prepaid order cannot be confirmed.");
    }
    if (["shipped", "in_transit", "out_for_delivery", "delivered"].includes(to)) throw badRequest("Use Shipments to dispatch and track orders (keeps stock and tracking in sync).");
    await tx(async (conn) => {
      await orders.setStatus(conn, id, to, { note: req.body.note || "", actorId: req.user.id });
      await audit.record({ req, action: "order.status", entityType: "order", entityId: req.params.number, after: { status: to }, reason: req.body.note }, conn);
    });
    res.json({ order: await orders.orderJson(id, { includeInternal: true }) });
  })
);

router.post(
  "/orders/:number/notes",
  requirePermission("orders.manage"),
  ah(async (req, res) => {
    const id = await orderIdByNumber(req.params.number);
    const note = String(req.body.note || "").trim().slice(0, 1000);
    if (!note) throw badRequest("Write a note.");
    const o = await one("SELECT status FROM orders WHERE id = :id", { id });
    await query("INSERT INTO order_status_history (order_id, from_status, to_status, note, is_internal, actor_user_id) VALUES (:o, :s, :s, :n, :i, :u)", { o: id, s: o.status, n: note, i: req.body.customerVisible ? 0 : 1, u: req.user.id });
    res.status(201).json({ ok: true });
  })
);

// ── RFQs ──
router.get(
  "/rfqs",
  requirePermission("rfq.manage"),
  ah(async (req, res) => {
    const where = ["1=1"];
    const p = {};
    if (req.query.status) (where.push("r.status = :s"), (p.s = String(req.query.status)));
    if (req.query.mine === "1") (where.push("r.assigned_to = :me"), (p.me = req.user.id));
    if (req.query.q) (where.push("(r.rfq_number LIKE :q OR r.contact_email LIKE :q OR r.company_name LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
    const w = where.join(" AND ");
    const rows = await query(
      `SELECT r.rfq_number, r.id, r.status, r.contact_name, r.contact_email, r.company_name, r.country_code, r.required_date, r.created_at, u.email AS assignee,
              (SELECT COUNT(*) FROM rfq_items i WHERE i.rfq_id = r.id) AS line_count
         FROM rfqs r LEFT JOIN users u ON u.id = r.assigned_to WHERE ${w} ORDER BY r.id DESC LIMIT ${lim(req)} OFFSET ${off(req)}`,
      p
    );
    const total = await one(`SELECT COUNT(*) c FROM rfqs r WHERE ${w}`, p);
    res.json({ total: Number(total.c), rfqs: rows.map((r) => ({ id: String(r.id), rfqNumber: r.rfq_number, status: r.status, contact: r.contact_name, email: r.contact_email, company: r.company_name, country: r.country_code, requiredDate: r.required_date, createdAt: r.created_at, assignee: r.assignee, lines: Number(r.line_count) })) });
  })
);

async function rfqIdByNumber(n) {
  const r = await one("SELECT id FROM rfqs WHERE rfq_number = :n", { n });
  if (!r) throw notFound("RFQ not found.");
  return r.id;
}

router.get("/rfqs/:number", requirePermission("rfq.manage"), ah(async (req, res) => res.json({ rfq: await rq.rfqJson(await rfqIdByNumber(req.params.number), { internal: true }) })));

router.patch(
  "/rfqs/:number",
  requirePermission("rfq.manage"),
  ah(async (req, res) => {
    const id = await rfqIdByNumber(req.params.number);
    const before = await one("SELECT status, assigned_to FROM rfqs WHERE id = :id", { id });
    const upd = {};
    if (req.body.status !== undefined) {
      if (!["submitted", "under_review", "info_requested", "quoted", "rejected", "closed"].includes(req.body.status)) throw badRequest("Invalid status.");
      upd.status = req.body.status;
    }
    if (req.body.assignedTo !== undefined) {
      if (req.body.assignedTo) {
        const u = await one("SELECT u.id FROM users u JOIN roles r ON r.code = u.role WHERE u.id = :id AND r.is_staff = 1 AND u.deleted_at IS NULL", { id: req.body.assignedTo });
        if (!u) throw badRequest("Assign to a team member.");
      }
      upd.assigned_to = req.body.assignedTo || null;
    }
    if (!Object.keys(upd).length) throw badRequest("Nothing to change.");
    await tx(async (conn) => {
      await query(`UPDATE rfqs SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id }, conn);
      if (["info_requested", "rejected"].includes(upd.status) && req.body.message) {
        await query("INSERT INTO rfq_messages (rfq_id, author_user_id, author_name, is_internal, body) VALUES (:r, :u, :n, 0, :b)", { r: id, u: req.user.id, n: req.user.name, b: String(req.body.message).slice(0, 5000) }, conn);
        if (upd.status === "info_requested") await require("../../core/events.js").emit("rfq.info_requested", { rfqId: id }, conn, { key: `${id}:${Date.now()}` });
      }
      if (upd.status === "rejected") await require("../../core/events.js").emit("rfq.rejected", { rfqId: id, message: req.body.message || "" }, conn, { key: String(id) });
      await audit.record({ req, action: "rfq.update", entityType: "rfq", entityId: req.params.number, before, after: upd, reason: req.body.message }, conn);
    });
    res.json({ rfq: await rq.rfqJson(id, { internal: true }) });
  })
);

router.post(
  "/rfqs/:number/messages",
  requirePermission("rfq.manage"),
  ah(async (req, res) => {
    const id = await rfqIdByNumber(req.params.number);
    const body = String(req.body.body || "").trim().slice(0, 5000);
    if (!body) throw badRequest("Write a message.");
    await query("INSERT INTO rfq_messages (rfq_id, author_user_id, author_name, is_internal, body) VALUES (:r, :u, :n, :i, :b)", { r: id, u: req.user.id, n: req.user.name, i: req.body.internal ? 1 : 0, b: body });
    res.status(201).json({ rfq: await rq.rfqJson(id, { internal: true }) });
  })
);

// ── Quotes ──
router.get(
  "/quotes",
  requirePermission("quotes.manage"),
  ah(async (req, res) => {
    const where = ["1=1"];
    const p = {};
    if (req.query.status) (where.push("q.status = :s"), (p.s = String(req.query.status)));
    if (req.query.q) (where.push("(q.quote_number LIKE :q OR q.customer_email LIKE :q OR q.company_name LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
    const w = where.join(" AND ");
    const rows = await query(
      `SELECT q.id, q.quote_number, q.status, q.current_version, q.customer_name, q.customer_email, q.company_name, q.created_at, v.total, v.currency, v.valid_until, u.email AS salesperson
         FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version = q.current_version LEFT JOIN users u ON u.id = q.salesperson_id
        WHERE ${w} ORDER BY q.id DESC LIMIT ${lim(req)} OFFSET ${off(req)}`,
      p
    );
    const total = await one(`SELECT COUNT(*) c FROM quotes q WHERE ${w}`, p);
    res.json({ total: Number(total.c), quotes: rows.map((r) => ({ id: String(r.id), quoteNumber: r.quote_number, label: `${r.quote_number}-V${r.current_version}`, status: r.status, customer: r.customer_name, email: r.customer_email, company: r.company_name, total: r.total, currency: r.currency, validUntil: r.valid_until, salesperson: r.salesperson, createdAt: r.created_at })) });
  })
);

router.post("/quotes", requirePermission("quotes.manage"), ah(async (req, res) => res.status(201).json(await rq.createQuote(req, req.body || {}))));

async function quoteIdByNumber(n) {
  const q = await one("SELECT id FROM quotes WHERE quote_number = :n", { n: String(n).replace(/-V\d+$/, "") });
  if (!q) throw notFound("Quote not found.");
  return q.id;
}
router.get("/quotes/:number", requirePermission("quotes.manage"), ah(async (req, res) => res.json({ quote: await rq.quoteJson(await quoteIdByNumber(req.params.number), { internal: true }) })));
router.put("/quotes/:number", requirePermission("quotes.manage"), ah(async (req, res) => {
  const id = await quoteIdByNumber(req.params.number);
  await rq.updateDraft(req, id, req.body || {});
  res.json({ quote: await rq.quoteJson(id, { internal: true }) });
}));
router.post("/quotes/:number/revise", requirePermission("quotes.manage"), ah(async (req, res) => {
  const id = await quoteIdByNumber(req.params.number);
  await rq.revise(req, id, req.body || {});
  res.status(201).json({ quote: await rq.quoteJson(id, { internal: true }) });
}));
router.post("/quotes/:number/send", requirePermission("quotes.manage"), ah(async (req, res) => {
  const id = await quoteIdByNumber(req.params.number);
  await rq.send(req, id);
  res.json({ quote: await rq.quoteJson(id, { internal: true }) });
}));
router.post("/quotes/price-preview", requirePermission("quotes.manage"), ah(async (req, res) => {
  const b = req.body || {};
  const r = await rq.priceVersion({ lines: b.lines || [], country: b.country, currency: b.currency, incoterm: b.incoterm || "DAP", method: b.shippingMethod, charges: b.charges || {} });
  res.json({ currency: r.cur.code, lines: r.lines, totals: r.totals });
}));

router.get("/team", ah(async (req, res) => {
  const rows = await query("SELECT u.id, u.name, u.email, u.role FROM users u JOIN roles r ON r.code = u.role WHERE r.is_staff = 1 AND u.deleted_at IS NULL AND u.status = 'active' ORDER BY u.name");
  res.json({ team: rows.map((u) => ({ id: String(u.id), name: u.name, email: u.email, role: u.role })) });
}));

module.exports = router;
