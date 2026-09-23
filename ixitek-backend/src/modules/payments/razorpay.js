// razorpay.js — thin, dependency-free client for the Razorpay REST API
// (Orders, Payments, Capture, Refunds) plus signature verification.
// Docs: https://razorpay.com/docs/api/ — amounts are in the currency's
// smallest unit. Card data never touches IXITEK servers (Checkout handles it).
const crypto = require("crypto");
const { AppError } = require("../../core/errors.js");

const cfg = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || "",
  keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  // Overridable only so tests can point at a local stub of the documented API.
  base: (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1").replace(/\/$/, ""),
  timeoutMs: Number(process.env.RAZORPAY_TIMEOUT_MS || 15000),
});

function isConfigured() {
  const c = cfg();
  return Boolean(c.keyId && c.keySecret);
}

function mode() {
  const id = cfg().keyId;
  if (!id) return "disabled";
  return id.startsWith("rzp_live_") ? "live" : "test";
}

class GatewayError extends AppError {
  constructor(message, { status = 502, code = "GATEWAY_ERROR", gatewayCode = null, gatewayStatus = null } = {}) {
    super(status, code, message);
    this.gatewayCode = gatewayCode;
    this.gatewayStatus = gatewayStatus;
  }
}

async function call(method, path, body, { fetchImpl = fetch, headers = {} } = {}) {
  const c = cfg();
  if (!c.keyId || !c.keySecret) throw new GatewayError("Online payment is not configured.", { status: 503, code: "PAYMENTS_DISABLED" });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), c.timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${c.base}${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}`, "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
  } catch (err) {
    throw new GatewayError(`Payment gateway unreachable (${err.name === "AbortError" ? "timeout" : err.message}).`);
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new GatewayError(e.description || `Payment gateway error (HTTP ${res.status}).`, { status: res.status >= 500 ? 502 : 400, gatewayCode: e.code || null, gatewayStatus: res.status });
  }
  return data;
}

const api = {
  createOrder: ({ amount, currency, receipt, notes }, o) => call("POST", "/orders", { amount, currency, receipt, notes, payment_capture: 1 }, o),
  fetchOrder: (id, o) => call("GET", `/orders/${encodeURIComponent(id)}`, null, o),
  fetchOrderPayments: (id, o) => call("GET", `/orders/${encodeURIComponent(id)}/payments`, null, o),
  fetchPayment: (id, o) => call("GET", `/payments/${encodeURIComponent(id)}`, null, o),
  capture: (id, { amount, currency }, o) => call("POST", `/payments/${encodeURIComponent(id)}/capture`, { amount, currency }, o),
  refund: (id, { amount, receipt, notes }, o) => call("POST", `/payments/${encodeURIComponent(id)}/refund`, { amount, receipt, notes, speed: "normal" }, o),
  fetchRefund: (paymentId, refundId, o) => call("GET", `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`, null, o),
};

function hmacHex(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !/^[0-9a-f]+$/i.test(a)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const secret = cfg().keySecret;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), String(signature));
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret) in X-Razorpay-Signature. */
function verifyWebhookSignature(rawBody, signature) {
  const secret = cfg().webhookSecret;
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), String(signature));
}

module.exports = { cfg, isConfigured, mode, api, verifyCheckoutSignature, verifyWebhookSignature, hmacHex, GatewayError };
