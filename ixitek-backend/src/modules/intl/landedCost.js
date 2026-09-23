// landedCost.js — the authoritative quote engine for customer-facing totals.
//
//   selling price (pricing engine: contract price > override > rule, with
//   customer group / country / currency / quantity)
//   → freight (chargeable weight = max(actual, volumetric) or CBM)
//   → insurance → customs duties → import taxes → handling → other charges
//   → incoterm split (what IXITEK invoices vs. what the buyer pays at import)
//   → TDS / withholding → currency conversion (USD → target, once)
//
// Every component carries a status so the UI never presents an estimate as
// exact: estimated | included | not_configured | requires_verification |
// rfq_required | default_estimate | partial | not_applicable.
// Supplier costs are only returned in `internal` (admin preview) — callers
// serving customers must pass includeInternal = false (the default).
const { query, queryText, one } = require("../../core/db.js");
const { D, Decimal } = require("../../core/money.js");
const pricing = require("../pricing/pricingService.js");
const fx = require("./fxService.js");
const gst = require("./gst.js");
const { badRequest } = require("../../core/errors.js");

const PUBLIC_STATUSES = ["active", "coming_soon", "discontinued", "end_of_sale", "end_of_life"];
const ZERO = D(0);

const setting = (key, fallback) => require("../../core/settings.js").get(key, fallback);

const digits = (hs) => String(hs || "").replace(/\D/g, "");
const today = () => new Date().toISOString().slice(0, 10);
const validNow = (r) => (!r.valid_from || String(r.valid_from).slice(0, 10) <= today()) && (!r.valid_to || String(r.valid_to).slice(0, 10) >= today());

async function hsFor(product) {
  if (product.hs_code) return { hs: digits(product.hs_code), source: "product" };
  let catId = product.category_id;
  for (let i = 0; catId && i < 10; i++) {
    const c = await one("SELECT id, parent_id, default_hs_code FROM categories WHERE id = :id", { id: catId });
    if (!c) break;
    if (c.default_hs_code) return { hs: digits(c.default_hs_code), source: "category" };
    catId = c.parent_id;
  }
  return { hs: null, source: null };
}

async function loadProducts(ids) {
  if (!ids.length) return new Map();
  const rows = await queryText(
    `SELECT id, sku, slug, name, status, category_id, weight_kg, length_mm, width_mm, height_mm, hs_code, country_of_origin, moq, max_order_qty
       FROM products WHERE id IN (?) AND deleted_at IS NULL`,
    [ids]
  );
  const attrs = await queryText(
    `SELECT v.product_id, a.code, v.value_text FROM product_attribute_values v JOIN attributes a ON a.id = v.attribute_id WHERE v.product_id IN (?)`,
    [ids]
  );
  const map = new Map(rows.map((r) => [Number(r.id), { ...r, attrs: {} }]));
  for (const a of attrs) map.get(Number(a.product_id)).attrs[a.code] = a.value_text;
  return map;
}

function comp(key, label, usd, status, { payable = false, note = null, collectedAt = null } = {}) {
  return { key, label, usd: usd === null ? null : D(usd), status, payable, note, collectedAt };
}

/**
 * @param {object} p
 * @param {{productId:number, qty:number}[]} p.lines
 * @param {string} p.country ISO-2
 * @param {string} [p.currency]
 * @param {string} [p.method] shipping method code
 * @param {string} [p.incoterm]
 * @param {object} [p.customer] { userId, companyId, customerGroup, isBusiness }
 * @param {boolean} [p.includeInternal] admin preview only
 */
async function estimate({ lines, country, currency, method, incoterm, state = null, customer = {}, includeInternal = false }) {
  if (!Array.isArray(lines) || !lines.length) throw badRequest("Add at least one product.");
  if (lines.length > 500) throw badRequest("Too many lines (max 500).");
  const cty = await one("SELECT * FROM countries WHERE code = :c AND is_active = 1", { c: String(country || "").toUpperCase() });
  if (!cty) throw badRequest("Choose a supported destination country.");
  const cur = await fx.effectiveCurrency(currency || cty.default_currency);
  const inco = await one("SELECT * FROM incoterms WHERE code = :c AND is_active = 1", { c: String(incoterm || cty.default_incoterm).toUpperCase() });
  if (!inco) throw badRequest("Unsupported Incoterm.");
  const origin = await setting("commerce.default_origin_country", "CN");
  const goodsOrigin = await setting("commerce.default_goods_origin", "CN");
  const disclaimer = await setting("commerce.customs_disclaimer", "");

  const normLines = lines.map((l) => ({ productId: Number(l.productId), qty: Math.floor(Number(l.qty)) }));
  for (const l of normLines) if (!(l.productId > 0) || !(l.qty >= 1) || l.qty > 1e6) throw badRequest("Each line needs a product and a whole quantity of at least 1.");
  const products = await loadProducts([...new Set(normLines.map((l) => l.productId))]);

  const blockers = [];
  const notices = [];
  const out = [];
  let goods = ZERO;
  const internal = { lines: [] };

  for (const l of normLines) {
    const p = products.get(l.productId);
    if (!p || !PUBLIC_STATUSES.includes(p.status)) throw badRequest("One of the products is not available.");
    if (l.qty < (p.moq || 1)) blockers.push({ code: "moq", message: `${p.sku}: minimum order quantity is ${p.moq}.` });
    if (p.max_order_qty && l.qty > p.max_order_qty) blockers.push({ code: "max_qty", message: `${p.sku}: maximum order quantity is ${p.max_order_qty}.` });
    const calc = await pricing.calculate(p.id, { customerGroup: customer.customerGroup || null, country: cty.code, currency: cur.code, qty: l.qty, userId: customer.userId || null, companyId: customer.companyId || null });
    const unit = calc.sellingPriceUsd === null ? null : D(calc.sellingPriceUsd);
    if (unit === null) blockers.push({ code: "price_on_request", message: `${p.sku}: price on request.` });
    const hs = await hsFor(p);
    const lineTotal = unit === null ? null : unit.times(l.qty);
    if (lineTotal) goods = goods.plus(lineTotal);
    out.push({ p, qty: l.qty, unit, lineTotal, hs, origin: p.country_of_origin || goodsOrigin });
    if (includeInternal) internal.lines.push({ sku: p.sku, qty: l.qty, priceSource: calc.source, ruleId: calc.ruleId, costBasis: calc.costBasis, costUsd: calc.costUsd, marginPct: calc.marginPct || null, fixedMarkupUsd: calc.fixedMarkupUsd || null, sellingPriceUsd: calc.sellingPriceUsd });
  }
  const allPriced = out.every((o) => o.unit !== null);

  // ── Freight ──
  const methods = await query(
    `SELECT r.*, m.name AS method_name, m.basis FROM shipping_rate_rules r JOIN shipping_methods m ON m.code = r.method_code AND m.is_active = 1
      WHERE r.is_active = 1 AND r.origin_country = :o AND (r.dest_country = :d OR (r.dest_country IS NULL AND r.dest_zone = :z)) ORDER BY m.sort_order`,
    { o: origin, d: cty.code, z: cty.shipping_zone || "" }
  );
  const valid = methods.filter(validNow);
  const available = [...new Map(valid.map((r) => [r.method_code, r])).values()];
  const rule = available.find((r) => r.method_code === method) || available.find((r) => r.method_code === "air") || available[0] || null;
  let freight = null;
  let freightStatus = "not_configured";
  let freightNote = null;
  let chargeable = null;
  if (rule) {
    const missingWeight = out.filter((o) => o.p.weight_kg === null);
    const missingDims = out.filter((o) => o.p.length_mm === null || o.p.width_mm === null || o.p.height_mm === null);
    const needs = rule.rate_basis === "per_kg" ? missingWeight : rule.rate_basis === "per_cbm" ? missingDims : [];
    if (needs.length) {
      if (rule.missing_data_policy === "admin_default" && rule.default_freight_usd !== null) {
        freight = D(rule.default_freight_usd);
        freightStatus = "default_estimate";
        freightNote = "Standard freight estimate — weight/dimensions not yet recorded for every item. Final freight confirmed on dispatch.";
      } else {
        freightStatus = "rfq_required";
        freightNote = "Freight will be quoted — shipping weight/dimensions are not yet recorded for this item.";
      }
    } else {
      let qtyBasis = ZERO;
      if (rule.rate_basis === "per_kg") {
        let actual = ZERO;
        let vol = ZERO;
        let volKnown = true;
        for (const o of out) {
          actual = actual.plus(D(o.p.weight_kg).times(o.qty));
          if (o.p.length_mm === null || o.p.width_mm === null || o.p.height_mm === null) volKnown = false;
          else vol = vol.plus(D(o.p.length_mm).div(10).times(D(o.p.width_mm).div(10)).times(D(o.p.height_mm).div(10)).div(rule.volumetric_divisor).times(o.qty));
        }
        qtyBasis = Decimal.max(actual, vol);
        chargeable = { actualKg: actual.toFixed(3), volumetricKg: volKnown ? vol.toFixed(3) : null, chargeableKg: qtyBasis.toFixed(3), divisor: rule.volumetric_divisor };
        if (!volKnown) freightNote = "Volumetric weight not included (package dimensions not recorded).";
      } else if (rule.rate_basis === "per_cbm") {
        for (const o of out) qtyBasis = qtyBasis.plus(D(o.p.length_mm).times(o.p.width_mm).times(o.p.height_mm).div(1e9).times(o.qty));
        chargeable = { cbm: qtyBasis.toFixed(4) };
      } else qtyBasis = D(1);
      freight = Decimal.max(D(rule.rate_usd).times(qtyBasis), D(rule.min_charge_usd));
      freight = freight.times(D(1).plus(D(rule.fuel_surcharge_pct).div(100))).plus(rule.remote_area_fee_usd);
      freightStatus = "estimated";
    }
  }
  if (!rule) notices.push({ code: "no_shipping", message: `Shipping to ${cty.name} is quoted individually.` });

  // ── Insurance ──
  const ins = (await query("SELECT * FROM insurance_rules WHERE is_active = 1 AND (dest_country = :d OR dest_country IS NULL) ORDER BY dest_country IS NULL LIMIT 1", { d: cty.code }))[0];
  let insurance = null;
  let insStatus = "not_applicable"; // no insurance rule → not charged (omitted)
  if (ins) {
    const base = ins.basis === "goods" ? goods : goods.plus(freight || 0);
    insurance = Decimal.max(base.times(D(ins.rate_pct).div(100)), D(ins.min_usd));
    insStatus = freight === null && ins.basis !== "goods" ? "partial" : "estimated";
  }

  // ── Customs (per line) ──
  const customsRules = (await query("SELECT * FROM customs_rules WHERE is_active = 1 AND dest_country = :d", { d: cty.code })).filter(validNow);
  const taxRules = (await query("SELECT * FROM tax_rules WHERE is_active = 1 AND dest_country = :d", { d: cty.code })).filter(validNow);
  let duty = ZERO;
  let customsStatus = customsRules.length ? "estimated" : "not_configured";
  const customsMessages = new Set();
  const allocBase = goods.gt(0) ? goods : D(1);
  for (const o of out) {
    const share = o.lineTotal ? o.lineTotal.div(allocBase) : ZERO;
    o.customsValue = (o.lineTotal || ZERO).plus(D(freight || 0).times(share)).plus(D(insurance || 0).times(share));
    const matching = customsRules.filter(
      (r) => (!r.origin_country || r.origin_country === o.origin) && (!r.hs_prefix || (o.hs.hs && o.hs.hs.startsWith(digits(r.hs_prefix)))) && (!r.attribute_code || o.p.attrs[r.attribute_code] === r.attribute_value)
    );
    o.duty = ZERO;
    if (!matching.length) {
      o.customsStatus = "not_configured";
    } else if (matching.some((r) => r.rate_status === "requires_verification" || r.rate_pct === null)) {
      o.customsStatus = "requires_verification";
      for (const r of matching) if (r.customer_message) customsMessages.add(r.customer_message);
      for (const r of matching) if (r.rate_pct !== null && r.rate_status !== "requires_verification") o.duty = o.duty.plus(o.customsValue.times(D(r.rate_pct).div(100)));
    } else {
      o.customsStatus = "estimated";
      for (const r of matching) o.duty = o.duty.plus(o.customsValue.times(D(r.rate_pct).div(100)));
    }
    o.dutyRules = matching.map((r) => ({ type: r.duty_type, ratePct: r.rate_pct === null ? null : String(Number(r.rate_pct)), status: r.rate_status }));
    duty = duty.plus(o.duty);
  }
  if (out.some((o) => o.customsStatus === "requires_verification")) customsStatus = "requires_verification";
  else if (out.some((o) => o.customsStatus === "not_configured")) customsStatus = customsRules.length ? "partial" : "not_configured";
  if (freight === null && customsStatus === "estimated") customsStatus = "partial";

  // ── Taxes ──
  let importTax = ZERO;
  let invoiceTax = ZERO;
  let taxStatus = taxRules.length ? "estimated" : "not_configured";
  // Indian GST charged by IXITEK on its own invoice (domestic supply): one rate
  // per line — the most specific matching HSN rule — split later into
  // CGST+SGST/UTGST or IGST by place of supply.
  const gstSeller = cty.code === "IN" ? await gst.sellerGst() : { enabled: false };
  const gstMode = gstSeller.enabled && taxRules.some((r) => r.collected_at === "invoice");
  for (const o of out) {
    let rules = taxRules.filter((r) => !r.hs_prefix || (o.hs.hs && o.hs.hs.startsWith(digits(r.hs_prefix))));
    if (gstMode) {
      const inv = rules.filter((r) => r.collected_at === "invoice").sort((a, b) => digits(b.hs_prefix).length - digits(a.hs_prefix).length);
      rules = [...rules.filter((r) => r.collected_at !== "invoice"), ...inv.slice(0, 1)];
      o.gstRule = inv[0] || null;
    }
    for (const r of rules) {
      const share = o.lineTotal && goods.gt(0) ? o.lineTotal.div(goods) : ZERO;
      const base = r.basis === "goods" ? o.lineTotal || ZERO : r.basis === "goods_plus_freight" ? (o.lineTotal || ZERO).plus(D(freight || 0).times(share)) : o.customsValue.plus(o.duty);
      const amt = base.times(D(r.rate_pct).div(100));
      if (gstMode && r.collected_at === "invoice") o.gstBaseUsd = base;
      if (r.collected_at === "invoice") invoiceTax = invoiceTax.plus(amt);
      else importTax = importTax.plus(amt);
      if (r.basis === "customs_value_plus_duty" && o.customsStatus !== "estimated") taxStatus = "partial";
      if (r.rate_status === "requires_verification") taxStatus = "requires_verification";
    }
    if (!rules.length && taxRules.length && taxStatus === "estimated") taxStatus = "partial";
  }
  if (freight === null && taxStatus === "estimated" && taxRules.some((r) => r.basis !== "goods")) taxStatus = "partial";

  // ── Handling & other charges ──
  const handlingRules = await query("SELECT * FROM handling_rules WHERE is_active = 1 AND (dest_country = :d OR dest_country IS NULL) AND (method_code = :m OR method_code IS NULL)", { d: cty.code, m: rule ? rule.method_code : "" });
  let handling = ZERO;
  for (const h of handlingRules) handling = handling.plus(h.charge_type === "fixed" ? D(h.value) : goods.times(D(h.value).div(100)));
  const otherRules = await query("SELECT * FROM country_charge_rules WHERE is_active = 1 AND dest_country = :d", { d: cty.code });
  let otherInvoice = ZERO;
  let otherImport = ZERO;
  for (const r of otherRules) {
    const amt = r.charge_type === "fixed" ? D(r.value) : goods.times(D(r.value).div(100));
    if (r.payable_at === "invoice") otherInvoice = otherInvoice.plus(amt);
    else otherImport = otherImport.plus(amt);
  }

  // ── Incoterm split ──
  const sellerFreight = Boolean(inco.seller_pays_freight);
  const sellerIns = Boolean(inco.seller_pays_insurance);
  const sellerImport = Boolean(inco.seller_pays_import);
  const components = [
    comp("goods", "Products", allPriced ? goods : null, allPriced ? "estimated" : "rfq_required", { payable: true }),
    comp("freight", `Freight${rule ? ` (${rule.method_name})` : ""}`, freight, freightStatus, { payable: sellerFreight, note: freightNote }),
    comp("insurance", "Insurance", insurance, insStatus, { payable: sellerIns }),
    comp("customs", "Estimated customs duties", customsStatus === "not_configured" ? null : duty, customsStatus, { payable: sellerImport, collectedAt: "import", note: [...customsMessages].join(" ") || null }),
    comp("import_tax", "Estimated import tax (VAT/GST)", taxRules.some((r) => r.collected_at === "import") ? importTax : null, taxRules.some((r) => r.collected_at === "import") ? taxStatus : "not_applicable", { payable: sellerImport, collectedAt: "import" }),
    comp("invoice_tax", gstMode ? "GST" : "Tax", taxRules.some((r) => r.collected_at === "invoice") ? invoiceTax : null, taxRules.some((r) => r.collected_at === "invoice") ? taxStatus : "not_applicable", { payable: true }),
    comp("handling", "Handling", handlingRules.length ? handling : null, handlingRules.length ? "estimated" : "not_applicable", { payable: true }),
    comp("other", "Other charges", otherRules.length ? otherInvoice : null, otherRules.length ? "estimated" : "not_applicable", { payable: true }),
    comp("other_import", "Other import charges", otherRules.some((r) => r.payable_at === "import") ? otherImport : null, otherRules.some((r) => r.payable_at === "import") ? "estimated" : "not_applicable", { payable: sellerImport, collectedAt: "import" }),
  ].filter((c) => c.status !== "not_applicable");

  // Blockers from charges that IXITEK itself would have to invoice.
  if (sellerFreight && (freightStatus === "rfq_required" || freightStatus === "not_configured")) blockers.push({ code: "freight", message: freightNote || `Freight to ${cty.name} is quoted individually.` });
  const importUnknown = ["not_configured", "requires_verification", "partial"].includes(customsStatus);
  if (sellerImport && importUnknown) blockers.push({ code: "import_charges", message: "Duties must be confirmed before a DDP order can be placed." });
  if (!sellerImport && importUnknown && cty.unconfigured_charges === "quote") blockers.push({ code: "import_charges", message: customsStatus === "requires_verification" ? "Import charges subject to customs/trade-remedy verification." : "Import charges for this destination are provided on quotation." });
  if (!sellerImport && importUnknown && cty.unconfigured_charges === "checkout") notices.push({ code: "import_charges", message: "Import charges calculated at checkout/quote." });
  for (const m of customsMessages) notices.push({ code: "trade_remedy", message: m });

  // ── Totals (USD, full precision) ──
  const sum = (arr) => arr.reduce((s, c) => s.plus(c.usd || 0), ZERO);
  const payableComps = components.filter((c) => c.payable);
  const importComps = components.filter((c) => !c.payable && c.collectedAt === "import");
  const buyerArranged = components.filter((c) => !c.payable && !c.collectedAt);

  // ── TDS / withholding (deducted by business buyers) ──
  let tds = null;
  const wh = (await query("SELECT * FROM withholding_rules WHERE is_active = 1 AND dest_country = :d", { d: cty.code }))[0];
  if (wh && allPriced && (wh.applies_to === "all" || customer.isBusiness)) {
    const base = wh.basis === "goods" ? goods : sum(payableComps);
    if (base.gte(wh.threshold_usd)) tds = { name: wh.name, ratePct: String(Number(wh.rate_pct)), usd: base.times(D(wh.rate_pct).div(100)) };
  }

  // ── Currency conversion (each component once, then totals from rounded parts) ──
  const conv = (usd) => (usd === null ? null : D(usd).times(cur.rate).toDecimalPlaces(cur.decimals, 4));
  const fmt = (d) => (d === null ? null : d.toFixed(cur.decimals));

  // GST split in the invoice currency (line taxable values converted once, tax rounded per line).
  let gstOut = null;
  if (gstMode && allPriced) {
    const posState = state ? gst.resolveState(state) : null;
    const rows = out.filter((o) => o.gstRule && o.gstBaseUsd).map((o) => ({ key: String(o.p.id), sku: o.p.sku, hsCode: o.hs.hs, taxable: conv(o.gstBaseUsd), ratePct: D(o.gstRule.rate_pct) }));
    gstOut = gst.split(rows, { sellerState: gstSeller.state, posState, decimals: cur.decimals });
    const invComp = components.find((c) => c.key === "invoice_tax");
    if (invComp) invComp.fixed = D(gstOut.totals.total);
    if (state && !posState) notices.push({ code: "gst_state", message: "Select a valid Indian state for the delivery address so GST can be split into CGST/SGST or IGST." });
    // GST is accounted in rupees: domestic GST invoices are issued in INR.
    if (cur.code !== "INR") blockers.push({ code: "gst_currency", message: "Orders delivered within India are invoiced with GST in INR. Switch the currency to INR to check out." });
  } else if (cty.code === "IN" && !gstSeller.enabled && taxRules.some((r) => r.collected_at === "invoice")) {
    gstOut = { applicable: false, reason: "seller_state_not_configured" };
    // A GST invoice can't be issued without the seller's GST registration state.
    blockers.push({ code: "gst_config", message: "Online ordering with GST for India is not yet available. Please request a quote." });
  }
  const cconv = (c) => (c.fixed !== undefined ? c.fixed : conv(c.usd));
  const compsOut = components.map((c) => ({ key: c.key, label: c.label, amount: fmt(cconv(c)), status: c.status, includedInPayable: c.payable, paidAt: c.payable ? "invoice" : c.collectedAt === "import" ? "destination_import" : "buyer_arranged", note: c.note }));
  const sumConv = (arr) => arr.reduce((s, c) => s.plus(cconv(c) || 0), ZERO);
  const payable = sumConv(payableComps);
  const importCharges = sumConv(importComps);
  const landed = sumConv(components);
  const tdsConv = tds ? conv(tds.usd) : null;

  const unknownPayable = payableComps.some((c) => c.usd === null || ["rfq_required", "not_configured", "requires_verification"].includes(c.status));
  const result = {
    country: { code: cty.code, name: cty.name, taxIdLabel: cty.tax_id_label, requiresTaxId: Boolean(cty.requires_tax_id) },
    currency: { code: cur.code, symbol: cur.symbol, decimals: cur.decimals, rate: cur.rate, rateSource: cur.source, rateObservedAt: cur.observedAt, fallbackFrom: currency && String(currency).toUpperCase() !== cur.code ? String(currency).toUpperCase() : null },
    incoterm: { code: inco.code, name: inco.name, description: inco.description, sellerPaysFreight: sellerFreight, sellerPaysInsurance: sellerIns, sellerPaysImport: sellerImport },
    shipping: rule ? { method: rule.method_code, name: rule.method_name, transitDays: rule.transit_days_min ? [rule.transit_days_min, rule.transit_days_max] : null, chargeable } : null,
    availableMethods: available.map((r) => ({ code: r.method_code, name: r.method_name })),
    lines: out.map((o) => ({
      productId: String(o.p.id), sku: o.p.sku, slug: o.p.slug, name: o.p.name, qty: o.qty,
      unitPrice: o.unit === null ? null : fmt(conv(o.unit)), lineTotal: o.lineTotal === null ? null : fmt(conv(o.lineTotal)),
      priceOnRequest: o.unit === null, hsCode: o.hs.hs, customsStatus: o.customsStatus, estimatedDuty: o.customsStatus === "not_configured" ? null : fmt(conv(o.duty)),
    })),
    components: compsOut,
    totals: {
      payable: unknownPayable ? null : fmt(payable),
      payableIsPartial: unknownPayable,
      estimatedImportCharges: importComps.length ? fmt(importCharges) : null,
      estimatedLandedCost: fmt(landed),
      landedIsPartial: components.some((c) => c.usd === null || c.status !== "estimated"),
      tdsWithheld: tdsConv === null ? null : { name: tds.name, ratePct: tds.ratePct, amount: fmt(tdsConv) },
      netPayableAfterTds: !unknownPayable && tdsConv ? fmt(payable.minus(tdsConv)) : null,
    },
    gst: gstOut,
    buyerArranged: buyerArranged.map((c) => c.key),
    canCheckout: blockers.length === 0,
    blockers,
    notices,
    disclaimer,
    calculatedAt: new Date().toISOString(),
  };

  if (includeInternal) {
    const scope = cty.code === "IN" && cur.code === "INR" ? "domestic" : "international";
    const fee = await one("SELECT * FROM payment_fee_rules WHERE is_active = 1 AND provider = 'razorpay' AND scope = :s ORDER BY method IS NULL LIMIT 1", { s: scope });
    let gateway = null;
    if (fee && !unknownPayable) {
      const payUsd = sum(payableComps);
      const f = payUsd.times(D(fee.fee_pct).div(100)).plus(fee.fixed_fee_usd);
      const t = f.times(D(fee.fee_tax_pct).div(100));
      gateway = { rule: fee.name, scope, feeUsd: f.toFixed(4), feeTaxUsd: t.toFixed(4), totalUsd: f.plus(t).toFixed(4) };
    }
    const costTotal = internal.lines.reduce((s, l) => (l.costUsd ? s.plus(D(l.costUsd).times(l.qty)) : s), ZERO);
    result.internal = {
      ...internal,
      goodsUsd: goods.toFixed(4),
      supplierCostUsd: costTotal.toFixed(4),
      grossMarginUsd: allPriced ? goods.minus(costTotal).toFixed(4) : null,
      componentsUsd: components.map((c) => ({ key: c.key, usd: c.usd === null ? null : c.usd.toFixed(4) })),
      paymentGateway: gateway,
      origin,
      goodsOrigin,
    };
  }
  return result;
}

module.exports = { estimate, hsFor };
