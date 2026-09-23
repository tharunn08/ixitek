// shipmentService.js — dispatch & tracking. Shipping is the only path that
// moves an order to shipped / in transit / delivered, so stock, order status
// and customer notifications always agree.
//
// Carrier adapters: every carrier row names an adapter. "manual" (staff enter
// tracking + events) is implemented. A live integration (e.g. a DHL/FedEx
// tracking API) is added by registering an adapter with the same interface:
//   { buildTrackingUrl(trackingNumber, template), fetchEvents?(shipment) → [{status, location, description, occurredAt}] }
const { query, one, tx } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const seq = require("../commerce/sequences.js");
const orders = require("../commerce/orderService.js");
const inventory = require("../inventory/inventoryService.js");
const { badRequest, conflict, notFound } = require("../../core/errors.js");

const adapters = {
  manual: {
    buildTrackingUrl: (n, template) => (template && n ? template.replace("{tracking}", encodeURIComponent(n)) : ""),
    fetchEvents: null,
  },
};
function registerAdapter(name, impl) {
  adapters[name] = impl;
}

const FLOW = {
  preparing: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "preparing", "cancelled"],
  shipped: ["in_transit", "out_for_delivery", "delivered", "exception"],
  in_transit: ["out_for_delivery", "delivered", "exception"],
  out_for_delivery: ["delivered", "exception", "in_transit"],
  exception: ["in_transit", "out_for_delivery", "delivered", "returned"],
  delivered: [],
  returned: [],
  cancelled: [],
};
const ORDER_SHIPPABLE = ["confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery"];

async function remainingByItem(conn, orderId) {
  const rows = await query(
    `SELECT oi.id, oi.product_id, oi.sku, oi.qty,
            COALESCE((SELECT SUM(si.qty) FROM shipment_items si JOIN shipments s ON s.id = si.shipment_id WHERE si.order_item_id = oi.id AND s.status <> 'cancelled'), 0) AS allocated
       FROM order_items oi WHERE oi.order_id = :o ORDER BY oi.id`,
    { o: orderId },
    conn
  );
  return new Map(rows.map((r) => [String(r.id), { ...r, remaining: r.qty - Number(r.allocated) }]));
}

async function create(req, orderNumber, body) {
  const carrier = await one("SELECT * FROM carriers WHERE code = :c AND is_active = 1", { c: String(body.carrier || "") });
  if (!carrier) throw badRequest("Choose a carrier.");
  return tx(async (conn) => {
    const o = await one("SELECT * FROM orders WHERE order_number = :n FOR UPDATE", { n: orderNumber }, conn);
    if (!o) throw notFound("Order not found.");
    if (!ORDER_SHIPPABLE.includes(o.status)) throw conflict(o.status === "pending_payment" ? "This order is not paid yet." : `An order that is ${o.status.replace(/_/g, " ")} cannot be shipped.`);
    const rem = await remainingByItem(conn, o.id);
    let lines = Array.isArray(body.items) && body.items.length ? body.items : [...rem.values()].filter((r) => r.remaining > 0).map((r) => ({ orderItemId: String(r.id), qty: r.remaining }));
    lines = lines.map((l) => ({ orderItemId: String(l.orderItemId), qty: Math.floor(Number(l.qty)) })).filter((l) => l.qty > 0);
    if (!lines.length) throw conflict("Everything on this order is already allocated to shipments.");
    for (const l of lines) {
      const r = rem.get(l.orderItemId);
      if (!r) throw badRequest("Item does not belong to this order.");
      if (l.qty > r.remaining) throw conflict(`${r.sku}: only ${r.remaining} left to ship.`);
    }
    const number = await seq.next("shipment", conn);
    const tracking = String(body.trackingNumber || "").trim().slice(0, 100);
    const url = String(body.trackingUrl || "").trim().slice(0, 500) || (adapters[carrier.adapter] || adapters.manual).buildTrackingUrl(tracking, carrier.tracking_url_template);
    if (url && !/^https:\/\//i.test(url)) throw badRequest("Tracking link must start with https://");
    const ins = await query(
      `INSERT INTO shipments (shipment_number, order_id, warehouse_id, carrier, service, tracking_number, tracking_url, packages, weight_kg, estimated_delivery, notes, created_by)
       VALUES (:n, :o, :w, :c, :svc, :t, :u, :p, :kg, :eta, :notes, :by)`,
      {
        n: number, o: o.id, w: body.warehouseId || null, c: carrier.code, svc: String(body.service || "").slice(0, 60), t: tracking, u: url, p: Math.max(1, Number.parseInt(body.packages, 10) || 1),
        kg: body.weightKg ? String(Number(body.weightKg)) : null, eta: /^\d{4}-\d{2}-\d{2}$/.test(body.estimatedDelivery || "") ? body.estimatedDelivery : null, notes: String(body.notes || "").slice(0, 1000), by: req.user.id,
      },
      conn
    );
    for (const l of lines) await query("INSERT INTO shipment_items (shipment_id, order_item_id, qty) VALUES (:s, :i, :q)", { s: ins.insertId, i: l.orderItemId, q: l.qty }, conn);
    await query("INSERT INTO shipment_events (shipment_id, status, description, created_by) VALUES (:s, 'preparing', 'Shipment created', :u)", { s: ins.insertId, u: req.user.id }, conn);
    if (o.status === "confirmed") await orders.setStatus(conn, o.id, "processing", { note: `Shipment ${number} created`, actorId: req.user.id });
    await audit.record({ req, action: "shipment.create", entityType: "order", entityId: o.order_number, after: { shipment: number, carrier: carrier.code, lines: lines.length } }, conn);
    return { shipmentNumber: number };
  });
}

/** Take shipped quantities out of stock: consume this order's reservations first, then free stock. */
async function takeStock(conn, orderId, productId, qty, warehouseId, userId, ref) {
  const p = await one("SELECT sku, track_inventory FROM products WHERE id = :id", { id: productId }, conn);
  if (!p || !p.track_inventory) return;
  let need = qty;
  const res = await query("SELECT * FROM stock_reservations WHERE order_id = :o AND product_id = :p AND status = 'reserved' ORDER BY id FOR UPDATE", { o: orderId, p: productId }, conn);
  for (const r of res) {
    if (need <= 0) break;
    const take = Math.min(need, r.qty);
    await inventory.adjust({ productId, warehouseId: r.warehouse_id, operation: "release", quantity: take, reason: `Shipped ${ref}`, referenceType: "shipment", referenceId: ref, userId }, conn);
    await inventory.adjust({ productId, warehouseId: r.warehouse_id, operation: "decrease", quantity: take, reason: `Shipped ${ref}`, referenceType: "shipment", referenceId: ref, userId }, conn);
    if (take === r.qty) await query("UPDATE stock_reservations SET status = 'consumed' WHERE id = :id", { id: r.id }, conn);
    else {
      await query("UPDATE stock_reservations SET qty = qty - :t WHERE id = :id", { t: take, id: r.id }, conn);
      await query("INSERT INTO stock_reservations (order_id, product_id, warehouse_id, qty, status) VALUES (:o, :p, :w, :q, 'consumed')", { o: orderId, p: productId, w: r.warehouse_id, q: take }, conn);
    }
    need -= take;
  }
  if (need <= 0) return;
  const levels = await query("SELECT l.warehouse_id, l.on_hand - l.reserved AS free FROM inventory_levels l JOIN warehouses w ON w.id = l.warehouse_id AND w.is_active = 1 WHERE l.product_id = :p ORDER BY (l.warehouse_id = :w) DESC, free DESC", { p: productId, w: warehouseId || 0 }, conn);
  if (!levels.length) return; // not stock-managed yet (no inventory records) — made to order
  for (const l of levels) {
    if (need <= 0) break;
    const take = Math.min(need, Math.max(0, Number(l.free)));
    if (!take) continue;
    await inventory.adjust({ productId, warehouseId: l.warehouse_id, operation: "decrease", quantity: take, reason: `Shipped ${ref}`, referenceType: "shipment", referenceId: ref, userId }, conn);
    need -= take;
  }
  if (need > 0) throw conflict(`${p.sku}: not enough stock to ship (${need} short). Receive stock first.`);
}

async function updateStatus(req, number, body) {
  const to = String(body.status || "");
  return tx(async (conn) => {
    const s = await one("SELECT * FROM shipments WHERE shipment_number = :n FOR UPDATE", { n: number }, conn);
    if (!s) throw notFound("Shipment not found.");
    if (!(FLOW[s.status] || []).includes(to)) throw conflict(`A shipment cannot move from ${s.status.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`);
    const o = await one("SELECT * FROM orders WHERE id = :id FOR UPDATE", { id: s.order_id }, conn);
    const upd = { status: to };
    if (body.trackingNumber !== undefined) upd.tracking_number = String(body.trackingNumber).trim().slice(0, 100);
    if (body.trackingUrl !== undefined) {
      const u = String(body.trackingUrl).trim().slice(0, 500);
      if (u && !/^https:\/\//i.test(u)) throw badRequest("Tracking link must start with https://");
      upd.tracking_url = u;
    }
    if (upd.tracking_number && upd.tracking_url === undefined && !s.tracking_url) {
      const c = await one("SELECT adapter, tracking_url_template FROM carriers WHERE code = :c", { c: s.carrier }, conn);
      const built = (adapters[c.adapter] || adapters.manual).buildTrackingUrl(upd.tracking_number, c.tracking_url_template);
      if (built) upd.tracking_url = built;
    }
    if (to === "shipped") {
      if (!(upd.tracking_number || s.tracking_number) && !["own", "other"].includes(s.carrier)) throw badRequest("Enter the tracking number before marking as shipped.");
      const items = await query("SELECT si.qty, oi.id, oi.product_id FROM shipment_items si JOIN order_items oi ON oi.id = si.order_item_id WHERE si.shipment_id = :s", { s: s.id }, conn);
      for (const it of items) {
        if (it.product_id) await takeStock(conn, o.id, it.product_id, it.qty, s.warehouse_id, req.user.id, s.shipment_number);
        await query("UPDATE order_items SET qty_shipped = qty_shipped + :q WHERE id = :id", { q: it.qty, id: it.id }, conn);
      }
      upd.shipped_at = new Date();
    }
    if (to === "delivered") upd.delivered_at = new Date();
    if (to === "cancelled" && ["shipped"].includes(s.status)) throw conflict("A dispatched shipment cannot be cancelled.");
    await query(`UPDATE shipments SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id: s.id }, conn);
    await query("INSERT INTO shipment_events (shipment_id, status, location, description, occurred_at, created_by) VALUES (:s, :st, :l, :d, COALESCE(:at, CURRENT_TIMESTAMP(3)), :u)", {
      s: s.id, st: to, l: String(body.location || "").slice(0, 200), d: String(body.description || "").slice(0, 500), at: body.occurredAt && !Number.isNaN(Date.parse(body.occurredAt)) ? new Date(body.occurredAt) : null, u: req.user.id,
    }, conn);

    // Roll the order status forward from its shipments.
    const agg = await one(
      `SELECT (SELECT SUM(qty) FROM order_items WHERE order_id = :o) AS ordered, (SELECT SUM(qty_shipped) FROM order_items WHERE order_id = :o) AS shipped,
              SUM(status = 'delivered') AS delivered, SUM(status IN ('in_transit','out_for_delivery','exception')) AS moving, SUM(status = 'out_for_delivery') AS ofd,
              SUM(status NOT IN ('cancelled')) AS active, SUM(status = 'packed') AS packed
         FROM shipments WHERE order_id = :o`,
      { o: o.id },
      conn
    );
    const allShipped = Number(agg.shipped) >= Number(agg.ordered);
    let target = null;
    if (allShipped && Number(agg.delivered) === Number(agg.active)) target = "delivered";
    else if (allShipped && Number(agg.ofd) > 0) target = "out_for_delivery";
    else if (allShipped && (Number(agg.moving) > 0 || Number(agg.delivered) > 0)) target = "in_transit";
    else if (allShipped) target = "shipped";
    else if (to === "packed" && o.status === "processing") target = "packed";
    if (target) await advanceOrder(conn, o.id, target, { note: `Shipment ${s.shipment_number}: ${to.replace(/_/g, " ")}`, actorId: req.user.id });
    await audit.record({ req, action: "shipment.status", entityType: "shipment", entityId: s.shipment_number, before: { status: s.status }, after: upd }, conn);
    if (to === "shipped") await events.emit("shipment.shipped", { shipmentId: s.id }, conn, { key: String(s.id) });
    if (to === "delivered") await events.emit("shipment.delivered", { shipmentId: s.id }, conn, { key: String(s.id) });
    return { status: to };
  });
}

const PATH = ["confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery", "delivered"];
/** Move an order forward along the fulfilment path, one valid transition at a time (never backwards). */
async function advanceOrder(conn, orderId, target, { note, actorId }) {
  const ti = PATH.indexOf(target);
  for (let guard = 0; guard < PATH.length; guard++) {
    const cur = (await one("SELECT status FROM orders WHERE id = :id", { id: orderId }, conn)).status;
    const ci = PATH.indexOf(cur);
    if (ci < 0 || ci >= ti) return;
    const allowed = (orders.TRANSITIONS[cur] || []).filter((st) => PATH.indexOf(st) > ci && PATH.indexOf(st) <= ti);
    if (!allowed.length) return;
    const next = allowed.sort((a, b) => PATH.indexOf(b) - PATH.indexOf(a))[0];
    await orders.setStatus(conn, orderId, next, { note, actorId });
  }
}

async function listForOrder(orderId, { internal = false } = {}) {
  const ships = await query("SELECT s.*, c.name AS carrier_name FROM shipments s JOIN carriers c ON c.code = s.carrier WHERE s.order_id = :o ORDER BY s.id", { o: orderId });
  const out = [];
  for (const s of ships) {
    const items = await query("SELECT oi.sku, oi.name, si.qty, si.order_item_id FROM shipment_items si JOIN order_items oi ON oi.id = si.order_item_id WHERE si.shipment_id = :s", { s: s.id });
    const evs = await query("SELECT status, location, description, occurred_at FROM shipment_events WHERE shipment_id = :s ORDER BY occurred_at, id", { s: s.id });
    out.push({
      number: s.shipment_number, carrier: s.carrier, carrierName: s.carrier_name, service: s.service, trackingNumber: s.tracking_number, trackingUrl: s.tracking_url, status: s.status, packages: s.packages,
      weightKg: s.weight_kg, estimatedDelivery: s.estimated_delivery, shippedAt: s.shipped_at, deliveredAt: s.delivered_at, items: items.map((i) => ({ orderItemId: String(i.order_item_id), sku: i.sku, name: i.name, qty: i.qty })),
      events: evs.map((e) => ({ status: e.status, location: e.location, description: e.description, at: e.occurred_at })), ...(internal ? { notes: s.notes, transitions: FLOW[s.status] } : {}),
    });
  }
  return out;
}

module.exports = { create, updateStatus, listForOrder, registerAdapter, remainingByItem, FLOW };
