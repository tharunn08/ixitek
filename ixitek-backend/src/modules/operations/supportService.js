// supportService.js — returns/RMA/warranty claims and support tickets.
const { query, one, tx } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const settings = require("../../core/settings.js");
const seq = require("../commerce/sequences.js");
const inventory = require("../inventory/inventoryService.js");
const orders = require("../commerce/orderService.js");
const { badRequest, conflict, notFound } = require("../../core/errors.js");

const s = (v, n) => String(v ?? "").trim().slice(0, n);
const RMA_KINDS = ["return", "replacement", "repair", "refund", "warranty"];
const RMA_REASONS = ["damaged_in_transit", "defective", "wrong_item", "not_as_described", "no_longer_needed", "warranty_fault", "other"];
const RMA_FLOW = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["awaiting_return", "received", "completed", "cancelled"],
  awaiting_return: ["received", "cancelled"],
  received: ["inspected", "completed"],
  inspected: ["completed"],
  rejected: [],
  completed: [],
  cancelled: [],
};

// ── RMA ──
async function createRma(req, orderRow, body) {
  const kind = RMA_KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) throw badRequest("Choose what you need: return, replacement, repair, refund or warranty claim.");
  const reason = RMA_REASONS.includes(body.reason) ? body.reason : null;
  if (!reason) throw badRequest("Choose a reason.");
  const notes = s(body.notes, 5000);
  if (notes.length < 5) throw badRequest("Describe the problem.");
  return tx(async (conn) => {
    const o = await one("SELECT * FROM orders WHERE id = :id FOR UPDATE", { id: orderRow.id }, conn);
    if (!["shipped", "in_transit", "out_for_delivery", "delivered"].includes(o.status)) throw conflict("Returns can be requested once the order has shipped.");
    const lines = (body.items || []).map((i) => ({ orderItemId: String(i.orderItemId), qty: Math.floor(Number(i.qty)) })).filter((i) => i.qty > 0);
    if (!lines.length) throw badRequest("Choose the items and quantities.");
    let within = null;
    const delivered = await one("SELECT MAX(delivered_at) AS d FROM shipments WHERE order_id = :o AND status = 'delivered'", { o: o.id }, conn);
    for (const l of lines) {
      const it = await one("SELECT oi.id, oi.qty, oi.qty_shipped, oi.product_id, oi.sku, p.warranty_months FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.id = :id AND oi.order_id = :o", { id: l.orderItemId, o: o.id }, conn);
      if (!it) throw badRequest("Item does not belong to this order.");
      const open = await one("SELECT COALESCE(SUM(ri.qty), 0) AS q FROM rma_items ri JOIN rmas r ON r.id = ri.rma_id WHERE ri.order_item_id = :i AND r.status NOT IN ('rejected','cancelled')", { i: it.id }, conn);
      if (l.qty + Number(open.q) > it.qty_shipped) throw conflict(`${it.sku}: at most ${it.qty_shipped - Number(open.q)} can be returned.`);
      // Warranty: only computed when the product has a warranty period AND a delivery date is recorded. Otherwise staff verify.
      if (kind === "warranty" && it.warranty_months !== null && delivered && delivered.d) {
        const end = new Date(delivered.d);
        end.setMonth(end.getMonth() + Number(it.warranty_months));
        const ok = end >= new Date();
        within = within === null ? ok : within && ok;
      }
    }
    const number = await seq.next("rma", conn);
    const r = await query("INSERT INTO rmas (rma_number, order_id, user_id, kind, reason, customer_notes, within_warranty) VALUES (:n, :o, :u, :k, :r, :notes, :w)", {
      n: number, o: o.id, u: req.user ? req.user.id : o.user_id, k: kind, r: reason, notes, w: within === null ? null : within ? 1 : 0,
    }, conn);
    for (const l of lines) await query("INSERT INTO rma_items (rma_id, order_item_id, qty) VALUES (:r, :i, :q)", { r: r.insertId, i: l.orderItemId, q: l.qty }, conn);
    await query("INSERT INTO rma_events (rma_id, status, note, actor_user_id) VALUES (:r, 'requested', :n, :u)", { r: r.insertId, n: "Request submitted", u: req.user ? req.user.id : null }, conn);
    await audit.record({ req, actorEmail: o.customer_email, action: "rma.create", entityType: "rma", entityId: number, after: { order: o.order_number, kind, lines: lines.length } }, conn);
    await events.emit("rma.created", { rmaId: r.insertId }, conn, { key: String(r.insertId) });
    return { rmaNumber: number };
  });
}

async function rmaJson(id, { internal = false } = {}) {
  const r = await one("SELECT r.*, o.order_number, u.email AS assignee FROM rmas r JOIN orders o ON o.id = r.order_id LEFT JOIN users u ON u.id = r.assigned_to WHERE r.id = :id", { id });
  if (!r) return null;
  const items = await query("SELECT ri.*, oi.sku, oi.name, oi.unit_price FROM rma_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.rma_id = :id", { id });
  const evs = await query(`SELECT status, note, is_internal, created_at FROM rma_events WHERE rma_id = :id ${internal ? "" : "AND is_internal = 0"} ORDER BY id`, { id });
  return {
    rmaNumber: r.rma_number, orderNumber: r.order_number, kind: r.kind, status: r.status, reason: r.reason, notes: r.customer_notes, resolution: r.resolution, withinWarranty: r.within_warranty === null ? null : Boolean(r.within_warranty),
    returnTracking: r.return_tracking, createdAt: r.created_at, transitions: internal ? RMA_FLOW[r.status] : undefined, assignee: internal ? r.assignee : undefined,
    items: items.map((i) => ({ orderItemId: String(i.order_item_id), sku: i.sku, name: i.name, qty: i.qty, unitPrice: i.unit_price, condition: internal ? i.condition_note : undefined, restock: internal ? (i.restock === null ? null : Boolean(i.restock)) : undefined })),
    history: evs.map((e) => ({ status: e.status, note: e.note, internal: internal ? Boolean(e.is_internal) : undefined, at: e.created_at })),
    returnInstructions: r.status === "approved" || r.status === "awaiting_return" ? String((await settings.get("support.return_instructions", "")) || "") : undefined,
  };
}

/** Staff update. `restock`: [{orderItemId, qty, warehouseId}] puts returned units back into stock on "received". */
async function updateRma(req, number, body) {
  const to = s(body.status, 30);
  return tx(async (conn) => {
    const r = await one("SELECT * FROM rmas WHERE rma_number = :n FOR UPDATE", { n: number }, conn);
    if (!r) throw notFound("Return not found.");
    const upd = {};
    if (to && to !== r.status) {
      if (!(RMA_FLOW[r.status] || []).includes(to)) throw conflict(`Cannot move from ${r.status} to ${to}.`);
      upd.status = to;
    }
    if (body.resolution !== undefined) upd.resolution = s(body.resolution, 1000);
    if (body.returnTracking !== undefined) upd.return_tracking = s(body.returnTracking, 200);
    if (body.assignedTo !== undefined) upd.assigned_to = await require("./staff.js").assertStaff(body.assignedTo, conn);
    if (body.withinWarranty !== undefined) upd.within_warranty = body.withinWarranty === null ? null : body.withinWarranty ? 1 : 0;
    if (to === "rejected" && s(body.note, 2000).length < 3) throw badRequest("Explain why the request is rejected.");
    if (to === "completed" && !s(body.resolution ?? r.resolution, 1000)) throw badRequest("Record the resolution (e.g. refunded, replaced, repaired).");
    if (!Object.keys(upd).length && !body.note) throw badRequest("Nothing to change.");
    if (Object.keys(upd).length) await query(`UPDATE rmas SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id: r.id }, conn);
    if (to === "received" && Array.isArray(body.restock)) {
      for (const x of body.restock) {
        const it = await one("SELECT ri.qty, oi.product_id, oi.sku FROM rma_items ri JOIN order_items oi ON oi.id = ri.order_item_id WHERE ri.rma_id = :r AND ri.order_item_id = :i", { r: r.id, i: x.orderItemId }, conn);
        if (!it) throw badRequest("Item not on this return.");
        const q = Math.floor(Number(x.qty));
        if (!(q >= 0) || q > it.qty) throw badRequest(`${it.sku}: restock quantity 0–${it.qty}.`);
        await query("UPDATE rma_items SET restock = :rs, condition_note = :c WHERE rma_id = :r AND order_item_id = :i", { rs: q > 0 ? 1 : 0, c: s(x.condition, 300), r: r.id, i: x.orderItemId }, conn);
        if (q > 0 && it.product_id) await inventory.adjust({ productId: it.product_id, warehouseId: x.warehouseId, operation: "receive", quantity: q, reason: `Customer return ${r.rma_number}`, referenceType: "rma", referenceId: r.rma_number, userId: req.user.id }, conn);
        await query("UPDATE order_items SET qty_returned = qty_returned + :q WHERE id = :i", { q: it.qty, i: x.orderItemId }, conn);
      }
      const o = await one("SELECT id, status FROM orders WHERE id = :id", { id: r.order_id }, conn);
      if (["return", "refund"].includes(r.kind) && o.status === "delivered") await orders.setStatus(conn, o.id, "returned", { note: `Return ${r.rma_number} received`, actorId: req.user.id });
    }
    await query("INSERT INTO rma_events (rma_id, status, note, is_internal, actor_user_id) VALUES (:r, :s, :n, :i, :u)", { r: r.id, s: upd.status || r.status, n: s(body.note, 2000), i: body.internal ? 1 : 0, u: req.user.id }, conn);
    await audit.record({ req, action: "rma.update", entityType: "rma", entityId: r.rma_number, before: { status: r.status }, after: upd, reason: body.note }, conn);
    if (upd.status && !body.internal) await events.emit("rma.updated", { rmaId: r.id, status: upd.status }, conn, { key: `${r.id}:${upd.status}` });
  });
}

// ── Tickets ──
const CATS = ["order", "technical", "billing", "shipping", "returns", "account", "other"];
async function createTicket(req, body) {
  const name = s(body.name || (req.user && req.user.name), 150);
  const email = s(body.email || (req.user && req.user.email), 254).toLowerCase();
  if (!name) throw badRequest("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Enter a valid email.");
  const subject = s(body.subject, 200);
  const message = s(body.message, 10000);
  if (subject.length < 3 || message.length < 5) throw badRequest("Add a subject and describe the issue.");
  let orderId = null;
  if (body.orderNumber) {
    const o = await one("SELECT id, user_id, customer_email FROM orders WHERE order_number = :n", { n: s(body.orderNumber, 20) });
    if (o && ((req.user && Number(o.user_id) === Number(req.user.id)) || o.customer_email === email)) orderId = o.id;
  }
  return tx(async (conn) => {
    const number = await seq.next("ticket", conn);
    const t = await query("INSERT INTO tickets (ticket_number, access_token, user_id, company_id, name, email, subject, category, order_id) VALUES (:n, :tok, :u, :c, :name, :e, :s, :cat, :o)", {
      n: number, tok: seq.token(), u: req.user ? req.user.id : null, c: req.user ? req.user.company_id || null : null, name, e: email, s: subject, cat: CATS.includes(body.category) ? body.category : "other", o: orderId,
    }, conn);
    await query("INSERT INTO ticket_messages (ticket_id, author_user_id, author_name, body) VALUES (:t, :u, :n, :b)", { t: t.insertId, u: req.user ? req.user.id : null, n: name, b: message }, conn);
    await events.emit("ticket.created", { ticketId: t.insertId }, conn, { key: String(t.insertId) });
    const tok = await one("SELECT access_token FROM tickets WHERE id = :id", { id: t.insertId }, conn);
    return { ticketNumber: number, accessToken: tok.access_token };
  });
}

async function ticketJson(id, { internal = false } = {}) {
  const t = await one("SELECT t.*, o.order_number, u.email AS assignee FROM tickets t LEFT JOIN orders o ON o.id = t.order_id LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = :id", { id });
  if (!t) return null;
  const msgs = await query(`SELECT id, author_name, is_staff, is_internal, body, created_at FROM ticket_messages WHERE ticket_id = :id ${internal ? "" : "AND is_internal = 0"} ORDER BY id`, { id });
  return {
    ticketNumber: t.ticket_number, subject: t.subject, category: t.category, priority: t.priority, status: t.status, orderNumber: t.order_number, name: t.name, email: t.email, createdAt: t.created_at, updatedAt: t.updated_at,
    assignee: internal ? t.assignee : undefined,
    messages: msgs.map((m) => ({ id: String(m.id), author: m.author_name, staff: Boolean(m.is_staff), internal: internal ? Boolean(m.is_internal) : undefined, body: m.body, at: m.created_at })),
  };
}

async function replyTicket(req, ticketId, body, { staff = false } = {}) {
  const text = s(body.body, 10000);
  if (!text) throw badRequest("Write a message.");
  const internal = staff && Boolean(body.internal);
  await tx(async (conn) => {
    const t = await one("SELECT * FROM tickets WHERE id = :id FOR UPDATE", { id: ticketId }, conn);
    if (!t) throw notFound("Ticket not found.");
    if (t.status === "closed" && !staff) throw conflict("This ticket is closed. Open a new ticket if you still need help.");
    const m = await query("INSERT INTO ticket_messages (ticket_id, author_user_id, author_name, is_staff, is_internal, body) VALUES (:t, :u, :n, :s, :i, :b)", { t: t.id, u: req.user ? req.user.id : null, n: req.user ? req.user.name : t.name, s: staff ? 1 : 0, i: internal ? 1 : 0, b: text }, conn);
    const next = internal ? t.status : staff ? (body.status && ["open", "pending_customer", "pending_internal", "resolved", "closed"].includes(body.status) ? body.status : "pending_customer") : "open";
    await query("UPDATE tickets SET status = :s WHERE id = :id", { s: next, id: t.id }, conn);
    if (staff && !internal) await events.emit("ticket.replied", { ticketId: t.id, messageId: m.insertId }, conn, { key: String(m.insertId) });
  });
}

module.exports = { createRma, rmaJson, updateRma, RMA_KINDS, RMA_REASONS, RMA_FLOW, createTicket, ticketJson, replyTicket, CATS };
