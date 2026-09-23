// inventoryService.js — stock changes. Every change:
//   1. runs in a MySQL transaction,
//   2. locks the (product, warehouse) row with SELECT … FOR UPDATE, so two
//      simultaneous orders/adjustments can never oversell or double-deduct,
//   3. refuses to go negative (CHECK constraints are a second safety net),
//   4. appends a stock_movements ledger row with the balance after the change,
//   5. is idempotent when an idempotency key is supplied,
//   6. writes an audit entry.
const { query, queryText, one, tx } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const { badRequest, conflict, notFound } = require("../../core/errors.js");

const OPERATIONS = {
  receive: { label: "Receive stock", bucket: "on_hand", sign: +1, type: "receipt" },
  increase: { label: "Increase (adjustment)", bucket: "on_hand", sign: +1, type: "adjustment_in" },
  decrease: { label: "Decrease (adjustment)", bucket: "on_hand", sign: -1, type: "adjustment_out" },
  count: { label: "Set counted quantity", bucket: "on_hand", sign: 0, type: "count" },
  damage: { label: "Move to damaged", bucket: "on_hand", sign: -1, type: "damage" },
  writeoff_damaged: { label: "Write off damaged", bucket: "damaged", sign: -1, type: "damage_writeoff" },
  incoming: { label: "Expected incoming", bucket: "incoming", sign: +1, type: "incoming" },
  incoming_cancel: { label: "Cancel incoming", bucket: "incoming", sign: -1, type: "incoming_cancel" },
  reserve: { label: "Reserve", bucket: "reserved", sign: +1, type: "reserve" },
  release: { label: "Release reservation", bucket: "reserved", sign: -1, type: "release" },
};

async function lockLevel(conn, productId, warehouseId) {
  const wh = await one("SELECT id, is_active FROM warehouses WHERE id = :id", { id: warehouseId }, conn);
  if (!wh) throw notFound("Warehouse not found.");
  const p = await one("SELECT id FROM products WHERE id = :id AND deleted_at IS NULL", { id: productId }, conn);
  if (!p) throw notFound("Product not found.");
  // Take the exclusive row lock FIRST. (INSERT IGNORE on an existing row takes a
  // shared lock; upgrading S→X under concurrency is what causes deadlocks.)
  const sel = "SELECT * FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w FOR UPDATE";
  const existing = await one(sel, { p: productId, w: warehouseId }, conn);
  if (existing) return existing;
  await query("INSERT IGNORE INTO inventory_levels (product_id, warehouse_id) VALUES (:p, :w)", { p: productId, w: warehouseId }, conn);
  return one(sel, { p: productId, w: warehouseId }, conn);
}

async function writeMovement(conn, m) {
  await query(
    `INSERT INTO stock_movements (product_id, warehouse_id, movement_type, bucket, quantity, balance_after, reason, reference_type, reference_id, idempotency_key, created_by)
     VALUES (:productId, :warehouseId, :type, :bucket, :qty, :balance, :reason, :refType, :refId, :idem, :by)`,
    { refType: null, refId: null, idem: null, by: null, ...m },
    conn
  );
}

function levelJson(l) {
  return { onHand: l.on_hand, reserved: l.reserved, available: l.on_hand - l.reserved, incoming: l.incoming, damaged: l.damaged, reorderPoint: l.reorder_point, reorderQty: l.reorder_qty, binLocation: l.bin_location };
}

/**
 * Apply one stock operation.
 * @param {object} p { productId, warehouseId, operation, quantity, reason, referenceType, referenceId, idempotencyKey, userId, req }
 */
async function adjust(p, outerConn = null) {
  const op = OPERATIONS[p.operation];
  if (!op) throw badRequest(`Unknown stock operation "${p.operation}".`);
  const qty = Number(p.quantity);
  if (!Number.isInteger(qty) || qty < 0 || (op.sign !== 0 && qty === 0)) throw badRequest("Quantity must be a positive whole number.");
  if (qty > 10_000_000) throw badRequest("Quantity is too large.");
  const reason = String(p.reason || "").trim();
  if (reason.length < 3 && !p.referenceType) throw badRequest("Please give a reason for this stock change.");

  const run = async (conn) => {
    if (p.idempotencyKey) {
      const dup = await one("SELECT id FROM stock_movements WHERE idempotency_key = :k", { k: p.idempotencyKey }, conn);
      if (dup) return { duplicate: true, level: levelJson(await one("SELECT * FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w", { p: p.productId, w: p.warehouseId }, conn)) };
    }
    const level = await lockLevel(conn, p.productId, p.warehouseId);
    const before = levelJson(level);
    const next = { on_hand: level.on_hand, reserved: level.reserved, incoming: level.incoming, damaged: level.damaged };
    const common = { productId: p.productId, warehouseId: p.warehouseId, reason, refType: p.referenceType || null, refId: p.referenceId || null, by: p.userId || null };

    if (op.type === "count") {
      const delta = qty - level.on_hand;
      if (delta === 0) return { unchanged: true, level: before };
      if (qty < level.reserved) throw conflict(`Counted quantity (${qty}) is below reserved stock (${level.reserved}). Release reservations first.`);
      next.on_hand = qty;
      await writeMovement(conn, { ...common, type: "count", bucket: "on_hand", qty: delta, balance: qty, idem: p.idempotencyKey || null });
    } else if (op.type === "damage") {
      if (level.on_hand - level.reserved < qty) throw conflict(`Only ${level.on_hand - level.reserved} unreserved units available to mark as damaged.`);
      next.on_hand -= qty;
      next.damaged += qty;
      await writeMovement(conn, { ...common, type: "damage", bucket: "on_hand", qty: -qty, balance: next.on_hand, idem: p.idempotencyKey || null });
      await writeMovement(conn, { ...common, type: "damage", bucket: "damaged", qty, balance: next.damaged });
    } else {
      const delta = op.sign * qty;
      next[op.bucket] += delta;
      if (next[op.bucket] < 0) throw conflict(`Not enough ${op.bucket.replace("_", " ")} stock: have ${level[op.bucket]}, tried to remove ${qty}.`);
      if (op.bucket === "on_hand" && next.on_hand < next.reserved) {
        throw conflict(`This would leave on-hand (${next.on_hand}) below reserved (${next.reserved}). Only ${level.on_hand - level.reserved} units are free.`);
      }
      if (op.bucket === "reserved" && op.sign > 0 && next.reserved > next.on_hand && !p.allowBackorder) {
        throw conflict(`Only ${level.on_hand - level.reserved} units available to reserve.`);
      }
      await writeMovement(conn, { ...common, type: op.type, bucket: op.bucket, qty: delta, balance: next[op.bucket], idem: p.idempotencyKey || null });
    }

    await query(
      `UPDATE inventory_levels SET on_hand = :on_hand, reserved = :reserved, incoming = :incoming, damaged = :damaged, version = version + 1
        WHERE product_id = :p AND warehouse_id = :w`,
      { ...next, p: p.productId, w: p.warehouseId },
      conn
    );
    const after = { ...before, onHand: next.on_hand, reserved: next.reserved, available: next.on_hand - next.reserved, incoming: next.incoming, damaged: next.damaged };
    await audit.record({ req: p.req, actorId: p.userId, action: `inventory.${p.operation}`, entityType: "inventory", entityId: `${p.productId}:${p.warehouseId}`, before, after, reason }, conn);
    return { level: after };
  };
  return outerConn ? run(outerConn) : tx(run, { retries: 3 });
}

async function transfer({ productId, fromWarehouseId, toWarehouseId, quantity, reason, userId, req }) {
  if (String(fromWarehouseId) === String(toWarehouseId)) throw badRequest("Choose two different warehouses.");
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw badRequest("Quantity must be a positive whole number.");
  if (String(reason || "").trim().length < 3) throw badRequest("Please give a reason for this transfer.");
  return tx(async (conn) => {
    // Lock both rows in a fixed order to avoid deadlocks.
    const [a, b] = [Number(fromWarehouseId), Number(toWarehouseId)].sort((x, y) => x - y);
    await lockLevel(conn, productId, a);
    await lockLevel(conn, productId, b);
    const from = await one("SELECT * FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w", { p: productId, w: fromWarehouseId }, conn);
    const to = await one("SELECT * FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w", { p: productId, w: toWarehouseId }, conn);
    if (from.on_hand - from.reserved < qty) throw conflict(`Only ${from.on_hand - from.reserved} free units in the source warehouse.`);
    const ref = `TR-${Date.now()}`;
    await query("UPDATE inventory_levels SET on_hand = on_hand - :q, version = version + 1 WHERE product_id = :p AND warehouse_id = :w", { q: qty, p: productId, w: fromWarehouseId }, conn);
    await query("UPDATE inventory_levels SET on_hand = on_hand + :q, version = version + 1 WHERE product_id = :p AND warehouse_id = :w", { q: qty, p: productId, w: toWarehouseId }, conn);
    const base = { productId, reason: String(reason).trim(), refType: "transfer", refId: ref, by: userId };
    await writeMovement(conn, { ...base, warehouseId: fromWarehouseId, type: "transfer_out", bucket: "on_hand", qty: -qty, balance: from.on_hand - qty });
    await writeMovement(conn, { ...base, warehouseId: toWarehouseId, type: "transfer_in", bucket: "on_hand", qty, balance: to.on_hand + qty });
    await audit.record({ req, actorId: userId, action: "inventory.transfer", entityType: "inventory", entityId: String(productId), after: { fromWarehouseId, toWarehouseId, qty, ref }, reason }, conn);
    return { reference: ref };
  });
}

async function setReorder({ productId, warehouseId, reorderPoint, reorderQty, binLocation, req }) {
  const norm = (v) => (v === null || v === undefined || v === "" ? null : Math.max(0, Number.parseInt(v, 10) || 0));
  await tx(async (conn) => {
    const before = levelJson(await lockLevel(conn, productId, warehouseId));
    await query(
      "UPDATE inventory_levels SET reorder_point = :rp, reorder_qty = :rq, bin_location = :bin WHERE product_id = :p AND warehouse_id = :w",
      { rp: norm(reorderPoint), rq: norm(reorderQty), bin: String(binLocation || "").slice(0, 60), p: productId, w: warehouseId },
      conn
    );
    await audit.record({ req, action: "inventory.settings", entityType: "inventory", entityId: `${productId}:${warehouseId}`, before, after: { reorderPoint: norm(reorderPoint), reorderQty: norm(reorderQty), binLocation } }, conn);
  });
}

/** Customer-safe availability summary for a set of products (no warehouse detail). */
async function availabilityFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await queryText(
    `SELECT l.product_id, SUM(l.on_hand - l.reserved) AS available, SUM(l.incoming) AS incoming
       FROM inventory_levels l JOIN warehouses w ON w.id = l.warehouse_id AND w.is_active = 1
      WHERE l.product_id IN (?) GROUP BY l.product_id`,
    [productIds.map(Number)]
  );
  return new Map(rows.map((r) => [Number(r.product_id), { available: Math.max(0, Number(r.available)), incoming: Number(r.incoming) }]));
}

module.exports = { OPERATIONS, adjust, transfer, setReorder, availabilityFor, levelJson };
