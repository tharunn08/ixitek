// Indian GST: CGST+SGST (intra-state) vs IGST (inter-state), place of supply =
// ship-to state, GSTIN validation, invoices/credit notes/HSN summary, report.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { request, db, resetDb, buildApp, createUser, agentFor, jobs, createTestProduct } = require("./helpers.js");
const gst = require("../src/modules/intl/gst.js");
const fx = require("../src/modules/intl/fxService.js");
const { D } = require("../src/core/money.js");

let server;
let owner;
const idem = () => `gst-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const addr = (state, city = "Pune") => ({ contactName: "Asha Buyer", companyName: "Test Networks Pvt Ltd", line1: "12 Test Road", city, state, postalCode: "411001", countryCode: "IN", phone: "+91 90000 00000" });
const est = (extra = {}) => request(server).post("/api/intl/estimate").send({ productId: pid, qty: 4, country: "IN", currency: "INR", method: "air", incoterm: "DAP", ...extra });
let pid;

before(async () => {
  await resetDb();
  process.env.EMAIL_PROVIDER = "log";
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  pid = await createTestProduct({ sku: "T-GST-1", exw: "65", weightKg: "0.5", dims: [200, 150, 20], margin: 30 });
  await fx.recordRate({ currency: "INR", rate: "83.5000", source: "manual", note: "test rate" });
  fx.invalidate();
  // Domestic supply model: IXITEK invoices GST 18 % (the import-IGST planning rule is switched off for this test).
  await db.query("UPDATE tax_rules SET is_active = 0 WHERE dest_country = 'IN'");
  await db.query("INSERT INTO tax_rules (name, dest_country, hs_prefix, rate_pct, basis, collected_at, rate_status) VALUES ('GST 18% (test)', 'IN', '8544', 18, 'goods_plus_freight', 'invoice', 'confirmed')");
});
after(async () => {
  delete process.env.EMAIL_PROVIDER;
  await new Promise((r) => server.close(r));
  await db.close();
});

test("unit: state codes, GSTIN check digit, split rounding, amount in words", () => {
  assert.equal(gst.resolveState("MH").code, "27");
  assert.equal(gst.resolveState("IN-KA").code, "29");
  assert.equal(gst.resolveState("tamil nadu").code, "33");
  assert.equal(gst.resolveState("7").name, "Delhi");
  assert.equal(gst.resolveState("Chandigarh").utgst, true);
  assert.equal(gst.resolveState("Delhi").utgst, false, "Delhi has a legislature → SGST");
  assert.equal(gst.resolveState("25"), null, "Daman & Diu code retired (merged into 26)");
  assert.equal(gst.resolveState("Atlantis"), null);
  assert.equal(gst.validateGstin("27AAPFU0939F1ZV").valid, true);
  assert.equal(gst.validateGstin("27aapfu0939f1zv").gstin, "27AAPFU0939F1ZV");
  assert.equal(gst.validateGstin("27AAPFU0939F1ZX").valid, false, "wrong check character");
  assert.equal(gst.validateGstin("X").valid, false);
  const mh = gst.resolveState("27");
  const ka = gst.resolveState("29");
  const rows = [{ key: "a", hsCode: "85447090", taxable: "1000.05", ratePct: "18" }, { key: "b", hsCode: "85447090", taxable: "333.33", ratePct: "18" }];
  const intra = gst.split(rows, { sellerState: mh, posState: mh });
  assert.equal(intra.supplyType, "intra_state");
  // 1000.05 × 9 % = 90.0045 → 90.00; 333.33 × 9 % = 29.9997 → 30.00
  assert.deepEqual(intra.lines.map((l) => [l.cgst, l.sgst, l.igst]), [["90.00", "90.00", "0.00"], ["30.00", "30.00", "0.00"]]);
  const inter = gst.split(rows, { sellerState: mh, posState: ka });
  assert.equal(inter.supplyType, "inter_state");
  assert.equal(inter.totals.igst, "240.00");
  assert.equal(inter.totals.total, intra.totals.total, "tax total does not depend on the state");
  assert.equal(inter.hsnSummary.length, 1);
  assert.equal(gst.split(rows, { sellerState: mh, posState: null }).supplyType, null);
  const lump = gst.splitLumpSum([{ key: "0", taxable: D("100") }, { key: "1", taxable: D("200.01") }], "54.01", { sellerState: mh, posState: mh });
  assert.equal(D(lump.totals.cgst).plus(lump.totals.sgst).toFixed(2), "54.01", "lump-sum parts add up exactly");
  assert.equal(gst.amountInWords("123456.50"), "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only");
  assert.equal(gst.amountInWords("10000000"), "Rupees One Crore Only");
});

test("seller GST not configured → no online checkout with GST for India; settings validate GSTIN/state", async () => {
  const r = await est({ state: "MH" });
  assert.equal(r.status, 200);
  assert.equal(r.body.gst.applicable, false);
  assert.ok(r.body.blockers.some((b) => b.code === "gst_config"));
  assert.equal(r.body.canCheckout, false);
  assert.equal((await owner.put("/api/admin/finance/settings").send({ "seller.state_code": "Atlantis" })).status, 400);
  assert.equal((await owner.put("/api/admin/finance/settings").send({ "seller.tax_id": "27AAPFU0939F1ZX" })).status, 400, "bad check digit");
  const mismatch = await owner.put("/api/admin/finance/settings").send({ "seller.tax_id": "27AAPFU0939F1ZV", "seller.state_code": "29" });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error, /registered in state 27/);
  const ok = await owner.put("/api/admin/finance/settings").send({ "seller.legal_name": "Test Seller Pvt Ltd", "seller.address": "1 Test Street\nPune", "seller.tax_id": "27aapfu0939f1zv", "seller.state_code": "Maharashtra", reason: "test" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const s = (await owner.get("/api/admin/finance/settings")).body.settings;
  assert.equal(s["seller.state_code"], "27", "stored as the GST state code");
  assert.equal(s["seller.tax_id"], "27AAPFU0939F1ZV");
});

test("estimate: CGST+SGST in the seller's state, IGST elsewhere, same total; state list endpoint", async () => {
  const none = (await est()).body;
  const mh = (await est({ state: "Maharashtra" })).body;
  const ka = (await est({ state: "KA" })).body;
  assert.equal(none.canCheckout, true, JSON.stringify(none.blockers));
  assert.equal(none.gst.supplyType, null);
  assert.equal(mh.gst.supplyType, "intra_state");
  assert.equal(ka.gst.supplyType, "inter_state");
  const tax = (e) => e.components.find((c) => c.key === "invoice_tax");
  assert.equal(tax(mh).label, "GST");
  assert.equal(tax(mh).amount, mh.gst.totals.total);
  assert.equal(D(mh.gst.totals.cgst).plus(mh.gst.totals.sgst).toFixed(2), mh.gst.totals.total);
  assert.equal(mh.gst.totals.cgst, mh.gst.totals.sgst);
  assert.equal(ka.gst.totals.igst, ka.gst.totals.total);
  assert.equal(ka.gst.totals.cgst, "0.00");
  assert.equal(none.totals.payable, mh.totals.payable);
  assert.equal(mh.totals.payable, ka.totals.payable);
  // Taxable value includes freight (basis goods_plus_freight): tax = 18 % of goods + freight.
  const goods = D(mh.components.find((c) => c.key === "goods").amount);
  const freight = D(mh.components.find((c) => c.key === "freight").amount);
  assert.ok(D(mh.gst.totals.taxable).minus(goods.plus(freight)).abs().lte("0.01"));
  assert.ok(!/supplier|exw|fob|margin/i.test(JSON.stringify(mh)), "no cost data");
  const usd = (await est({ state: "MH", currency: "USD" })).body;
  assert.ok(usd.blockers.some((b) => b.code === "gst_currency"), "GST checkout only in INR");
  const st = await request(server).get("/api/intl/states/IN");
  assert.equal(st.body.states.length, 36);
  assert.deepEqual((await request(server).get("/api/intl/states/US")).body.states, []);
});

async function checkout(state, extra = {}) {
  const g = request.agent(server);
  await g.post("/api/shop/cart/items").send({ sku: "T-GST-1", qty: 4 });
  const options = await g.post("/api/shop/checkout/options").send({ country: "IN", currency: "INR", method: "air", incoterm: "DAP", state });
  const r = await g.post("/api/shop/checkout/place").send({
    email: "gst@test.local", name: "GST Buyer", shipping: addr(state), billingSameAsShipping: true, currency: "INR", shippingMethod: "air", incoterm: "DAP", paymentMethod: "bank_transfer", acceptTerms: true,
    taxId: "29AAAAA0000A1ZY", idempotencyKey: idem(), expectedTotal: options.body.cart.estimate && options.body.cart.estimate.totals.payable, ...extra,
  });
  return { r, options: options.body };
}

test("checkout: place of supply from the delivery state; split stored per order and line; bad state/GSTIN refused", async () => {
  const bad = await checkout("Atlantis");
  assert.equal(bad.r.status, 400);
  assert.match(bad.r.body.error, /state or union territory/);
  const badGstin = await checkout("MH", { taxId: "27AAPFU0939F1ZX" });
  assert.equal(badGstin.r.status, 400);
  assert.match(badGstin.r.body.error, /GSTIN/);

  const intra = await checkout("MH");
  assert.equal(intra.r.status, 201, JSON.stringify(intra.r.body));
  assert.equal(intra.options.cart.estimate.gst.supplyType, "intra_state", "checkout options use the entered state");
  const o = await db.one("SELECT * FROM orders WHERE order_number = :n", { n: intra.r.body.orderNumber });
  assert.equal(o.place_of_supply, "27");
  assert.equal(o.gst_supply_type, "intra_state");
  assert.equal(o.state_tax_label, "SGST");
  assert.equal(String(o.cgst), String(o.sgst));
  assert.equal(D(o.cgst).plus(o.sgst).toFixed(2), D(o.tax).toFixed(2));
  assert.equal(String(o.igst), "0.00");
  const items = await db.query("SELECT gst_rate, cgst, sgst, gst_taxable_value FROM order_items WHERE order_id = :o", { o: o.id });
  assert.equal(Number(items[0].gst_rate), 18);
  const a = await db.one("SELECT state, state_code FROM order_addresses WHERE order_id = :o AND address_type = 'shipping'", { o: o.id });
  assert.deepEqual([a.state, a.state_code], ["Maharashtra", "27"]);
  const view = await request(server).get(`/api/shop/orders/${intra.r.body.orderNumber}?token=${intra.r.body.accessToken}`);
  assert.equal(view.body.order.gst.placeOfSupply.name, "Maharashtra");
  assert.equal(view.body.order.items[0].gst.ratePct, "18");

  const inter = await checkout("Karnataka");
  assert.equal(inter.r.status, 201, JSON.stringify(inter.r.body));
  const o2 = await db.one("SELECT * FROM orders WHERE order_number = :n", { n: inter.r.body.orderNumber });
  assert.equal(o2.gst_supply_type, "inter_state");
  assert.equal(D(o2.igst).toFixed(2), D(o2.tax).toFixed(2));
  assert.equal(String(o2.cgst), "0.00");
  assert.equal(String(o2.total), String(o.total), "same total in either state");
});

test("tax invoice with HSN summary, proportional GST credit note, GST register (JSON + CSV)", async () => {
  const { r } = await checkout("MH");
  const n = r.body.orderNumber;
  const o = await db.one("SELECT * FROM orders WHERE order_number = :n", { n });
  let p = await owner.post(`/api/admin/finance/orders/${n}/payments`).send({ amount: o.total, reference: `UTR-${n}` });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  await jobs.drain();
  const inv = await db.one("SELECT * FROM invoices WHERE order_id = :o AND invoice_type = 'tax_invoice'", { o: o.id });
  assert.ok(inv, "tax invoice issued");
  assert.equal(inv.place_of_supply, "27");
  assert.equal(inv.buyer_tax_id, "29AAAAA0000A1ZY");
  assert.equal(String(inv.cgst), String(o.cgst));
  const snap = typeof inv.snapshot_json === "string" ? JSON.parse(inv.snapshot_json) : inv.snapshot_json;
  assert.equal(snap.gst.hsnSummary.length, 1);
  assert.equal(snap.gst.hsnSummary[0].hsCode, "85447090");
  assert.equal(snap.gst.hsnSummary[0].cgst, D(o.cgst).toFixed(2));
  assert.ok(!snap.taxComponents.some((c) => /GST/.test(c.label)), "output GST not printed twice");
  const pdf = await request(server).get(`/api/pay/orders/${n}/invoices/${inv.invoice_number}.pdf?token=${o.access_token}`);
  assert.equal(pdf.status, 200);

  // Partial refund of 25 % → GST reversed in the same proportion.
  const pay = await db.one("SELECT id FROM payments WHERE order_id = :o", { o: o.id });
  const quarter = D(o.total).div(4).toDecimalPlaces(2).toFixed(2);
  const rf = await owner.post(`/api/admin/finance/payments/${pay.id}/refund`).send({ amount: quarter, reason: "Returned 1 of 4", reference: "NEFT-RET-1", idempotencyKey: `rf-${n}` });
  assert.ok([200, 201].includes(rf.status), JSON.stringify(rf.body));
  await jobs.drain();
  const cn = await db.one("SELECT * FROM invoices WHERE order_id = :o AND invoice_type = 'credit_note'", { o: o.id });
  assert.ok(cn, "credit note issued");
  assert.equal(D(cn.gst_taxable_value).plus(cn.cgst).plus(cn.sgst).toFixed(2), quarter, "taxable + GST = refund");
  assert.ok(D(cn.cgst).minus(D(o.cgst).div(4)).abs().lte("0.01"));

  const rep = await owner.get("/api/admin/finance/gst-report");
  assert.equal(rep.status, 200);
  const mine = rep.body.invoices.filter((i) => i.orderNumber === n);
  assert.equal(mine.length, 2);
  assert.ok(mine.every((i) => i.b2b && i.placeOfSupply === "27"));
  assert.equal(rep.body.totals.cgst, D(inv.cgst).minus(cn.cgst).toFixed(2));
  assert.equal(rep.body.hsnSummary[0].cgst, rep.body.totals.cgst);
  const csv = await owner.get("/api/admin/finance/gst-report?format=csv");
  assert.match(csv.headers["content-type"], /text\/csv/);
  assert.match(csv.text, /Buyer GSTIN/);
  assert.match(csv.text, new RegExp(inv.invoice_number));
  assert.equal((await request(server).get("/api/admin/finance/gst-report")).status, 401);
});

test("quotation: GST needs seller state before sending; accepted order splits the quoted GST by delivery state", async () => {
  const mk = () => owner.post("/api/admin/commerce/quotes").send({ customerEmail: "q-gst@test.local", country: "IN", currency: "INR", lines: [{ sku: "CUST-PANEL", description: "Custom LGX panel", qty: 2, unitPrice: "5000" }], charges: { freight: "1000", tax: "1980" } });
  await owner.put("/api/admin/finance/settings").send({ "seller.state_code": "" });
  const a = await mk();
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const blocked = await owner.post(`/api/admin/commerce/quotes/${a.body.quoteNumber}/send`).send({});
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /GST state code/);
  await owner.put("/api/admin/finance/settings").send({ "seller.state_code": "27" });
  assert.equal((await owner.post(`/api/admin/commerce/quotes/${a.body.quoteNumber}/send`).send({})).status, 200);
  const tok = (await db.one("SELECT access_token FROM quotes WHERE quote_number = :n", { n: a.body.quoteNumber })).access_token;
  const acc = await request(server).post(`/api/shop/quotes/${a.body.quoteNumber}/accept?token=${tok}`).send({ shipping: addr("Tamil Nadu", "Chennai"), billingSameAsShipping: true, paymentMethod: "bank_transfer" });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  const o = await db.one("SELECT * FROM orders WHERE order_number = :n", { n: acc.body.orderNumber });
  assert.equal(o.gst_supply_type, "inter_state");
  assert.equal(o.place_of_supply, "33");
  assert.equal(String(o.igst), "1980.00");
  assert.equal(String(o.gst_taxable_value), "11000.00", "goods + freight");
  assert.equal(o.gst_rate_basis, "effective");
  assert.equal(String(o.total), "12980.00");
});
