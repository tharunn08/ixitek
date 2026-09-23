// invoiceService.js — proforma invoices, tax invoices and credit notes.
// Each document stores a complete JSON snapshot (seller, buyer, lines,
// totals) at issue time; PDFs are rendered from that snapshot, so later edits
// to products, prices, settings or addresses never change an issued document.
const { query, one, tx, json } = require("../../core/db.js");
const { D, Decimal } = require("../../core/money.js");
const settings = require("../../core/settings.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const seq = require("../commerce/sequences.js");
const pdf = require("./pdf.js");
const gst = require("../intl/gst.js");
const { conflict, notFound, badRequest } = require("../../core/errors.js");

const TITLES = { proforma: "PROFORMA INVOICE", tax_invoice: "TAX INVOICE", credit_note: "CREDIT NOTE" };
const SEQ = { proforma: "proforma", tax_invoice: "invoice", credit_note: "credit_note" };

async function seller() {
  const s = {
    legalName: String((await settings.get("seller.legal_name", "")) || "").trim(),
    address: String((await settings.get("seller.address", "")) || "").trim(),
    taxId: String((await settings.get("seller.tax_id", "")) || "").trim(),
    taxIdLabel: String((await settings.get("seller.tax_id_label", "Tax ID")) || "Tax ID"),
    email: String((await settings.get("seller.email", "")) || ""),
    phone: String((await settings.get("seller.phone", "")) || ""),
    footer: String((await settings.get("invoice.footer_note", "")) || ""),
    bankDetails: String((await settings.get("seller.bank_details", "")) || ""),
  };
  const st = gst.resolveState(await settings.get("seller.state_code", ""));
  s.state = st ? { code: st.code, name: st.name } : null;
  return s;
}

async function sellerReady() {
  const s = await seller();
  const missing = [];
  if (!s.legalName) missing.push("registered legal name");
  if (!s.address) missing.push("registered address");
  return { seller: s, ready: missing.length === 0, missing };
}

async function orderSnapshot(orderId, conn) {
  const o = await one("SELECT * FROM orders WHERE id = :id", { id: orderId }, conn);
  if (!o) throw notFound("Order not found.");
  const items = await query("SELECT sku, name, hs_code, qty, unit_price, discount, line_total, gst_rate FROM order_items WHERE order_id = :id ORDER BY id", { id: orderId }, conn);
  const addrs = await query("SELECT * FROM order_addresses WHERE order_id = :id", { id: orderId }, conn);
  const addr = (t) => {
    const a = addrs.find((x) => x.address_type === t);
    return a ? { contactName: a.contact_name, companyName: a.company_name, line1: a.line1, line2: a.line2, city: a.city, state: a.state, stateCode: a.state_code, postalCode: a.postal_code, countryCode: a.country_code, phone: a.phone, taxId: a.tax_id } : null;
  };
  const est = json(o.estimate_json, {});
  const g = require("../commerce/orderService.js").gstJson(o);
  // With a GST split, output GST is shown as CGST/SGST/IGST rows; duties/import tax paid under DDP stay separate rows.
  const taxComponents = (est.components || []).filter((c) => c.includedInPayable && ["invoice_tax", "customs", "import_tax"].includes(c.key) && c.amount !== null && !(g && c.key === "invoice_tax")).map((c) => ({ label: c.label, amount: c.amount, basis: c.basis || null }));
  const gstLines = g ? await query("SELECT hs_code, gst_taxable_value, gst_rate, cgst, sgst, igst FROM order_items WHERE order_id = :id AND gst_rate IS NOT NULL ORDER BY id", { id: orderId }, conn) : [];
  return {
    o,
    data: {
      order: { number: o.order_number, placedAt: o.placed_at, poNumber: o.po_number, paymentMethod: o.payment_method, paymentTerms: o.payment_terms, incoterm: o.incoterm, shippingMethod: o.shipping_method, country: o.country_code },
      buyer: { name: o.customer_name, email: o.customer_email, company: o.company_name, taxId: o.tax_id, billing: addr("billing"), shipping: addr("shipping") },
      currency: o.currency,
      lines: items.map((i) => ({ sku: i.sku, description: i.name, hsCode: i.hs_code, qty: i.qty, unitPrice: i.unit_price, discount: i.discount, lineTotal: i.line_total, gstRate: i.gst_rate === null ? null : String(Number(i.gst_rate)) })),
      totals: { subtotal: o.subtotal, discount: o.discount, freight: o.freight, insurance: o.insurance, tax: o.tax, handling: o.handling, other: o.other_charges, total: o.total, amountPaid: o.amount_paid },
      taxComponents,
      gst: g ? { ...g, hsnSummary: hsnSummary(gstLines) } : null,
      importChargesNote: o.import_charges_estimate !== null ? `Estimated import charges payable by the consignee (not included): ${o.currency} ${o.import_charges_estimate}` : "",
    },
  };
}

function hsnSummary(rows) {
  const map = new Map();
  for (const r of rows) {
    const rate = String(Number(r.gst_rate));
    const k = `${r.hs_code || ""}|${rate}`;
    const h = map.get(k) || { hsCode: r.hs_code || null, ratePct: rate, taxable: D(0), cgst: D(0), sgst: D(0), igst: D(0) };
    for (const [f, c] of [["taxable", "gst_taxable_value"], ["cgst", "cgst"], ["sgst", "sgst"], ["igst", "igst"]]) h[f] = h[f].plus(r[c] || 0);
    map.set(k, h);
  }
  return [...map.values()].map((h) => ({ hsCode: h.hsCode, ratePct: h.ratePct, taxable: h.taxable.toFixed(2), cgst: h.cgst.toFixed(2), sgst: h.sgst.toFixed(2), igst: h.igst.toFixed(2), total: h.cgst.plus(h.sgst).plus(h.igst).toFixed(2) }));
}

/** GST on a credit note: the original invoice's GST reversed in proportion to the refunded amount, per HSN/rate group. */
function creditNoteGst(orderGst, refundAmount, orderTotal) {
  const ratio = Decimal.min(D(refundAmount).div(orderTotal), D(1));
  const r2 = (d) => D(d).times(ratio).toDecimalPlaces(2, 4);
  const hsn = orderGst.hsnSummary.map((h) => {
    const x = { hsCode: h.hsCode, ratePct: h.ratePct, cgst: r2(h.cgst), sgst: r2(h.sgst), igst: r2(h.igst) };
    x.total = x.cgst.plus(x.sgst).plus(x.igst);
    return x;
  });
  const tax = hsn.reduce((a, h) => a.plus(h.total), D(0));
  const taxable = D(refundAmount).minus(tax);
  // Taxable value per group in proportion; the last group takes the remainder so the parts add up to the refund.
  let used = D(0);
  const origTaxable = orderGst.hsnSummary.reduce((a, h) => a.plus(h.taxable), D(0));
  hsn.forEach((h, i) => {
    h.taxable = i === hsn.length - 1 ? taxable.minus(used) : taxable.times(D(orderGst.hsnSummary[i].taxable).div(origTaxable || 1)).toDecimalPlaces(2, 4);
    used = used.plus(h.taxable);
  });
  const f = (d) => D(d).toFixed(2);
  const sum = (k) => hsn.reduce((a, h) => a.plus(h[k]), D(0));
  return {
    ...orderGst,
    taxable: f(taxable), cgst: f(sum("cgst")), sgst: f(sum("sgst")), igst: f(sum("igst")), total: f(tax),
    hsnSummary: hsn.map((h) => ({ hsCode: h.hsCode, ratePct: h.ratePct, taxable: f(h.taxable), cgst: f(h.cgst), sgst: f(h.sgst), igst: f(h.igst), total: f(h.total) })),
    reversal: { ratio: ratio.toFixed(6) },
  };
}

/** Issue a document for an order. Tax invoices and proformas are one-per-order (idempotent). */
async function issue(orderId, type, { req = null, refundId = null, conn: outer = null } = {}) {
  if (!TITLES[type]) throw badRequest("Unknown document type.");
  const { seller: s, ready, missing } = await sellerReady();
  if (!ready) throw conflict(`Configure the seller ${missing.join(" and ")} in Admin → Settings → Invoicing before issuing invoices.`);
  const run = async (conn) => {
    await one("SELECT id FROM orders WHERE id = :id FOR UPDATE", { id: orderId }, conn);
    if (type !== "credit_note") {
      const existing = await one("SELECT invoice_number FROM invoices WHERE order_id = :o AND invoice_type = :t AND status <> 'void' ORDER BY id DESC LIMIT 1", { o: orderId, t: type }, conn);
      if (existing) return { invoiceNumber: existing.invoice_number, existing: true };
    } else if (refundId) {
      const existing = await one("SELECT invoice_number FROM invoices WHERE refund_id = :r", { r: refundId }, conn);
      if (existing) return { invoiceNumber: existing.invoice_number, existing: true };
    }
    const { o, data } = await orderSnapshot(orderId, conn);
    let totals = data.totals;
    let lines = data.lines;
    if (type === "credit_note") {
      const r = await one("SELECT * FROM refunds WHERE id = :id", { id: refundId }, conn);
      if (!r) throw notFound("Refund not found.");
      if (data.gst) {
        data.gst = creditNoteGst(data.gst, r.amount, o.total);
        lines = [{ sku: "", description: `Credit against invoice for order ${o.order_number}: ${r.reason}`, hsCode: null, qty: 1, unitPrice: data.gst.taxable, discount: "0", lineTotal: data.gst.taxable }];
        totals = { subtotal: data.gst.taxable, discount: "0", freight: "0", insurance: "0", tax: data.gst.total, handling: "0", other: "0", total: r.amount };
      } else {
        lines = [{ sku: "", description: `Credit against invoice for order ${o.order_number}: ${r.reason}`, hsCode: null, qty: 1, unitPrice: r.amount, discount: "0", lineTotal: r.amount }];
        totals = { subtotal: r.amount, discount: "0", freight: "0", insurance: "0", tax: "0", handling: "0", other: "0", total: r.amount };
      }
      data.reference = await one("SELECT invoice_number FROM invoices WHERE order_id = :o AND invoice_type = 'tax_invoice' AND status <> 'void' ORDER BY id DESC LIMIT 1", { o: orderId }, conn);
    }
    if (data.gst && type !== "proforma") {
      const v = gst.validateGstin(s.taxId);
      if (!v.valid) throw conflict(`Enter IXITEK's GSTIN in Admin → Finance → Invoicing before issuing GST ${type === "credit_note" ? "credit notes" : "tax invoices"} (${v.reason})`);
      if (!s.state || v.stateCode !== s.state.code) throw conflict("The seller GSTIN does not belong to the configured seller state code. Correct it in Admin → Finance → Invoicing.");
    }
    const number = await seq.next(SEQ[type], conn);
    const dueDays = Number(await settings.get("invoice.payment_due_days", 0)) || 0;
    const snapshot = { ...data, lines, totals, seller: s, type, number, issuedAt: new Date().toISOString() };
    await query(
      `INSERT INTO invoices (invoice_number, invoice_type, order_id, refund_id, status, currency, buyer_tax_id, place_of_supply, gst_supply_type, gst_taxable_value, cgst, sgst, igst,
         subtotal, discount, freight, insurance, tax, other_charges, total, snapshot_json, due_date, created_by)
       VALUES (:n, :t, :o, :r, :s, :c, :btax, :pos, :gtype, :gtaxable, :cgst, :sgst, :igst, :sub, :disc, :fr, :ins, :tax, :oth, :tot, :snap, :due, :u)`,
      {
        n: number, t: type, o: orderId, r: refundId, s: type === "credit_note" ? "issued" : o.payment_status === "paid" ? "paid" : D(o.amount_paid).gt(0) ? "partially_paid" : "issued", c: o.currency,
        sub: totals.subtotal, disc: totals.discount, fr: totals.freight, ins: totals.insurance, tax: totals.tax, oth: D(totals.other || 0).plus(totals.handling || 0).toFixed(2), tot: totals.total,
        btax: o.tax_id || null, pos: data.gst ? data.gst.placeOfSupply.code : null, gtype: data.gst ? data.gst.supplyType : null, gtaxable: data.gst ? data.gst.taxable : null,
        cgst: data.gst ? data.gst.cgst : null, sgst: data.gst ? data.gst.sgst : null, igst: data.gst ? data.gst.igst : null,
        snap: JSON.stringify(snapshot), due: type === "tax_invoice" && o.payment_terms !== "prepaid" ? new Date(Date.now() + (dueDays || 30) * 864e5).toISOString().slice(0, 10) : null, u: req && req.user ? req.user.id : null,
      },
      conn
    );
    await audit.record({ req, action: `invoice.issue.${type}`, entityType: "order", entityId: o.order_number, after: { invoice: number, total: totals.total, currency: o.currency } }, conn);
    if (type === "tax_invoice" || type === "credit_note") await events.emit("invoice.issued", { invoiceNumber: number }, conn, { key: number });
    return { invoiceNumber: number, existing: false };
  };
  return outer ? run(outer) : tx(run);
}

async function voidInvoice(req, number, reason) {
  if (String(reason || "").trim().length < 3) throw badRequest("Give a reason.");
  await tx(async (conn) => {
    const inv = await one("SELECT * FROM invoices WHERE invoice_number = :n FOR UPDATE", { n: number }, conn);
    if (!inv) throw notFound("Invoice not found.");
    if (inv.status === "void") throw conflict("Already void.");
    await query("UPDATE invoices SET status = 'void', void_reason = :r, voided_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { r: String(reason).slice(0, 500), id: inv.id }, conn);
    await audit.record({ req, action: "invoice.void", entityType: "invoice", entityId: number, reason }, conn);
  });
}

async function byNumber(number) {
  const inv = await one("SELECT * FROM invoices WHERE invoice_number = :n", { n: String(number) });
  if (!inv) throw notFound("Invoice not found.");
  return inv;
}

async function renderInvoicePdf(inv) {
  const snap = json(inv.snapshot_json, {});
  const cur = snap.currency;
  const g = snap.gst || null;
  const isCn = inv.invoice_type === "credit_note";
  const pos = g ? `${g.placeOfSupply.code} - ${g.placeOfSupply.name}` : "";
  return pdf.toBuffer((doc) => {
    let y = pdf.header(
      doc,
      {
        title: TITLES[inv.invoice_type] + (inv.status === "void" ? " (VOID)" : ""),
        number: inv.invoice_number,
        date: new Date(inv.issued_at).toISOString().slice(0, 10),
        extra: [
          ["Order", snap.order.number], ["PO", snap.order.poNumber], ["Incoterm", snap.order.incoterm], ["Payment", String(snap.order.paymentMethod || "").replace(/_/g, " ")],
          ["Due", inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : ""], ["Against", snap.reference ? snap.reference.invoice_number : ""],
          ...(g ? [["Place of supply", pos], ["Supply", g.supplyType === "intra_state" ? "Intra-state" : "Inter-state"], ["Reverse charge", "No"]] : []),
        ],
      },
      { ...snap.seller, stateLine: g && snap.seller.state ? `State: ${snap.seller.state.name} (${snap.seller.state.code})` : "" }
    );
    const taxLabel = snap.order.country === "IN" ? "GSTIN" : "Tax ID";
    y = pdf.addressBlock(doc, y, [["Bill to", snap.buyer.billing], ["Ship to", snap.buyer.shipping]], { taxIdLabel: taxLabel, buyerTaxId: snap.buyer.taxId });
    const cols = g && !isCn
      ? [
          { key: "n", label: "#", width: 20 }, { key: "sku", label: "SKU", width: 85 }, { key: "description", label: "Description", width: 140 }, { key: "hsCode", label: "HSN", width: 50 },
          { key: "qty", label: "Qty", width: 30, align: "right" }, { key: "unit", label: "Unit price", width: 65, align: "right" }, { key: "total", label: "Amount", width: 75, align: "right" }, { key: "rate", label: "GST %", width: 50, align: "right" },
        ]
      : [
          { key: "n", label: "#", width: 22 }, { key: "sku", label: "SKU", width: 95 }, { key: "description", label: "Description", width: 158 }, { key: "hsCode", label: g ? "HSN" : "HS", width: 55 },
          { key: "qty", label: "Qty", width: 35, align: "right" }, { key: "unit", label: "Unit price", width: 70, align: "right" }, { key: "total", label: "Amount", width: 80, align: "right" },
        ];
    y = pdf.table(doc, y, cols, snap.lines.map((l, i) => ({ n: String(i + 1), sku: l.sku, description: l.description, hsCode: l.hsCode || "", qty: String(l.qty), unit: pdf.fmt(D(l.unitPrice).toFixed(2)), total: pdf.fmt(l.lineTotal), rate: l.gstRate ? `${l.gstRate}%` : "" })));
    const t = snap.totals;
    const rows = [[g && isCn ? "Taxable value" : "Subtotal", pdf.fmt(t.subtotal, cur)]];
    if (D(t.discount || 0).gt(0)) rows.push(["Discount", `-${pdf.fmt(t.discount, cur)}`]);
    if (D(t.freight || 0).gt(0)) rows.push(["Freight", pdf.fmt(t.freight, cur)]);
    if (D(t.insurance || 0).gt(0)) rows.push(["Insurance", pdf.fmt(t.insurance, cur)]);
    if (D(t.handling || 0).gt(0)) rows.push(["Handling", pdf.fmt(t.handling, cur)]);
    if (D(t.other || 0).gt(0)) rows.push(["Other charges", pdf.fmt(t.other, cur)]);
    if (g) {
      if (g.supplyType === "intra_state") rows.push(["CGST", pdf.fmt(g.cgst, cur)], [g.stateTaxLabel || "SGST", pdf.fmt(g.sgst, cur)]);
      else rows.push(["IGST", pdf.fmt(g.igst, cur)]);
    }
    if (!isCn) for (const c of snap.taxComponents || []) rows.push([c.label, pdf.fmt(c.amount, cur)]);
    rows.push([isCn ? "Credit total" : "Total", pdf.fmt(t.total, cur), true]);
    if (inv.invoice_type === "tax_invoice" && D(t.amountPaid || 0).gt(0)) rows.push(["Paid", pdf.fmt(t.amountPaid, cur)]);
    y = pdf.totals(doc, y, rows);
    if (cur === "INR") y = pdf.paragraph(doc, y, "Amount in words", gst.amountInWords(t.total, "INR"));
    if (g && g.hsnSummary && g.hsnSummary.length) {
      const intra = g.supplyType === "intra_state";
      const sl = g.stateTaxLabel || "SGST";
      const half = (r) => `${D(r).div(2).toString()}%`;
      y = pdf.paragraph(doc, y, isCn ? "GST reversed (HSN summary)" : "HSN / SAC summary", " ");
      y = pdf.table(
        doc,
        y - 6,
        intra
          ? [
              { key: "hsn", label: "HSN", width: 70 }, { key: "taxable", label: "Taxable value", width: 90, align: "right" }, { key: "cr", label: "CGST %", width: 50, align: "right" }, { key: "c", label: "CGST", width: 75, align: "right" },
              { key: "sr", label: `${sl} %`, width: 55, align: "right" }, { key: "s", label: sl, width: 75, align: "right" }, { key: "tt", label: "Total tax", width: 100, align: "right" },
            ]
          : [
              { key: "hsn", label: "HSN", width: 90 }, { key: "taxable", label: "Taxable value", width: 120, align: "right" }, { key: "ir", label: "IGST %", width: 80, align: "right" }, { key: "i", label: "IGST", width: 110, align: "right" },
              { key: "tt", label: "Total tax", width: 115, align: "right" },
            ],
        [
          ...g.hsnSummary.map((h) => ({ hsn: h.hsCode || "—", taxable: pdf.fmt(h.taxable), cr: half(h.ratePct), c: pdf.fmt(h.cgst), sr: half(h.ratePct), s: pdf.fmt(h.sgst), ir: `${h.ratePct}%`, i: pdf.fmt(h.igst), tt: pdf.fmt(h.total) })),
          { hsn: "Total", taxable: pdf.fmt(g.taxable), cr: "", c: pdf.fmt(g.cgst), sr: "", s: pdf.fmt(g.sgst), ir: "", i: pdf.fmt(g.igst), tt: pdf.fmt(D(g.cgst).plus(g.sgst).plus(g.igst).toFixed(2)) },
        ]
      );
      if (g.rateBasis === "effective") y = pdf.paragraph(doc, y, "GST rate", "GST as quoted; the rate shown is the effective rate of the quoted tax on the taxable value.");
    }
    if (!isCn && !/ 0(\.0+)?$/.test(snap.importChargesNote || "")) y = pdf.paragraph(doc, y, "Import charges", snap.importChargesNote);
    if (!isCn && snap.seller.bankDetails && D(snap.totals.total).gt(snap.totals.amountPaid || 0)) y = pdf.paragraph(doc, y, "Bank transfer details", `${snap.seller.bankDetails}\nPayment reference: ${snap.order.number}`);
    y = pdf.paragraph(doc, y, "Notes", snap.seller.footer);
    if (g && inv.invoice_type !== "proforma") y = pdf.signature(doc, y, snap.seller.legalName);
    if (inv.status === "void") pdf.paragraph(doc, y, "Void", `This document was voided: ${inv.void_reason || ""}`);
  });
}

/** Quotation PDF for a specific (sent) version. */
async function renderQuotePdf(quoteId, version) {
  const q = await one("SELECT * FROM quotes WHERE id = :id", { id: quoteId });
  const v = await one("SELECT * FROM quote_versions WHERE quote_id = :q AND version = :v", { q: quoteId, v: version });
  if (!q || !v) throw notFound("Quotation not found.");
  const items = await query("SELECT sku, description, qty, unit_price, discount_pct, line_total, lead_time FROM quote_items WHERE quote_version_id = :v ORDER BY id", { v: v.id });
  const { seller: s } = await sellerReady();
  const cur = v.currency;
  return pdf.toBuffer((doc) => {
    let y = pdf.header(
      doc,
      {
        title: "QUOTATION",
        number: `${q.quote_number}-V${v.version}`,
        date: new Date(v.sent_at || v.created_at).toISOString().slice(0, 10),
        extra: [["Valid until", new Date(v.valid_until).toISOString().slice(0, 10)], ["Incoterm", v.incoterm], ["Ship to", v.country_code], ["Payment terms", v.payment_terms], ["Status", v.status]],
      },
      { ...s, legalName: s.legalName || "IXITEK" }
    );
    y = pdf.addressBlock(doc, y, [["Prepared for", { companyName: q.company_name, contactName: q.customer_name, line1: q.customer_email }]]);
    y = pdf.table(
      doc,
      y,
      [
        { key: "n", label: "#", width: 22 },
        { key: "sku", label: "SKU", width: 95 },
        { key: "description", label: "Description", width: 150 },
        { key: "lead", label: "Lead time", width: 60 },
        { key: "qty", label: "Qty", width: 35, align: "right" },
        { key: "unit", label: "Unit price", width: 70, align: "right" },
        { key: "total", label: "Amount", width: 83, align: "right" },
      ],
      items.map((l, i) => ({ n: String(i + 1), sku: l.sku, description: l.description + (D(l.discount_pct).gt(0) ? ` (less ${D(l.discount_pct).toString()}%)` : ""), lead: l.lead_time || v.lead_time || "", qty: String(l.qty), unit: pdf.fmt(D(l.unit_price).toFixed(2)), total: pdf.fmt(l.line_total) }))
    );
    const rows = [["Subtotal", pdf.fmt(v.subtotal, cur)]];
    if (D(v.discount).gt(0)) rows.push(["Discount", `-${pdf.fmt(v.discount, cur)}`]);
    if (D(v.freight).gt(0)) rows.push(["Freight", pdf.fmt(v.freight, cur)]);
    if (D(v.insurance).gt(0)) rows.push(["Insurance", pdf.fmt(v.insurance, cur)]);
    if (D(v.tax).gt(0)) rows.push(["Tax", pdf.fmt(v.tax, cur)]);
    if (D(v.other_charges).gt(0)) rows.push(["Other charges", pdf.fmt(v.other_charges, cur)]);
    rows.push(["Total", pdf.fmt(v.total, cur), true]);
    y = pdf.totals(doc, y, rows);
    const imp = v.customs_estimate !== null || v.import_tax_estimate !== null ? `Estimated import charges (not included, payable by consignee): customs ${v.customs_estimate ?? "—"}, import tax ${v.import_tax_estimate ?? "—"} ${cur}. Final duties and taxes are determined by customs at import.` : "";
    y = pdf.paragraph(doc, y, "Import charges", imp);
    y = pdf.paragraph(doc, y, "Terms", v.terms);
    pdf.paragraph(doc, y, "Notes", v.notes);
  });
}

function invoiceJson(inv, { internal = false } = {}) {
  return {
    number: inv.invoice_number, type: inv.invoice_type, status: inv.status, currency: inv.currency, total: inv.total, issuedAt: inv.issued_at, dueDate: inv.due_date,
    gst: inv.gst_supply_type ? { supplyType: inv.gst_supply_type, placeOfSupply: inv.place_of_supply, taxable: inv.gst_taxable_value, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst } : null,
    ...(internal ? { voidReason: inv.void_reason, orderId: String(inv.order_id) } : {}),
  };
}

module.exports = { issue, voidInvoice, byNumber, renderInvoicePdf, renderQuotePdf, sellerReady, invoiceJson, TITLES };
