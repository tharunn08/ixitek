// handlers.js — business events → emails / documents. Runs in the job
// worker (never inside the request). Every email uses an idempotency key, so
// a retried event never sends the same message twice.
const events = require("../../core/events.js");
const { one, query } = require("../../core/db.js");
const settings = require("../../core/settings.js");
const monitor = require("../../core/monitor.js");
const email = require("../email/emailService.js");
const orders = require("../commerce/orderService.js");
const rq = require("../commerce/rfqQuoteService.js");
const invoices = require("../documents/invoiceService.js");

const salesInbox = async () => String((await settings.get("email.sales_inbox", "")) || process.env.SALES_INBOX || "").trim();

async function orderCtx(orderId) {
  const row = await one("SELECT id, order_number, access_token, customer_email FROM orders WHERE id = :id", { id: orderId });
  if (!row) return null;
  return { row, order: await orders.orderJson(orderId) };
}

events.on("order.placed", async ({ orderId }) => {
  const c = await orderCtx(orderId);
  if (!c) return;
  await email.queue("order_placed", c.row.customer_email, { order: c.order, token: c.row.access_token }, { key: orderId, related: { type: "order", id: c.row.order_number } });
  const inbox = await salesInbox();
  if (inbox) await email.queue("order_new_internal", inbox, { order: c.order }, { key: orderId, related: { type: "order", id: c.row.order_number } });
});

events.on("payment.captured", async ({ orderId, paymentId, fullyPaid }) => {
  const c = await orderCtx(orderId);
  const pay = await one("SELECT amount, currency FROM payments WHERE id = :id", { id: paymentId });
  if (!c || !pay) return;
  await email.queue("payment_received", c.row.customer_email, { orderNumber: c.row.order_number, amount: pay.amount, currency: pay.currency, token: c.row.access_token, fullyPaid }, { key: paymentId, related: { type: "order", id: c.row.order_number } });
  if (fullyPaid) {
    try {
      await invoices.issue(orderId, "tax_invoice");
    } catch (err) {
      // Missing seller details etc. — never blocks the payment; staff issue it from Admin.
      monitor.event("invoice_failure", `Invoice not issued for ${c.row.order_number}: ${err.message}`, {});
    }
  }
});

events.on("payment.failed", async ({ orderId, reason }) => {
  const c = await orderCtx(orderId);
  if (!c) return;
  const n = await one("SELECT COUNT(*) AS c FROM payments WHERE order_id = :o AND status = 'failed'", { o: orderId });
  await email.queue("payment_failed", c.row.customer_email, { orderNumber: c.row.order_number, reason, token: c.row.access_token }, { key: `${orderId}:${n.c}`, related: { type: "order", id: c.row.order_number } });
});

events.on("invoice.issued", async ({ invoiceNumber }) => {
  const inv = await invoices.byNumber(invoiceNumber);
  const c = await orderCtx(inv.order_id);
  if (!c) return;
  await email.queue("invoice_issued", c.row.customer_email, { invoiceNumber, type: inv.invoice_type, orderNumber: c.row.order_number, total: inv.total, currency: inv.currency, token: c.row.access_token }, { key: invoiceNumber, related: { type: "order", id: c.row.order_number }, attachments: [{ kind: "invoice", number: invoiceNumber }] });
});

events.on("order.status.cancelled", async ({ orderId }) => {
  const c = await orderCtx(orderId);
  if (!c) return;
  const h = await one("SELECT note FROM order_status_history WHERE order_id = :o AND to_status = 'cancelled' ORDER BY id DESC LIMIT 1", { o: orderId });
  await email.queue("order_cancelled", c.row.customer_email, { orderNumber: c.row.order_number, note: h ? h.note : "", token: c.row.access_token }, { key: orderId, related: { type: "order", id: c.row.order_number } });
});

events.on("refund.processed", async ({ refundId, orderId }) => {
  const c = await orderCtx(orderId);
  const r = await one("SELECT amount, currency FROM refunds WHERE id = :id", { id: refundId });
  if (!c || !r) return;
  await email.queue("refund_processed", c.row.customer_email, { orderNumber: c.row.order_number, amount: r.amount, currency: r.currency, token: c.row.access_token }, { key: refundId, related: { type: "order", id: c.row.order_number } });
  const hasInvoice = await one("SELECT id FROM invoices WHERE order_id = :o AND invoice_type = 'tax_invoice' AND status <> 'void'", { o: orderId });
  if (hasInvoice) {
    try {
      await invoices.issue(orderId, "credit_note", { refundId });
    } catch (err) {
      monitor.event("invoice_failure", `Credit note not issued for refund ${refundId}: ${err.message}`, {});
    }
  }
});

events.on("rfq.submitted", async ({ rfqId }) => {
  const rfq = await rq.rfqJson(rfqId);
  const row = await one("SELECT access_token FROM rfqs WHERE id = :id", { id: rfqId });
  if (!rfq) return;
  await email.queue("rfq_received", rfq.contact.email, { rfq, token: row.access_token }, { key: rfqId, related: { type: "rfq", id: rfq.rfqNumber } });
  const inbox = await salesInbox();
  if (inbox) await email.queue("rfq_new_internal", inbox, { rfq }, { key: rfqId, related: { type: "rfq", id: rfq.rfqNumber } });
});

events.on("rfq.info_requested", async ({ rfqId }) => {
  const r = await one("SELECT rfq_number, contact_email, access_token FROM rfqs WHERE id = :id", { id: rfqId });
  const m = await one("SELECT id, body FROM rfq_messages WHERE rfq_id = :id AND is_internal = 0 ORDER BY id DESC LIMIT 1", { id: rfqId });
  if (!r || !m) return;
  await email.queue("rfq_info_requested", r.contact_email, { rfqNumber: r.rfq_number, message: m.body, token: r.access_token }, { key: m.id, related: { type: "rfq", id: r.rfq_number } });
});

events.on("rfq.rejected", async ({ rfqId, message }) => {
  const r = await one("SELECT rfq_number, contact_email FROM rfqs WHERE id = :id", { id: rfqId });
  if (r) await email.queue("rfq_rejected", r.contact_email, { rfqNumber: r.rfq_number, message }, { key: rfqId, related: { type: "rfq", id: r.rfq_number } });
});

events.on("quote.sent", async ({ quoteId, versionId }) => {
  const quote = await rq.quoteJson(quoteId);
  const q = await one("SELECT access_token, customer_email FROM quotes WHERE id = :id", { id: quoteId });
  const version = quote.versions.find((v) => v.id === String(versionId));
  if (!version) return;
  await email.queue("quote_sent", q.customer_email, { quote, version, token: q.access_token }, { key: versionId, related: { type: "quote", id: quote.quoteNumber }, attachments: [{ kind: "quote", quoteId, version: version.version }] });
});

events.on("quote.expiring", async ({ quoteId, versionId }) => {
  const q = await one("SELECT q.quote_number, q.access_token, q.customer_email, v.version, v.valid_until FROM quotes q JOIN quote_versions v ON v.id = :v WHERE q.id = :id", { id: quoteId, v: versionId });
  if (q) await email.queue("quote_expiring", q.customer_email, { label: `${q.quote_number}-V${q.version}`, validUntil: new Date(q.valid_until).toISOString().slice(0, 10), quoteNumber: q.quote_number, token: q.access_token }, { key: versionId, related: { type: "quote", id: q.quote_number } });
});

events.on("quote.expired", async ({ quoteId }) => {
  const q = await one("SELECT quote_number, customer_email, current_version FROM quotes WHERE id = :id", { id: quoteId });
  if (q) await email.queue("quote_expired", q.customer_email, { label: `${q.quote_number}-V${q.current_version}` }, { key: `${quoteId}:${q.current_version}`, related: { type: "quote", id: q.quote_number } });
});

events.on("quote.rejected", async ({ quoteId }) => {
  const q = await one("SELECT q.quote_number, q.current_version, v.response_note FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version = q.current_version WHERE q.id = :id", { id: quoteId });
  const inbox = await salesInbox();
  if (q && inbox) await email.queue("quote_response_internal", inbox, { label: `${q.quote_number}-V${q.current_version}`, action: "rejected", note: q.response_note }, { key: `${quoteId}:${q.current_version}`, related: { type: "quote", id: q.quote_number } });
});

events.on("enquiry.created", async ({ enquiryId }) => {
  const e = await one("SELECT * FROM enquiries WHERE id = :id", { id: enquiryId });
  const inbox = await salesInbox();
  if (e && inbox) await email.queue("enquiry_new_internal", inbox, { enquiry: { type: e.type, name: e.name, email: e.email, phone: e.phone, company: e.company, category: e.category, message: e.message } }, { key: enquiryId, related: { type: "enquiry", id: enquiryId } });
});

// ── Shipping ──
async function shipmentCtx(shipmentId) {
  const sh = await one("SELECT s.*, c.name AS carrier_name FROM shipments s JOIN carriers c ON c.code = s.carrier WHERE s.id = :id", { id: shipmentId });
  if (!sh) return null;
  const o = await one("SELECT id, order_number, access_token, customer_email, payment_method, payment_status FROM orders WHERE id = :id", { id: sh.order_id });
  const items = await query("SELECT oi.sku, oi.name, si.qty FROM shipment_items si JOIN order_items oi ON oi.id = si.order_item_id WHERE si.shipment_id = :s", { s: sh.id });
  return { sh, o, items };
}
events.on("shipment.shipped", async ({ shipmentId }) => {
  const c = await shipmentCtx(shipmentId);
  if (!c) return;
  await email.queue("order_shipped", c.o.customer_email, { orderNumber: c.o.order_number, carrier: c.sh.carrier_name, trackingNumber: c.sh.tracking_number, trackingUrl: c.sh.tracking_url, token: c.o.access_token, items: c.items }, { key: shipmentId, related: { type: "order", id: c.o.order_number } });
  // Credit-terms (purchase order) customers are invoiced on dispatch.
  if (c.o.payment_method === "purchase_order") {
    try {
      await invoices.issue(c.o.id, "tax_invoice");
    } catch (err) {
      monitor.event("invoice_failure", `Invoice not issued for ${c.o.order_number}: ${err.message}`, {});
    }
  }
});
events.on("shipment.delivered", async ({ shipmentId }) => {
  const c = await shipmentCtx(shipmentId);
  if (!c) return;
  const ord = await one("SELECT status FROM orders WHERE id = :id", { id: c.o.id });
  if (ord.status === "delivered") await email.queue("order_delivered", c.o.customer_email, { orderNumber: c.o.order_number, token: c.o.access_token }, { key: c.o.id, related: { type: "order", id: c.o.order_number } });
});

// ── Returns & support ──
events.on("rma.created", async ({ rmaId }) => {
  const r = await one("SELECT r.rma_number, r.kind, o.order_number, o.customer_email, o.access_token FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.id = :id", { id: rmaId });
  if (!r) return;
  await email.queue("generic", r.customer_email, { subject: `Return request ${r.rma_number} received`, title: `We received your ${r.kind} request`, message: `Request ${r.rma_number} for order ${r.order_number} is being reviewed. We will email you with the next steps.`, cta: { label: "View order", url: require("../email/templates.js").orderLink(r.order_number, r.access_token) } }, { key: `rma:${rmaId}`, related: { type: "rma", id: r.rma_number } });
  const inbox = await salesInbox();
  if (inbox) await email.queue("generic", inbox, { subject: `New ${r.kind} request ${r.rma_number} (${r.order_number})`, title: "New return / warranty request", message: `${r.rma_number} for ${r.order_number}. Review it in Admin → Returns.` }, { key: `rma-int:${rmaId}`, related: { type: "rma", id: r.rma_number } });
});
events.on("rma.updated", async ({ rmaId, status }) => {
  const r = await one("SELECT r.rma_number, r.resolution, o.order_number, o.customer_email, o.access_token FROM rmas r JOIN orders o ON o.id = r.order_id WHERE r.id = :id", { id: rmaId });
  const ev = await one("SELECT note FROM rma_events WHERE rma_id = :id AND is_internal = 0 ORDER BY id DESC LIMIT 1", { id: rmaId });
  if (!r) return;
  const extra = status === "approved" ? String((await settings.get("support.return_instructions", "")) || "") : "";
  await email.queue("generic", r.customer_email, { subject: `Return ${r.rma_number}: ${status.replace(/_/g, " ")}`, title: `Return ${r.rma_number} — ${status.replace(/_/g, " ")}`, message: [ev && ev.note, r.resolution && status === "completed" ? `Resolution: ${r.resolution}` : "", extra].filter(Boolean).join(" ") || `Your return request is now ${status.replace(/_/g, " ")}.`, cta: { label: "View order", url: require("../email/templates.js").orderLink(r.order_number, r.access_token) } }, { key: `rma:${rmaId}:${status}`, related: { type: "rma", id: r.rma_number } });
});
events.on("ticket.created", async ({ ticketId }) => {
  const t = await one("SELECT ticket_number, access_token, email, subject FROM tickets WHERE id = :id", { id: ticketId });
  if (!t) return;
  const url = `${require("../email/templates.js").site()}/support/tickets/${t.ticket_number}?token=${t.access_token}`;
  await email.queue("generic", t.email, { subject: `[${t.ticket_number}] ${t.subject}`, title: `Support request ${t.ticket_number}`, message: "Thank you — our support team will reply here. You can add details from the link below.", cta: { label: "View ticket", url } }, { key: `ticket:${ticketId}`, related: { type: "ticket", id: t.ticket_number } });
  const inbox = String((await settings.get("email.support_inbox", "")) || "") || (await salesInbox());
  if (inbox) await email.queue("generic", inbox, { subject: `New ticket ${t.ticket_number}: ${t.subject}`, title: "New support ticket", message: `${t.ticket_number} from ${t.email}. Open Admin → Support.` }, { key: `ticket-int:${ticketId}`, related: { type: "ticket", id: t.ticket_number } });
});
events.on("ticket.replied", async ({ ticketId, messageId }) => {
  const t = await one("SELECT ticket_number, access_token, email, subject FROM tickets WHERE id = :id", { id: ticketId });
  const m = await one("SELECT body FROM ticket_messages WHERE id = :id", { id: messageId });
  if (!t || !m) return;
  const url = `${require("../email/templates.js").site()}/support/tickets/${t.ticket_number}?token=${t.access_token}`;
  await email.queue("generic", t.email, { subject: `Re: [${t.ticket_number}] ${t.subject}`, title: `Reply on ${t.ticket_number}`, message: m.body, cta: { label: "Reply", url } }, { key: `ticket-msg:${messageId}`, related: { type: "ticket", id: t.ticket_number } });
});

module.exports = {};
