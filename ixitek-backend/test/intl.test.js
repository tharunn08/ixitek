// Wave 3 — international commerce: FX, landed cost per route, admin rules, cost secrecy.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { request, db, resetDb, buildApp, createUser, agentFor, createTestProduct } = require("./helpers.js");
const fx = require("../src/modules/intl/fxService.js");

let server;
let owner;
let staff;
let pid;
let pidSM;
let pidCat;

before(async () => {
  await resetDb();
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  staff = await agentFor(server, await createUser("staff"));
  // $65 EXW, 30% margin → $84.50 selling price (user example). 0.5 kg, 200×150×20 mm.
  pid = await createTestProduct({ sku: "T-MM-1", exw: "65", weightKg: "0.5", dims: [200, 150, 20], margin: 30, attrs: { fiber_mode: "Multimode" } });
  pidSM = await createTestProduct({ sku: "T-SM-1", exw: "65", weightKg: "0.5", dims: [200, 150, 20], attrs: { fiber_mode: "Singlemode" } });
  pidCat = await createTestProduct({ sku: "T-CAT-1", exw: "2", weightKg: "0.1", dims: [100, 100, 30], sourceKey: "sheet:CAT" });
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

const est = (body) => request(server).post("/api/intl/estimate").send(body);
const comp = (r, key) => r.body.components.find((c) => c.key === key);

test("China → India: air $5/kg on chargeable weight, BCD 0%, IGST 18% on CIF+duty", async () => {
  const r = await est({ productId: pid, qty: 10, country: "IN", method: "air" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // actual 5 kg; volumetric 10 × (20×15×2)/6000 = 1 kg → chargeable 5 kg × $5 = $25
  assert.equal(r.body.shipping.chargeable.chargeableKg, "5.000");
  assert.equal(comp(r, "goods").amount, "845.00");
  assert.equal(comp(r, "freight").amount, "25.00");
  assert.equal(comp(r, "customs").amount, "0.00");
  assert.equal(comp(r, "import_tax").amount, "156.60"); // 18% × 870
  assert.equal(r.body.totals.payable, "870.00"); // DAP: goods + freight
  assert.equal(r.body.totals.estimatedImportCharges, "156.60");
  assert.equal(r.body.totals.estimatedLandedCost, "1026.60");
  assert.equal(r.body.canCheckout, true);
  const ex = await est({ productId: pid, qty: 10, country: "IN", method: "express" });
  assert.equal(comp(ex, "freight").amount, "39.95"); // 5 kg × 7.99
  const lcl = await est({ productId: pid, qty: 10, country: "IN", method: "lcl" });
  assert.equal(comp(lcl, "freight").amount, "0.06"); // 10 × 0.0006 CBM × $10 (no minimum configured)
});

test("China → USA: HTS 8544.70 base 0% + Section 301 25% planning", async () => {
  const r = await est({ productId: pid, qty: 10, country: "US", method: "air" });
  assert.equal(comp(r, "freight").amount, "34.55"); // 5 × 6.91
  assert.equal(comp(r, "customs").amount, "219.89"); // 25% × 879.55
  assert.equal(comp(r, "customs").status, "estimated");
  assert.ok(!r.body.components.find((c) => c.key === "import_tax"), "no US sales/import tax invented");
});

test("China → UK: VAT 20%, single-mode flagged for trade-remedy verification (not 0%)", async () => {
  const sm = await est({ productId: pidSM, qty: 10, country: "GB", method: "air" });
  assert.equal(comp(sm, "customs").status, "requires_verification");
  assert.ok(sm.body.notices.concat(sm.body.blockers).some((n) => /trade-remedy verification/.test(n.message)));
  assert.equal(sm.body.canCheckout, false, "UK single-mode requires a quote");
  const mm = await est({ productId: pid, qty: 10, country: "GB", method: "air" });
  assert.notEqual(comp(mm, "customs").status, "estimated", "UK base duty is not configured, so it must not be shown as 0% estimated");
  assert.equal(comp(mm, "freight").amount, "22.50");
});

test("China → UAE and Singapore", async () => {
  const ae = await est({ productId: pid, qty: 10, country: "AE", method: "air" });
  assert.equal(comp(ae, "freight").amount, "20.00");
  assert.equal(comp(ae, "customs").amount, "43.25"); // 5% × 865
  assert.equal(comp(ae, "import_tax").amount, "45.41"); // 5% × (865 + 43.25)
  const sg = await est({ productId: pid, qty: 10, country: "SG", method: "air" });
  assert.equal(comp(sg, "freight").amount, "9.50");
  assert.equal(comp(sg, "customs").status, "not_configured", "no invented SG duty");
  assert.equal(comp(sg, "import_tax").status, "partial");
});

test("unconfigured country → quote; missing weight → freight RFQ; DDP needs confirmed duties; EXW excludes freight", async () => {
  const de = await est({ productId: pid, qty: 1, country: "DE" });
  assert.equal(de.body.canCheckout, false);
  assert.ok(de.body.notices.some((n) => n.code === "no_shipping"));
  const noW = await createTestProduct({ sku: "T-NOWEIGHT" });
  const r = await est({ productId: noW, qty: 1, country: "IN", method: "air" });
  assert.equal(comp(r, "freight").status, "rfq_required");
  assert.equal(r.body.canCheckout, false);
  await db.query("UPDATE shipping_rate_rules SET missing_data_policy = 'admin_default', default_freight_usd = 40 WHERE dest_country = 'IN' AND method_code = 'air'");
  const r2 = await est({ productId: noW, qty: 1, country: "IN", method: "air" });
  assert.equal(comp(r2, "freight").status, "default_estimate");
  assert.equal(comp(r2, "freight").amount, "40.00");
  const ddpGB = await est({ productId: pid, qty: 1, country: "GB", incoterm: "DDP" });
  assert.equal(ddpGB.body.canCheckout, false);
  const exw = await est({ productId: pid, qty: 10, country: "IN", incoterm: "EXW" });
  assert.equal(comp(exw, "freight").includedInPayable, false);
  assert.equal(exw.body.totals.payable, "845.00");
});

test("FX: USD base, no rate → USD fallback; manual; override wins; provider failure keeps last valid", async () => {
  const noRate = await est({ productId: pid, qty: 1, country: "IN", currency: "INR", method: "air" });
  assert.equal(noRate.body.currency.code, "USD");
  assert.equal(noRate.body.currency.fallbackFrom, "INR");
  const add = await owner.post("/api/admin/intl/fx/rate").send({ currency: "INR", rate: "83.5", kind: "manual", reason: "test rate" });
  assert.equal(add.status, 201);
  const r = await est({ productId: pid, qty: 10, country: "IN", currency: "INR", method: "air" });
  assert.equal(r.body.currency.code, "INR");
  assert.equal(comp(r, "goods").amount, "70557.50"); // 845 × 83.5
  const big = await owner.post("/api/admin/intl/fx/rate").send({ currency: "INR", rate: "8.35", kind: "manual", reason: "typo" });
  assert.equal(big.status, 409, "large jumps need confirmation");
  await owner.post("/api/admin/intl/fx/rate").send({ currency: "INR", rate: "84", kind: "override", reason: "treasury pin" });
  const o = await est({ productId: pid, qty: 10, country: "IN", currency: "INR", method: "air" });
  assert.equal(comp(o, "goods").amount, "70980.00");
  const failing = await fx.refreshFromProvider({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(failing.ok, false);
  const still = await fx.convert("1", "INR");
  assert.equal(still.rate, "84.0000000000");
  const ok = await fx.refreshFromProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ base_code: "USD", rates: { INR: 83.9, EUR: 0.9, JPY: 150.12 } }) }) });
  assert.deepEqual(ok.updated.sort(), ["EUR", "INR", "JPY"]);
  const stillOverride = await fx.convert("1", "INR");
  assert.equal(stillOverride.rate, "84.0000000000", "override stays pinned over provider updates");
  const jpy = await fx.convert("845", "JPY");
  assert.equal(jpy.amount, "126851", "JPY has zero decimals");
  const gbp = await est({ productId: pid, qty: 1, country: "GB", currency: "GBP" });
  assert.equal(gbp.body.currency.code, "USD", "GBP without a rate falls back to USD, never 0/NaN");
  const cat = await request(server).get("/api/catalog/products?limit=5&currency=EUR");
  assert.equal(cat.body.displayCurrency.code, "EUR");
  assert.ok(cat.body.items.filter((i) => i.price).every((i) => i.price.currency === "EUR" && /^\d+\.\d{2}$/.test(i.price.amount)));
});

test("customer estimate never exposes costs; admin preview shows them only to pricing roles", async () => {
  const r = await est({ productId: pid, qty: 3, country: "US" });
  assert.doesNotMatch(JSON.stringify(r.body), /supplier|exw|fob|margin|costUsd|internal/i);
  const p = await owner.post("/api/admin/intl/preview").send({ sku: "T-MM-1", qty: 10, country: "IN", method: "air" });
  assert.equal(p.body.internal.supplierCostUsd, "650.0000");
  assert.equal(p.body.internal.grossMarginUsd, "195.0000");
  assert.ok(p.body.internal.paymentGateway, "gateway cost planned internally");
  const s = await staff.post("/api/admin/intl/preview").send({ sku: "T-MM-1", qty: 10, country: "IN" });
  assert.equal(s.status, 403, "staff role has no intl access");
});

test("admin rules: validated, reason required, audited, disable/enable, staff blocked", async () => {
  const noReason = await owner.post("/api/admin/intl/tax_rules").send({ name: "X", dest_country: "US", rate_pct: "5", basis: "goods", collected_at: "import", rate_status: "planning" });
  assert.equal(noReason.status, 400);
  const bad = await owner.post("/api/admin/intl/tax_rules").send({ name: "X", dest_country: "US", rate_pct: "abc", basis: "nope", collected_at: "import", rate_status: "planning", reason: "t" });
  assert.equal(bad.status, 422);
  const ok = await owner.post("/api/admin/intl/withholding_rules").send({ name: "TDS 194Q (test)", dest_country: "IN", rate_pct: "0.1", basis: "goods", threshold_usd: "0", applies_to: "business", is_active: true, reason: "test" });
  assert.equal(ok.status, 201);
  const hist = await owner.get(`/api/admin/intl/withholding_rules/${ok.body.id}/history`);
  assert.equal(hist.body.history.length, 1);
  await db.query("UPDATE users SET customer_group = 'business' WHERE email = 'owner@test.local'");
  const withTds = await owner.post("/api/intl/estimate").send({ productId: pid, qty: 10, country: "IN", currency: "USD", method: "air" });
  assert.equal(withTds.body.totals.tdsWithheld.amount, "0.85");
  const off = await owner.put(`/api/admin/intl/withholding_rules/${ok.body.id}`).send({ is_active: false, reason: "test off" });
  assert.equal(off.status, 200);
  const noTds = await owner.post("/api/intl/estimate").send({ productId: pid, qty: 10, country: "IN", currency: "USD", method: "air" });
  assert.equal(noTds.body.totals.tdsWithheld, null);
  const rate = await db.one("SELECT id FROM shipping_rate_rules WHERE dest_country = 'US' AND method_code = 'air'");
  const upd = await owner.put(`/api/admin/intl/shipping_rate_rules/${rate.id}`).send({ rate_usd: "7.50", volumetric_divisor: 5000, reason: "new forwarder quote" });
  assert.equal(upd.status, 200);
  const us = await est({ productId: pid, qty: 10, country: "US", method: "air" });
  assert.equal(comp(us, "freight").amount, "37.50");
  const staffEdit = await staff.put(`/api/admin/intl/shipping_rate_rules/${rate.id}`).send({ rate_usd: "1", reason: "x" });
  assert.equal(staffEdit.status, 403);
  const audit = await db.one("SELECT COUNT(*) c FROM audit_logs WHERE action LIKE 'intl.%'");
  assert.ok(Number(audit.c) >= 3);
  void pidCat;
});

test("locales + detection", async () => {
  const l = await request(server).get("/api/intl/locales");
  assert.ok(l.body.countries.find((c) => c.code === "IN" && c.currency === "INR"));
  assert.ok(l.body.currencies.find((c) => c.code === "JPY" && c.decimals === 0));
  const d = await request(server).get("/api/intl/detect").set("cf-ipcountry", "AE");
  assert.equal(d.body.detected.country, "AE");
  const d2 = await request(server).get("/api/intl/detect").set("accept-language", "de-DE,de;q=0.9");
  assert.equal(d2.body.detected.country, "DE");
});
