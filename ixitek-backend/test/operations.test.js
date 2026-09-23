// Wave 7 — shipping, procurement, CRM, company accounts, returns, support, customer portal.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { request, db, resetDb, buildApp, createUser, agentFor, createTestProduct, jobs } = require("./helpers.js");
const inventory = require("../src/modules/inventory/inventoryService.js");

let server;
let owner;
let invMgr;
let buyer;
let pid;
let whId;
const ADDRESS = { contactName: "Asha Buyer", companyName: "Test Networks", line1: "12 Test Road", city: "Pune", state: "MH", postalCode: "411001", countryCode: "IN", phone: "+91 90000 00000" };
const idem = () => `ops-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const level = async () => db.one("SELECT on_hand, reserved, incoming, damaged FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w", { p: pid, w: whId });

async function paidOrder(agent, qty, extra = {}) {
  await agent.post("/api/shop/cart/items").send({ sku: "T-OPS-1", qty });
  const r = await agent.post("/api/shop/checkout/place").send({ email: "buyer@test.local", name: "Buyer", shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem(), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const o = await db.one("SELECT total FROM orders WHERE order_number = :n", { n: r.body.orderNumber });
  const p = await owner.post(`/api/admin/finance/orders/${r.body.orderNumber}/payments`).send({ amount: o.total, reference: `UTR-${r.body.orderNumber}` });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  return r.body;
}

before(async () => {
  await resetDb();
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  invMgr = await agentFor(server, await createUser("inventory_manager"));
  await createUser("customer", "buyer@test.local");
  buyer = await agentFor(server, { email: "buyer@test.local", password: "Passw0rd!" });
  pid = await createTestProduct({ sku: "T-OPS-1", exw: "65", weightKg: "0.5", dims: [200, 150, 20], margin: 30 });
  await db.query("UPDATE products SET warranty_months = 12 WHERE id = :p", { p: pid });
  const w = await db.query("INSERT INTO warehouses (code, name, country_code, is_default) VALUES ('BLR', 'Test WH', 'IN', 1)");
  whId = w.insertId;
  await inventory.adjust({ productId: pid, warehouseId: whId, operation: "increase", quantity: 20, reason: "Opening stock (test)" });
  process.env.EMAIL_PROVIDER = "log";
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test("shipping: unpaid orders can't ship; partial shipment consumes reserved stock; statuses roll the order forward", async () => {
  // Unpaid order blocked.
  await buyer.post("/api/shop/cart/items").send({ sku: "T-OPS-1", qty: 1 });
  const unpaid = await buyer.post("/api/shop/checkout/place").send({ shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "bank_transfer", acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem() });
  assert.equal((await owner.post(`/api/admin/shipping/orders/${unpaid.body.orderNumber}/shipments`).send({ carrier: "dhl" })).status, 409);
  await owner.post(`/api/admin/commerce/orders/${unpaid.body.orderNumber}/status`).send({ status: "cancelled", note: "test cleanup" });

  const o = await paidOrder(buyer, 5);
  assert.equal((await level()).reserved, 5);
  const view = await owner.get(`/api/admin/shipping/orders/${o.orderNumber}`);
  const itemId = view.body.remaining[0].orderItemId;
  let r = await owner.post(`/api/admin/shipping/orders/${o.orderNumber}/shipments`).send({ carrier: "dhl", items: [{ orderItemId: itemId, qty: 3 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s1 = r.body.shipmentNumber;
  assert.match(s1, /^SHP-\d{4}-\d{6}$/);
  assert.equal((await owner.post(`/api/admin/shipping/orders/${o.orderNumber}/shipments`).send({ carrier: "dhl", items: [{ orderItemId: itemId, qty: 3 }] })).status, 409, "cannot allocate more than ordered");
  assert.equal((await owner.post(`/api/admin/shipping/shipments/${s1}/status`).send({ status: "shipped" })).status, 400, "tracking number required");
  r = await owner.post(`/api/admin/shipping/shipments/${s1}/status`).send({ status: "shipped", trackingNumber: "TRK123", trackingUrl: "https://example.test/t/TRK123" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let lv = await level();
  assert.equal(lv.on_hand, 17);
  assert.equal(lv.reserved, 2);
  let ord = await db.one("SELECT status FROM orders WHERE order_number = :n", { n: o.orderNumber });
  assert.equal(ord.status, "processing", "partially shipped order stays in fulfilment");
  r = await owner.post(`/api/admin/shipping/orders/${o.orderNumber}/shipments`).send({ carrier: "own" });
  const s2 = r.body.shipmentNumber;
  await owner.post(`/api/admin/shipping/shipments/${s2}/status`).send({ status: "shipped" });
  lv = await level();
  assert.equal(lv.on_hand, 15);
  assert.equal(lv.reserved, 0);
  ord = await db.one("SELECT status FROM orders WHERE order_number = :n", { n: o.orderNumber });
  assert.equal(ord.status, "shipped");
  await owner.post(`/api/admin/shipping/shipments/${s1}/status`).send({ status: "in_transit", location: "Hong Kong hub" });
  assert.equal((await db.one("SELECT status FROM orders WHERE order_number = :n", { n: o.orderNumber })).status, "in_transit");
  await owner.post(`/api/admin/shipping/shipments/${s1}/status`).send({ status: "delivered" });
  assert.equal((await db.one("SELECT status FROM orders WHERE order_number = :n", { n: o.orderNumber })).status, "in_transit", "not delivered until every shipment is");
  await owner.post(`/api/admin/shipping/shipments/${s2}/status`).send({ status: "delivered" });
  assert.equal((await db.one("SELECT status FROM orders WHERE order_number = :n", { n: o.orderNumber })).status, "delivered");
  assert.equal((await owner.post(`/api/admin/shipping/shipments/${s2}/status`).send({ status: "in_transit" })).status, 409);
  // Customer sees tracking + events.
  const c = await buyer.get(`/api/shop/orders/${o.orderNumber}`);
  assert.equal(c.body.order.shipments.length, 2);
  assert.equal(c.body.order.shipments[0].trackingNumber, "TRK123");
  assert.ok(c.body.order.shipments[0].events.find((e) => e.location === "Hong Kong hub"));
  const hist = c.body.order.history.map((h) => h.to);
  assert.deepEqual(hist.slice(-6), ["confirmed", "processing", "packed", "shipped", "in_transit", "delivered"]);
  await jobs.drain();
  const mails = (await db.query("SELECT template FROM email_messages WHERE related_id = :n", { n: o.orderNumber })).map((m) => m.template);
  assert.ok(mails.includes("order_shipped") && mails.includes("order_delivered"), mails.join(","));
  globalThis.__deliveredOrder = o.orderNumber;
});

test("returns: customer requests, over-quantity blocked, staff approve → receive with restock → returned", async () => {
  const n = globalThis.__deliveredOrder;
  const ord = await buyer.get(`/api/shop/orders/${n}`);
  const itemId = ord.body.order.items[0].id;
  assert.equal((await buyer.post(`/api/account/orders/${n}/returns`).send({ kind: "return", reason: "defective", notes: "Two cords fail loss test", items: [{ orderItemId: itemId, qty: 9 }] })).status, 409);
  const r = await buyer.post(`/api/account/orders/${n}/returns`).send({ kind: "warranty", reason: "warranty_fault", notes: "Two cords fail loss test", items: [{ orderItemId: itemId, qty: 2 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const rma = r.body.rmaNumber;
  let a = await owner.get(`/api/admin/returns/${rma}`);
  assert.equal(a.body.return.withinWarranty, true, "12-month warranty computed from delivery date");
  assert.equal((await owner.post(`/api/admin/returns/${rma}`).send({ status: "rejected" })).status, 400, "rejection needs a reason");
  a = await owner.post(`/api/admin/returns/${rma}`).send({ status: "approved", note: "Please ship both cords back." });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const before = (await level()).on_hand;
  a = await owner.post(`/api/admin/returns/${rma}`).send({ status: "received", restock: [{ orderItemId: itemId, qty: 1, warehouseId: whId, condition: "1 OK, 1 failed" }], note: "Received", internal: true });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal((await level()).on_hand, before + 1);
  const mine = await buyer.get(`/api/account/returns/${rma}`);
  assert.ok(!mine.body.return.history.find((h) => h.note === "Received"), "internal notes hidden from customer");
  assert.equal((await owner.post(`/api/admin/returns/${rma}`).send({ status: "completed" })).status, 400, "completion needs a resolution");
  assert.equal((await owner.post(`/api/admin/returns/${rma}`).send({ status: "completed", resolution: "Replacement shipped" })).status, 200);
});

test("procurement: supplier costs hidden without pricing.read_cost; PO → incoming → partial receipt with damage → received", async () => {
  let r = await owner.post("/api/admin/procurement/suppliers").send({ code: "SUP-A", name: "Test Supplier A", country: "CN", currency: "USD" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sid = r.body.supplier.id;
  r = await owner.put(`/api/admin/procurement/suppliers/${sid}/products`).send({ sku: "T-OPS-1", supplierSku: "SUP-LC-1", unitCost: "12.3400", preferred: true });
  assert.equal(r.status, 200);
  const hidden = await invMgr.get(`/api/admin/procurement/suppliers/${sid}/products`);
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.items[0].unitCost, undefined, "cost hidden for inventory manager");
  assert.ok(!JSON.stringify(hidden.body).includes("12.34"));
  assert.equal((await invMgr.put(`/api/admin/procurement/suppliers/${sid}/products`).send({ sku: "T-OPS-1", unitCost: "1" })).status, 400);
  r = await owner.post("/api/admin/procurement/purchase-orders").send({ supplierId: sid, warehouseId: whId, lines: [{ sku: "T-OPS-1", qty: 10 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const po = r.body.purchaseOrder;
  assert.match(po.poNumber, /^PO-\d{4}-\d{6}$/);
  assert.equal(po.subtotal, "123.40");
  const before = await level();
  await owner.post(`/api/admin/procurement/purchase-orders/${po.id}/send`).send({});
  assert.equal((await level()).incoming, before.incoming + 10);
  const itemId = po.items[0].id;
  r = await invMgr.post(`/api/admin/procurement/purchase-orders/${po.id}/receive`).send({ idempotencyKey: "grn-test-1", lines: [{ itemId, qty: 6, damaged: 1 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const dup = await invMgr.post(`/api/admin/procurement/purchase-orders/${po.id}/receive`).send({ idempotencyKey: "grn-test-1", lines: [{ itemId, qty: 6 }] });
  assert.equal(dup.body.duplicate, true);
  let lv = await level();
  assert.equal(lv.incoming, before.incoming + 4);
  assert.equal(lv.on_hand, before.on_hand + 5);
  assert.equal(lv.damaged, before.damaged + 1);
  assert.equal((await invMgr.post(`/api/admin/procurement/purchase-orders/${po.id}/receive`).send({ lines: [{ itemId, qty: 5 }] })).status, 409, "cannot over-receive");
  await invMgr.post(`/api/admin/procurement/purchase-orders/${po.id}/receive`).send({ lines: [{ itemId, qty: 4 }] });
  const done = await owner.get(`/api/admin/procurement/purchase-orders/${po.id}`);
  assert.equal(done.body.purchaseOrder.status, "received");
  assert.equal(done.body.purchaseOrder.receipts.length, 2);
  lv = await level();
  assert.equal(lv.incoming, before.incoming);
  r = await owner.post("/api/admin/procurement/supplier-invoices").send({ supplierId: sid, poId: po.id, number: "SI-001", date: "2026-09-01", amount: "123.40" });
  assert.equal(r.status, 201);
  assert.equal((await owner.post("/api/admin/procurement/supplier-invoices").send({ supplierId: sid, number: "SI-001", date: "2026-09-01", amount: "1" })).status, 409);
  assert.equal((await owner.post(`/api/admin/procurement/supplier-invoices/${r.body.id}/status`).send({ status: "paid" })).status, 400);
  assert.equal((await owner.post(`/api/admin/procurement/supplier-invoices/${r.body.id}/status`).send({ status: "paid", paymentReference: "SWIFT-778" })).status, 200);
});

test("CRM: enquiries and RFQs create leads automatically; stage changes audited; pipeline", async () => {
  await request(server).post("/api/enquiries").send({ name: "Lead Person", email: "lead@test.local", company: "Lead Co", message: "Need 500 LC patch cords" });
  await request(server).post("/api/shop/rfq").send({ name: "Rfq Person", email: "rfq@test.local", country: "SG", items: [{ sku: "T-OPS-1", qty: 50 }] });
  await jobs.drain();
  const l = await owner.get("/api/admin/crm/leads");
  assert.equal(l.status, 200);
  const enq = l.body.leads.find((x) => x.email === "lead@test.local");
  const rfq = l.body.leads.find((x) => x.email === "rfq@test.local");
  assert.ok(enq && enq.source === "enquiry");
  assert.ok(rfq && rfq.source === "rfq" && rfq.rfqNumber);
  assert.equal((await owner.patch(`/api/admin/crm/leads/${enq.id}`).send({ stage: "lost" })).status, 400);
  assert.equal((await owner.patch(`/api/admin/crm/leads/${enq.id}`).send({ stage: "proposal", valueUsd: "2500", nextFollowUp: "2026-09-25" })).status, 200);
  await owner.post("/api/admin/crm/activities").send({ entityType: "lead", entityId: enq.id, kind: "call", subject: "Intro call", dueAt: new Date(Date.now() + 864e5).toISOString() });
  const d = await owner.get(`/api/admin/crm/leads/${enq.id}`);
  assert.ok(d.body.activities.find((a) => a.subject.startsWith("Stage: new → proposal")));
  const p = await owner.get("/api/admin/crm/pipeline");
  assert.equal(p.body.stages.find((x) => x.stage === "proposal").valueUsd, "2500.00");
  assert.ok(p.body.dueActivities.length >= 1);
  assert.equal((await buyer.get("/api/admin/crm/leads")).status, 403);
});

test("company accounts: apply → approve with credit → purchase-order terms, credit limit enforced, invitations & roles", async () => {
  await createUser("customer", "cadmin@test.local");
  const ca = await agentFor(server, { email: "cadmin@test.local", password: "Passw0rd!" });
  let r = await ca.post("/api/account/company").send({ legalName: "Test Fibre Pvt Ltd", country: "IN", taxId: "29AAAAA0000A1ZY" });
  assert.equal(r.status, 201);
  const cid = r.body.companyId;
  await ca.post("/api/shop/cart/items").send({ sku: "T-OPS-1", qty: 1 });
  let opts = await ca.post("/api/shop/checkout/options").send({ country: "IN", currency: "USD", method: "air" });
  assert.deepEqual(opts.body.paymentMethods, ["bank_transfer"], "pending company gets no credit");
  assert.equal((await owner.patch(`/api/admin/companies/${cid}`).send({ status: "approved", paymentTerms: "net30", creditLimitUsd: "100" })).status, 400, "reason required");
  r = await owner.patch(`/api/admin/companies/${cid}`).send({ status: "approved", paymentTerms: "net30", creditLimitUsd: "100", reason: "Verified GST & trade references" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // Re-login so the session reflects the company (company_id already on user).
  opts = await ca.post("/api/shop/checkout/options").send({ country: "IN", currency: "USD", method: "air" });
  assert.ok(opts.body.paymentMethods.includes("purchase_order"));
  const total = opts.body.cart.estimate.totals.payable; // 84.50 + freight
  r = await ca.post("/api/shop/checkout/place").send({ shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "purchase_order", poNumber: "PO-778", acceptTerms: true, taxId: "29AAAAA0000A1ZY", idempotencyKey: idem() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ord = await db.one("SELECT status, payment_terms, company_id FROM orders WHERE order_number = :n", { n: r.body.orderNumber });
  assert.equal(ord.status, "confirmed");
  assert.equal(ord.payment_terms, "net30");
  assert.equal(String(ord.company_id), cid);
  assert.ok(Number(total) > 0);
  // A second order would exceed the $100 limit.
  await ca.post("/api/shop/cart/items").send({ sku: "T-OPS-1", qty: 1 });
  r = await ca.post("/api/shop/checkout/place").send({ shipping: ADDRESS, billingSameAsShipping: true, currency: "USD", shippingMethod: "air", paymentMethod: "purchase_order", acceptTerms: true, taxId: "29AAAAA0000A1ZY", idempotencyKey: idem() });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /available credit/);
  // Invitations
  await createUser("customer", "colleague@test.local");
  r = await ca.post("/api/account/company/invitations").send({ email: "colleague@test.local", role: "buyer" });
  assert.equal(r.status, 201);
  await jobs.drain();
  const mail = await db.one("SELECT body_text FROM email_messages WHERE to_email = 'colleague@test.local' ORDER BY id DESC LIMIT 1");
  const token = /token=([\w-]+)/.exec(mail.body_text)[1];
  const col = await agentFor(server, { email: "colleague@test.local", password: "Passw0rd!" });
  assert.equal((await buyer.post("/api/account/company/join").send({ token })).status, 403, "wrong email");
  assert.equal((await col.post("/api/account/company/join").send({ token })).status, 200);
  const co = await ca.get("/api/account/company");
  assert.equal(co.body.members.length, 2);
  assert.ok(co.body.credit && Number(co.body.credit.usedUsd) > 0);
  const me = co.body.members.find((m) => m.email === "cadmin@test.local");
  assert.equal((await ca.patch(`/api/account/company/members/${me.id}`).send({ role: "buyer" })).status, 409, "last admin protected");
  // The colleague sees the company's order.
  assert.equal((await col.get(`/api/shop/orders/${ord ? (await db.one("SELECT order_number FROM orders WHERE company_id = :c LIMIT 1", { c: cid })).order_number : ""}`)).status, 200);
});

test("support tickets: guest via token, staff reply, internal notes hidden", async () => {
  const r = await request(server).post("/api/support/tickets").send({ name: "Guest", email: "guest@test.local", subject: "Datasheet needed", category: "technical", message: "Please share the insertion loss spec." });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { ticketNumber, accessToken } = r.body;
  assert.equal((await request(server).get(`/api/support/tickets/${ticketNumber}`)).status, 404);
  await owner.post(`/api/admin/tickets/${ticketNumber}/messages`).send({ body: "Internal: ask product team", internal: true });
  await owner.post(`/api/admin/tickets/${ticketNumber}/messages`).send({ body: "Attached is the spec sheet link." });
  const g = await request(server).get(`/api/support/tickets/${ticketNumber}?token=${accessToken}`);
  assert.equal(g.body.ticket.messages.length, 2);
  assert.ok(!g.body.ticket.messages.find((m) => m.body.startsWith("Internal")));
  assert.equal(g.body.ticket.status, "pending_customer");
  await request(server).post(`/api/support/tickets/${ticketNumber}/messages?token=${accessToken}`).send({ body: "Thanks!" });
  assert.equal((await owner.get(`/api/admin/tickets/${ticketNumber}`)).body.ticket.status, "open");
});

test("customer portal: dashboard, addresses, invoices & payments lists, profile, password", async () => {
  const d = await buyer.get("/api/account/dashboard");
  assert.equal(d.status, 200);
  assert.ok(d.body.recentOrders.length >= 1);
  let a = await buyer.post("/api/account/addresses").send({ ...ADDRESS, type: "shipping", label: "Plant", isDefault: true });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  a = await buyer.put(`/api/account/addresses/${a.body.address.id}`).send({ ...ADDRESS, city: "Mumbai", type: "shipping" });
  assert.equal(a.body.address.city, "Mumbai");
  assert.equal((await buyer.get("/api/account/addresses")).body.addresses.length, 1);
  const pays = await buyer.get("/api/account/payments");
  assert.ok(pays.body.payments.length >= 1);
  assert.ok(!JSON.stringify(pays.body).match(/fee|merchant/i));
  assert.equal((await buyer.get("/api/account/invoices")).status, 200);
  assert.equal((await buyer.put("/api/account/password").send({ currentPassword: "wrong", newPassword: "NewPassw0rd" })).status, 400);
  assert.equal((await buyer.put("/api/account/password").send({ currentPassword: "Passw0rd!", newPassword: "NewPassw0rd1" })).status, 200);
  assert.equal((await buyer.put("/api/account/profile").send({ name: "Buyer Renamed", phone: "123" })).status, 200);
});
