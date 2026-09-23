// /api/admin/intl — countries, currencies, exchange rates, charge rules
// (generic audited CRUD from ruleRegistry) and the admin price preview.
const express = require("express");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const { query, one } = require("../../core/db.js");
const { D } = require("../../core/money.js");
const audit = require("../../core/audit.js");
const fx = require("./fxService.js");
const landed = require("./landedCost.js");
const { ENTITIES } = require("./ruleRegistry.js");
const { ah, badRequest, notFound, conflict } = require("../../core/errors.js");

const router = express.Router();
const HAS_UPDATED_BY = new Set(["shipping_rate_rules", "customs_rules", "tax_rules", "insurance_rules", "handling_rules", "country_charge_rules", "withholding_rules", "payment_fee_rules"]);
router.use(requireAuth, requirePermission("admin.access", "intl.read"));

router.get("/schema", (req, res) => {
  res.json({ entities: Object.fromEntries(Object.entries(ENTITIES).map(([k, e]) => [k, { label: e.label, pk: e.pk, fields: e.fields }])) });
});

router.get(
  "/lookups",
  ah(async (req, res) => {
    const [countries, currencies, languages, zones, methods, incoterms] = await Promise.all([
      query("SELECT code, name FROM countries ORDER BY name"),
      query("SELECT code, name FROM currencies ORDER BY sort_order"),
      query("SELECT code, name FROM languages ORDER BY sort_order"),
      query("SELECT code, name FROM shipping_zones ORDER BY code"),
      query("SELECT code, name FROM shipping_methods ORDER BY sort_order"),
      query("SELECT code, name FROM incoterms ORDER BY sort_order"),
    ]);
    res.json({ country: countries, currency: currencies, language: languages, zone: zones, method: methods, incoterm: incoterms });
  })
);

function entity(name) {
  const e = ENTITIES[name];
  if (!e) throw notFound("Unknown table.");
  return e;
}

function coerce(e, body, { creating }) {
  const out = {};
  const errors = {};
  for (const [name, f] of Object.entries(e.fields)) {
    if (!(name in body)) {
      if (creating && f.required && f.type !== "bool") errors[name] = "Required";
      continue;
    }
    if (f.createOnly && !creating) continue;
    let v = body[name];
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (f.required && f.type !== "bool") errors[name] = "Required";
      out[name] = f.type === "bool" ? 0 : null;
      continue;
    }
    switch (f.type) {
      case "bool":
        v = v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
        break;
      case "int":
        v = Number(v);
        if (!Number.isInteger(v)) errors[name] = "Whole number required";
        else if (f.min !== undefined && v < f.min) errors[name] = `Minimum ${f.min}`;
        else if (f.max !== undefined && v > f.max) errors[name] = `Maximum ${f.max}`;
        break;
      case "decimal": {
        let d;
        try {
          d = D(v);
        } catch {
          d = null;
        }
        if (!d || !d.isFinite()) errors[name] = "Number required";
        else if (f.min !== undefined && d.lt(f.min)) errors[name] = `Minimum ${f.min}`;
        else v = d.toFixed(4);
        break;
      }
      case "enum":
        if (!f.options.includes(v)) errors[name] = `One of: ${f.options.join(", ")}`;
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[name] = "Date as YYYY-MM-DD";
        break;
      case "country":
      case "currency":
      case "language":
      case "zone":
      case "method":
      case "incoterm":
        v = String(v).trim();
        if (["country", "currency", "incoterm", "zone"].includes(f.type)) v = v.toUpperCase();
        break;
      default:
        v = String(v).trim();
        if (f.max && v.length > f.max) errors[name] = `Max ${f.max} characters`;
        if (f.pattern && !new RegExp(f.pattern).test(v)) errors[name] = "Invalid format";
    }
    out[name] = v;
  }
  if (Object.keys(errors).length) {
    const err = badRequest("Please correct the highlighted fields.", errors);
    err.status = 422;
    throw err;
  }
  return out;
}

// ── Exchange rates ──
router.get(
  "/fx/current",
  ah(async (req, res) => res.json({ currencies: [...(await fx.currentRates({ fresh: true })).values()] }))
);
router.get("/fx/history/:currency", ah(async (req, res) => res.json({ history: await fx.history(String(req.params.currency).toUpperCase()) })));
router.post(
  "/fx/rate",
  requirePermission("intl.manage"),
  ah(async (req, res) => {
    const currency = String(req.body.currency || "").toUpperCase();
    const kind = req.body.kind === "override" ? "override" : "manual";
    if (!(await one("SELECT code FROM currencies WHERE code = :c", { c: currency })) || currency === "USD") throw badRequest("Choose a currency other than USD.");
    let rate;
    try {
      rate = D(req.body.rate);
    } catch {
      throw badRequest("Enter a valid rate.");
    }
    if (!rate.isFinite() || rate.lte(0)) throw badRequest("Rate must be greater than zero.");
    const current = (await fx.currentRates({ fresh: true })).get(currency);
    // Guard against typos: a >25% jump needs explicit confirmation.
    if (current && current.rate && !req.body.confirmLargeChange) {
      const change = rate.minus(current.rate).abs().div(current.rate);
      if (change.gt(0.25)) throw conflict(`This rate differs from the current ${current.rate} by ${change.times(100).toFixed(1)}%. Confirm to proceed.`, { requiresConfirmation: true });
    }
    if (!String(req.body.reason || "").trim()) throw badRequest("Please give a reason (e.g. bank rate on date).");
    if (kind === "override") await fx.clearOverride(currency);
    await fx.recordRate({ currency, rate: rate.toString(), source: kind, provider: kind === "manual" ? "manual" : "admin override", note: req.body.reason, userId: req.user.id });
    await audit.record({ req, action: `fx.${kind}`, entityType: "exchange_rate", entityId: currency, before: current ? { rate: current.rate, source: current.source } : null, after: { rate: rate.toString() }, reason: req.body.reason });
    res.status(201).json({ ok: true });
  })
);
router.post(
  "/fx/override/:currency/clear",
  requirePermission("intl.manage"),
  ah(async (req, res) => {
    await fx.clearOverride(String(req.params.currency).toUpperCase());
    await audit.record({ req, action: "fx.override.clear", entityType: "exchange_rate", entityId: req.params.currency });
    res.json({ ok: true });
  })
);
router.post(
  "/fx/refresh",
  requirePermission("intl.manage"),
  ah(async (req, res) => {
    const r = await fx.refreshFromProvider();
    await audit.record({ req, action: "fx.refresh", entityType: "exchange_rate", entityId: null, after: r });
    res.json(r);
  })
);

// ── Admin price preview (includes confidential cost only with pricing.read_cost) ──
router.post(
  "/preview",
  ah(async (req, res) => {
    const b = req.body || {};
    let customer = {};
    if (b.customerEmail) {
      const u = await one(
        "SELECT u.id, u.customer_group, u.company_id, g.is_business FROM users u JOIN customer_groups g ON g.code = u.customer_group WHERE u.email = :e",
        { e: String(b.customerEmail).trim().toLowerCase() }
      );
      if (!u) throw badRequest("No customer with that email.");
      customer = { userId: u.id, companyId: u.company_id, customerGroup: u.customer_group, isBusiness: Boolean(u.is_business) };
    } else if (b.customerGroup) {
      const g = await one("SELECT code, is_business FROM customer_groups WHERE code = :c", { c: b.customerGroup });
      if (!g) throw badRequest("Unknown customer group.");
      customer = { customerGroup: g.code, isBusiness: Boolean(g.is_business) };
    }
    let productId = Number(b.productId);
    if (!productId && b.sku) {
      const p = await one("SELECT id FROM products WHERE sku = :s AND deleted_at IS NULL", { s: String(b.sku).trim() });
      if (!p) throw badRequest("No product with that SKU.");
      productId = Number(p.id);
    }
    const includeInternal = await can(req.user, "pricing.read_cost");
    const result = await landed.estimate({ lines: [{ productId, qty: Number(b.qty) || 1 }], country: b.country, currency: b.currency, method: b.method, incoterm: b.incoterm, customer, includeInternal });
    res.json({ ...result, canSeeCosts: includeInternal });
  })
);

router.get("/customer-groups", ah(async (req, res) => res.json({ groups: await query("SELECT code, name, is_business FROM customer_groups ORDER BY sort_order") })));

// Generic rule CRUD — registered last so specific routes above take precedence.
router.get(
  "/:entity",
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const cols = [e.pk, ...Object.keys(e.fields).filter((f) => f !== e.pk)];
    const rows = await query(`SELECT ${[...new Set(cols)].map((c) => `\`${c}\``).join(", ")} FROM \`${e.table}\` ORDER BY ${e.orderBy}`);
    res.json({ rows: rows.map((r) => ({ ...r, id: String(r[e.pk]) })) });
  })
);

router.post(
  "/:entity",
  requirePermission("intl.manage"),
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const data = coerce(e, req.body, { creating: true });
    if (!String(req.body.reason || "").trim()) throw badRequest("Please give a reason for this change.");
    if (HAS_UPDATED_BY.has(e.table)) data.updated_by = req.user.id;
    const cols = Object.keys(data);
    try {
      const r = await query(`INSERT INTO \`${e.table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${cols.map((c) => `:${c}`).join(",")})`, data);
      const id = e.pk === "id" ? r.insertId : data[e.pk];
      await audit.record({ req, action: `intl.${req.params.entity}.create`, entityType: e.table, entityId: id, after: data, reason: req.body.reason });
      fx.invalidate();
      res.status(201).json({ id: String(id) });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw conflict("A record with this code already exists.");
      if (err.code === "ER_NO_REFERENCED_ROW_2") throw badRequest("A referenced country/currency/method/zone does not exist.");
      throw err;
    }
  })
);

router.put(
  "/:entity/:id",
  requirePermission("intl.manage"),
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const before = await one(`SELECT * FROM \`${e.table}\` WHERE \`${e.pk}\` = :id`, { id: req.params.id });
    if (!before) throw notFound();
    if (!String(req.body.reason || "").trim()) throw badRequest("Please give a reason for this change.");
    const data = coerce(e, req.body, { creating: false });
    if ("updated_by" in before) data.updated_by = req.user.id;
    const cols = Object.keys(data);
    if (!cols.length) throw badRequest("Nothing to change.");
    try {
      await query(`UPDATE \`${e.table}\` SET ${cols.map((c) => `\`${c}\` = :${c}`).join(", ")} WHERE \`${e.pk}\` = :pkValue`, { ...data, pkValue: req.params.id });
    } catch (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") throw badRequest("A referenced country/currency/method/zone does not exist.");
      throw err;
    }
    const changed = {};
    const prev = {};
    for (const c of cols) if (String(before[c] ?? "") !== String(data[c] ?? "") && c !== "updated_by") (changed[c] = data[c]), (prev[c] = before[c]);
    await audit.record({ req, action: `intl.${req.params.entity}.update`, entityType: e.table, entityId: req.params.id, before: prev, after: changed, reason: req.body.reason });
    fx.invalidate();
    res.json({ ok: true, changed: Object.keys(changed) });
  })
);

router.get(
  "/:entity/:id/history",
  ah(async (req, res) => {
    const e = entity(req.params.entity);
    const rows = await query(
      "SELECT id, actor_email, action, before_json, after_json, reason, created_at FROM audit_logs WHERE entity_type = :t AND entity_id = :id ORDER BY id DESC LIMIT 100",
      { t: e.table, id: String(req.params.id) }
    );
    const j = (v) => (typeof v === "string" ? JSON.parse(v) : v);
    res.json({ history: rows.map((r) => ({ id: String(r.id), actor: r.actor_email, action: r.action, before: j(r.before_json), after: j(r.after_json), reason: r.reason, at: r.created_at })) });
  })
);

module.exports = router;
