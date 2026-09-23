// paymentService.js — the only code that changes an order's payment state.
//
// Flow (Razorpay): IXITEK order (pending_payment) → Razorpay Order created
// server-side → Checkout in the browser → handler posts ids + signature →
// server verifies the HMAC signature AND fetches the payment from Razorpay →
// idempotent insert (unique provider_payment_id) → order paid/confirmed →
// events (invoice, email). Webhooks and a reconciliation job reach the same
// idempotent function, so a closed browser, a delayed callback or a webhook
// delivered twice all converge on exactly one payment row.
const { query, one, tx, json } = require("../../core/db.js");
const { D } = require("../../core/money.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const monitor = require("../../core/monitor.js");
const log = require("../../core/logger.js");
const rzp = require("./razorpay.js");
const orders = require("../commerce/orderService.js");
const { badRequest, conflict, notFound, forbidden } = require("../../core/errors.js");

const PAYABLE_STATUSES = ["pending_payment", "payment_failed"];

async function currencyInfo(code, conn = null) {
  const c = await one("SELECT code, decimals, razorpay_enabled FROM currencies WHERE code = :c", { c: code }, conn);
  if (!c) throw badRequest(`Unknown currency ${code}.`);
  return { code: c.code, decimals: Number(c.decimals), razorpayEnabled: Boolean(Number(c.razorpay_enabled)) };
}

const toMinor = (amount, decimals) => D(amount).times(D(10).pow(decimals)).toDecimalPlaces(0).toFixed(0);
const fromMinor = (minor, decimals) => D(minor).div(D(10).pow(decimals)).toFixed(decimals);

function balanceDue(o) {
  const due = D(o.total).minus(o.amount_paid);
  return due.isNegative() ? D(0) : due;
}

/** Gateway fee: exact values from Razorpay when present, otherwise the configured planning rule. Stored separately — never added to the customer's total. */
async function feeFor({ amount, currency, decimals, international, gatewayFeeMinor, gatewayTaxMinor }, conn = null) {
  if (gatewayFeeMinor !== undefined && gatewayFeeMinor !== null) {
    const fee = D(fromMinor(gatewayFeeMinor, decimals));
    const tax = D(fromMinor(gatewayTaxMinor || 0, decimals));
    return { payment_gateway_fee: fee.minus(tax).toFixed(2), payment_gateway_tax: tax.toFixed(2), merchant_payment_cost: fee.toFixed(2), fee_source: "gateway" };
  }
  const rule = await one("SELECT fee_pct, fee_tax_pct FROM payment_fee_rules WHERE provider = 'razorpay' AND scope = :s AND is_active = 1 ORDER BY id LIMIT 1", { s: international ? "international" : "domestic" }, conn);
  if (!rule) return { payment_gateway_fee: null, payment_gateway_tax: null, merchant_payment_cost: null, fee_source: null };
  const fee = D(amount).times(rule.fee_pct).div(100).toDecimalPlaces(2);
  const tax = fee.times(rule.fee_tax_pct).div(100).toDecimalPlaces(2);
  void currency;
  return { payment_gateway_fee: fee.toFixed(2), payment_gateway_tax: tax.toFixed(2), merchant_payment_cost: fee.plus(tax).toFixed(2), fee_source: "estimated" };
}

/** Create (or reuse) the Razorpay Order for the amount currently due. */
async function startRazorpay(req, orderRow) {
  if (!rzp.isConfigured()) throw badRequest("Online payment is not available. Please choose bank transfer or request a quote.");
  const o = await one("SELECT * FROM orders WHERE id = :id", { id: orderRow.id });
  if (o.payment_method !== "razorpay") throw badRequest("This order is not set up for online payment.");
  if (!PAYABLE_STATUSES.includes(o.status)) throw conflict(o.payment_status === "paid" ? "This order is already paid." : `This order is ${o.status.replace(/_/g, " ")} and cannot be paid online.`);
  const cur = await currencyInfo(o.currency);
  if (!cur.razorpayEnabled) throw badRequest(`Online payment in ${o.currency} is not enabled. Please use bank transfer.`);
  const due = balanceDue(o);
  if (!due.gt(0)) throw conflict("Nothing is due on this order.");
  const amountMinor = toMinor(due, cur.decimals);
  // Reuse a recent unpaid Razorpay order for the same amount (avoids orphan orders on refresh).
  let intent = await one(
    "SELECT * FROM payment_intents WHERE order_id = :o AND provider = 'razorpay' AND status IN ('created','attempted') AND amount_minor = :m AND currency = :c AND created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 12 HOUR) ORDER BY id DESC LIMIT 1",
    { o: o.id, m: amountMinor, c: o.currency }
  );
  if (!intent) {
    const receipt = o.order_number;
    const r = await rzp.api.createOrder({ amount: Number(amountMinor), currency: o.currency, receipt, notes: { ixitek_order: o.order_number } });
    if (!r || !r.id || String(r.amount) !== String(amountMinor) || r.currency !== o.currency) {
      monitor.event("payment_failure", `Razorpay order response mismatch for ${o.order_number}`, { response: r ? { id: r.id, amount: r.amount, currency: r.currency } : null });
      throw new rzp.GatewayError("The payment gateway returned an unexpected response. Please try again.");
    }
    const ins = await query(
      "INSERT INTO payment_intents (order_id, provider, provider_order_id, amount, amount_minor, currency, receipt) VALUES (:o, 'razorpay', :p, :a, :m, :c, :r)",
      { o: o.id, p: r.id, a: due.toFixed(cur.decimals), m: amountMinor, c: o.currency, r: receipt }
    );
    intent = await one("SELECT * FROM payment_intents WHERE id = :id", { id: ins.insertId });
  }
  const addr = await one("SELECT phone FROM order_addresses WHERE order_id = :o AND address_type = 'billing'", { o: o.id });
  return {
    keyId: rzp.cfg().keyId,
    mode: rzp.mode(),
    razorpayOrderId: intent.provider_order_id,
    amount: Number(intent.amount_minor),
    currency: intent.currency,
    displayAmount: intent.amount,
    orderNumber: o.order_number,
    name: "IXITEK",
    description: `Order ${o.order_number}`,
    prefill: { name: o.customer_name, email: o.customer_email, contact: o.customer_phone || (addr && addr.phone) || "" },
  };
}

/**
 * Apply a captured gateway payment exactly once. `entity` is a Razorpay payment entity
 * obtained from the API or a signature-verified webhook — never from the browser alone.
 */
async function applyGatewayPayment(entity, { via }) {
  if (!entity || !entity.id || !entity.order_id) throw badRequest("Incomplete payment details.");
  return tx(async (conn) => {
    const intent = await one("SELECT * FROM payment_intents WHERE provider = 'razorpay' AND provider_order_id = :p FOR UPDATE", { p: entity.order_id }, conn);
    if (!intent) {
      monitor.event("payment_failure", `Razorpay payment ${entity.id} for unknown order ${entity.order_id}`, {});
      return { ignored: true, reason: "unknown_order" };
    }
    const existing = await one("SELECT * FROM payments WHERE provider = 'razorpay' AND provider_payment_id = :id", { id: entity.id }, conn);
    if (existing && existing.status !== "failed" && existing.status !== "created" && existing.status !== "authorized") return { duplicate: true, paymentId: existing.id };

    const o = await one("SELECT * FROM orders WHERE id = :id FOR UPDATE", { id: intent.order_id }, conn);
    const cur = await currencyInfo(entity.currency || intent.currency, conn);
    const amount = fromMinor(entity.amount, cur.decimals);
    const fees = await feeFor({ amount, currency: cur.code, decimals: cur.decimals, international: Boolean(entity.international), gatewayFeeMinor: entity.fee, gatewayTaxMinor: entity.tax }, conn);
    const mismatch = String(entity.amount) !== String(intent.amount_minor) || entity.currency !== intent.currency;
    const row = {
      order: o.id, intent: intent.id, po: entity.order_id, pp: entity.id, status: "captured", amount, cur: cur.code, method: entity.method || null,
      intl: entity.international === undefined ? null : entity.international ? 1 : 0, via, ...fees, notes: mismatch ? `Amount/currency differs from the Razorpay order (${intent.amount} ${intent.currency}).` : "",
    };
    let paymentId;
    if (existing) {
      await query(
        `UPDATE payments SET status = 'captured', amount = :amount, currency = :cur, method = :method, international = :intl, payment_gateway_fee = :payment_gateway_fee, payment_gateway_tax = :payment_gateway_tax,
            merchant_payment_cost = :merchant_payment_cost, fee_source = :fee_source, verified_via = :via, notes = :notes, error_code = NULL, error_description = NULL, paid_at = CURRENT_TIMESTAMP(3) WHERE id = :id`,
        { ...row, id: existing.id },
        conn
      );
      paymentId = existing.id;
    } else {
      const ins = await query(
        `INSERT INTO payments (order_id, intent_id, provider, provider_order_id, provider_payment_id, status, amount, currency, method, international, payment_gateway_fee, payment_gateway_tax, merchant_payment_cost, fee_source, verified_via, notes, paid_at)
         VALUES (:order, :intent, 'razorpay', :po, :pp, :status, :amount, :cur, :method, :intl, :payment_gateway_fee, :payment_gateway_tax, :merchant_payment_cost, :fee_source, :via, :notes, CURRENT_TIMESTAMP(3))`,
        row,
        conn
      );
      paymentId = ins.insertId;
    }
    await query("UPDATE payment_intents SET status = 'paid' WHERE id = :id", { id: intent.id }, conn);
    if (mismatch) monitor.event("payment_failure", `Payment ${entity.id} amount/currency mismatch on ${o.order_number}`, { expected: `${intent.amount_minor} ${intent.currency}`, got: `${entity.amount} ${entity.currency}` });
    await creditOrder(conn, o, amount, cur.code, { paymentId, actor: null, note: `Razorpay payment ${entity.id} (${via.replace(/_/g, " ")})` });
    return { paymentId, orderNumber: o.order_number };
  });
}

/** Add a received amount to the order; confirm when fully paid. */
async function creditOrder(conn, o, amount, currency, { paymentId, actor, note }) {
  if (currency !== o.currency) throw badRequest(`Payment currency ${currency} does not match order currency ${o.currency}.`);
  const paid = D(o.amount_paid).plus(amount);
  const fully = paid.gte(o.total);
  await query("UPDATE orders SET amount_paid = :p, payment_status = :s WHERE id = :id", { p: paid.toFixed(2), s: fully ? "paid" : o.payment_status === "failed" ? "unpaid" : o.payment_status, id: o.id }, conn);
  if (fully && PAYABLE_STATUSES.includes(o.status)) await orders.setStatus(conn, o.id, "confirmed", { note, actorId: actor });
  else if (["cancelled", "refunded"].includes(o.status)) monitor.event("payment_failure", `Payment received on ${o.status} order ${o.order_number} — refund or reinstate it.`, { paymentId: String(paymentId) });
  await events.emit("payment.captured", { orderId: o.id, paymentId, fullyPaid: fully }, conn, { key: String(paymentId) });
}

/** Browser handler callback. Signature proves authenticity; the API fetch proves state and amount. */
async function verifyCheckout(req, orderRow, body) {
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  const intent = await one("SELECT * FROM payment_intents WHERE provider = 'razorpay' AND provider_order_id = :p AND order_id = :o", { p: orderId, o: orderRow.id });
  if (!intent) throw badRequest("This payment does not belong to this order.");
  if (!rzp.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    monitor.event("payment_failure", `Invalid Razorpay checkout signature for ${orderRow.order_number}`, { paymentId });
    await audit.record({ req, action: "payment.signature_invalid", entityType: "order", entityId: orderRow.order_number, after: { paymentId } });
    throw badRequest("Payment verification failed. If money was deducted, it will be reconciled automatically — please contact us with your order number.");
  }
  await query("UPDATE payment_intents SET status = IF(status = 'created', 'attempted', status) WHERE id = :id", { id: intent.id });
  let entity;
  try {
    entity = await rzp.api.fetchPayment(paymentId);
  } catch (err) {
    log.warn("[payments] fetch after checkout failed; webhook/reconciliation will complete it", { err: err.message });
    return { status: "processing", message: "Payment received by the gateway and is being confirmed. You'll get an email shortly." };
  }
  if (entity.order_id !== orderId) throw badRequest("Payment does not match this order.");
  if (entity.status === "authorized") entity = await captureAuthorized(entity, intent);
  if (entity.status !== "captured") {
    if (entity.status === "failed") await recordFailure(entity);
    return { status: entity.status === "failed" ? "failed" : "processing", message: entity.status === "failed" ? entity.error_description || "Payment failed." : "Payment is being confirmed." };
  }
  const res = await applyGatewayPayment(entity, { via: "checkout_signature" });
  await query("UPDATE payments SET signature = :s WHERE provider = 'razorpay' AND provider_payment_id = :p", { s: signature, p: paymentId });
  return { status: "paid", ...res };
}

async function captureAuthorized(entity, intent) {
  try {
    return await rzp.api.capture(entity.id, { amount: Number(entity.amount), currency: entity.currency });
  } catch (err) {
    // Already captured by auto-capture or a concurrent webhook → re-fetch.
    const again = await rzp.api.fetchPayment(entity.id).catch(() => null);
    if (again && again.status === "captured") return again;
    log.warn("[payments] capture failed", { payment: entity.id, intent: intent.id, err: err.message });
    return entity;
  }
}

async function recordFailure(entity) {
  await tx(async (conn) => {
    const intent = await one("SELECT * FROM payment_intents WHERE provider = 'razorpay' AND provider_order_id = :p FOR UPDATE", { p: entity.order_id }, conn);
    if (!intent) return;
    const cur = await currencyInfo(entity.currency || intent.currency, conn);
    await query(
      `INSERT INTO payments (order_id, intent_id, provider, provider_order_id, provider_payment_id, status, amount, currency, method, error_code, error_description, verified_via)
       VALUES (:o, :i, 'razorpay', :po, :pp, 'failed', :a, :c, :m, :ec, :ed, 'webhook')
       ON DUPLICATE KEY UPDATE status = IF(status IN ('captured','refunded','partially_refunded'), status, 'failed'), error_code = VALUES(error_code), error_description = VALUES(error_description)`,
      { o: intent.order_id, i: intent.id, po: entity.order_id, pp: entity.id, a: fromMinor(entity.amount || 0, cur.decimals), c: cur.code, m: entity.method || null, ec: String(entity.error_code || "").slice(0, 80) || null, ed: String(entity.error_description || "").slice(0, 500) || null },
      conn
    );
    const o = await one("SELECT * FROM orders WHERE id = :id FOR UPDATE", { id: intent.order_id }, conn);
    if (o.status === "pending_payment" && o.payment_status !== "paid") {
      await orders.setStatus(conn, o.id, "payment_failed", { note: `Payment attempt failed: ${entity.error_description || entity.error_code || "declined"}` });
      await query("UPDATE orders SET payment_status = 'failed' WHERE id = :id", { id: o.id }, conn);
      await events.emit("payment.failed", { orderId: o.id, reason: entity.error_description || "" }, conn, { key: `${entity.id}` });
    }
  });
}

/** Webhook entry point. Returns an HTTP status + body; stores every verified event once. */
async function handleWebhook(rawBody, headers) {
  const signature = headers["x-razorpay-signature"];
  const ok = rzp.verifyWebhookSignature(rawBody, signature);
  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    payload = null;
  }
  if (!ok || !payload) {
    monitor.event("webhook_failure", "Rejected Razorpay webhook: invalid signature or body", { hasSignature: Boolean(signature) });
    return { status: 400, body: { error: "Invalid signature." } };
  }
  const eventId = String(headers["x-razorpay-event-id"] || `${payload.event}:${(payload.payload && payload.payload.payment && payload.payload.payment.entity && payload.payload.payment.entity.id) || payload.created_at}`).slice(0, 100);
  const ins = await query("INSERT IGNORE INTO payment_events (provider, event_id, event_type, signature_ok, payload_json) VALUES ('razorpay', :id, :t, 1, :p)", { id: eventId, t: String(payload.event || "unknown").slice(0, 80), p: JSON.stringify(redact(payload)) });
  if (!ins.affectedRows) {
    const prev = await one("SELECT status FROM payment_events WHERE provider = 'razorpay' AND event_id = :id", { id: eventId });
    if (!prev || prev.status !== "failed") return { status: 200, body: { ok: true, duplicate: true } };
    // A previously failed event is re-processed on Razorpay's retry.
  }
  try {
    const result = await processEvent(payload);
    await query("UPDATE payment_events SET status = :s, processed_at = CURRENT_TIMESTAMP(3) WHERE provider = 'razorpay' AND event_id = :id", { s: result && result.ignored ? "ignored" : "processed", id: eventId });
    return { status: 200, body: { ok: true } };
  } catch (err) {
    await query("UPDATE payment_events SET status = 'failed', error = :e WHERE provider = 'razorpay' AND event_id = :id", { e: String(err.message).slice(0, 1000), id: eventId });
    monitor.event("webhook_failure", `Razorpay ${payload.event} processing failed: ${err.message}`, { eventId });
    // 500 → Razorpay retries; a 'failed' row is re-processed on the retry.
    return { status: 500, body: { error: "Processing failed; will retry." } };
  }
}

/** Keep only what reconciliation needs; never store card/bank/VPA details. */
function redact(p) {
  const pick = (e) => (e ? { id: e.id, entity: e.entity, order_id: e.order_id, payment_id: e.payment_id, amount: e.amount, currency: e.currency, status: e.status, method: e.method, international: e.international, fee: e.fee, tax: e.tax, error_code: e.error_code, error_description: e.error_description, created_at: e.created_at } : undefined);
  const pl = p.payload || {};
  return { event: p.event, created_at: p.created_at, payload: { payment: pl.payment ? { entity: pick(pl.payment.entity) } : undefined, order: pl.order ? { entity: pick(pl.order.entity) } : undefined, refund: pl.refund ? { entity: pick(pl.refund.entity) } : undefined } };
}

async function processEvent(p) {
  const pay = p.payload && p.payload.payment && p.payload.payment.entity;
  switch (p.event) {
    case "payment.captured":
    case "order.paid":
      if (pay && pay.status === "captured") return applyGatewayPayment(pay, { via: "webhook" });
      return { ignored: true };
    case "payment.authorized": {
      if (!pay) return { ignored: true };
      const intent = await one("SELECT * FROM payment_intents WHERE provider = 'razorpay' AND provider_order_id = :p", { p: pay.order_id });
      if (!intent) return { ignored: true };
      const captured = await captureAuthorized(pay, intent);
      if (captured.status === "captured") return applyGatewayPayment(captured, { via: "webhook" });
      return { ignored: true };
    }
    case "payment.failed":
      if (pay) await recordFailure(pay);
      return {};
    case "refund.processed":
    case "refund.failed": {
      const r = p.payload.refund && p.payload.refund.entity;
      if (!r) return { ignored: true };
      const row = await one("SELECT id FROM refunds WHERE provider_refund_id = :id", { id: r.id });
      if (!row) return { ignored: true };
      if (p.event === "refund.processed") await markRefundProcessed(row.id);
      else await query("UPDATE refunds SET status = 'failed', error = :e WHERE id = :id AND status = 'pending'", { e: "Gateway reported refund failure", id: row.id });
      return {};
    }
    default:
      return { ignored: true };
  }
}

/** Bank transfer / cheque / manual receipt recorded by finance staff (audited). */
async function recordManual(req, orderNumber, body) {
  const amount = String(body.amount || "").trim();
  let d;
  try {
    d = D(amount);
  } catch {
    d = null;
  }
  if (!d || !d.isFinite() || !d.gt(0)) throw badRequest("Enter the amount received.");
  const reference = String(body.reference || "").trim().slice(0, 120);
  if (reference.length < 3) throw badRequest("Enter the bank/UTR reference.");
  const provider = ["bank_transfer", "manual"].includes(body.provider) ? body.provider : "bank_transfer";
  return tx(async (conn) => {
    const o = await one("SELECT * FROM orders WHERE order_number = :n FOR UPDATE", { n: orderNumber }, conn);
    if (!o) throw notFound("Order not found.");
    const cur = await currencyInfo(o.currency, conn);
    if (d.decimalPlaces() > cur.decimals) throw badRequest(`${o.currency} amounts have ${cur.decimals} decimals.`);
    if (d.gt(balanceDue(o)) && !body.allowOverpayment) throw conflict(`Amount exceeds the balance due (${balanceDue(o).toFixed(cur.decimals)} ${o.currency}).`);
    const dup = await one("SELECT id FROM payments WHERE provider = :p AND provider_payment_id = :r", { p: provider, r: reference }, conn);
    if (dup) throw conflict("A payment with this reference is already recorded.");
    const ins = await query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, reference, status, amount, currency, method, recorded_by, verified_via, notes, paid_at)
       VALUES (:o, :p, :r, :r, 'captured', :a, :c, :m, :u, 'manual', :n, COALESCE(:at, CURRENT_TIMESTAMP(3)))`,
      { o: o.id, p: provider, r: reference, a: d.toFixed(cur.decimals), c: o.currency, m: String(body.method || provider).slice(0, 30), u: req.user.id, n: String(body.note || "").slice(0, 1000), at: /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn || "") ? body.paidOn : null },
      conn
    );
    await creditOrder(conn, o, d.toFixed(cur.decimals), o.currency, { paymentId: ins.insertId, actor: req.user.id, note: `${provider.replace("_", " ")} ${reference} recorded by ${req.user.email}` });
    await audit.record({ req, action: "payment.record_manual", entityType: "order", entityId: o.order_number, after: { amount: d.toFixed(cur.decimals), currency: o.currency, reference } }, conn);
    return { paymentId: ins.insertId };
  });
}

/** Refund (full or partial). Idempotent by key; gateway call happens outside the DB transaction. */
async function refund(req, paymentId, body) {
  const key = String(body.idempotencyKey || "").slice(0, 100);
  if (!/^[\w:-]{8,100}$/.test(key)) throw badRequest("Missing refund idempotency key.");
  const reason = String(body.reason || "").trim().slice(0, 500);
  if (reason.length < 3) throw badRequest("Give a reason for the refund.");
  const dup = await one("SELECT * FROM refunds WHERE idempotency_key = :k", { k: key });
  if (dup) return { refundId: dup.id, status: dup.status, duplicate: true };

  const prepared = await tx(async (conn) => {
    const p = await one("SELECT * FROM payments WHERE id = :id FOR UPDATE", { id: paymentId }, conn);
    if (!p) throw notFound("Payment not found.");
    if (!["captured", "partially_refunded"].includes(p.status)) throw conflict("Only captured payments can be refunded.");
    const cur = await currencyInfo(p.currency, conn);
    const pending = await one("SELECT COALESCE(SUM(amount), 0) AS s FROM refunds WHERE payment_id = :p AND status = 'pending'", { p: p.id }, conn);
    const refundable = D(p.amount).minus(p.amount_refunded).minus(pending.s);
    let amt;
    try {
      amt = body.amount === undefined || body.amount === null || body.amount === "" ? refundable : D(body.amount);
    } catch {
      throw badRequest("Refund amount must be a number.");
    }
    if (!amt.gt(0) || amt.decimalPlaces() > cur.decimals) throw badRequest("Enter a valid refund amount.");
    if (amt.gt(refundable)) throw conflict(`At most ${refundable.toFixed(cur.decimals)} ${p.currency} can be refunded on this payment.`);
    const manual = p.provider !== "razorpay";
    if (manual && String(body.reference || "").trim().length < 3) throw badRequest("Enter the bank reference of the refund you sent.");
    const ins = await query(
      "INSERT INTO refunds (payment_id, order_id, amount, currency, status, reason, idempotency_key, created_by, provider_refund_id) VALUES (:p, :o, :a, :c, 'pending', :r, :k, :u, :pr)",
      { p: p.id, o: p.order_id, a: amt.toFixed(cur.decimals), c: p.currency, r: reason, k: key, u: req.user.id, pr: manual ? `manual:${String(body.reference).trim().slice(0, 50)}` : null },
      conn
    );
    const o = await one("SELECT order_number FROM orders WHERE id = :id", { id: p.order_id }, conn);
    await audit.record({ req, action: "payment.refund", entityType: "order", entityId: o.order_number, after: { paymentId: String(p.id), amount: amt.toFixed(cur.decimals), currency: p.currency }, reason }, conn);
    return { refundId: ins.insertId, payment: p, amountMinor: toMinor(amt, cur.decimals), manual };
  });

  if (prepared.manual) {
    await markRefundProcessed(prepared.refundId);
    return { refundId: prepared.refundId, status: "processed" };
  }
  try {
    const r = await rzp.api.refund(prepared.payment.provider_payment_id, { amount: Number(prepared.amountMinor), receipt: `REF-${prepared.refundId}`, notes: { ixitek_refund: String(prepared.refundId) } });
    await query("UPDATE refunds SET provider_refund_id = :id WHERE id = :rid", { id: r.id, rid: prepared.refundId });
    if (r.status === "processed") await markRefundProcessed(prepared.refundId);
    return { refundId: prepared.refundId, status: r.status === "processed" ? "processed" : "pending" };
  } catch (err) {
    await query("UPDATE refunds SET status = 'failed', error = :e WHERE id = :id", { e: String(err.message).slice(0, 500), id: prepared.refundId });
    monitor.event("payment_failure", `Refund ${prepared.refundId} failed: ${err.message}`, {});
    throw err;
  }
}

async function markRefundProcessed(refundId) {
  await tx(async (conn) => {
    const r = await one("SELECT * FROM refunds WHERE id = :id FOR UPDATE", { id: refundId }, conn);
    if (!r || r.status === "processed") return;
    await query("UPDATE refunds SET status = 'processed', processed_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: r.id }, conn);
    const p = await one("SELECT * FROM payments WHERE id = :id FOR UPDATE", { id: r.payment_id }, conn);
    const pRef = D(p.amount_refunded).plus(r.amount);
    await query("UPDATE payments SET amount_refunded = :a, status = :s WHERE id = :id", { a: pRef.toFixed(2), s: pRef.gte(p.amount) ? "refunded" : "partially_refunded", id: p.id }, conn);
    const o = await one("SELECT * FROM orders WHERE id = :id FOR UPDATE", { id: r.order_id }, conn);
    const oRef = D(o.amount_refunded).plus(r.amount);
    const full = oRef.gte(o.amount_paid);
    await query("UPDATE orders SET amount_refunded = :a, payment_status = :s WHERE id = :id", { a: oRef.toFixed(2), s: full ? "refunded" : "partially_refunded", id: o.id }, conn);
    if (o.status === "returned" || o.status === "partially_refunded") await orders.setStatus(conn, o.id, full ? "refunded" : "partially_refunded", { note: `Refund ${r.amount} ${r.currency}` });
    await events.emit("refund.processed", { refundId: r.id, orderId: o.id }, conn, { key: String(r.id) });
  });
}

/** Reconciliation: settle intents whose browser callback never arrived (closed tab, network loss). */
async function reconcile() {
  if (!rzp.isConfigured()) return { skipped: "razorpay not configured" };
  const intents = await query(
    "SELECT * FROM payment_intents WHERE provider = 'razorpay' AND status IN ('created','attempted') AND created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 5 MINUTE) AND created_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY) ORDER BY id LIMIT 200"
  );
  let settled = 0;
  let failed = 0;
  for (const it of intents) {
    try {
      const list = await rzp.api.fetchOrderPayments(it.provider_order_id);
      for (const pay of (list && list.items) || []) {
        if (pay.status === "captured") (await applyGatewayPayment(pay, { via: "reconciliation" }), settled++);
        else if (pay.status === "authorized") {
          const c = await captureAuthorized(pay, it);
          if (c.status === "captured") (await applyGatewayPayment(c, { via: "reconciliation" }), settled++);
        } else if (pay.status === "failed") (await recordFailure(pay), failed++);
      }
    } catch (err) {
      monitor.event("payment_failure", `Reconciliation failed for ${it.provider_order_id}: ${err.message}`, {});
    }
  }
  await query("UPDATE payment_intents SET status = 'expired' WHERE status IN ('created','attempted') AND created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)");
  return { checked: intents.length, settled, failed };
}
require("../../core/jobs.js").register("payments.reconcile", reconcile);

/** Payments + refunds for admin (fees visible only here). */
async function adminPayments(orderId) {
  const pays = await query("SELECT * FROM payments WHERE order_id = :o ORDER BY id", { o: orderId });
  const refunds = await query("SELECT r.*, u.email AS created_by_email FROM refunds r LEFT JOIN users u ON u.id = r.created_by WHERE r.order_id = :o ORDER BY r.id", { o: orderId });
  return {
    payments: pays.map((p) => ({
      id: String(p.id), provider: p.provider, providerOrderId: p.provider_order_id, providerPaymentId: p.provider_payment_id, reference: p.reference, status: p.status, amount: p.amount, currency: p.currency,
      amountRefunded: p.amount_refunded, method: p.method, international: p.international === null ? null : Boolean(p.international), paymentGatewayFee: p.payment_gateway_fee, paymentGatewayTax: p.payment_gateway_tax,
      merchantPaymentCost: p.merchant_payment_cost, feeSource: p.fee_source, verifiedVia: p.verified_via, errorCode: p.error_code, errorDescription: p.error_description, notes: p.notes, paidAt: p.paid_at, createdAt: p.created_at,
    })),
    refunds: refunds.map((r) => ({ id: String(r.id), paymentId: String(r.payment_id), providerRefundId: r.provider_refund_id, amount: r.amount, currency: r.currency, status: r.status, reason: r.reason, error: r.error, createdBy: r.created_by_email, createdAt: r.created_at, processedAt: r.processed_at })),
  };
}

void json;
void forbidden;
module.exports = { startRazorpay, verifyCheckout, applyGatewayPayment, handleWebhook, recordManual, refund, markRefundProcessed, reconcile, adminPayments, balanceDue, toMinor, fromMinor, feeFor };
