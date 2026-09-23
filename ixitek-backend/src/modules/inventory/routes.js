// /api/admin/inventory — warehouses, stock levels, increase/decrease,
// transfers, reorder settings, movement ledger, bulk CSV adjustments.
const express = require("express");
const multer = require("multer");
const { parse: parseCsv } = require("csv-parse/sync");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const { query, one } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const svc = require("./inventoryService.js");
const { ah, badRequest, conflict, notFound } = require("../../core/errors.js");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
router.use(requireAuth, requirePermission("admin.access", "inventory.read"));

const whJson = (w) => ({ id: String(w.id), code: w.code, name: w.name, countryCode: w.country_code, city: w.city, address: w.address, isActive: Boolean(w.is_active), isDefault: Boolean(w.is_default), sortOrder: w.sort_order });

router.get("/operations", (req, res) => res.json({ operations: Object.entries(svc.OPERATIONS).filter(([k]) => !["reserve", "release"].includes(k)).map(([code, o]) => ({ code, label: o.label })) }));

// ── Warehouses ──────────────────────────────────────────────────────────
router.get(
  "/warehouses",
  ah(async (req, res) => {
    const rows = await query(
      `SELECT w.*, COALESCE(SUM(l.on_hand),0) AS on_hand, COALESCE(SUM(l.reserved),0) AS reserved, COUNT(l.product_id) AS skus
         FROM warehouses w LEFT JOIN inventory_levels l ON l.warehouse_id = w.id GROUP BY w.id ORDER BY w.sort_order, w.id`
    );
    res.json({ warehouses: rows.map((w) => ({ ...whJson(w), totals: { onHand: Number(w.on_hand), reserved: Number(w.reserved), skus: Number(w.skus) } })) });
  })
);

function whInput(b) {
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw badRequest("Code must be 2–30 letters, digits, - or _.");
  if (!name) throw badRequest("Enter a warehouse name.");
  const cc = b.countryCode ? String(b.countryCode).trim().toUpperCase() : null;
  if (cc && !/^[A-Z]{2}$/.test(cc)) throw badRequest("Country must be a 2-letter ISO code.");
  return { code, name: name.slice(0, 150), cc, city: String(b.city || "").slice(0, 100), address: String(b.address || "").slice(0, 500), active: b.isActive === false ? 0 : 1, def: b.isDefault ? 1 : 0, sort: Number(b.sortOrder) || 0 };
}

router.post(
  "/warehouses",
  requirePermission("inventory.warehouses"),
  ah(async (req, res) => {
    const w = whInput(req.body);
    try {
      const r = await query("INSERT INTO warehouses (code, name, country_code, city, address, is_active, is_default, sort_order) VALUES (:code, :name, :cc, :city, :address, :active, :def, :sort)", w);
      if (w.def) await query("UPDATE warehouses SET is_default = 0 WHERE id <> :id", { id: r.insertId });
      await audit.record({ req, action: "warehouse.create", entityType: "warehouse", entityId: r.insertId, after: w });
      res.status(201).json({ warehouse: whJson(await one("SELECT * FROM warehouses WHERE id = :id", { id: r.insertId })) });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw conflict("A warehouse with this code already exists.");
      throw err;
    }
  })
);

router.put(
  "/warehouses/:id",
  requirePermission("inventory.warehouses"),
  ah(async (req, res) => {
    const before = await one("SELECT * FROM warehouses WHERE id = :id", { id: req.params.id });
    if (!before) throw notFound();
    const w = whInput(req.body);
    await query("UPDATE warehouses SET code=:code, name=:name, country_code=:cc, city=:city, address=:address, is_active=:active, is_default=:def, sort_order=:sort WHERE id=:id", { ...w, id: req.params.id });
    if (w.def) await query("UPDATE warehouses SET is_default = 0 WHERE id <> :id", { id: req.params.id });
    await audit.record({ req, action: "warehouse.update", entityType: "warehouse", entityId: req.params.id, before: whJson(before), after: w });
    res.json({ warehouse: whJson(await one("SELECT * FROM warehouses WHERE id = :id", { id: req.params.id })) });
  })
);

// ── Stock levels (server-side paging/filter/sort) ───────────────────────
router.get(
  "/levels",
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = ["p.deleted_at IS NULL"];
    const params = {};
    if (req.query.q) {
      where.push("(p.sku LIKE :q OR p.name LIKE :q)");
      params.q = `%${String(req.query.q).slice(0, 100)}%`;
    }
    if (req.query.categoryId) (where.push("p.category_id = :cat"), (params.cat = Number(req.query.categoryId)));
    const whFilter = req.query.warehouseId ? "AND l.warehouse_id = :wh" : "";
    if (req.query.warehouseId) params.wh = Number(req.query.warehouseId);
    const having = [];
    if (req.query.status === "out") having.push("available <= 0");
    if (req.query.status === "low") having.push("reorder_point IS NOT NULL AND available <= reorder_point");
    if (req.query.status === "in") having.push("available > 0");
    const sorts = { sku: "p.sku", available: "available", on_hand: "on_hand", name: "p.name" };
    const sort = sorts[req.query.sort] || "p.sku";
    const dir = req.query.dir === "desc" ? "DESC" : "ASC";
    const base = `
      FROM products p
      LEFT JOIN inventory_levels l ON l.product_id = p.id ${whFilter}
      WHERE ${where.join(" AND ")}
      GROUP BY p.id, p.sku, p.name, p.track_inventory
      ${having.length ? "HAVING " + having.join(" AND ") : ""}`;
    const select = `SELECT p.id, p.sku, p.name, p.track_inventory,
        COALESCE(SUM(l.on_hand),0) AS on_hand, COALESCE(SUM(l.reserved),0) AS reserved,
        COALESCE(SUM(l.on_hand - l.reserved),0) AS available, COALESCE(SUM(l.incoming),0) AS incoming,
        COALESCE(SUM(l.damaged),0) AS damaged, MIN(l.reorder_point) AS reorder_point`;
    const rows = await query(`${select} ${base} ORDER BY ${sort} ${dir}, p.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
    const total = await one(`SELECT COUNT(*) AS c FROM (${select} ${base}) t`, params);
    res.json({
      page, limit, total: Number(total.c),
      items: rows.map((r) => ({ productId: String(r.id), sku: r.sku, name: r.name, trackInventory: Boolean(r.track_inventory), onHand: Number(r.on_hand), reserved: Number(r.reserved), available: Number(r.available), incoming: Number(r.incoming), damaged: Number(r.damaged), reorderPoint: r.reorder_point === null ? null : Number(r.reorder_point) })),
    });
  })
);

router.get(
  "/products/:id",
  ah(async (req, res) => {
    const product = await one("SELECT id, sku, name, track_inventory, allow_backorder FROM products WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
    if (!product) throw notFound();
    const levels = await query(
      `SELECT w.id AS warehouse_id, w.code, w.name, w.is_active, l.* FROM warehouses w
         LEFT JOIN inventory_levels l ON l.warehouse_id = w.id AND l.product_id = :id ORDER BY w.sort_order, w.id`,
      { id: req.params.id }
    );
    const movements = await query(
      `SELECT m.*, w.code AS warehouse_code, u.email AS user_email FROM stock_movements m
         JOIN warehouses w ON w.id = m.warehouse_id LEFT JOIN users u ON u.id = m.created_by
        WHERE m.product_id = :id ORDER BY m.id DESC LIMIT 100`,
      { id: req.params.id }
    );
    res.json({
      product: { id: String(product.id), sku: product.sku, name: product.name, trackInventory: Boolean(product.track_inventory), allowBackorder: Boolean(product.allow_backorder) },
      levels: levels.map((l) => ({
        warehouseId: String(l.warehouse_id), warehouseCode: l.code, warehouseName: l.name, warehouseActive: Boolean(l.is_active),
        ...(l.product_id ? svc.levelJson(l) : { onHand: 0, reserved: 0, available: 0, incoming: 0, damaged: 0, reorderPoint: null, reorderQty: null, binLocation: "" }),
      })),
      movements: movements.map(movementJson),
    });
  })
);

function movementJson(m) {
  return { id: String(m.id), productId: String(m.product_id), sku: m.sku, warehouseCode: m.warehouse_code, type: m.movement_type, bucket: m.bucket, quantity: m.quantity, balanceAfter: m.balance_after, reason: m.reason, referenceType: m.reference_type, referenceId: m.reference_id, user: m.user_email, createdAt: m.created_at };
}

router.get(
  "/movements",
  ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = [];
    const p = {};
    if (req.query.warehouseId) (where.push("m.warehouse_id = :wh"), (p.wh = Number(req.query.warehouseId)));
    if (req.query.type) (where.push("m.movement_type = :t"), (p.t = String(req.query.type)));
    if (req.query.q) (where.push("pr.sku LIKE :q"), (p.q = `%${String(req.query.q).slice(0, 100)}%`));
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query(
      `SELECT m.*, pr.sku, w.code AS warehouse_code, u.email AS user_email FROM stock_movements m
         JOIN products pr ON pr.id = m.product_id JOIN warehouses w ON w.id = m.warehouse_id LEFT JOIN users u ON u.id = m.created_by
        ${w} ORDER BY m.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      p
    );
    const total = await one(`SELECT COUNT(*) AS c FROM stock_movements m JOIN products pr ON pr.id = m.product_id ${w}`, p);
    res.json({ page, limit, total: Number(total.c), movements: rows.map(movementJson) });
  })
);

// ── Changes ─────────────────────────────────────────────────────────────
router.post(
  "/adjust",
  requirePermission("inventory.adjust"),
  ah(async (req, res) => {
    const b = req.body;
    const result = await svc.adjust({
      productId: Number(b.productId), warehouseId: Number(b.warehouseId), operation: String(b.operation || ""), quantity: b.quantity,
      reason: b.reason, idempotencyKey: b.idempotencyKey ? String(b.idempotencyKey).slice(0, 190) : null, userId: req.user.id, req,
    });
    res.json(result);
  })
);

router.post(
  "/transfer",
  requirePermission("inventory.adjust"),
  ah(async (req, res) => {
    const b = req.body;
    res.json(await svc.transfer({ productId: Number(b.productId), fromWarehouseId: Number(b.fromWarehouseId), toWarehouseId: Number(b.toWarehouseId), quantity: b.quantity, reason: b.reason, userId: req.user.id, req }));
  })
);

router.put(
  "/products/:id/warehouses/:wh/settings",
  requirePermission("inventory.adjust"),
  ah(async (req, res) => {
    await svc.setReorder({ productId: Number(req.params.id), warehouseId: Number(req.params.wh), reorderPoint: req.body.reorderPoint, reorderQty: req.body.reorderQty, binLocation: req.body.binLocation, req });
    res.json({ ok: true });
  })
);

// ── Bulk CSV: columns SKU, Warehouse, Operation, Quantity, Reason ───────
async function validateBulk(buffer) {
  let records;
  try {
    records = parseCsv(buffer, { bom: true, columns: (h) => h.map((x) => String(x).trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch (err) {
    throw badRequest(`CSV could not be read: ${err.message}`);
  }
  if (records.length > 5000) throw badRequest("Maximum 5,000 rows per file.");
  const warehouses = new Map((await query("SELECT id, code FROM warehouses")).map((w) => [w.code.toUpperCase(), Number(w.id)]));
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const errors = [];
    const sku = r.sku || r["part#"] || "";
    const product = sku ? await one("SELECT id, name FROM products WHERE sku = :sku AND deleted_at IS NULL", { sku }) : null;
    if (!product) errors.push(`Unknown SKU "${sku}"`);
    const whId = warehouses.get(String(r.warehouse || "").toUpperCase());
    if (!whId) errors.push(`Unknown warehouse "${r.warehouse || ""}"`);
    const operation = String(r.operation || "").toLowerCase();
    if (!svc.OPERATIONS[operation] || ["reserve", "release"].includes(operation)) errors.push(`Unknown operation "${r.operation || ""}"`);
    const qty = Number(r.quantity);
    if (!Number.isInteger(qty) || qty < 0) errors.push("Quantity must be a whole number ≥ 0");
    if (String(r.reason || "").trim().length < 3) errors.push("Reason required");
    out.push({ line: i + 2, sku, productId: product ? String(product.id) : null, name: product ? product.name : null, warehouse: r.warehouse, warehouseId: whId ? String(whId) : null, operation, quantity: qty, reason: r.reason || "", errors });
  }
  return out;
}

router.post(
  "/bulk/preview",
  requirePermission("inventory.adjust"),
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw badRequest("Attach a CSV file.");
    const rows = await validateBulk(req.file.buffer);
    res.json({ rows, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length });
  })
);

router.post(
  "/bulk/apply",
  requirePermission("inventory.adjust"),
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw badRequest("Attach a CSV file.");
    if (req.body.confirm !== "yes") throw badRequest("Bulk stock changes must be confirmed.");
    const rows = await validateBulk(req.file.buffer);
    if (rows.some((r) => r.errors.length)) throw badRequest("Fix the invalid rows first (run preview).");
    const batchKey = require("crypto").createHash("sha256").update(req.file.buffer).digest("hex").slice(0, 32);
    const results = [];
    for (const r of rows) {
      try {
        const out = await svc.adjust({ productId: Number(r.productId), warehouseId: Number(r.warehouseId), operation: r.operation, quantity: r.quantity, reason: `${r.reason} (bulk)`, idempotencyKey: `bulk:${batchKey}:${r.line}`, userId: req.user.id, req });
        results.push({ line: r.line, sku: r.sku, ok: true, duplicate: Boolean(out.duplicate), available: out.level ? out.level.available : null });
      } catch (err) {
        results.push({ line: r.line, sku: r.sku, ok: false, error: err.expose ? err.message : "Failed" });
      }
    }
    res.json({ applied: results.filter((r) => r.ok && !r.duplicate).length, skippedDuplicates: results.filter((r) => r.duplicate).length, failed: results.filter((r) => !r.ok).length, results });
  })
);

module.exports = router;
