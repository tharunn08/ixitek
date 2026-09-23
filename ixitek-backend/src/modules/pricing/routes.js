// /api/admin/pricing — rules, preview, overrides, cost edits, history.
// Everything here that exposes cost requires `pricing.read_cost`.
const express = require("express");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission } = require("../../core/rbac.js");
const { query, one, tx } = require("../../core/db.js");
const { D, toDb } = require("../../core/money.js");
const audit = require("../../core/audit.js");
const jobs = require("../../core/jobs.js");
const svc = require("./pricingService.js");
const { ah, badRequest, notFound } = require("../../core/errors.js");

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access"));

const ruleJson = (r) => ({
  id: String(r.id), name: r.name, scope: r.scope, scopeId: String(r.scope_id), scopeName: r.scope_name || null,
  customerGroup: r.customer_group, countryCode: r.country_code, currency: r.currency, minQty: r.min_qty,
  costBasis: r.cost_basis, marginPct: String(r.margin_pct), fixedMarkupUsd: String(r.fixed_markup_usd), roundingStep: String(r.rounding_step),
  priority: r.priority, isActive: Boolean(r.is_active), validFrom: r.valid_from, validTo: r.valid_to, note: r.note, updatedAt: r.updated_at,
});

router.get(
  "/rules",
  requirePermission("pricing.read_cost"),
  ah(async (req, res) => {
    const rows = await query(
      `SELECT r.*, COALESCE(c.name, f.name, p.sku) AS scope_name FROM pricing_rules r
         LEFT JOIN categories c ON r.scope = 'category' AND c.id = r.scope_id
         LEFT JOIN product_families f ON r.scope = 'family' AND f.id = r.scope_id
         LEFT JOIN products p ON r.scope = 'product' AND p.id = r.scope_id
        ORDER BY FIELD(r.scope,'global','category','family','product'), r.id`
    );
    res.json({ rules: rows.map(ruleJson) });
  })
);

router.post("/rules/preview", requirePermission("pricing.read_cost"), ah(async (req, res) => res.json(await svc.previewRule(req.body))));

async function afterRuleChange(scope, scopeId, actorId) {
  // Small scopes recompute inline; large ones go to a background job.
  const ids = await svc.productsInScope(scope, scopeId);
  if (ids.length <= 200) return svc.recompute(ids.map((r) => Number(r.id)), { source: "admin", actorId });
  await jobs.enqueue("pricing.recompute_all", { actorId });
  return { queued: true, products: ids.length };
}

router.post(
  "/rules",
  requirePermission("pricing.write", "pricing.read_cost"),
  ah(async (req, res) => {
    const id = await svc.saveRule(req, req.body);
    const rule = await one("SELECT * FROM pricing_rules WHERE id = :id", { id });
    const recompute = await afterRuleChange(rule.scope, rule.scope_id, req.user.id);
    res.status(201).json({ rule: ruleJson(rule), recompute });
  })
);

router.put(
  "/rules/:id",
  requirePermission("pricing.write", "pricing.read_cost"),
  ah(async (req, res) => {
    const before = await one("SELECT scope, scope_id FROM pricing_rules WHERE id = :id", { id: req.params.id });
    if (!before) throw notFound();
    await svc.saveRule(req, req.body, Number(req.params.id));
    const rule = await one("SELECT * FROM pricing_rules WHERE id = :id", { id: req.params.id });
    const recompute = await afterRuleChange(rule.scope, rule.scope_id, req.user.id);
    if (before.scope !== rule.scope || String(before.scope_id) !== String(rule.scope_id)) await afterRuleChange(before.scope, before.scope_id, req.user.id);
    res.json({ rule: ruleJson(rule), recompute });
  })
);

// Rules are deactivated, not deleted (history stays meaningful).
router.post(
  "/rules/:id/deactivate",
  requirePermission("pricing.write"),
  ah(async (req, res) => {
    const rule = await one("SELECT * FROM pricing_rules WHERE id = :id", { id: req.params.id });
    if (!rule) throw notFound();
    await svc.saveRule(req, { ...ruleJson(rule), scopeId: rule.scope_id, isActive: false, reason: req.body.reason }, Number(rule.id));
    const recompute = await afterRuleChange(rule.scope, rule.scope_id, req.user.id);
    res.json({ ok: true, recompute });
  })
);

router.post(
  "/recompute",
  requirePermission("pricing.write"),
  ah(async (req, res) => {
    const jobId = await jobs.enqueue("pricing.recompute_all", { actorId: req.user.id });
    await audit.record({ req, action: "pricing.recompute_all", entityType: "pricing", entityId: null });
    res.status(202).json({ jobId: String(jobId) });
  })
);

router.put(
  "/products/:id/override",
  requirePermission("pricing.write"),
  ah(async (req, res) => {
    await svc.setOverride(req, Number(req.params.id), { priceUsd: req.body.priceUsd, reason: req.body.reason });
    const row = await one("SELECT selling_price_usd, source, override_price_usd, override_reason FROM product_selling_prices WHERE product_id = :id", { id: req.params.id });
    res.json({ sellingPriceUsd: row.selling_price_usd, source: row.source, overridePriceUsd: row.override_price_usd, overrideReason: row.override_reason });
  })
);

// Edit confidential costs (history + audit on every change).
router.put(
  "/products/:id/costs",
  requirePermission("pricing.write", "pricing.read_cost"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 3) throw badRequest("A reason is required when changing supplier costs.");
    const fields = { supplier_fob_cost_usd: req.body.supplierFobCostUsd, supplier_exw_cost_usd: req.body.supplierExwCostUsd, internal_cost_usd: req.body.internalCostUsd };
    const basis = req.body.costBasis;
    if (basis !== undefined && !["exw", "fob", "internal"].includes(basis)) throw badRequest("Invalid cost basis.");
    await tx(async (conn) => {
      if (!(await one("SELECT id FROM products WHERE id = :id AND deleted_at IS NULL", { id }, conn))) throw notFound();
      await query("INSERT IGNORE INTO product_costs (product_id) VALUES (:id)", { id }, conn);
      const cur = await one("SELECT * FROM product_costs WHERE product_id = :id FOR UPDATE", { id }, conn);
      const changes = {};
      for (const [col, val] of Object.entries(fields)) {
        if (val === undefined) continue;
        const nv = val === null || val === "" ? null : toDb(val);
        if (nv !== null && (!D(nv).isFinite() || D(nv).isNegative())) throw badRequest(`Invalid value for ${col}.`);
        const ov = cur[col] === null ? null : toDb(cur[col]);
        if (ov !== nv) changes[col] = [ov, nv];
      }
      if (basis !== undefined && basis !== cur.cost_basis) changes.cost_basis = [cur.cost_basis, basis];
      if (!Object.keys(changes).length) return;
      const sets = Object.keys(changes).map((c) => `${c} = :${c}`).join(", ");
      const p = { id, by: req.user.id };
      for (const [c, [, nv]] of Object.entries(changes)) p[c] = nv;
      await query(`UPDATE product_costs SET ${sets}, updated_by = :by WHERE product_id = :id`, p, conn);
      for (const [c, [ov, nv]] of Object.entries(changes)) {
        await query("INSERT INTO price_history (product_id, field, old_value, new_value, reason, source, changed_by) VALUES (:id, :f, :o, :n, :r, 'admin', :by)", { id, f: c, o: ov, n: nv, r: reason, by: req.user.id }, conn);
      }
      await audit.record({ req, action: "pricing.cost.update", entityType: "product", entityId: id, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[0]])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[1]])), reason }, conn);
    });
    await svc.recompute([id], { reason: "Supplier cost changed", source: "admin", actorId: req.user.id });
    res.json({ ok: true });
  })
);

router.get(
  "/products/:id/history",
  requirePermission("pricing.read_cost"),
  ah(async (req, res) => {
    const rows = await query(
      `SELECT h.id, h.field, h.old_value, h.new_value, h.currency, h.reason, h.source, h.created_at, u.email AS changed_by_email
         FROM price_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.product_id = :id ORDER BY h.id DESC LIMIT 200`,
      { id: req.params.id }
    );
    res.json({ history: rows.map((r) => ({ id: String(r.id), field: r.field, oldValue: r.old_value, newValue: r.new_value, currency: r.currency, reason: r.reason, source: r.source, changedBy: r.changed_by_email, createdAt: r.created_at })) });
  })
);

router.get(
  "/summary",
  requirePermission("pricing.read_cost"),
  ah(async (req, res) => {
    const r = await one(
      `SELECT COUNT(*) AS products,
              SUM(s.selling_price_usd IS NOT NULL) AS priced,
              SUM(s.source = 'override') AS overridden,
              SUM(c.supplier_exw_cost_usd IS NULL AND c.supplier_fob_cost_usd IS NULL AND c.internal_cost_usd IS NULL OR c.product_id IS NULL) AS no_cost
         FROM products p LEFT JOIN product_selling_prices s ON s.product_id = p.id LEFT JOIN product_costs c ON c.product_id = p.id
        WHERE p.deleted_at IS NULL`
    );
    res.json({ products: Number(r.products), priced: Number(r.priced || 0), requestQuote: Number(r.products) - Number(r.priced || 0), overridden: Number(r.overridden || 0), withoutCost: Number(r.no_cost || 0) });
  })
);

jobs.register("pricing.recompute_all", async ({ actorId }) => svc.recomputeAll({ source: "system", actorId, reason: "Pricing rules changed" }));

module.exports = router;
