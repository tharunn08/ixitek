// Payment, invoice and document routes.
//   publicRouter  → /api/pay            (customer: pay, verify, download PDFs)
//   webhookRouter → /api/webhooks       (raw body, mounted BEFORE express.json)
//   adminRouter   → /api/admin/finance  (payments, refunds, invoices, email log, settings)
const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, one } = require("../../core/db.js");
const { optionalAuth, requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const audit = require("../../core/audit.js");
const settings = require("../../core/settings.js");
const pay = require("./paymentService.js");
const rzp = require("./razorpay.js");
const orders = require("../commerce/orderService.js");
const invoices = require("../documents/invoiceService.js");
const email = require("../email/emailService.js");
const { ah, badRequest, notFound } = require("../../core/errors.js");

// ── Public ────────────────────────────────────────────────────────────────
const publicRouter = express.Router();
publicRouter.use(optionalAuth, (req, res, next) => (res.set("Cache-Control", "private, no-store"), next()));
const payLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

async function orderFor(req, number) {
  const o = await one("SELECT id, order_number, user_id, company_id, access_token, status, payment_status FROM orders WHERE order_number = :n", { n: String(number) });
  if (!o || !(await orders.canView(req, o, req.query.token || (req.body && req.body.token) || req.get("x-order-token")))) throw notFound("Order not found.");
  return o;
}

publicRouter.get("/config", ah(async (req, res) => {
  res.json({
    razorpay: { enabled: rzp.isConfigured(), mode: rzp.mode(), keyId: rzp.isConfigured() ? rzp.cfg().keyId : null },
    // Public business text entered by IXITEK in Admin → Finance → Business settings (empty until configured).
    bankTransferInstructions: String((await settings.get("commerce.bank_transfer_instructions", "")) || ""),
    termsUrl: String((await settings.get("commerce.terms_url", "")) || ""),
    returnInstructions: String((await settings.get("support.return_instructions", "")) || ""),
  });
}));

publicRouter.post("/orders/:number/razorpay", payLimiter, ah(async (req, res) => {
  const o = await orderFor(req, req.params.number);
  res.json(await pay.startRazorpay(req, o));
}));

publicRouter.post("/orders/:number/razorpay/verify", payLimiter, ah(async (req, res) => {
  const o = await orderFor(req, req.params.number);
  const out = await pay.verifyCheckout(req, o, req.body || {});
  res.json({ ...out, order: await orders.orderJson(o.id) });
}));

// Proforma for an unpaid order (bank transfer / PO). Issued once, then re-rendered from its snapshot.
publicRouter.get("/orders/:number/proforma.pdf", ah(async (req, res) => {
  const o = await orderFor(req, req.params.number);
  if (["cancelled"].includes(o.status)) throw badRequest("This order is cancelled.");
  const { invoiceNumber } = await invoices.issue(o.id, "proforma", { req });
  sendPdf(res, `${invoiceNumber}.pdf`, await invoices.renderInvoicePdf(await invoices.byNumber(invoiceNumber)));
}));

publicRouter.get("/orders/:number/invoices/:invoice.pdf", ah(async (req, res) => {
  const o = await orderFor(req, req.params.number);
  const inv = await invoices.byNumber(req.params.invoice);
  if (String(inv.order_id) !== String(o.id)) throw notFound("Invoice not found.");
  sendPdf(res, `${inv.invoice_number}.pdf`, await invoices.renderInvoicePdf(inv));
}));

publicRouter.get("/quotes/:number.pdf", ah(async (req, res) => {
  const q = await one("SELECT id, quote_number, user_id, company_id, customer_email, access_token, current_version FROM quotes WHERE quote_number = :n", { n: String(req.params.number).replace(/-V\d+$/, "") });
  const token = String(req.query.token || "");
  const crypto = require("crypto");
  const tokenOk = q && token.length === q.access_token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(q.access_token));
  const userOk = q && req.user && (Number(q.user_id) === Number(req.user.id) || q.customer_email === req.user.email || (q.company_id && Number(q.company_id) === Number(req.user.company_id)));
  const staffOk = q && req.user && (await can(req.user, "quotes.manage"));
  if (!q || !(tokenOk || userOk || staffOk)) throw notFound("Quotation not found.");
  const version = Number(req.query.version) || q.current_version;
  const v = await one("SELECT status FROM quote_versions WHERE quote_id = :q AND version = :v", { q: q.id, v: version });
  if (!v || (v.status === "draft" && !staffOk)) throw notFound("Quotation not found.");
  sendPdf(res, `${q.quote_number}-V${version}.pdf`, await invoices.renderQuotePdf(q.id, version));
}));

function sendPdf(res, filename, buf) {
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename.replace(/[^\w.-]/g, "_")}"`, "Content-Length": buf.length, "X-Content-Type-Options": "nosniff" });
  res.send(buf);
}

// ── Webhooks (raw body for HMAC) ─────────────────────────────────────────
const webhookRouter = express.Router();
webhookRouter.post("/razorpay", express.raw({ type: "*/*", limit: "1mb" }), ah(async (req, res) => {
  const out = await pay.handleWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.from(""), req.headers);
  res.status(out.status).json(out.body);
}));

// ── Admin ────────────────────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(requireAuth, requirePermission("admin.access"));

async function orderIdByNumber(n) {
  const o = await one("SELECT id FROM orders WHERE order_number = :n", { n: String(n) });
  if (!o) throw notFound("Order not found.");
  return o.id;
}

adminRouter.get("/status", requirePermission("finance.read"), ah(async (req, res) => {
  const seller = await invoices.sellerReady();
  const pending = await one("SELECT COUNT(*) AS c FROM email_messages WHERE status IN ('queued','sending','failed')");
  res.json({ razorpay: { configured: rzp.isConfigured(), mode: rzp.mode(), webhookSecretSet: Boolean(rzp.cfg().webhookSecret) }, email: { ...email.status(), notSent: Number(pending.c) }, seller: { ready: seller.ready, missing: seller.missing } });
}));

adminRouter.get("/orders/:number/payments", requirePermission("orders.read"), ah(async (req, res) => {
  const id = await orderIdByNumber(req.params.number);
  const out = await pay.adminPayments(id);
  if (!(await can(req.user, "finance.read"))) out.payments.forEach((p) => ((p.paymentGatewayFee = undefined), (p.paymentGatewayTax = undefined), (p.merchantPaymentCost = undefined)));
  const invs = await query("SELECT * FROM invoices WHERE order_id = :o ORDER BY id", { o: id });
  res.json({ ...out, invoices: invs.map((i) => invoices.invoiceJson(i, { internal: true })) });
}));

adminRouter.post("/orders/:number/payments", requirePermission("payments.record"), ah(async (req, res) => {
  const out = await pay.recordManual(req, req.params.number, req.body || {});
  res.status(201).json(out);
}));

adminRouter.post("/payments/:id/refund", requirePermission("payments.refund"), ah(async (req, res) => {
  res.status(201).json(await pay.refund(req, req.params.id, req.body || {}));
}));

adminRouter.post("/orders/:number/invoices", requirePermission("finance.manage"), ah(async (req, res) => {
  const id = await orderIdByNumber(req.params.number);
  const type = String((req.body && req.body.type) || "tax_invoice");
  if (!["tax_invoice", "proforma"].includes(type)) throw badRequest("Credit notes are issued from refunds.");
  if (type === "tax_invoice") {
    const o = await one("SELECT payment_status, payment_method, status FROM orders WHERE id = :id", { id });
    if (o.payment_status !== "paid" && o.payment_method !== "purchase_order") throw badRequest("A tax invoice is issued once the order is paid (or for purchase-order customers).");
    if (o.status === "cancelled") throw badRequest("The order is cancelled.");
  }
  res.status(201).json(await invoices.issue(id, type, { req }));
}));

adminRouter.post("/invoices/:number/void", requirePermission("finance.manage"), ah(async (req, res) => {
  await invoices.voidInvoice(req, req.params.number, req.body && req.body.reason);
  res.json({ ok: true });
}));

adminRouter.get("/invoices", requirePermission("finance.read"), ah(async (req, res) => {
  const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const off = (Math.max(Number(req.query.page) || 1, 1) - 1) * lim;
  const where = ["1=1"];
  const p = {};
  if (req.query.type) (where.push("i.invoice_type = :t"), (p.t = String(req.query.type)));
  if (req.query.q) (where.push("(i.invoice_number LIKE :q OR o.order_number LIKE :q OR o.customer_email LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
  const rows = await query(`SELECT i.*, o.order_number, o.customer_name FROM invoices i JOIN orders o ON o.id = i.order_id WHERE ${where.join(" AND ")} ORDER BY i.id DESC LIMIT ${lim} OFFSET ${off}`, p);
  const total = await one(`SELECT COUNT(*) c FROM invoices i JOIN orders o ON o.id = i.order_id WHERE ${where.join(" AND ")}`, p);
  res.json({ total: Number(total.c), invoices: rows.map((r) => ({ ...invoices.invoiceJson(r, { internal: true }), orderNumber: r.order_number, customer: r.customer_name })) });
}));

adminRouter.get("/invoices/:number.pdf", requirePermission("orders.read"), ah(async (req, res) => {
  const inv = await invoices.byNumber(req.params.number);
  sendPdf(res, `${inv.invoice_number}.pdf`, await invoices.renderInvoicePdf(inv));
}));

// Reconciliation view: every gateway payment with fees (finance only).
adminRouter.get("/payments", requirePermission("finance.read"), ah(async (req, res) => {
  const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const off = (Math.max(Number(req.query.page) || 1, 1) - 1) * lim;
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("p.status = :s"), (p.s = String(req.query.status)));
  if (req.query.provider) (where.push("p.provider = :pr"), (p.pr = String(req.query.provider)));
  if (req.query.from) (where.push("p.created_at >= :f"), (p.f = String(req.query.from)));
  if (req.query.to) (where.push("p.created_at < DATE_ADD(:to, INTERVAL 1 DAY)"), (p.to = String(req.query.to)));
  const w = where.join(" AND ");
  const rows = await query(`SELECT p.*, o.order_number FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${w} ORDER BY p.id DESC LIMIT ${lim} OFFSET ${off}`, p);
  const sums = await query(`SELECT p.currency, SUM(p.amount) AS amount, SUM(p.amount_refunded) AS refunded, SUM(COALESCE(p.merchant_payment_cost, 0)) AS cost, COUNT(*) AS n FROM payments p WHERE ${w} AND p.status IN ('captured','partially_refunded','refunded') GROUP BY p.currency`, p);
  const total = await one(`SELECT COUNT(*) c FROM payments p WHERE ${w}`, p);
  const events = await query("SELECT event_id, event_type, status, error, received_at FROM payment_events ORDER BY id DESC LIMIT 20");
  res.json({
    total: Number(total.c),
    payments: rows.map((r) => ({ id: String(r.id), orderNumber: r.order_number, provider: r.provider, providerPaymentId: r.provider_payment_id, reference: r.reference, status: r.status, amount: r.amount, currency: r.currency, amountRefunded: r.amount_refunded, method: r.method, paymentGatewayFee: r.payment_gateway_fee, paymentGatewayTax: r.payment_gateway_tax, merchantPaymentCost: r.merchant_payment_cost, feeSource: r.fee_source, verifiedVia: r.verified_via, createdAt: r.created_at })),
    totals: sums.map((s) => ({ currency: s.currency, count: Number(s.n), amount: s.amount, refunded: s.refunded, merchantPaymentCost: s.cost })),
    recentWebhooks: events,
  });
}));

adminRouter.post("/reconcile", requirePermission("finance.manage"), ah(async (req, res) => {
  const out = await pay.reconcile();
  await audit.record({ req, action: "payments.reconcile", entityType: "payments", entityId: "razorpay", after: out });
  res.json(out);
}));

// ── Email log ──
adminRouter.get("/emails", requirePermission("email.manage"), ah(async (req, res) => {
  const lim = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const off = (Math.max(Number(req.query.page) || 1, 1) - 1) * lim;
  const where = ["1=1"];
  const p = {};
  if (req.query.status) (where.push("status = :s"), (p.s = String(req.query.status)));
  if (req.query.q) (where.push("(to_email LIKE :q OR subject LIKE :q OR related_id LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 80)}%`));
  const rows = await query(`SELECT id, template, to_email, subject, status, provider, attempts, last_error, related_type, related_id, resend_of, created_at, sent_at FROM email_messages WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${lim} OFFSET ${off}`, p);
  const total = await one(`SELECT COUNT(*) c FROM email_messages WHERE ${where.join(" AND ")}`, p);
  res.json({ total: Number(total.c), status: email.status(), emails: rows.map((r) => ({ id: String(r.id), template: r.template, to: r.to_email, subject: r.subject, status: r.status, provider: r.provider, attempts: r.attempts, lastError: r.last_error, related: r.related_type ? { type: r.related_type, id: r.related_id } : null, resendOf: r.resend_of ? String(r.resend_of) : null, createdAt: r.created_at, sentAt: r.sent_at })) });
}));

adminRouter.get("/emails/:id", requirePermission("email.manage"), ah(async (req, res) => {
  const m = await one("SELECT id, template, to_email, subject, body_html, status, last_error, created_at, sent_at FROM email_messages WHERE id = :id", { id: req.params.id });
  if (!m) throw notFound("Email not found.");
  res.json({ email: { id: String(m.id), template: m.template, to: m.to_email, subject: m.subject, html: m.body_html, status: m.status, lastError: m.last_error, createdAt: m.created_at, sentAt: m.sent_at } });
}));

adminRouter.post("/emails/:id/resend", requirePermission("email.manage"), ah(async (req, res) => {
  const id = await email.resend(req.params.id, req.user.id, req.body && req.body.to);
  if (!id) throw notFound("Email not found.");
  await audit.record({ req, action: "email.resend", entityType: "email", entityId: req.params.id, after: { newId: String(id), to: req.body && req.body.to } });
  res.status(201).json({ id: String(id) });
}));

// ── GST report (tax invoices and credit notes with Indian GST) ──
// Invoice-wise register and HSN summary for the accountant's GSTR-1 preparation.
adminRouter.get("/gst-report", requirePermission("finance.read"), ah(async (req, res) => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(String(req.query.from || "")) ? req.query.from : new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = iso.test(String(req.query.to || "")) ? req.query.to : new Date().toISOString().slice(0, 10);
  if (from > to) throw badRequest("'From' must be on or before 'To'.");
  const rows = await query(
    `SELECT i.invoice_number, i.invoice_type, i.status, i.issued_at, i.currency, i.buyer_tax_id, i.place_of_supply, i.gst_supply_type, i.gst_taxable_value, i.cgst, i.sgst, i.igst, i.tax, i.total, i.snapshot_json, o.order_number, o.customer_name, o.company_name
       FROM invoices i JOIN orders o ON o.id = i.order_id
      WHERE i.invoice_type IN ('tax_invoice','credit_note') AND i.gst_supply_type IS NOT NULL AND i.issued_at >= :f AND i.issued_at < DATE_ADD(:t, INTERVAL 1 DAY)
      ORDER BY i.issued_at, i.id`,
    { f: from, t: to }
  );
  const { D } = require("../../core/money.js");
  const { json } = require("../../core/db.js");
  const gst = require("../intl/gst.js");
  const sign = (r) => (r.invoice_type === "credit_note" ? -1 : 1);
  const tot = { taxable: D(0), cgst: D(0), sgst: D(0), igst: D(0) };
  const hsn = new Map();
  const invoicesOut = rows.map((r) => {
    const live = r.status !== "void";
    const k = sign(r);
    if (live) for (const [f, c] of [["taxable", "gst_taxable_value"], ["cgst", "cgst"], ["sgst", "sgst"], ["igst", "igst"]]) tot[f] = tot[f].plus(D(r[c] || 0).times(k));
    const snap = json(r.snapshot_json, {});
    if (live) for (const h of (snap.gst && snap.gst.hsnSummary) || []) {
      const key = `${h.hsCode || ""}|${h.ratePct}`;
      const a = hsn.get(key) || { hsCode: h.hsCode, ratePct: h.ratePct, taxable: D(0), cgst: D(0), sgst: D(0), igst: D(0) };
      for (const f of ["taxable", "cgst", "sgst", "igst"]) a[f] = a[f].plus(D(h[f] || 0).times(k));
      hsn.set(key, a);
    }
    const st = gst.resolveState(r.place_of_supply);
    return {
      number: r.invoice_number, type: r.invoice_type, status: r.status, issuedAt: r.issued_at, orderNumber: r.order_number, buyer: r.company_name || r.customer_name, buyerGstin: r.buyer_tax_id || "",
      b2b: Boolean(r.buyer_tax_id), placeOfSupply: r.place_of_supply, placeOfSupplyName: st ? st.name : "", supplyType: r.gst_supply_type, currency: r.currency,
      taxable: r.gst_taxable_value, cgst: r.cgst, sgst: r.sgst, igst: r.igst, total: r.total,
    };
  });
  const f2 = (d) => d.toFixed(2);
  const out = {
    from, to, invoices: invoicesOut,
    hsnSummary: [...hsn.values()].map((h) => ({ hsCode: h.hsCode, ratePct: h.ratePct, taxable: f2(h.taxable), cgst: f2(h.cgst), sgst: f2(h.sgst), igst: f2(h.igst), totalTax: f2(h.cgst.plus(h.sgst).plus(h.igst)) })),
    totals: { taxable: f2(tot.taxable), cgst: f2(tot.cgst), sgst: f2(tot.sgst), igst: f2(tot.igst), totalTax: f2(tot.cgst.plus(tot.sgst).plus(tot.igst)) },
    note: "Credit notes are shown as negative in the totals. Void documents are listed but excluded from totals.",
  };
  if (req.query.format === "csv") {
    const esc = (v) => {
      const t = String(v ?? "");
      return /[",\n\r]|^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"` : t;
    };
    const head = ["Document", "Type", "Status", "Date", "Order", "Buyer", "Buyer GSTIN", "B2B/B2C", "Place of supply", "Supply type", "Currency", "Taxable value", "CGST", "SGST/UTGST", "IGST", "Document total"];
    const lines = [head.join(",")];
    for (const i of invoicesOut) lines.push([i.number, i.type, i.status, new Date(i.issuedAt).toISOString().slice(0, 10), i.orderNumber, i.buyer, i.buyerGstin, i.b2b ? "B2B" : "B2C", `${i.placeOfSupply}-${i.placeOfSupplyName}`, i.supplyType, i.currency, i.taxable, i.cgst, i.sgst, i.igst, i.total].map(esc).join(","));
    lines.push("", ["HSN", "GST rate %", "Taxable value", "CGST", "SGST/UTGST", "IGST", "Total tax"].join(","));
    for (const h of out.hsnSummary) lines.push([h.hsCode || "", h.ratePct, h.taxable, h.cgst, h.sgst, h.igst, h.totalTax].map(esc).join(","));
    await audit.record({ req, action: "finance.gst_report.export", entityType: "report", entityId: `${from}..${to}` });
    res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="gst-register-${from}-to-${to}.csv"`);
    return res.send(`\ufeff${lines.join("\r\n")}\r\n`);
  }
  res.json(out);
}));

// ── Business settings used on documents / emails ──
const EDITABLE = {
  "seller.legal_name": 200, "seller.address": 1000, "seller.bank_details": 1000, "seller.tax_id": 60, "seller.tax_id_label": 30, "seller.email": 254, "seller.phone": 40, "seller.state_code": 60,
  "invoice.payment_due_days": "int", "invoice.footer_note": 2000, "email.from_name": 100, "email.sales_inbox": 254,
  "commerce.bank_transfer_instructions": 2000, "commerce.terms_url": 500, "commerce.quote_validity_days": "int",
  "support.return_instructions": 2000, "email.support_inbox": 254,
};
adminRouter.get("/settings", requirePermission("finance.read"), ah(async (req, res) => {
  const out = {};
  for (const k of Object.keys(EDITABLE)) out[k] = await settings.get(k, "");
  res.json({ settings: out });
}));
adminRouter.put("/settings", requirePermission("settings.manage"), ah(async (req, res) => {
  const changes = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k === "reason") continue;
    if (!(k in EDITABLE)) throw badRequest(`Unknown setting ${k}.`);
    if (EDITABLE[k] === "int") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 365) throw badRequest(`${k} must be a whole number 0–365.`);
      changes[k] = n;
    } else changes[k] = String(v ?? "").trim().slice(0, EDITABLE[k]);
  }
  if (!Object.keys(changes).length) throw badRequest("Nothing to change.");
  // GST identity: the state code must be a GST state code and the GSTIN must be valid and belong to that state.
  const gst = require("../intl/gst.js");
  if ("seller.state_code" in changes && changes["seller.state_code"]) {
    const st = gst.resolveState(changes["seller.state_code"]);
    if (!st) throw badRequest("State code: enter the 2-digit GST state code (e.g. 27 for Maharashtra) or the state name.");
    changes["seller.state_code"] = st.code;
  }
  const label = String("seller.tax_id_label" in changes ? changes["seller.tax_id_label"] : await settings.get("seller.tax_id_label", "")).toUpperCase();
  const taxId = "seller.tax_id" in changes ? changes["seller.tax_id"] : String((await settings.get("seller.tax_id", "")) || "");
  const stateCode = "seller.state_code" in changes ? changes["seller.state_code"] : String((await settings.get("seller.state_code", "")) || "");
  if (label === "GSTIN" && taxId && ("seller.tax_id" in changes || "seller.state_code" in changes || "seller.tax_id_label" in changes)) {
    const v = gst.validateGstin(taxId);
    if (!v.valid) throw badRequest(`GSTIN: ${v.reason}`);
    if ("seller.tax_id" in changes) changes["seller.tax_id"] = v.gstin;
    if (stateCode && v.stateCode !== stateCode) throw badRequest(`The GSTIN is registered in state ${v.stateCode}, but the seller state code is ${stateCode}.`);
  }
  const before = {};
  for (const k of Object.keys(changes)) before[k] = await settings.get(k, "");
  for (const [k, v] of Object.entries(changes)) await settings.set(k, v, req.user.id);
  await audit.record({ req, action: "settings.update", entityType: "settings", entityId: "business", before, after: changes, reason: req.body.reason });
  res.json({ ok: true });
}));

module.exports = { publicRouter, webhookRouter, adminRouter };
