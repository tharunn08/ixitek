// Wave 6 — Razorpay (TEST MODE semantics against a local stub of the documented
// REST API), webhooks, refunds, reconciliation, manual payments, invoices, email outbox.
// The stub is a test double only; live verification must be done with Razorpay
// test keys on staging (see docs/DEPLOYMENT.md).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const crypto = require("crypto");
const { SMTPServer } = require("smtp-server");
const { request, db, resetDb, buildApp, createUser, agentFor, createTestProduct, jobs } = require("./helpers.js");
const fx = require("../src/modules/intl/fxService.js");
const pay = require("../src/modules/payments/paymentService.js");
const settings = require("../src/core/settings.js");
const email = require("../src/modules/email/emailService.js");

const SECRET = "rzp_test_secret_abcdefghijkl";
const WEBHOOK_SECRET = "whsec_test_123456";
let server;
let mock;
let owner;
let staff;
let smtp;
const smtpInbox = [];

// ── Minimal stub of Razorpay's REST API (Orders / Payments / Capture / Refunds) ──
const store = { orders: new Map(), payments: new Map(), refunds: new Map(), seq: 0 };
const rid = (p) => `${p}_${(++store.seq).toString(36).padStart(10, "0")}`;
function startMock() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const auth = Buffer.from(String(req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
        const send = (code, obj) => (res.writeHead(code, { "Content-Type": "application/json" }), res.end(JSON.stringify(obj)));
        if (auth !== `rzp_test_key123:${SECRET}`) return send(401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
        const b = body ? JSON.parse(body) : {};
        let m;
        if (req.method === "POST" && req.url === "/v1/orders") {
          if (!Number.isInteger(b.amount) || b.amount < 100) return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "Order amount less than minimum amount allowed" } });
          const o = { id: rid("order"), entity: "order", amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" };
          store.orders.set(o.id, o);
          return send(200, o);
        }
        if (req.method === "GET" && (m = /^\/v1\/payments\/([\w]+)$/.exec(req.url))) {
          const p = store.payments.get(m[1]);
          return p ? send(200, p) : send(400, { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } });
        }
        if (req.method === "GET" && (m = /^\/v1\/orders\/([\w]+)\/payments$/.exec(req.url))) {
          return send(200, { entity: "collection", items: [...store.payments.values()].filter((p) => p.order_id === m[1]) });
        }
        if (req.method === "POST" && (m = /^\/v1\/payments\/([\w]+)\/capture$/.exec(req.url))) {
          const p = store.payments.get(m[1]);
          if (!p || p.status !== "authorized") return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "This payment has already been captured" } });
          if (b.amount !== p.amount) return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "Capture amount must be equal to the amount authorized" } });
          p.status = "captured";
          return send(200, p);
        }
        if (req.method === "POST" && (m = /^\/v1\/payments\/([\w]+)\/refund$/.exec(req.url))) {
          const p = store.payments.get(m[1]);
          if (!p || p.status !== "captured") return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "Payment not captured" } });
          if (b.amount > p.amount - (p.amount_refunded || 0)) return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "The refund amount provided is greater than amount captured" } });
          p.amount_refunded = (p.amount_refunded || 0) + b.amount;
          const r = { id: rid("rfnd"), entity: "refund", amount: b.amount, currency: p.currency, payment_id: p.id, status: "processed" };
          store.refunds.set(r.id, r);
          return send(200, r);
        }
        send(404, { error: { code: "NOT_FOUND", description: "not found" } });
      });
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}
/** Simulates the customer completing Razorpay Checkout for a Razorpay order. */
function customerPays(orderId, { status = "captured", method = "card", international = false } = {}) {
  const o = store.orders.get(orderId);
  const fee = Math.round(o.amount * 0.02 * 1.18);
  const tax = Math.round(o.amount * 0.02 * 0.18);
  const p = { id: rid("pay"), entity: "payment", amount: o.amount, currency: o.currency, status, order_id: orderId, method, international, fee, tax, error_code: status === "failed" ? "BAD_REQUEST_ERROR" : null, error_description: status === "failed" ? "Payment was declined by the bank" : null };
  store.payments.set(p.id, p);
  const signature = crypto.createHmac("sha256", SECRET).update(`${orderId}|${p.id}`).digest("hex");
  return { payment: p, signature };
}
const webhookBody = (event, payment, extra = {}) => JSON.stringify({ entity: "event", event, contains: ["payment"], payload: { payment: { entity: payment }, ...extra }, created_at: Math.floor(Date.now() / 1000) });
const sign = (raw) => crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");

const ADDRESS = { contactName: "Asha Buyer", companyName: "Test Networks Pvt Ltd", line1: "12 Test Road", city: "Pune", state: "MH", postalCode: "411001", countryCode: "IN", phone: "+91 90000 00000" };
const idem = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

async function placeOrder({ paymentMethod = "razorpay", currency = "INR", qty = 2 } = {}) {
  const g = request.agent(server);
  await g.post("/api/shop/cart/items").send({ sku: "T-PAY-1", qty });
  const r = await g.post("/api/shop/checkout/place").send({ email: "payer@test.local", name: "Payer", shipping: ADDRESS, billingSameAsShipping: true, currency, shippingMethod: "air", paymentMethod, acceptTerms: true, taxId: "27ABCDE1234F1Z0", idempotencyKey: idem() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const orderRow = (n) => db.one("SELECT * FROM orders WHERE order_number = :n", { n });

before(async () => {
  await resetDb();
  mock = await startMock();
  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, cb) {
      let raw = "";
      stream.on("data", (c) => (raw += c));
      stream.on("end", () => (smtpInbox.push({ to: session.envelope.rcptTo.map((r) => r.address), raw }), cb()));
    },
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  staff = await agentFor(server, await createUser("staff"));
  await createTestProduct({ sku: "T-PAY-1", exw: "65", weightKg: "0.5", dims: [200, 150, 20], margin: 30 });
  await fx.recordRate({ currency: "INR", rate: "83.5000", source: "manual", note: "test rate" });
  fx.invalidate();
  process.env.EMAIL_PROVIDER = "log";
});
after(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_API_BASE", "EMAIL_PROVIDER", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT"]) delete process.env[k];
  await new Promise((r) => server.close(r));
  await new Promise((r) => mock.close(r));
  await new Promise((r) => smtp.close(r));
  await db.close();
});

function enableRazorpay() {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key123";
  process.env.RAZORPAY_KEY_SECRET = SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.RAZORPAY_API_BASE = `http://127.0.0.1:${mock.address().port}/v1`;
}

test("Razorpay is never offered or started without keys", async () => {
  const cfg = await request(server).get("/api/pay/config");
  assert.equal(cfg.body.razorpay.enabled, false);
  const o = await placeOrder({ paymentMethod: "bank_transfer" });
  const r = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  assert.equal(r.status, 400);
});

test("success: server-side Razorpay order → signature verified → API-confirmed → paid once", async () => {
  enableRazorpay();
  const o = await placeOrder();
  const row = await orderRow(o.orderNumber);
  assert.match(row.total, /^\d+\.\d{2}$/);
  assert.equal(row.currency, "INR");
  const start = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.amount, Math.round(Number(row.total) * 100));
  assert.equal(start.body.currency, "INR");
  assert.equal(start.body.mode, "test");
  assert.ok(!("keySecret" in start.body) && !JSON.stringify(start.body).includes(SECRET), "secret never sent to the browser");
  // Refresh reuses the same Razorpay order.
  const again = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  assert.equal(again.body.razorpayOrderId, start.body.razorpayOrderId);

  const { payment, signature } = customerPays(start.body.razorpayOrderId);
  // Invalid signature → rejected, nothing marked paid.
  const bad = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: start.body.razorpayOrderId, razorpay_payment_id: payment.id, razorpay_signature: "0".repeat(64) });
  assert.equal(bad.status, 400);
  assert.equal((await orderRow(o.orderNumber)).payment_status, "unpaid");

  const ok = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: start.body.razorpayOrderId, razorpay_payment_id: payment.id, razorpay_signature: signature });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, "paid");
  assert.equal(ok.body.order.paymentStatus, "paid");
  assert.equal(ok.body.order.status, "confirmed");
  // Duplicate callback (double submit) → still one payment.
  const dup = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: start.body.razorpayOrderId, razorpay_payment_id: payment.id, razorpay_signature: signature });
  assert.equal(dup.status, 200);
  const pays = await db.query("SELECT * FROM payments WHERE provider_payment_id = :p", { p: payment.id });
  assert.equal(pays.length, 1);
  assert.equal(pays[0].signature, signature);
  assert.equal(pays[0].fee_source, "gateway");
  assert.ok(Number(pays[0].merchant_payment_cost) > 0, "gateway fee stored separately");
  assert.equal((await orderRow(o.orderNumber)).total, row.total, "fee never added to customer total");
  // Webhook for the same payment, delivered twice → no second payment.
  const raw = webhookBody("payment.captured", payment);
  for (let i = 0; i < 2; i++) {
    const w = await request(server).post("/api/webhooks/razorpay").set("Content-Type", "application/json").set("X-Razorpay-Signature", sign(raw)).set("X-Razorpay-Event-Id", "evt_dup_1").send(raw);
    assert.equal(w.status, 200);
  }
  assert.equal((await db.query("SELECT id FROM payments WHERE provider_payment_id = :p", { p: payment.id })).length, 1);
  assert.equal(Number((await db.one("SELECT COUNT(*) c FROM payment_events WHERE event_id = 'evt_dup_1'")).c), 1);
  // Customer JSON shows no fee/cost fields.
  const view = await request(server).get(`/api/shop/orders/${o.orderNumber}?token=${o.accessToken}`);
  assert.ok(!/fee|merchant|signature/i.test(JSON.stringify(view.body.order.payments)));
});

test("webhook with invalid signature is rejected and not stored", async () => {
  enableRazorpay();
  const raw = webhookBody("payment.captured", { id: "pay_forged", order_id: "order_x", amount: 100, currency: "INR", status: "captured" });
  const w = await request(server).post("/api/webhooks/razorpay").set("Content-Type", "application/json").set("X-Razorpay-Signature", "deadbeef".repeat(8)).set("X-Razorpay-Event-Id", "evt_forged").send(raw);
  assert.equal(w.status, 400);
  assert.equal(Number((await db.one("SELECT COUNT(*) c FROM payment_events WHERE event_id = 'evt_forged'")).c), 0);
  assert.equal(Number((await db.one("SELECT COUNT(*) c FROM payments WHERE provider_payment_id = 'pay_forged'")).c), 0);
});

test("failure, then retry: payment.failed → payment_failed; cancel/close leaves order payable", async () => {
  enableRazorpay();
  const o = await placeOrder();
  const start = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  const { payment } = customerPays(start.body.razorpayOrderId, { status: "failed" });
  const raw = webhookBody("payment.failed", payment);
  const w = await request(server).post("/api/webhooks/razorpay").set("Content-Type", "application/json").set("X-Razorpay-Signature", sign(raw)).set("X-Razorpay-Event-Id", `evt_${payment.id}`).send(raw);
  assert.equal(w.status, 200);
  let row = await orderRow(o.orderNumber);
  assert.equal(row.status, "payment_failed");
  assert.equal(row.payment_status, "failed");
  // Retry succeeds.
  const again = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  assert.equal(again.status, 200);
  const ok = customerPays(again.body.razorpayOrderId);
  const v = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: again.body.razorpayOrderId, razorpay_payment_id: ok.payment.id, razorpay_signature: ok.signature });
  assert.equal(v.body.status, "paid");
  row = await orderRow(o.orderNumber);
  assert.equal(row.status, "confirmed");
  // Paying a paid order is refused.
  assert.equal((await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({})).status, 409);
});

test("browser closed after paying: reconciliation settles it; delayed callback afterwards is a no-op", async () => {
  enableRazorpay();
  const o = await placeOrder();
  const start = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  const { payment, signature } = customerPays(start.body.razorpayOrderId, { status: "authorized" }); // auto-capture off → server captures
  await db.query("UPDATE payment_intents SET created_at = DATE_SUB(created_at, INTERVAL 10 MINUTE) WHERE provider_order_id = :p", { p: start.body.razorpayOrderId });
  const rec = await pay.reconcile();
  assert.ok(rec.settled >= 1, JSON.stringify(rec));
  const row = await orderRow(o.orderNumber);
  assert.equal(row.payment_status, "paid");
  const p = await db.one("SELECT * FROM payments WHERE provider_payment_id = :p", { p: payment.id });
  assert.equal(p.verified_via, "reconciliation");
  const late = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: start.body.razorpayOrderId, razorpay_payment_id: payment.id, razorpay_signature: signature });
  assert.equal(late.status, 200);
  assert.equal((await db.query("SELECT id FROM payments WHERE provider_payment_id = :p", { p: payment.id })).length, 1);
  assert.equal((await orderRow(o.orderNumber)).amount_paid, row.amount_paid);
});

test("refunds: partial then full, over-refund refused, idempotent key, permission enforced", async () => {
  enableRazorpay();
  const o = await placeOrder();
  const start = await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay?token=${o.accessToken}`).send({});
  const c = customerPays(start.body.razorpayOrderId);
  await request(server).post(`/api/pay/orders/${o.orderNumber}/razorpay/verify?token=${o.accessToken}`).send({ razorpay_order_id: start.body.razorpayOrderId, razorpay_payment_id: c.payment.id, razorpay_signature: c.signature });
  const p = await db.one("SELECT * FROM payments WHERE provider_payment_id = :p", { p: c.payment.id });
  assert.equal((await staff.post(`/api/admin/finance/payments/${p.id}/refund`).send({ amount: "10.00", reason: "test", idempotencyKey: "refund-key-000" })).status, 403);
  let r = await owner.post(`/api/admin/finance/payments/${p.id}/refund`).send({ amount: "1000.00", reason: "Damaged patch cord", idempotencyKey: "refund-key-001" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, "processed");
  const again = await owner.post(`/api/admin/finance/payments/${p.id}/refund`).send({ amount: "1000.00", reason: "Damaged patch cord", idempotencyKey: "refund-key-001" });
  assert.equal(again.body.duplicate, true);
  let row = await orderRow(o.orderNumber);
  assert.equal(row.payment_status, "partially_refunded");
  assert.equal(row.amount_refunded, "1000.00");
  r = await owner.post(`/api/admin/finance/payments/${p.id}/refund`).send({ amount: "999999.00", reason: "too much", idempotencyKey: "refund-key-002" });
  assert.equal(r.status, 409);
  r = await owner.post(`/api/admin/finance/payments/${p.id}/refund`).send({ reason: "Order cancelled by customer", idempotencyKey: "refund-key-003" });
  assert.equal(r.status, 201);
  row = await orderRow(o.orderNumber);
  assert.equal(row.payment_status, "refunded");
  assert.equal(row.amount_refunded, row.amount_paid);
  const pp = await db.one("SELECT status, amount_refunded, amount FROM payments WHERE id = :id", { id: p.id });
  assert.equal(pp.status, "refunded");
  assert.equal(pp.amount_refunded, pp.amount);
  assert.ok(await db.one("SELECT id FROM audit_logs WHERE action = 'payment.refund' LIMIT 1"));
});

test("bank transfer: manual receipt (audited), duplicate reference refused, proforma + invoice PDFs need seller details", async () => {
  const o = await placeOrder({ paymentMethod: "bank_transfer", currency: "USD" });
  // Seller details not configured → no proforma / invoice (never a document with invented company data).
  let pf = await request(server).get(`/api/pay/orders/${o.orderNumber}/proforma.pdf?token=${o.accessToken}`);
  assert.equal(pf.status, 409);
  await owner.put("/api/admin/finance/settings").send({ "seller.legal_name": "Test Seller Legal Name", "seller.address": "Test address line\nTest City", reason: "test setup" });
  pf = await request(server).get(`/api/pay/orders/${o.orderNumber}/proforma.pdf?token=${o.accessToken}`).buffer(true).parse((res, cb) => { const b = []; res.on("data", (c) => b.push(c)); res.on("end", () => cb(null, Buffer.concat(b))); });
  assert.equal(pf.status, 200);
  assert.equal(pf.body.slice(0, 4).toString(), "%PDF");
  const row = await orderRow(o.orderNumber);
  assert.equal((await staff.post(`/api/admin/finance/orders/${o.orderNumber}/payments`).send({ amount: row.total, reference: "UTR123456" })).status, 403);
  let r = await owner.post(`/api/admin/finance/orders/${o.orderNumber}/payments`).send({ amount: "999999", reference: "UTR123456" });
  assert.equal(r.status, 409, "over-payment refused");
  r = await owner.post(`/api/admin/finance/orders/${o.orderNumber}/payments`).send({ amount: row.total, reference: "UTR123456", note: "HDFC credit" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await owner.post(`/api/admin/finance/orders/${o.orderNumber}/payments`).send({ amount: "1", reference: "UTR123456" });
  assert.equal(r.status, 409);
  const after = await orderRow(o.orderNumber);
  assert.equal(after.payment_status, "paid");
  assert.equal(after.status, "confirmed");
  // Background: payment.captured → tax invoice → invoice email with PDF.
  await jobs.drain();
  const inv = await db.one("SELECT * FROM invoices WHERE order_id = :o AND invoice_type = 'tax_invoice'", { o: after.id });
  assert.ok(inv, "tax invoice issued after full payment");
  assert.match(inv.invoice_number, /^INV-\d{4}-\d{6}$/);
  const snap = typeof inv.snapshot_json === "string" ? JSON.parse(inv.snapshot_json) : inv.snapshot_json;
  assert.equal(snap.seller.legalName, "Test Seller Legal Name");
  assert.ok(!/supplier|exw|fob|margin/i.test(JSON.stringify(snap)), "no cost data on invoices");
  // Changing seller settings later does not change the issued invoice snapshot.
  await owner.put("/api/admin/finance/settings").send({ "seller.legal_name": "Renamed Co" });
  const again = await db.one("SELECT snapshot_json FROM invoices WHERE id = :id", { id: inv.id });
  assert.equal((typeof again.snapshot_json === "string" ? JSON.parse(again.snapshot_json) : again.snapshot_json).seller.legalName, "Test Seller Legal Name");
  const dl = await request(server).get(`/api/pay/orders/${o.orderNumber}/invoices/${inv.invoice_number}.pdf?token=${o.accessToken}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers["content-type"], "application/pdf");
  // Other people cannot download it.
  assert.equal((await request(server).get(`/api/pay/orders/${o.orderNumber}/invoices/${inv.invoice_number}.pdf`)).status, 404);
  const mails = await db.query("SELECT template, status, provider FROM email_messages WHERE related_id = :n ORDER BY id", { n: o.orderNumber });
  const names = mails.map((m) => m.template);
  for (const t of ["order_placed", "payment_received", "invoice_issued"]) assert.ok(names.includes(t), `${t} queued (${names})`);
  assert.ok(mails.every((m) => m.status === "sent" && m.provider === "log"));
});

test("email: SMTP delivery with PDF attachment; failure never rolls back the order; resend", async () => {
  process.env.EMAIL_PROVIDER = "smtp";
  process.env.EMAIL_FROM = "orders@test.local";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.server.address().port);
  email.resetTransport();
  const inv = await db.one("SELECT invoice_number FROM invoices WHERE invoice_type = 'tax_invoice' ORDER BY id LIMIT 1");
  const orderId = (await db.one("SELECT order_id FROM invoices WHERE invoice_number = :n", { n: inv.invoice_number })).order_id;
  const id = await email.queue("invoice_issued", "buyer@test.local", { invoiceNumber: inv.invoice_number, type: "tax_invoice", orderNumber: "X", total: "1.00", currency: "USD", token: "t" }, { key: `smtp-test-${orderId}`, attachments: [{ kind: "invoice", number: inv.invoice_number }] });
  await jobs.drain();
  const m = await db.one("SELECT status, provider FROM email_messages WHERE id = :id", { id });
  assert.equal(m.status, "sent");
  const got = smtpInbox.find((x) => x.to.includes("buyer@test.local"));
  assert.ok(got, "delivered to SMTP");
  assert.match(got.raw, /application\/pdf/);
  assert.match(got.raw, new RegExp(`${inv.invoice_number}\\.pdf`));

  // Broken provider: the order still succeeds, the email is recorded as failed and can be resent.
  process.env.SMTP_PORT = "1";
  email.resetTransport();
  const o = await placeOrder({ paymentMethod: "bank_transfer", currency: "USD" });
  await jobs.drain();
  const row = await orderRow(o.orderNumber);
  assert.equal(row.status, "pending_payment");
  const failed = await db.one("SELECT id, status, last_error FROM email_messages WHERE related_id = :n AND template = 'order_placed'", { n: o.orderNumber });
  assert.equal(failed.status, "failed");
  assert.ok(failed.last_error);
  process.env.SMTP_PORT = String(smtp.server.address().port);
  email.resetTransport();
  const rs = await owner.post(`/api/admin/finance/emails/${failed.id}/resend`).send({});
  assert.equal(rs.status, 201);
  await db.query("UPDATE jobs SET run_at = CURRENT_TIMESTAMP(3) WHERE status = 'queued'");
  await jobs.drain();
  assert.equal((await db.one("SELECT status FROM email_messages WHERE id = :id", { id: rs.body.id })).status, "sent");
  const log = await owner.get("/api/admin/finance/emails?q=" + o.orderNumber);
  assert.ok(log.body.emails.length >= 2);
  process.env.EMAIL_PROVIDER = "log";
});

test("finance admin: status, payments ledger with fees, settings audit", async () => {
  const s = await owner.get("/api/admin/finance/status");
  assert.equal(s.status, 200);
  assert.equal(s.body.razorpay.mode, "test");
  const l = await owner.get("/api/admin/finance/payments");
  assert.ok(l.body.payments.length >= 4);
  assert.ok(l.body.totals.find((t) => t.currency === "INR"));
  assert.ok(await db.one("SELECT id FROM audit_logs WHERE action = 'settings.update' LIMIT 1"));
  assert.equal((await staff.get("/api/admin/finance/payments")).status, 403);
  void settings;
});
