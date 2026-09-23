// Wave 5 — cart, quick order, BOM, checkout, orders, RFQs and quotations.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { request, db, resetDb, buildApp, createUser, agentFor, createTestProduct } = require("./helpers.js");
const inventory = require("../src/modules/inventory/inventoryService.js");
const rq = require("../src/modules/commerce/rfqQuoteService.js");

let server;
let owner;
let buyer;
let pid;
let pidStock;
let pidNoPrice;
let whId;

const ADDRESS = { contactName: "Asha Buyer", companyName: "Test Networks Pvt Ltd", line1: "12 Test Road", city: "Pune", state: "MH", postalCode: "411001", countryCode: "IN", phone: "+91 90000 00000" };
const idem = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

before(async () => {
  await resetDb();
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  await createUser("customer", "buyer@test.local");
  buyer = await agentFor(server, { email: "buyer@test.local", password: "Passw0rd!" });
  // $65 EXW +30% → $84.50; 0.5 kg → air freight is computable for IN.
  pid = await createTestProduct({ sku: "T-LC-1M", exw: "65", weightKg: "0.5", dims: [200, 150, 20], margin: 30 });
  pidStock = await createTestProduct({ sku: "T-LC-2M", exw: "10", weightKg: "0.2", dims: [100, 100, 20] });
  pidNoPrice = await createTestProduct({ sku: "T-NOPRICE", exw: "10", weightKg: "0.2", dims: [100, 100, 20] });
  // No cost and no override → no approved selling price → Request a Quote only.
  await db.query("UPDATE product_costs SET supplier_exw_cost_usd = NULL, supplier_fob_cost_usd = NULL WHERE product_id = :p", { p: pidNoPrice });
  await require("../src/modules/pricing/pricingService.js").recompute([pidNoPrice]);
  const w = await db.query("INSERT INTO warehouses (code, name, country_code, is_default) VALUES ('TST', 'Test warehouse', 'IN', 1)");
  whId = w.insertId;
  await inventory.adjust({ productId: pidStock, warehouseId: whId, operation: "increase", quantity: 5, reason: "Test opening stock" });
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test("guest cart: add, update, save for later, remove — prices server-side, no supplier cost leaks", async () => {
  const g = request.agent(server);
  let r = await g.post("/api/shop/cart/items").send({ sku: "T-LC-1M", qty: 2 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await g.get("/api/shop/cart?country=IN&currency=USD&method=air");
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].unitPrice, "84.50");
  assert.equal(r.body.estimate.totals.payable, "174.00"); // 169.00 + 1 kg × $5
  const body = JSON.stringify(r.body);
  assert.ok(!/supplier|exw_cost|fob_cost|margin/i.test(body), "no supplier cost fields in cart JSON");
  assert.ok(!body.includes("65.00"), "EXW cost value must not appear");
  const itemId = r.body.items[0].id;
  r = await g.patch(`/api/shop/cart/items/${itemId}`).send({ qty: 3 });
  assert.equal(r.body.items[0].qty, 3);
  r = await g.patch(`/api/shop/cart/items/${itemId}`).send({ savedForLater: true });
  assert.equal(r.body.items.length, 0);
  assert.equal(r.body.saved.length, 1);
  // Changing country keeps the items (no deletion) and recalculates.
  r = await g.patch(`/api/shop/cart/items/${itemId}`).send({ savedForLater: false });
  r = await g.get("/api/shop/cart?country=GB");
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.country, "GB");
  r = await g.delete(`/api/shop/cart/items/${itemId}`);
  assert.equal(r.body.items.length, 0);
  // Invalid quantity rejected.
  r = await g.post("/api/shop/cart/items").send({ sku: "T-LC-1M", qty: 0 });
  assert.equal(r.status, 400);
  r = await g.post("/api/shop/cart/items").send({ sku: "NOPE-XYZ", qty: 1 });
  assert.equal(r.status, 404);
});

test("quick order: matched / normalised SKU / not found / out of stock / invalid", async () => {
  const r = await request(server).post("/api/shop/quick-order/validate").send({ text: "T-LC-1M 3\nt lc 1m 1\nDOES-NOT-EXIST 2\nT-LC-2M 50\nT-LC-1M abc" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const st = r.body.lines.map((l) => l.status);
  assert.deepEqual(st, ["matched", "invalid", "not_found", "insufficient_stock", "invalid"]);
  const r2 = await request(server).post("/api/shop/quick-order/validate").send({ lines: [{ sku: "tlc1m", qty: 1 }] });
  assert.equal(r2.body.lines[0].status, "matched");
  assert.equal(r2.body.lines[0].matchedBy, "normalised_sku", "normalised matches are flagged, never silent");
  assert.equal(r2.body.lines[0].product.sku, "T-LC-1M");
});

test("BOM upload (CSV) matches SKU and description columns; rejects other file types", async () => {
  const csv = "Part Number,Description,Qty\nT-LC-1M,,4\n,Test product T-LC-2M,2\nUNKNOWN-1,,1\n";
  const r = await request(server).post("/api/shop/bom/upload").attach("file", Buffer.from(csv), "bom.csv");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.summary.total, 3);
  assert.equal(r.body.lines[0].status, "matched");
  assert.equal(r.body.lines[1].status, "matched");
  assert.equal(r.body.lines[1].matchedBy, "description");
  assert.equal(r.body.lines[2].status, "not_found");
  const bad = await request(server).post("/api/shop/bom/upload").attach("file", Buffer.from("x"), "bom.txt");
  assert.equal(bad.status, 400);
  const fake = await request(server).post("/api/shop/bom/upload").attach("file", Buffer.from("not a zip"), "bom.xlsx");
  assert.equal(fake.status, 400);
});

test("checkout: validation, idempotency, immutable snapshot, stock reservation, guest token access", async () => {
  const g = request.agent(server);
  await g.post("/api/shop/cart/items").send({ items: [{ sku: "T-LC-1M", qty: 2 }, { sku: "T-LC-2M", qty: 3 }] });
  const opts = await g.post("/api/shop/checkout/options").send({ country: "IN", currency: "USD", method: "air" });
  assert.equal(opts.status, 200, JSON.stringify(opts.body));
  assert.deepEqual(opts.body.paymentMethods, ["bank_transfer"], "Razorpay only offered when keys are configured");
  const payable = opts.body.cart.estimate.totals.payable;

  const base = { email: "guest@test.local", name: "Guest Buyer", shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0" };
  let r = await g.post("/api/shop/checkout/place").send({ ...base, idempotencyKey: idem(), acceptTerms: false });
  assert.equal(r.status, 400);
  r = await g.post("/api/shop/checkout/place").send({ ...base, idempotencyKey: idem(), paymentMethod: "razorpay" });
  assert.equal(r.status, 400, "razorpay rejected when not configured");
  r = await g.post("/api/shop/checkout/place").send({ ...base, idempotencyKey: idem(), expectedTotal: "1.00" });
  assert.equal(r.status, 409, "changed total must be re-confirmed");

  const key = idem();
  r = await g.post("/api/shop/checkout/place").send({ ...base, idempotencyKey: key, expectedTotal: payable });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.orderNumber, /^IXT-\d{4}-\d{6}$/);
  const { orderNumber, accessToken } = r.body;
  const dup = await g.post("/api/shop/checkout/place").send({ ...base, idempotencyKey: key, expectedTotal: payable });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.orderNumber, orderNumber);
  assert.equal(dup.body.duplicate, true);
  assert.equal(Number((await db.one("SELECT COUNT(*) c FROM orders")).c), 1);

  // Guest can only read the order with its token.
  assert.equal((await request(server).get(`/api/shop/orders/${orderNumber}`)).status, 404);
  assert.equal((await request(server).get(`/api/shop/orders/${orderNumber}?token=wrong`)).status, 404);
  let o = await request(server).get(`/api/shop/orders/${orderNumber}?token=${accessToken}`);
  assert.equal(o.status, 200);
  assert.equal(o.body.order.status, "pending_payment");
  assert.equal(o.body.order.paymentStatus, "unpaid");
  assert.equal(o.body.order.totals.total, payable);
  assert.equal(o.body.order.items.find((i) => i.sku === "T-LC-1M").unitPrice, "84.5000");
  assert.ok(!/supplier|margin|exchangeRate/i.test(JSON.stringify(o.body)));

  // Stock reserved for the tracked item.
  const lvl = await db.one("SELECT on_hand, reserved FROM inventory_levels WHERE product_id = :p", { p: pidStock });
  assert.equal(Number(lvl.reserved), 3);

  // Price changes afterwards do not touch the historical order.
  await db.query("UPDATE product_selling_prices SET selling_price_usd = 999 WHERE product_id = :p", { p: pid });
  o = await request(server).get(`/api/shop/orders/${orderNumber}?token=${accessToken}`);
  assert.equal(o.body.order.items.find((i) => i.sku === "T-LC-1M").unitPrice, "84.5000");
  await require("../src/modules/pricing/pricingService.js").recompute([pid]);

  // Cart was converted — a new visit starts empty.
  const after = await g.get("/api/shop/cart");
  assert.equal(after.body.items.length, 0);

  // Admin: unpaid prepaid order cannot be confirmed; cancel releases stock.
  let a = await owner.post(`/api/admin/commerce/orders/${orderNumber}/status`).send({ status: "confirmed" });
  assert.equal(a.status, 400);
  a = await owner.post(`/api/admin/commerce/orders/${orderNumber}/status`).send({ status: "shipped" });
  assert.equal(a.status, 400);
  a = await owner.post(`/api/admin/commerce/orders/${orderNumber}/status`).send({ status: "cancelled", note: "Customer asked to cancel" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(Number((await db.one("SELECT reserved FROM inventory_levels WHERE product_id = :p", { p: pidStock })).reserved), 0);
  a = await owner.post(`/api/admin/commerce/orders/${orderNumber}/status`).send({ status: "processing" });
  assert.equal(a.status, 409, "cancelled is terminal");
  const hist = await owner.get(`/api/admin/commerce/orders/${orderNumber}`);
  assert.deepEqual(hist.body.order.history.map((h) => h.to), ["pending_payment", "cancelled"]);
});

test("checkout blocks what cannot be priced; insufficient stock is refused", async () => {
  const g = request.agent(server);
  await g.post("/api/shop/cart/items").send({ sku: "T-NOPRICE", qty: 1 });
  const r = await g.post("/api/shop/checkout/place").send({ email: "g2@test.local", name: "G2", shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem() });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  const g2 = request.agent(server);
  await g2.post("/api/shop/cart/items").send({ sku: "T-LC-2M", qty: 50 });
  const r2 = await g2.post("/api/shop/checkout/place").send({ email: "g3@test.local", name: "G3", shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem() });
  assert.equal(r2.status, 409);
  assert.match(r2.body.error, /only 5 available/);
  assert.equal(Number((await db.one("SELECT COUNT(*) c FROM orders WHERE customer_email = 'g3@test.local'")).c), 0, "no partial order left behind");
});

test("signed-in: guest cart merges on sign-in; wishlist; order history; reorder", async () => {
  const g = request.agent(server);
  await g.post("/api/shop/cart/items").send({ sku: "T-LC-1M", qty: 1 });
  const login = await g.post("/api/auth/login").send({ identifier: "buyer@test.local", password: "Passw0rd!" });
  const csrf = login.body.csrfToken;
  let r = await g.get("/api/shop/cart?country=IN&currency=USD&method=air");
  assert.equal(r.body.items.length, 1, "guest line merged into the account cart");
  r = await g.post("/api/shop/wishlist").set("X-CSRF-Token", csrf).send({ slug: "t-lc-2m" });
  assert.equal(r.status, 201);
  r = await g.get("/api/shop/wishlist");
  assert.equal(r.body.items[0].sku, "T-LC-2M");
  r = await g.post("/api/shop/checkout/place").set("X-CSRF-Token", csrf).send({ shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const list = await g.get("/api/shop/orders");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.orders.length, 1);
  assert.equal(list.body.orders[0].orderNumber, r.body.orderNumber);
  // Another customer cannot see it.
  await createUser("customer", "other@test.local");
  const other = await agentFor(server, { email: "other@test.local", password: "Passw0rd!" });
  assert.equal((await other.get(`/api/shop/orders/${r.body.orderNumber}`)).status, 404);
  const re = await g.post(`/api/shop/orders/${r.body.orderNumber}/reorder`).set("X-CSRF-Token", csrf).send({});
  assert.equal(re.status, 200);
  assert.equal(re.body.items.length, 1);
});

test("RFQ → quote V1 → revise V2 → accept creates order at quoted prices; drafts hidden; expiry", async () => {
  const rfq = await request(server).post("/api/shop/rfq").send({ name: "Rita", email: "rita@test.local", country: "AE", items: [{ sku: "T-LC-1M", qty: 100 }, { description: "Custom MPO trunk 24F 30m", qty: 2 }], message: "Project Alpha", requiredDate: "2030-01-15" });
  assert.equal(rfq.status, 201, JSON.stringify(rfq.body));
  assert.match(rfq.body.rfqNumber, /^RFQ-\d{4}-\d{6}$/);
  const pub = await request(server).get(`/api/shop/rfqs/${rfq.body.rfqNumber}?token=${rfq.body.accessToken}`);
  assert.equal(pub.body.rfq.items.length, 2);
  assert.equal((await request(server).get(`/api/shop/rfqs/${rfq.body.rfqNumber}`)).status, 404);
  const rfqRow = await db.one("SELECT id FROM rfqs WHERE rfq_number = :n", { n: rfq.body.rfqNumber });

  // Staff requests info; customer replies → back under review.
  let a = await owner.patch(`/api/admin/commerce/rfqs/${rfq.body.rfqNumber}`).send({ status: "info_requested", message: "Which connector polish?" });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  await request(server).post(`/api/shop/rfqs/${rfq.body.rfqNumber}/messages?token=${rfq.body.accessToken}`).send({ body: "UPC please" });
  assert.equal((await db.one("SELECT status FROM rfqs WHERE id = :id", { id: rfqRow.id })).status, "under_review");

  // Quote with a catalog line at a negotiated price + custom line with explicit price and charges.
  a = await owner.post("/api/admin/commerce/quotes").send({ rfqId: rfqRow.id, currency: "USD", incoterm: "DAP", lines: [{ productId: pid, qty: 100, unitPrice: "80.00" }, { sku: "CUSTOM", description: "Custom MPO", qty: 2, unitPrice: "150" }], charges: { freight: "120.00" } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const qn = a.body.quoteNumber;
  assert.match(qn, /^QT-\d{4}-\d{6}$/);
  // Customer can't see a draft.
  const tok = (await db.one("SELECT access_token FROM quotes WHERE quote_number = :n", { n: qn })).access_token;
  let c = await request(server).get(`/api/shop/quotes/${qn}?token=${tok}`);
  assert.equal(c.status, 404);
  await owner.post(`/api/admin/commerce/quotes/${qn}/send`).send({});
  c = await request(server).get(`/api/shop/quotes/${qn}?token=${tok}`);
  assert.equal(c.body.quote.versions[0].label, `${qn}-V1`);
  assert.equal(c.body.quote.versions[0].totals.total, "8420.00"); // 8000 + 300 + 120
  // A sent version is immutable.
  assert.equal((await owner.put(`/api/admin/commerce/quotes/${qn}`).send({ lines: [{ productId: pid, qty: 1 }] })).status, 409);

  // Customer asks to drop the custom line → revised V2.
  a = await owner.post(`/api/admin/commerce/quotes/${qn}/revise`).send({ currency: "USD", country: "AE", incoterm: "DAP", lines: [{ productId: pid, qty: 100, unitPrice: "79.00" }], charges: { freight: "100" }, reason: "Customer dropped custom line" });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  c = await request(server).get(`/api/shop/quotes/${qn}?token=${tok}`);
  assert.deepEqual(c.body.quote.versions.map((v) => v.status), ["superseded"], "V2 draft hidden, V1 superseded");
  await owner.post(`/api/admin/commerce/quotes/${qn}/send`).send({});
  const acc = await request(server).post(`/api/shop/quotes/${qn}/accept?token=${tok}`).send({ shipping: { ...ADDRESS, countryCode: "AE" }, billingSameAsShipping: true, paymentMethod: "bank_transfer" });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  const ord = await request(server).get(`/api/shop/orders/${acc.body.orderNumber}?token=${acc.body.accessToken}`);
  assert.equal(ord.body.order.totals.total, "8000.00");
  assert.equal(ord.body.order.items[0].unitPrice, "79.0000");
  assert.equal(ord.body.order.source, "quote");
  // Accepting again is refused (single order).
  assert.equal((await request(server).post(`/api/shop/quotes/${qn}/accept?token=${tok}`).send({ shipping: { ...ADDRESS, countryCode: "AE" }, billingSameAsShipping: true })).status, 409);
  assert.equal((await db.one("SELECT status FROM rfqs WHERE id = :id", { id: rfqRow.id })).status, "converted");

  // Expiry: a sent quote past validity expires and can no longer be accepted.
  a = await owner.post("/api/admin/commerce/quotes").send({ customerEmail: "late@test.local", country: "SG", currency: "USD", lines: [{ productId: pid, qty: 1, unitPrice: "90" }] });
  const qn2 = a.body.quoteNumber;
  await owner.post(`/api/admin/commerce/quotes/${qn2}/send`).send({});
  await db.query("UPDATE quote_versions v JOIN quotes q ON q.id = v.quote_id SET v.valid_until = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) WHERE q.quote_number = :n", { n: qn2 });
  const res = await rq.expiryJob();
  assert.ok(res.expired >= 1);
  assert.equal((await db.one("SELECT status FROM quotes WHERE quote_number = :n", { n: qn2 })).status, "expired");
});

test("commerce admin requires permissions; customers get 403", async () => {
  assert.equal((await buyer.get("/api/admin/commerce/orders")).status, 403);
  assert.equal((await request(server).get("/api/admin/commerce/orders")).status, 401);
  const r = await owner.get("/api/admin/commerce/orders");
  assert.equal(r.status, 200);
  assert.ok(r.body.total >= 2);
});

test("quotation with a custom (non-catalog) line converts to an order at the quoted price", async () => {
  const a = await owner.post("/api/admin/commerce/quotes").send({ customerEmail: "custom@test.local", country: "IN", currency: "USD", lines: [{ sku: "CUST-MPO-24", description: "Custom MPO trunk 24F 30m", qty: 2, unitPrice: "150" }], charges: { freight: "20" } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  await owner.post(`/api/admin/commerce/quotes/${a.body.quoteNumber}/send`).send({});
  const tok = (await db.one("SELECT access_token FROM quotes WHERE quote_number = :n", { n: a.body.quoteNumber })).access_token;
  const acc = await request(server).post(`/api/shop/quotes/${a.body.quoteNumber}/accept?token=${tok}`).send({ shipping: ADDRESS, billingSameAsShipping: true, paymentMethod: "bank_transfer" });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  const o = await request(server).get(`/api/shop/orders/${acc.body.orderNumber}?token=${acc.body.accessToken}`);
  assert.equal(o.body.order.items[0].sku, "CUST-MPO-24");
  assert.equal(o.body.order.items[0].productId, null);
  assert.equal(o.body.order.totals.total, "320.00");
});
