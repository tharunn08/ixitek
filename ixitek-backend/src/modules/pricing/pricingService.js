// pricingService.js — the ONLY place selling prices are calculated.
//
//   supplier costs (confidential, product_costs)
//        └─ cost basis (EXW CN | US FOB | internal)
//             └─ rule: margin % + fixed markup, rounded to step
//                  └─ manual override (wins, audited)
//                       └─ product_selling_prices.selling_price_usd  ← storefront reads ONLY this
//
// No selling price configured → NULL → customer sees "Request a Quote".
// All arithmetic uses decimal.js; costs never leave this module except via
// admin endpoints guarded by the `pricing.read_cost` permission.
const { query, one, tx } = require("../../core/db.js");
const { D, toDb } = require("../../core/money.js");
const audit = require("../../core/audit.js");
const { badRequest, notFound } = require("../../core/errors.js");

const SCOPE_RANK = { product: 400, family: 300, category: 200, global: 100 };

/** Ancestor chain of a category, nearest first. */
async function categoryAncestors(categoryId, conn) {
  const chain = [];
  let id = categoryId;
  for (let i = 0; id && i < 10; i++) {
    const row = await one("SELECT id, parent_id FROM categories WHERE id = :id", { id }, conn);
    if (!row) break;
    chain.push(Number(row.id));
    id = row.parent_id;
  }
  return chain;
}

async function loadContext(productId, conn) {
  const p = await one(
    `SELECT p.id, p.category_id, p.family_id, c.supplier_fob_cost_usd, c.supplier_exw_cost_usd, c.internal_cost_usd, c.cost_basis
       FROM products p LEFT JOIN product_costs c ON c.product_id = p.id
      WHERE p.id = :id AND p.deleted_at IS NULL`,
    { id: productId },
    conn
  );
  if (!p) return null;
  p.categoryChain = await categoryAncestors(p.category_id, conn);
  return p;
}

function costFor(ctx, basis) {
  const b = basis === "product" || !basis ? ctx.cost_basis || "exw" : basis;
  const v = b === "fob" ? ctx.supplier_fob_cost_usd : b === "exw" ? ctx.supplier_exw_cost_usd : ctx.internal_cost_usd;
  return { basis: b, cost: v === null || v === undefined ? null : String(v) };
}

/** Pick the most specific active rule for the context. */
async function resolveRule(ctx, { customerGroup = null, country = null, currency = null, qty = 1, at = new Date() } = {}, conn = null) {
  const rules = await query(
    `SELECT * FROM pricing_rules
      WHERE is_active = 1
        AND (valid_from IS NULL OR valid_from <= :at) AND (valid_to IS NULL OR valid_to > :at)
        AND min_qty <= :qty
        AND (customer_group IS NULL OR customer_group = :grp)
        AND (country_code IS NULL OR country_code = :country)
        AND (currency IS NULL OR currency = :currency)
        AND ( scope = 'global'
           OR (scope = 'product' AND scope_id = :pid)
           OR (scope = 'family' AND scope_id = :fid)
           OR (scope = 'category' AND FIND_IN_SET(scope_id, :cats)) )`,
    { at, qty, grp: customerGroup, country, currency, pid: ctx.id, fid: ctx.family_id || 0, cats: ctx.categoryChain.join(",") || "0" },
    conn
  );
  if (!rules.length) return null;
  const score = (r) => {
    let s = SCOPE_RANK[r.scope];
    if (r.scope === "category") s += 50 - ctx.categoryChain.indexOf(Number(r.scope_id)); // nearer category wins
    return [s, r.customer_group ? 1 : 0, r.country_code ? 1 : 0, r.currency ? 1 : 0, r.min_qty, r.priority, Number(r.id)];
  };
  rules.sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return 0;
  });
  return rules[0];
}

/** Pure calculation: cost × (1 + margin%) + fixed markup, rounded half-up to the step. */
function applyRule(cost, rule) {
  const step = D(rule.rounding_step || "0.01");
  const raw = D(cost).times(D(1).plus(D(rule.margin_pct).div(100))).plus(D(rule.fixed_markup_usd || 0));
  const rounded = step.isZero() ? raw : raw.div(step).toDecimalPlaces(0, 4 /* ROUND_HALF_UP */).times(step);
  return rounded.isNegative() ? D(0) : rounded;
}

/**
 * Internal quote of a selling price. Returns cost details → callers must
 * strip them before anything customer-facing (see publicPrice()).
 */
/** Negotiated / contract price for a user or company (highest priority). */
async function customerPrice(productId, { userId = null, companyId = null, qty = 1, at = new Date() } = {}, conn = null) {
  if (!userId && !companyId) return null;
  return one(
    `SELECT id, price_usd FROM customer_prices
      WHERE product_id = :pid AND is_active = 1 AND min_qty <= :qty
        AND ((user_id IS NOT NULL AND user_id = :uid) OR (company_id IS NOT NULL AND company_id = :cid))
        AND (valid_from IS NULL OR valid_from <= :at) AND (valid_to IS NULL OR valid_to > :at)
      ORDER BY user_id IS NOT NULL DESC, min_qty DESC, id DESC LIMIT 1`,
    { pid: productId, qty, uid: userId || 0, cid: companyId || 0, at },
    conn
  );
}

async function calculate(productId, opts = {}, conn = null) {
  const ctx = await loadContext(productId, conn);
  if (!ctx) throw notFound("Product not found.");
  if (!opts.ignoreOverride) {
    const cp = await customerPrice(productId, opts, conn);
    if (cp) return { productId, sellingPriceUsd: toDb(cp.price_usd), source: "customer_price", ruleId: null, customerPriceId: Number(cp.id), costBasis: null, costUsd: null };
  }
  const override = await one("SELECT override_price_usd FROM product_selling_prices WHERE product_id = :id", { id: productId }, conn);
  if (override && override.override_price_usd !== null && !opts.ignoreOverride) {
    return { productId, sellingPriceUsd: toDb(override.override_price_usd), source: "override", ruleId: null, costBasis: null, costUsd: null };
  }
  const rule = await resolveRule(ctx, opts, conn);
  if (!rule) return { productId, sellingPriceUsd: null, source: "none", ruleId: null, costBasis: null, costUsd: null };
  const { basis, cost } = costFor(ctx, rule.cost_basis);
  if (cost === null) return { productId, sellingPriceUsd: null, source: "none", ruleId: Number(rule.id), costBasis: basis, costUsd: null, reason: "no cost for basis" };
  return { productId, sellingPriceUsd: toDb(applyRule(cost, rule)), source: "rule", ruleId: Number(rule.id), costBasis: basis, costUsd: toDb(cost), marginPct: String(rule.margin_pct), fixedMarkupUsd: String(rule.fixed_markup_usd) };
}

/** Customer-safe view of a price. Never contains cost, basis or margin. */
function publicPrice(row) {
  if (!row || row.selling_price_usd === null || row.selling_price_usd === undefined) return null;
  return { amount: D(row.selling_price_usd).toFixed(2), currency: "USD" };
}

/** Recompute the materialised public price for products; records history on change. */
async function recompute(productIds, { reason = "Recalculated from pricing rules", source = "system", actorId = null, importBatchId = null } = {}) {
  let changed = 0;
  for (const id of productIds) {
    await tx(async (conn) => {
      const current = await one("SELECT * FROM product_selling_prices WHERE product_id = :id FOR UPDATE", { id }, conn);
      const calc = await calculate(id, { ignoreOverride: true }, conn);
      const overrideValue = current && current.override_price_usd !== null ? toDb(current.override_price_usd) : null;
      const finalPrice = overrideValue !== null ? overrideValue : calc.sellingPriceUsd;
      const finalSource = overrideValue !== null ? "override" : calc.source;
      const before = current && current.selling_price_usd !== null ? toDb(current.selling_price_usd) : null;
      await query(
        `INSERT INTO product_selling_prices (product_id, selling_price_usd, source, rule_id, computed_at)
         VALUES (:id, :price, :src, :rule, CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE selling_price_usd = VALUES(selling_price_usd), source = VALUES(source), rule_id = VALUES(rule_id), computed_at = VALUES(computed_at)`,
        { id, price: finalPrice, src: finalSource, rule: calc.ruleId },
        conn
      );
      if (before !== finalPrice) {
        changed++;
        await query(
          `INSERT INTO price_history (product_id, rule_id, field, old_value, new_value, reason, source, changed_by, import_batch_id)
           VALUES (:id, :rule, 'selling_price_usd', :old, :new, :reason, :source, :by, :batch)`,
          { id, rule: calc.ruleId, old: before, new: finalPrice, reason, source, by: actorId, batch: importBatchId },
          conn
        );
      }
    });
  }
  return { processed: productIds.length, changed };
}

async function recomputeAll(opts) {
  const rows = await query("SELECT id FROM products WHERE deleted_at IS NULL ORDER BY id");
  return recompute(rows.map((r) => Number(r.id)), opts);
}

/** Products a rule scope can affect (used for preview + targeted recompute). */
async function productsInScope(scope, scopeId, limit = null) {
  const lim = limit ? `LIMIT ${Number(limit)}` : "";
  if (scope === "global") return query(`SELECT id FROM products WHERE deleted_at IS NULL ORDER BY id ${lim}`);
  if (scope === "product") return query("SELECT id FROM products WHERE id = :id AND deleted_at IS NULL", { id: scopeId });
  if (scope === "family") return query(`SELECT DISTINCT product_id AS id FROM product_family_links WHERE family_id = :id ORDER BY product_id ${lim}`, { id: scopeId });
  // category: the category and all descendants
  const cats = [Number(scopeId)];
  for (let i = 0; i < cats.length && i < 500; i++) {
    const kids = await query("SELECT id FROM categories WHERE parent_id = :id", { id: cats[i] });
    cats.push(...kids.map((k) => Number(k.id)));
  }
  return query(`SELECT id FROM products WHERE deleted_at IS NULL AND FIND_IN_SET(category_id, :cats) ORDER BY id ${lim}`, { cats: cats.join(",") });
}

function validateRule(body) {
  const scope = String(body.scope || "");
  if (!SCOPE_RANK[scope]) throw badRequest("scope must be global, category, family or product.");
  const scopeId = scope === "global" ? 0 : Number(body.scopeId);
  if (scope !== "global" && !(scopeId > 0)) throw badRequest("Choose what this rule applies to.");
  const margin = D(body.marginPct ?? 0);
  if (margin.lte(-100) || margin.gte(1000)) throw badRequest("Margin must be between -99.999% and 999.999%.");
  const markup = D(body.fixedMarkupUsd ?? 0);
  if (markup.isNegative()) throw badRequest("Fixed markup cannot be negative.");
  const basis = String(body.costBasis || "product");
  if (!["product", "exw", "fob", "internal"].includes(basis)) throw badRequest("Invalid cost basis.");
  const minQty = Math.max(1, Number.parseInt(body.minQty || 1, 10));
  const step = D(body.roundingStep ?? "0.01");
  if (step.isNegative()) throw badRequest("Rounding step cannot be negative.");
  const up = (v, n) => (v ? String(v).trim().toUpperCase().slice(0, n) : null);
  return {
    name: String(body.name || "").slice(0, 150),
    scope,
    scopeId,
    customerGroup: body.customerGroup ? String(body.customerGroup).slice(0, 40) : null,
    countryCode: up(body.countryCode, 2),
    currency: up(body.currency, 3),
    minQty,
    costBasis: basis,
    marginPct: margin.toFixed(3),
    fixedMarkupUsd: toDb(markup),
    roundingStep: toDb(step),
    priority: Number.parseInt(body.priority || 0, 10) || 0,
    isActive: body.isActive === undefined ? 1 : body.isActive ? 1 : 0,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validTo: body.validTo ? new Date(body.validTo) : null,
    note: body.note ? String(body.note).slice(0, 255) : null,
  };
}

/** Preview what a rule would do, without saving (admin with pricing.read_cost). */
async function previewRule(body, { sample = 25 } = {}) {
  const rule = validateRule(body);
  const ids = await productsInScope(rule.scope, rule.scopeId, sample);
  const fakeRule = { margin_pct: rule.marginPct, fixed_markup_usd: rule.fixedMarkupUsd, rounding_step: rule.roundingStep };
  const out = [];
  for (const { id } of ids) {
    const ctx = await loadContext(id);
    const current = await one(
      "SELECT p.sku, p.name, s.selling_price_usd, s.source FROM products p LEFT JOIN product_selling_prices s ON s.product_id = p.id WHERE p.id = :id",
      { id }
    );
    const { basis, cost } = costFor(ctx, rule.costBasis);
    out.push({
      productId: String(id),
      sku: current.sku,
      name: current.name,
      costBasis: basis,
      costUsd: cost === null ? null : toDb(cost),
      currentPriceUsd: current.selling_price_usd === null ? null : toDb(current.selling_price_usd),
      currentSource: current.source || "none",
      newPriceUsd: cost === null ? null : toDb(applyRule(cost, fakeRule)),
      overridden: current.source === "override",
    });
  }
  return { rule, sample: out };
}

async function saveRule(req, body, id = null) {
  const r = validateRule(body);
  const params = { ...r, by: req.user.id, id };
  let ruleId = id;
  await tx(async (conn) => {
    let before = null;
    if (id) {
      before = await one("SELECT * FROM pricing_rules WHERE id = :id FOR UPDATE", { id }, conn);
      if (!before) throw notFound("Rule not found.");
      await query(
        `UPDATE pricing_rules SET name=:name, scope=:scope, scope_id=:scopeId, customer_group=:customerGroup, country_code=:countryCode,
           currency=:currency, min_qty=:minQty, cost_basis=:costBasis, margin_pct=:marginPct, fixed_markup_usd=:fixedMarkupUsd,
           rounding_step=:roundingStep, priority=:priority, is_active=:isActive, valid_from=:validFrom, valid_to=:validTo, note=:note, updated_by=:by
         WHERE id=:id`,
        params,
        conn
      );
    } else {
      const res = await query(
        `INSERT INTO pricing_rules (name, scope, scope_id, customer_group, country_code, currency, min_qty, cost_basis, margin_pct,
           fixed_markup_usd, rounding_step, priority, is_active, valid_from, valid_to, note, created_by, updated_by)
         VALUES (:name, :scope, :scopeId, :customerGroup, :countryCode, :currency, :minQty, :costBasis, :marginPct,
           :fixedMarkupUsd, :roundingStep, :priority, :isActive, :validFrom, :validTo, :note, :by, :by)`,
        params,
        conn
      );
      ruleId = res.insertId;
    }
    for (const f of ["margin_pct", "fixed_markup_usd", "cost_basis", "is_active"]) {
      const key = { margin_pct: "marginPct", fixed_markup_usd: "fixedMarkupUsd", cost_basis: "costBasis", is_active: "isActive" }[f];
      const oldV = before ? String(before[f]) : null;
      const newV = String(r[key]);
      if (oldV !== newV) {
        await query(
          "INSERT INTO price_history (rule_id, field, old_value, new_value, reason, source, changed_by) VALUES (:rid, :f, :o, :n, :reason, 'admin', :by)",
          { rid: ruleId, f: `rule.${f}`, o: oldV, n: newV, reason: body.reason || null, by: req.user.id },
          conn
        );
      }
    }
    await audit.record({ req, action: id ? "pricing.rule.update" : "pricing.rule.create", entityType: "pricing_rule", entityId: ruleId, before, after: r, reason: body.reason }, conn);
  });
  return ruleId;
}

async function setOverride(req, productId, { priceUsd, reason }) {
  if (!reason || String(reason).trim().length < 3) throw badRequest("A reason is required for a manual price override.");
  const clearing = priceUsd === null || priceUsd === undefined || priceUsd === "";
  if (!clearing) {
    const d = D(priceUsd);
    if (!d.isFinite() || d.isNegative()) throw badRequest("Enter a valid non-negative price.");
  }
  await tx(async (conn) => {
    const p = await one("SELECT id FROM products WHERE id = :id AND deleted_at IS NULL", { id: productId }, conn);
    if (!p) throw notFound("Product not found.");
    const cur = await one("SELECT * FROM product_selling_prices WHERE product_id = :id FOR UPDATE", { id: productId }, conn);
    const oldV = cur && cur.override_price_usd !== null ? toDb(cur.override_price_usd) : null;
    const newV = clearing ? null : toDb(priceUsd);
    await query(
      `INSERT INTO product_selling_prices (product_id, override_price_usd, override_reason, override_by, override_at, source)
       VALUES (:id, :v, :reason, :by, CURRENT_TIMESTAMP(3), 'none')
       ON DUPLICATE KEY UPDATE override_price_usd = VALUES(override_price_usd), override_reason = VALUES(override_reason),
         override_by = VALUES(override_by), override_at = VALUES(override_at)`,
      { id: productId, v: newV, reason: String(reason).slice(0, 500), by: req.user.id },
      conn
    );
    await query(
      "INSERT INTO price_history (product_id, field, old_value, new_value, reason, source, changed_by) VALUES (:id, 'override_price_usd', :o, :n, :reason, 'admin', :by)",
      { id: productId, o: oldV, n: newV, reason: String(reason).slice(0, 500), by: req.user.id },
      conn
    );
    await audit.record({ req, action: clearing ? "pricing.override.clear" : "pricing.override.set", entityType: "product", entityId: productId, before: { overridePriceUsd: oldV }, after: { overridePriceUsd: newV }, reason }, conn);
  });
  await recompute([Number(productId)], { reason: clearing ? "Override removed" : "Manual override", source: "admin", actorId: req.user.id });
}

module.exports = { customerPrice, calculate, applyRule, publicPrice, recompute, recomputeAll, productsInScope, previewRule, saveRule, setOverride, validateRule, resolveRule, loadContext };
