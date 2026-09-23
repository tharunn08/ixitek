// procurement.js — suppliers, supplier SKUs/costs, purchase orders, goods
// receipts (→ inventory) and supplier invoices. Mounted at /api/admin/procurement.
// Supplier costs are confidential: every cost field is removed from responses
// unless the user holds pricing.read_cost.
const express = require("express");
const { query, one, tx } = require("../../core/db.js");
const { paging, meta } = require("../../core/paging.js");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const seq = require("../commerce/sequences.js");
const inventory = require("../inventory/inventoryService.js");
const { D } = require("../../core/money.js");
const { ah, badRequest, conflict, notFound } = require("../../core/errors.js");

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access"), requirePermission("procurement.manage"));
const s = (v, n) => String(v ?? "").trim().slice(0, n);
const seeCost = (req) => can(req.user, "pricing.read_cost");
const cost = (show, v) => (show ? v : undefined);

// ── Suppliers ──
function supplierJson(r) {
  return { id: String(r.id), code: r.code, name: r.name, country: r.country_code, contactName: r.contact_name, email: r.email, phone: r.phone, address: r.address, currency: r.currency, paymentTerms: r.payment_terms, leadTimeDays: r.lead_time_days, notes: r.notes, isActive: Boolean(r.is_active) };
}
function cleanSupplier(b) {
  const code = s(b.code, 30).toUpperCase();
  const name = s(b.name, 200);
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw badRequest("Supplier code: 2–30 letters, digits, - or _.");
  if (!name) throw badRequest("Supplier name is required.");
  const email = s(b.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Invalid email.");
  return {
    code, name, country_code: s(b.country, 2).toUpperCase() || null, contact_name: s(b.contactName, 150), email, phone: s(b.phone, 40), address: s(b.address, 1000),
    currency: s(b.currency, 3).toUpperCase() || "USD", payment_terms: s(b.paymentTerms, 60), lead_time_days: b.leadTimeDays === "" || b.leadTimeDays == null ? null : Math.max(0, Number.parseInt(b.leadTimeDays, 10) || 0),
    notes: s(b.notes, 5000), is_active: b.isActive === false ? 0 : 1,
  };
}
router.get("/suppliers", ah(async (req, res) => {
  const rows = await query("SELECT * FROM suppliers ORDER BY is_active DESC, name");
  res.json({ suppliers: rows.map(supplierJson) });
}));
router.post("/suppliers", ah(async (req, res) => {
  const v = cleanSupplier(req.body || {});
  if (await one("SELECT id FROM suppliers WHERE code = :c", { c: v.code })) throw conflict("Supplier code already exists.");
  const r = await query(`INSERT INTO suppliers (${Object.keys(v).join(", ")}) VALUES (${Object.keys(v).map((k) => `:${k}`).join(", ")})`, v);
  await audit.record({ req, action: "supplier.create", entityType: "supplier", entityId: v.code });
  res.status(201).json({ supplier: supplierJson(await one("SELECT * FROM suppliers WHERE id = :id", { id: r.insertId })) });
}));
router.put("/suppliers/:id", ah(async (req, res) => {
  const before = await one("SELECT * FROM suppliers WHERE id = :id", { id: req.params.id });
  if (!before) throw notFound("Supplier not found.");
  const v = cleanSupplier({ ...supplierJson(before), ...req.body });
  if (v.code !== before.code && (await one("SELECT id FROM suppliers WHERE code = :c", { c: v.code }))) throw conflict("Supplier code already exists.");
  await query(`UPDATE suppliers SET ${Object.keys(v).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...v, id: before.id });
  await audit.record({ req, action: "supplier.update", entityType: "supplier", entityId: v.code });
  res.json({ supplier: supplierJson(await one("SELECT * FROM suppliers WHERE id = :id", { id: before.id })) });
}));

router.get("/suppliers/:id/products", ah(async (req, res) => {
  const show = await seeCost(req);
  const rows = await query("SELECT sp.*, p.sku, p.name FROM supplier_products sp JOIN products p ON p.id = sp.product_id WHERE sp.supplier_id = :s ORDER BY p.sku", { s: req.params.id });
  res.json({ canSeeCost: show, items: rows.map((r) => ({ id: String(r.id), productId: String(r.product_id), sku: r.sku, name: r.name, supplierSku: r.supplier_sku, unitCost: cost(show, r.unit_cost), currency: r.currency, moq: r.moq, leadTimeDays: r.lead_time_days, preferred: Boolean(r.is_preferred) })) });
}));
router.put("/suppliers/:id/products", ah(async (req, res) => {
  const show = await seeCost(req);
  const b = req.body || {};
  const p = await one("SELECT id, sku FROM products WHERE (id = :id OR sku = :sku) AND deleted_at IS NULL", { id: b.productId || 0, sku: s(b.sku, 100) });
  if (!p) throw badRequest("Unknown product.");
  if (!(await one("SELECT id FROM suppliers WHERE id = :id", { id: req.params.id }))) throw notFound("Supplier not found.");
  let unitCost = null;
  if (b.unitCost !== undefined && b.unitCost !== null && b.unitCost !== "") {
    if (!show) throw badRequest("You do not have permission to set supplier costs.");
    const d = D(b.unitCost);
    if (!d.isFinite() || d.isNegative()) throw badRequest("Cost must be a positive number.");
    unitCost = d.toFixed(4);
  }
  await query(
    `INSERT INTO supplier_products (supplier_id, product_id, supplier_sku, unit_cost, currency, moq, lead_time_days, is_preferred) VALUES (:s, :p, :ss, :c, :cur, :moq, :lt, :pref)
     ON DUPLICATE KEY UPDATE supplier_sku = VALUES(supplier_sku), unit_cost = IF(:setCost, VALUES(unit_cost), unit_cost), currency = VALUES(currency), moq = VALUES(moq), lead_time_days = VALUES(lead_time_days), is_preferred = VALUES(is_preferred)`,
    { s: req.params.id, p: p.id, ss: s(b.supplierSku, 100), c: unitCost, cur: s(b.currency, 3).toUpperCase() || "USD", moq: Math.max(1, Number.parseInt(b.moq, 10) || 1), lt: b.leadTimeDays == null || b.leadTimeDays === "" ? null : Math.max(0, Number.parseInt(b.leadTimeDays, 10) || 0), pref: b.preferred ? 1 : 0, setCost: unitCost !== null ? 1 : 0 }
  );
  await audit.record({ req, action: "supplier.product", entityType: "product", entityId: p.sku, after: { supplier: req.params.id, supplierSku: s(b.supplierSku, 100), costChanged: unitCost !== null } });
  res.json({ ok: true });
}));

// ── Purchase orders ──
async function poJson(id, show) {
  const po = await one("SELECT po.*, s.name AS supplier_name, s.code AS supplier_code, w.code AS warehouse_code FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN warehouses w ON w.id = po.warehouse_id WHERE po.id = :id", { id });
  if (!po) return null;
  const items = await query("SELECT i.*, p.sku, p.name FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id = :id ORDER BY i.id", { id });
  const grns = await query("SELECT grn_number, received_at, notes FROM goods_receipts WHERE po_id = :id ORDER BY id", { id });
  const invs = await query("SELECT id, invoice_number, invoice_date, amount, currency, status FROM supplier_invoices WHERE po_id = :id", { id });
  return {
    id: String(po.id), poNumber: po.po_number, status: po.status, supplier: { id: String(po.supplier_id), code: po.supplier_code, name: po.supplier_name }, warehouse: { id: String(po.warehouse_id), code: po.warehouse_code },
    currency: po.currency, incoterm: po.incoterm, expectedDate: po.expected_date, subtotal: cost(show, po.subtotal), notes: po.notes, sentAt: po.sent_at, createdAt: po.created_at,
    items: items.map((i) => ({ id: String(i.id), productId: String(i.product_id), sku: i.sku, name: i.name, supplierSku: i.supplier_sku, qty: i.qty, qtyReceived: i.qty_received, unitCost: cost(show, i.unit_cost) })),
    receipts: grns.map((g) => ({ number: g.grn_number, receivedAt: g.received_at, notes: g.notes })),
    supplierInvoices: invs.map((v) => ({ id: String(v.id), number: v.invoice_number, date: v.invoice_date, amount: cost(show, v.amount), currency: v.currency, status: v.status })),
  };
}

router.get("/purchase-orders", ah(async (req, res) => {
  const show = await seeCost(req);
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("po.status = :s"), (p.s = String(req.query.status)));
  if (req.query.supplierId) (where.push("po.supplier_id = :sup"), (p.sup = req.query.supplierId));
  if (req.query.q) (where.push("(po.po_number LIKE :q OR s.name LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
  const pg = paging(req);
  const rows = await query(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE ${where.join(" AND ")} ORDER BY po.id DESC ${pg.sql}`, p);
  const total = await one(`SELECT COUNT(*) c FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE ${where.join(" AND ")}`, p);
  res.json({ ...meta(pg, total.c), canSeeCost: show, purchaseOrders: rows.map((r) => ({ id: String(r.id), poNumber: r.po_number, status: r.status, supplier: r.supplier_name, currency: r.currency, subtotal: cost(show, r.subtotal), expectedDate: r.expected_date, createdAt: r.created_at })) });
}));

async function priceLines(conn, supplierId, lines, show) {
  const out = [];
  let subtotal = D(0);
  for (const l of lines) {
    const qty = Math.floor(Number(l.qty));
    if (!(qty >= 1)) throw badRequest("Each line needs a quantity ≥ 1.");
    const p = await one("SELECT id, sku FROM products WHERE (id = :id OR sku = :sku) AND deleted_at IS NULL", { id: l.productId || 0, sku: s(l.sku, 100) }, conn);
    if (!p) throw badRequest(`Unknown product ${l.sku || l.productId}.`);
    const sp = await one("SELECT supplier_sku, unit_cost FROM supplier_products WHERE supplier_id = :s AND product_id = :p", { s: supplierId, p: p.id }, conn);
    let unit = null;
    if (l.unitCost !== undefined && l.unitCost !== null && l.unitCost !== "") {
      if (!show) throw badRequest("You do not have permission to enter costs.");
      unit = D(l.unitCost);
    } else if (sp && sp.unit_cost !== null) unit = D(sp.unit_cost);
    if (unit === null) throw badRequest(`${p.sku}: no supplier cost on file — enter the unit cost.`);
    if (!unit.isFinite() || unit.isNegative()) throw badRequest("Costs must be positive.");
    subtotal = subtotal.plus(unit.times(qty));
    out.push({ productId: p.id, supplierSku: s(l.supplierSku, 100) || (sp ? sp.supplier_sku : ""), qty, unitCost: unit.toFixed(4) });
  }
  if (!out.length) throw badRequest("Add at least one line.");
  return { lines: out, subtotal: subtotal.toFixed(2) };
}

router.post("/purchase-orders", ah(async (req, res) => {
  const b = req.body || {};
  const show = await seeCost(req);
  const sup = await one("SELECT * FROM suppliers WHERE id = :id AND is_active = 1", { id: b.supplierId });
  if (!sup) throw badRequest("Choose an active supplier.");
  const wh = await one("SELECT id FROM warehouses WHERE id = :id AND is_active = 1", { id: b.warehouseId });
  if (!wh) throw badRequest("Choose the receiving warehouse.");
  const id = await tx(async (conn) => {
    const { lines, subtotal } = await priceLines(conn, sup.id, b.lines || [], show);
    const number = await seq.next("po", conn);
    const r = await query("INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, currency, incoterm, expected_date, subtotal, notes, created_by) VALUES (:n, :s, :w, :c, :i, :d, :sub, :notes, :u)", {
      n: number, s: sup.id, w: wh.id, c: s(b.currency, 3).toUpperCase() || sup.currency, i: s(b.incoterm, 3).toUpperCase() || null, d: /^\d{4}-\d{2}-\d{2}$/.test(b.expectedDate || "") ? b.expectedDate : null, sub: subtotal, notes: s(b.notes, 2000), u: req.user.id,
    }, conn);
    for (const l of lines) await query("INSERT INTO purchase_order_items (po_id, product_id, supplier_sku, qty, unit_cost) VALUES (:po, :p, :ss, :q, :c)", { po: r.insertId, p: l.productId, ss: l.supplierSku, q: l.qty, c: l.unitCost }, conn);
    await audit.record({ req, action: "po.create", entityType: "purchase_order", entityId: number, after: { supplier: sup.code, lines: lines.length } }, conn);
    return r.insertId;
  });
  res.status(201).json({ purchaseOrder: await poJson(id, show) });
}));

router.get("/purchase-orders/:id", ah(async (req, res) => {
  const po = await poJson(req.params.id, await seeCost(req));
  if (!po) throw notFound("Purchase order not found.");
  res.json({ purchaseOrder: po });
}));

router.put("/purchase-orders/:id", ah(async (req, res) => {
  const show = await seeCost(req);
  await tx(async (conn) => {
    const po = await one("SELECT * FROM purchase_orders WHERE id = :id FOR UPDATE", { id: req.params.id }, conn);
    if (!po) throw notFound("Purchase order not found.");
    if (po.status !== "draft") throw conflict("Only draft purchase orders can be edited.");
    const { lines, subtotal } = await priceLines(conn, po.supplier_id, req.body.lines || [], show);
    await query("DELETE FROM purchase_order_items WHERE po_id = :id", { id: po.id }, conn);
    for (const l of lines) await query("INSERT INTO purchase_order_items (po_id, product_id, supplier_sku, qty, unit_cost) VALUES (:po, :p, :ss, :q, :c)", { po: po.id, p: l.productId, ss: l.supplierSku, q: l.qty, c: l.unitCost }, conn);
    await query("UPDATE purchase_orders SET subtotal = :s, notes = :n, expected_date = :d WHERE id = :id", { s: subtotal, n: s(req.body.notes ?? po.notes, 2000), d: /^\d{4}-\d{2}-\d{2}$/.test(req.body.expectedDate || "") ? req.body.expectedDate : po.expected_date, id: po.id }, conn);
    await audit.record({ req, action: "po.update", entityType: "purchase_order", entityId: po.po_number }, conn);
  });
  res.json({ purchaseOrder: await poJson(req.params.id, show) });
}));

// Sent → quantities appear as "incoming" stock in the receiving warehouse.
router.post("/purchase-orders/:id/send", ah(async (req, res) => {
  await tx(async (conn) => {
    const po = await one("SELECT * FROM purchase_orders WHERE id = :id FOR UPDATE", { id: req.params.id }, conn);
    if (!po) throw notFound("Purchase order not found.");
    if (po.status !== "draft") throw conflict("Already sent.");
    const items = await query("SELECT * FROM purchase_order_items WHERE po_id = :id", { id: po.id }, conn);
    for (const i of items) await inventory.adjust({ productId: i.product_id, warehouseId: po.warehouse_id, operation: "incoming", quantity: i.qty, reason: `PO ${po.po_number}`, referenceType: "purchase_order", referenceId: po.po_number, userId: req.user.id }, conn);
    await query("UPDATE purchase_orders SET status = 'sent', sent_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: po.id }, conn);
    await audit.record({ req, action: "po.send", entityType: "purchase_order", entityId: po.po_number }, conn);
  });
  res.json({ purchaseOrder: await poJson(req.params.id, await seeCost(req)) });
}));

// Goods receipt: incoming → on hand (damaged units go to the damaged bucket). Idempotent per key.
router.post("/purchase-orders/:id/receive", ah(async (req, res) => {
  const b = req.body || {};
  const key = s(b.idempotencyKey, 100) || null;
  if (key) {
    const dup = await one("SELECT grn_number FROM goods_receipts WHERE idempotency_key = :k", { k: key });
    if (dup) return res.json({ grnNumber: dup.grn_number, duplicate: true });
  }
  const out = await tx(async (conn) => {
    const po = await one("SELECT * FROM purchase_orders WHERE id = :id FOR UPDATE", { id: req.params.id }, conn);
    if (!po) throw notFound("Purchase order not found.");
    if (!["sent", "partially_received"].includes(po.status)) throw conflict("Only sent purchase orders can be received.");
    const items = new Map((await query("SELECT * FROM purchase_order_items WHERE po_id = :id FOR UPDATE", { id: po.id }, conn)).map((i) => [String(i.id), i]));
    const lines = (b.lines || []).map((l) => ({ itemId: String(l.itemId), qty: Math.floor(Number(l.qty) || 0), damaged: Math.floor(Number(l.damaged) || 0) })).filter((l) => l.qty > 0);
    if (!lines.length) throw badRequest("Enter the received quantities.");
    const number = await seq.next("grn", conn);
    const g = await query("INSERT INTO goods_receipts (grn_number, po_id, warehouse_id, notes, idempotency_key, received_by) VALUES (:n, :po, :w, :notes, :k, :u)", { n: number, po: po.id, w: po.warehouse_id, notes: s(b.notes, 1000), k: key, u: req.user.id }, conn);
    for (const l of lines) {
      const it = items.get(l.itemId);
      if (!it) throw badRequest("Line does not belong to this purchase order.");
      if (l.damaged < 0 || l.damaged > l.qty) throw badRequest("Damaged quantity must be between 0 and the received quantity.");
      if (it.qty_received + l.qty > it.qty) throw conflict(`Receiving more than ordered on line ${l.itemId} (${it.qty - it.qty_received} outstanding).`);
      const ref = { referenceType: "goods_receipt", referenceId: number, userId: req.user.id };
      await inventory.adjust({ productId: it.product_id, warehouseId: po.warehouse_id, operation: "incoming_cancel", quantity: l.qty, reason: `GRN ${number}`, ...ref }, conn);
      await inventory.adjust({ productId: it.product_id, warehouseId: po.warehouse_id, operation: "receive", quantity: l.qty, reason: `GRN ${number} (PO ${po.po_number})`, ...ref }, conn);
      if (l.damaged) await inventory.adjust({ productId: it.product_id, warehouseId: po.warehouse_id, operation: "damage", quantity: l.damaged, reason: `Damaged on receipt ${number}`, ...ref }, conn);
      await query("UPDATE purchase_order_items SET qty_received = qty_received + :q WHERE id = :id", { q: l.qty, id: it.id }, conn);
      await query("INSERT INTO goods_receipt_items (grn_id, po_item_id, product_id, qty, damaged) VALUES (:g, :i, :p, :q, :d)", { g: g.insertId, i: it.id, p: it.product_id, q: l.qty, d: l.damaged }, conn);
    }
    const left = await one("SELECT SUM(qty - qty_received) AS r FROM purchase_order_items WHERE po_id = :id", { id: po.id }, conn);
    await query("UPDATE purchase_orders SET status = :s WHERE id = :id", { s: Number(left.r) > 0 ? "partially_received" : "received", id: po.id }, conn);
    await audit.record({ req, action: "po.receive", entityType: "purchase_order", entityId: po.po_number, after: { grn: number, lines: lines.length } }, conn);
    return { grnNumber: number };
  });
  res.status(201).json(out);
}));

router.post("/purchase-orders/:id/cancel", ah(async (req, res) => {
  const reason = s(req.body.reason, 500);
  if (reason.length < 3) throw badRequest("Give a reason.");
  await tx(async (conn) => {
    const po = await one("SELECT * FROM purchase_orders WHERE id = :id FOR UPDATE", { id: req.params.id }, conn);
    if (!po) throw notFound("Purchase order not found.");
    if (!["draft", "sent", "partially_received"].includes(po.status)) throw conflict("This purchase order cannot be cancelled.");
    if (po.status !== "draft") {
      const items = await query("SELECT * FROM purchase_order_items WHERE po_id = :id", { id: po.id }, conn);
      for (const i of items) if (i.qty > i.qty_received) await inventory.adjust({ productId: i.product_id, warehouseId: po.warehouse_id, operation: "incoming_cancel", quantity: i.qty - i.qty_received, reason: `PO ${po.po_number} cancelled`, referenceType: "purchase_order", referenceId: po.po_number, userId: req.user.id }, conn);
    }
    await query("UPDATE purchase_orders SET status = 'cancelled' WHERE id = :id", { id: po.id }, conn);
    await audit.record({ req, action: "po.cancel", entityType: "purchase_order", entityId: po.po_number, reason }, conn);
  });
  res.json({ ok: true });
}));

// ── Supplier invoices ──
router.get("/supplier-invoices", ah(async (req, res) => {
  const show = await seeCost(req);
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("si.status = :s"), (p.s = String(req.query.status)));
  const pg = paging(req);
  const rows = await query(`SELECT si.*, s.name AS supplier_name, po.po_number FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id LEFT JOIN purchase_orders po ON po.id = si.po_id WHERE ${where.join(" AND ")} ORDER BY si.status = 'unpaid' DESC, si.due_date, si.id DESC ${pg.sql}`, p);
  const total = await one(`SELECT COUNT(*) c FROM supplier_invoices si WHERE ${where.join(" AND ")}`, p);
  res.json({ ...meta(pg, total.c), canSeeCost: show, invoices: rows.map((r) => ({ id: String(r.id), supplier: r.supplier_name, poNumber: r.po_number, number: r.invoice_number, date: r.invoice_date, dueDate: r.due_date, currency: r.currency, amount: cost(show, r.amount), status: r.status, paidAt: r.paid_at, paymentReference: r.payment_reference, notes: r.notes })) });
}));
router.post("/supplier-invoices", ah(async (req, res) => {
  if (!(await seeCost(req))) throw badRequest("You do not have permission to record supplier costs.");
  const b = req.body || {};
  const sup = await one("SELECT id FROM suppliers WHERE id = :id", { id: b.supplierId });
  if (!sup) throw badRequest("Choose a supplier.");
  const number = s(b.number, 80);
  if (!number) throw badRequest("Enter the supplier's invoice number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) throw badRequest("Invoice date is required (YYYY-MM-DD).");
  let amt;
  try {
    amt = D(b.amount || 0);
  } catch {
    throw badRequest("Enter the invoice amount.");
  }
  if (!amt.gt(0)) throw badRequest("Enter the invoice amount.");
  if (await one("SELECT id FROM supplier_invoices WHERE supplier_id = :s AND invoice_number = :n", { s: sup.id, n: number })) throw conflict("This supplier invoice is already recorded.");
  const r = await query("INSERT INTO supplier_invoices (supplier_id, po_id, invoice_number, invoice_date, due_date, currency, amount, notes, created_by) VALUES (:s, :po, :n, :d, :due, :c, :a, :notes, :u)", {
    s: sup.id, po: b.poId || null, n: number, d: b.date, due: /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate || "") ? b.dueDate : null, c: s(b.currency, 3).toUpperCase() || "USD", a: amt.toFixed(2), notes: s(b.notes, 1000), u: req.user.id,
  });
  await audit.record({ req, action: "supplier_invoice.create", entityType: "supplier_invoice", entityId: String(r.insertId), after: { number } });
  res.status(201).json({ id: String(r.insertId) });
}));
router.post("/supplier-invoices/:id/status", ah(async (req, res) => {
  const st = req.body.status;
  if (!["unpaid", "paid", "disputed", "cancelled"].includes(st)) throw badRequest("Invalid status.");
  if (st === "paid" && s(req.body.paymentReference, 120).length < 3) throw badRequest("Enter the payment reference.");
  const r = await query("UPDATE supplier_invoices SET status = :s, paid_at = IF(:s = 'paid', CURRENT_DATE(), NULL), payment_reference = :ref WHERE id = :id", { s: st, ref: s(req.body.paymentReference, 120), id: req.params.id });
  if (!r.affectedRows) throw notFound("Invoice not found.");
  await audit.record({ req, action: "supplier_invoice.status", entityType: "supplier_invoice", entityId: req.params.id, after: { status: st } });
  res.json({ ok: true });
}));

// Reorder suggestions: products at/below reorder point with the preferred supplier.
router.get("/reorder-suggestions", ah(async (req, res) => {
  const show = await seeCost(req);
  const rows = await query(
    `SELECT p.id, p.sku, p.name, l.warehouse_id, w.code AS wh, l.on_hand, l.reserved, l.incoming, l.reorder_point, l.reorder_qty, sp.supplier_id, s.name AS supplier, sp.unit_cost, sp.moq
       FROM inventory_levels l JOIN products p ON p.id = l.product_id JOIN warehouses w ON w.id = l.warehouse_id
       LEFT JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_preferred = 1 LEFT JOIN suppliers s ON s.id = sp.supplier_id
      WHERE l.reorder_point IS NOT NULL AND (l.on_hand - l.reserved + l.incoming) <= l.reorder_point ORDER BY p.sku LIMIT 500`
  );
  res.json({ suggestions: rows.map((r) => ({ productId: String(r.id), sku: r.sku, name: r.name, warehouse: r.wh, available: r.on_hand - r.reserved, incoming: r.incoming, reorderPoint: r.reorder_point, suggestedQty: Math.max(r.reorder_qty || 0, r.moq || 1), supplier: r.supplier_id ? { id: String(r.supplier_id), name: r.supplier } : null, unitCost: cost(show, r.unit_cost) })) });
}));

module.exports = { router };
