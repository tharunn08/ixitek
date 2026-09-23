// templates.js — transactional email templates (HTML + plain text).
// Content is factual: numbers, statuses and links only — no marketing claims.
// Every interpolated value is HTML-escaped.
const settings = require("../../core/settings.js");

const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const site = () => (process.env.PUBLIC_SITE_URL || process.env.CORS_ORIGIN || "http://localhost:5173").split(",")[0].replace(/\/$/, "");
const money = (amount, currency) => `${currency || ""} ${amount ?? "—"}`.trim();
const orderLink = (number, token) => `${site()}/order/${encodeURIComponent(number)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
const quoteLink = (number, token) => `${site()}/quote/${encodeURIComponent(number)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
const rfqLink = (number, token) => `${site()}/rfq/${encodeURIComponent(number)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

function layout(title, bodyHtml, { cta } = {}) {
  const button = cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#0b4f9c;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1c2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #dde3ec">
<tr><td style="padding:18px 24px;border-bottom:3px solid #0b4f9c;font-size:20px;font-weight:700;color:#0b4f9c">IXITEK</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:18px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}${button}</td></tr>
<tr><td style="padding:14px 24px;background:#f7f9fc;font-size:12px;color:#667">This is a transactional message about your IXITEK account, order or request. <a href="${esc(site())}" style="color:#0b4f9c">${esc(site().replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(items, currency) {
  if (!items || !items.length) return "";
  const rows = items.map((i) => `<tr><td style="padding:6px;border-bottom:1px solid #eee">${esc(i.sku)}</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(i.name || i.description)}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${esc(i.qty)}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${i.lineTotal !== undefined ? esc(money(i.lineTotal, currency)) : ""}</td></tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse;margin:12px 0"><tr style="background:#eef3fa;color:#0b4f9c"><th align="left" style="padding:6px">SKU</th><th align="left" style="padding:6px">Item</th><th align="right" style="padding:6px">Qty</th><th align="right" style="padding:6px">Amount</th></tr>${rows}</table>`;
}
const itemsText = (items, currency) => (items || []).map((i) => `- ${i.sku}  ${i.name || i.description}  x${i.qty}${i.lineTotal !== undefined ? `  ${money(i.lineTotal, currency)}` : ""}`).join("\n");
const kv = (pairs) => `<table cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0">${pairs.filter((p) => p[1] !== undefined && p[1] !== null && p[1] !== "").map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#667">${esc(k)}</td><td style="padding:3px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>`;
const kvText = (pairs) => pairs.filter((p) => p[1] !== undefined && p[1] !== null && p[1] !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
const p = (t) => `<p style="font-size:14px;line-height:1.5;margin:0 0 12px">${esc(t)}</p>`;

const T = {
  async order_placed({ order, token }) {
    const bank = order.paymentMethod === "bank_transfer" ? String((await settings.get("commerce.bank_transfer_instructions", "")) || "") : "";
    const pairs = [["Order", order.orderNumber], ["Status", order.status.replace(/_/g, " ")], ["Payment method", order.paymentMethod.replace(/_/g, " ")], ["Total", money(order.totals.total, order.currency)], ["Incoterm", order.incoterm]];
    const importNote = order.totals.importChargesEstimate ? `Estimated import charges payable at destination (not included): ${money(order.totals.importChargesEstimate, order.currency)}. ${order.disclaimer || ""}` : "";
    const bankText = bank ? `Bank transfer instructions: ${bank} Please quote ${order.orderNumber} as the payment reference.` : order.paymentMethod === "bank_transfer" ? "Our team will send bank transfer details shortly." : "";
    return {
      subject: `Order ${order.orderNumber} received`,
      html: layout(`Thank you — we received order ${order.orderNumber}`, kv(pairs) + itemsTable(order.items, order.currency) + (importNote ? p(importNote) : "") + (bankText ? p(bankText) : ""), { cta: { label: "View order", url: orderLink(order.orderNumber, token) } }),
      text: `We received order ${order.orderNumber}.\n\n${kvText(pairs)}\n\n${itemsText(order.items, order.currency)}\n\n${importNote}\n${bankText}\n\nView: ${orderLink(order.orderNumber, token)}`,
    };
  },
  order_new_internal({ order }) {
    const pairs = [["Order", order.orderNumber], ["Customer", `${order.customer.name} <${order.customer.email}>`], ["Company", order.customer.company], ["Country", order.country], ["Total", money(order.totals.total, order.currency)], ["Payment", `${order.paymentMethod} / ${order.paymentStatus}`], ["Status", order.status]];
    return { subject: `New order ${order.orderNumber} — ${money(order.totals.total, order.currency)}`, html: layout("New order", kv(pairs) + itemsTable(order.items, order.currency), { cta: { label: "Open in admin", url: `${site()}/admin/orders/${order.orderNumber}` } }), text: kvText(pairs) };
  },
  payment_received({ orderNumber, amount, currency, token, fullyPaid }) {
    const t = fullyPaid ? "Your order is confirmed and will now be processed." : "We have recorded a part payment on your order.";
    return { subject: `Payment received for ${orderNumber}`, html: layout(`Payment received — ${money(amount, currency)}`, p(t), { cta: { label: "View order", url: orderLink(orderNumber, token) } }), text: `Payment of ${money(amount, currency)} received for ${orderNumber}. ${t}\n${orderLink(orderNumber, token)}` };
  },
  payment_failed({ orderNumber, reason, token }) {
    return { subject: `Payment not completed for ${orderNumber}`, html: layout("Your payment was not completed", p(`The payment attempt for order ${orderNumber} did not go through${reason ? `: ${reason}` : "."} No money was taken for this attempt. You can try again from your order page.`), { cta: { label: "Retry payment", url: orderLink(orderNumber, token) } }), text: `Payment for ${orderNumber} was not completed. ${reason || ""}\nRetry: ${orderLink(orderNumber, token)}` };
  },
  invoice_issued({ invoiceNumber, type, orderNumber, total, currency, token }) {
    const label = type === "credit_note" ? "Credit note" : type === "proforma" ? "Proforma invoice" : "Invoice";
    return { subject: `${label} ${invoiceNumber} for order ${orderNumber}`, html: layout(`${label} ${invoiceNumber}`, kv([["Order", orderNumber], ["Amount", money(total, currency)]]) + p("The PDF is attached."), { cta: { label: "View order", url: orderLink(orderNumber, token) } }), text: `${label} ${invoiceNumber} for order ${orderNumber}: ${money(total, currency)}. PDF attached.` };
  },
  order_shipped({ orderNumber, carrier, trackingNumber, trackingUrl, token, items }) {
    const pairs = [["Order", orderNumber], ["Carrier", carrier], ["Tracking number", trackingNumber]];
    return { subject: `Order ${orderNumber} has shipped`, html: layout("Your order has shipped", kv(pairs) + itemsTable(items) + (trackingUrl ? p(`Track: ${trackingUrl}`) : ""), { cta: { label: "Track order", url: orderLink(orderNumber, token) } }), text: `${kvText(pairs)}\n${trackingUrl || ""}\n${orderLink(orderNumber, token)}` };
  },
  order_delivered({ orderNumber, token }) {
    return { subject: `Order ${orderNumber} delivered`, html: layout("Delivered", p(`Order ${orderNumber} was marked as delivered. If anything is missing or damaged, you can request a return from your order page.`), { cta: { label: "View order", url: orderLink(orderNumber, token) } }), text: `Order ${orderNumber} delivered. ${orderLink(orderNumber, token)}` };
  },
  order_cancelled({ orderNumber, note, token }) {
    return { subject: `Order ${orderNumber} cancelled`, html: layout("Order cancelled", p(`Order ${orderNumber} has been cancelled.${note ? ` Note: ${note}` : ""} Any payment received will be refunded to the original payment method.`), { cta: { label: "View order", url: orderLink(orderNumber, token) } }), text: `Order ${orderNumber} cancelled. ${note || ""}` };
  },
  refund_processed({ orderNumber, amount, currency, token }) {
    return { subject: `Refund processed for ${orderNumber}`, html: layout(`Refund of ${money(amount, currency)} processed`, p("Refunds normally reach the original payment method within 5–7 working days, depending on your bank."), { cta: { label: "View order", url: orderLink(orderNumber, token) } }), text: `Refund of ${money(amount, currency)} processed for ${orderNumber}.` };
  },
  rfq_received({ rfq, token }) {
    return { subject: `We received your request ${rfq.rfqNumber}`, html: layout(`Request for quote ${rfq.rfqNumber}`, p("Thank you. Our sales team will review your request and reply with a quotation.") + itemsTable(rfq.items.map((i) => ({ sku: i.sku, name: i.description, qty: i.qty }))), { cta: { label: "View request", url: rfqLink(rfq.rfqNumber, token) } }), text: `We received ${rfq.rfqNumber}.\n${itemsText(rfq.items.map((i) => ({ sku: i.sku, name: i.description, qty: i.qty })))}\n${rfqLink(rfq.rfqNumber, token)}` };
  },
  rfq_new_internal({ rfq }) {
    const pairs = [["RFQ", rfq.rfqNumber], ["Contact", `${rfq.contact.name} <${rfq.contact.email}>`], ["Company", rfq.contact.company], ["Country", rfq.country], ["Required by", rfq.requiredDate], ["Source", rfq.source]];
    return { subject: `New RFQ ${rfq.rfqNumber} — ${rfq.contact.company || rfq.contact.name}`, html: layout("New request for quote", kv(pairs) + itemsTable(rfq.items.map((i) => ({ sku: i.sku, name: i.description, qty: i.qty }))) + (rfq.message ? p(rfq.message) : ""), { cta: { label: "Open in admin", url: `${site()}/admin/rfqs/${rfq.rfqNumber}` } }), text: `${kvText(pairs)}\n${rfq.message || ""}` };
  },
  rfq_info_requested({ rfqNumber, message, token }) {
    return { subject: `Question about your request ${rfqNumber}`, html: layout("We need a little more information", p(message || "Please reply with the requested details."), { cta: { label: "Reply", url: rfqLink(rfqNumber, token) } }), text: `${message}\nReply: ${rfqLink(rfqNumber, token)}` };
  },
  rfq_rejected({ rfqNumber, message }) {
    return { subject: `Update on your request ${rfqNumber}`, html: layout(`Request ${rfqNumber}`, p(message || "We are unable to quote this request at the moment.")), text: message || "We are unable to quote this request at the moment." };
  },
  quote_sent({ quote, version, token }) {
    const pairs = [["Quotation", version.label], ["Total", money(version.totals.total, version.currency)], ["Valid until", version.validUntil], ["Incoterm", version.incoterm]];
    return { subject: `Quotation ${version.label} from IXITEK`, html: layout(`Quotation ${version.label}`, kv(pairs) + itemsTable(version.items, version.currency) + p("The quotation PDF is attached. You can accept it online."), { cta: { label: "View & accept", url: quoteLink(quote.quoteNumber, token) } }), text: `${kvText(pairs)}\n${itemsText(version.items, version.currency)}\n${quoteLink(quote.quoteNumber, token)}` };
  },
  quote_expiring({ label, validUntil, quoteNumber, token }) {
    return { subject: `Quotation ${label} expires on ${validUntil}`, html: layout("Your quotation expires soon", p(`Quotation ${label} is valid until ${validUntil}.`), { cta: { label: "View quotation", url: quoteLink(quoteNumber, token) } }), text: `Quotation ${label} valid until ${validUntil}. ${quoteLink(quoteNumber, token)}` };
  },
  quote_expired({ label }) {
    return { subject: `Quotation ${label} has expired`, html: layout("Quotation expired", p(`Quotation ${label} has expired. Reply to this email or submit a new request if you would like an updated quote.`)), text: `Quotation ${label} has expired.` };
  },
  quote_response_internal({ label, action, orderNumber, note }) {
    return { subject: `Quotation ${label} ${action}`, html: layout(`Quotation ${label} ${action}`, kv([["Order", orderNumber], ["Note", note]])), text: `Quotation ${label} ${action}. ${orderNumber || ""} ${note || ""}` };
  },
  enquiry_new_internal({ enquiry }) {
    const pairs = [["Type", enquiry.type], ["Name", enquiry.name], ["Email", enquiry.email], ["Phone", enquiry.phone], ["Company", enquiry.company], ["Interest", enquiry.category]];
    return { subject: `New ${enquiry.type} enquiry — ${enquiry.name}`, html: layout("New website enquiry", kv(pairs) + p(enquiry.message)), text: `${kvText(pairs)}\n\n${enquiry.message}` };
  },
  generic({ subject, title, message, cta }) {
    return { subject, html: layout(title || subject, p(message), { cta }), text: `${message}${cta ? `\n${cta.url}` : ""}` };
  },
};

async function render(name, data) {
  const fn = T[name];
  if (!fn) throw new Error(`Unknown email template ${name}`);
  return fn(data || {});
}

module.exports = { render, names: Object.keys(T), orderLink, quoteLink, rfqLink, site };
