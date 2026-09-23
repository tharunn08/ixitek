// rfqQuoteService.js — RFQ intake, sales handling, versioned quotations and
// quote → order conversion. A sent quote version is immutable; revising
// creates the next version (QT-2026-000081-V2) and supersedes the previous.
const { query, one, tx } = require("../../core/db.js");
const { D } = require("../../core/money.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const settings = require("../../core/settings.js");
const seq = require("./sequences.js");
const fx = require("../intl/fxService.js");
const landed = require("../intl/landedCost.js");
const orders = require("./orderService.js");
const gst = require("../intl/gst.js");
const { badRequest, conflict, notFound } = require("../../core/errors.js");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const s = (v, n) => String(v || "").trim().slice(0, n);
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10));

async function createRfq(req, body, { source = "web", fileIds = [] } = {}) {
  const email = s(body.email || (req.user && req.user.email), 254).toLowerCase();
  const name = s(body.name || (req.user && req.user.name), 150);
  if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");
  if (!name) throw badRequest("Enter your name.");
  const country = s(body.country, 2).toUpperCase();
  if (!(await one("SELECT code FROM countries WHERE code = :c", { c: country }))) throw badRequest("Choose the destination country.");
  const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  if (!items.length) throw badRequest("Add at least one product or part number.");
  const cleaned = [];
  for (const it of items) {
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1) || qty > 1e7) throw badRequest("Each line needs a whole quantity of at least 1.");
    let product = null;
    if (it.productId) product = await one("SELECT id, sku, name FROM products WHERE id = :id AND deleted_at IS NULL", { id: it.productId });
    else if (it.sku) product = await one("SELECT id, sku, name FROM products WHERE sku = :s AND deleted_at IS NULL", { s: s(it.sku, 100) });
    if (!product && !s(it.sku, 100) && !s(it.description, 500)) throw badRequest("Each line needs a product, part number or description.");
    let target = null;
    if (it.targetPrice !== undefined && it.targetPrice !== null && it.targetPrice !== "") {
      try {
        target = D(it.targetPrice);
      } catch {
        target = null;
      }
      if (!target || !target.isFinite() || target.isNegative()) throw badRequest("Target price must be a positive number.");
      target = target.toFixed(4);
    }
    cleaned.push({ productId: product ? product.id : null, sku: product ? product.sku : s(it.sku, 100), description: s(it.description, 500) || (product ? product.name : ""), qty, target });
  }
  let requiredDate = null;
  if (body.requiredDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.requiredDate)) throw badRequest("Required date must be YYYY-MM-DD.");
    requiredDate = body.requiredDate;
  }
  const currency = s(body.currency, 3).toUpperCase() || "USD";
  return tx(async (conn) => {
    const number = await seq.next("rfq", conn);
    const cur = (await one("SELECT code FROM currencies WHERE code = :c", { c: currency }, conn)) ? currency : "USD";
    const r = await query(
      `INSERT INTO rfqs (rfq_number, access_token, user_id, company_id, contact_name, contact_email, contact_phone, company_name, country_code, destination, currency, incoterm, required_date, message, source)
       VALUES (:n, :t, :u, :c, :name, :email, :phone, :company, :country, :dest, :cur, :inco, :rd, :msg, :src)`,
      {
        n: number, t: seq.token(), u: req.user ? req.user.id : null, c: req.user ? req.user.company_id || null : null, name, email, phone: s(body.phone, 40), company: s(body.companyName, 200),
        country, dest: s(body.destination, 200), cur, inco: s(body.incoterm, 3).toUpperCase() || null, rd: requiredDate, msg: s(body.message, 10000), src: source,
      },
      conn
    );
    for (const it of cleaned) {
      await query("INSERT INTO rfq_items (rfq_id, product_id, sku, description, qty, target_price) VALUES (:r, :p, :sku, :d, :q, :t)", { r: r.insertId, p: it.productId, sku: it.sku, d: it.description, q: it.qty, t: it.target }, conn);
    }
    for (const f of fileIds) await query("INSERT INTO rfq_attachments (rfq_id, file_id) VALUES (:r, :f)", { r: r.insertId, f }, conn);
    await audit.record({ req, actorEmail: email, action: "rfq.create", entityType: "rfq", entityId: number, after: { lines: cleaned.length, country } }, conn);
    await events.emit("rfq.submitted", { rfqId: r.insertId }, conn, { key: String(r.insertId) });
    return { rfqId: r.insertId, rfqNumber: number, accessToken: (await one("SELECT access_token FROM rfqs WHERE id = :id", { id: r.insertId }, conn)).access_token };
  });
}

async function rfqJson(id, { internal = false } = {}) {
  const r = await one("SELECT r.*, u.email AS assignee_email, u.name AS assignee_name FROM rfqs r LEFT JOIN users u ON u.id = r.assigned_to WHERE r.id = :id", { id });
  if (!r) return null;
  const items = await query("SELECT id, product_id, sku, description, qty, target_price FROM rfq_items WHERE rfq_id = :id ORDER BY id", { id });
  const msgs = await query(`SELECT id, author_name, is_internal, body, created_at FROM rfq_messages WHERE rfq_id = :id ${internal ? "" : "AND is_internal = 0"} ORDER BY id`, { id });
  const files = await query("SELECT f.id, f.original_name, f.bytes FROM rfq_attachments a JOIN files f ON f.id = a.file_id WHERE a.rfq_id = :id", { id });
  const quotes = await query("SELECT id, quote_number, status, current_version, access_token FROM quotes WHERE rfq_id = :id ORDER BY id", { id });
  return {
    id: String(r.id), rfqNumber: r.rfq_number, status: r.status, createdAt: r.created_at, source: r.source,
    contact: { name: r.contact_name, email: r.contact_email, phone: r.contact_phone, company: r.company_name },
    country: r.country_code, destination: r.destination, currency: r.currency, incoterm: r.incoterm, requiredDate: r.required_date, message: r.message,
    items: items.map((i) => ({ id: String(i.id), productId: i.product_id ? String(i.product_id) : null, sku: i.sku, description: i.description, qty: i.qty, targetPrice: i.target_price })),
    messages: msgs.map((m) => ({ id: String(m.id), author: m.author_name, internal: Boolean(m.is_internal), body: m.body, at: m.created_at })),
    attachments: files.map((f) => ({ id: String(f.id), name: f.original_name, bytes: f.bytes })),
    // The requester (already authorised for this RFQ) gets each sent quotation's private link token.
    quotes: quotes.filter((q) => internal || q.status !== "draft").map((q) => ({ id: String(q.id), number: q.quote_number, status: q.status, version: q.current_version, ...(internal ? {} : { accessToken: q.access_token }) })),
    ...(internal ? { assignedTo: r.assigned_to ? { id: String(r.assigned_to), email: r.assignee_email, name: r.assignee_name } : null, userId: r.user_id ? String(r.user_id) : null } : {}),
  };
}

/** Build a quote version's lines + totals. Lines: [{productId?, sku, description, qty, unitPrice?, discountPct?, leadTime?}] */
async function priceVersion({ lines, country, currency, incoterm, method, charges = {} }) {
  const cur = await fx.effectiveCurrency(currency);
  if (currency && cur.code !== String(currency).toUpperCase()) throw badRequest(`No exchange rate for ${currency}. Set one in International commerce first.`);
  const out = [];
  let subtotal = D(0);
  let discount = D(0);
  const catalogLines = [];
  for (const l of lines) {
    const qty = Math.floor(Number(l.qty));
    if (!(qty >= 1)) throw badRequest("Each quote line needs a quantity ≥ 1.");
    let unit = null;
    if (l.unitPrice !== undefined && l.unitPrice !== null && l.unitPrice !== "") {
      try {
        unit = D(l.unitPrice);
      } catch {
        throw badRequest("Unit prices must be numbers.");
      }
    }
    let product = null;
    if (l.productId) product = await one("SELECT id, sku, name FROM products WHERE id = :id", { id: l.productId });
    else if (l.sku) product = await one("SELECT id, sku, name FROM products WHERE sku = :s AND deleted_at IS NULL", { s: s(l.sku, 100) });
    if (unit === null) {
      if (!product) throw badRequest(`Enter a unit price for ${l.sku || "the custom line"}.`);
      const calc = await require("../pricing/pricingService.js").calculate(product.id, { country, currency: cur.code, qty });
      if (calc.sellingPriceUsd === null) throw badRequest(`${product.sku} has no configured price — enter a unit price.`);
      unit = D(calc.sellingPriceUsd).times(cur.rate).toDecimalPlaces(4);
    }
    if (!unit.isFinite() || unit.isNegative()) throw badRequest("Unit prices must be positive.");
    const dPct = D(l.discountPct || 0);
    if (dPct.isNegative() || dPct.gt(100)) throw badRequest("Discount must be 0–100%.");
    const gross = unit.times(qty).toDecimalPlaces(cur.decimals);
    const lineDiscount = gross.times(dPct).div(100).toDecimalPlaces(cur.decimals);
    const lineTotal = gross.minus(lineDiscount);
    subtotal = subtotal.plus(gross);
    discount = discount.plus(lineDiscount);
    out.push({ productId: product ? product.id : null, sku: product ? product.sku : s(l.sku, 100), description: s(l.description, 500) || (product ? product.name : ""), qty, unitPrice: unit.toFixed(4), discountPct: dPct.toFixed(3), lineTotal: lineTotal.toFixed(cur.decimals), leadTime: s(l.leadTime, 100) });
    if (product) catalogLines.push({ productId: product.id, qty });
  }
  // Charges: explicit values entered by sales win; otherwise the landed-cost estimate for catalog lines.
  let est = null;
  if (catalogLines.length) {
    try {
      est = await landed.estimate({ lines: catalogLines, country, currency: cur.code, method, incoterm });
    } catch {
      est = null;
    }
  }
  const fromEst = (key, payableOnly) => {
    const c = est && est.components.find((x) => x.key === key);
    if (!c || c.amount === null) return null;
    if (payableOnly && !c.includedInPayable) return "0";
    return c.amount;
  };
  const val = (v, fallback) => {
    if (v === undefined || v === null || v === "") return fallback;
    const d = D(v);
    if (!d.isFinite() || d.isNegative()) throw badRequest("Charges must be positive numbers.");
    return d.toFixed(cur.decimals);
  };
  const freight = val(charges.freight, fromEst("freight", true) || "0");
  const insurance = val(charges.insurance, fromEst("insurance", true) || "0");
  const customs = val(charges.customs, fromEst("customs", false));
  const importTax = val(charges.importTax, fromEst("import_tax", false));
  const invoiceTax = val(charges.tax, fromEst("invoice_tax", true) || "0");
  const other = val(charges.other, "0");
  const inco = await one("SELECT seller_pays_import FROM incoterms WHERE code = :c", { c: incoterm });
  const importPayable = inco && Number(inco.seller_pays_import) ? D(customs || 0).plus(importTax || 0) : D(0);
  const tax = D(invoiceTax).plus(importPayable);
  const total = subtotal.minus(discount).plus(freight).plus(insurance).plus(tax).plus(other).toDecimalPlaces(cur.decimals);
  return { cur, lines: out, totals: { subtotal: subtotal.toFixed(cur.decimals), discount: discount.toFixed(cur.decimals), freight, insurance, customs, importTax, tax: tax.toFixed(cur.decimals), invoiceTax: D(invoiceTax).toFixed(cur.decimals), other, total: total.toFixed(cur.decimals) } };
}

async function saveVersion(conn, quoteId, version, body, userId) {
  const country = s(body.country, 2).toUpperCase();
  if (!(await one("SELECT code FROM countries WHERE code = :c", { c: country }, conn))) throw badRequest("Choose the destination country.");
  const incoterm = s(body.incoterm, 3).toUpperCase() || "DAP";
  if (!(await one("SELECT code FROM incoterms WHERE code = :c AND is_active = 1", { c: incoterm }, conn))) throw badRequest("Invalid Incoterm.");
  const priced = await priceVersion({ lines: body.lines || [], country, currency: body.currency, incoterm, method: body.shippingMethod, charges: body.charges || {} });
  if (!priced.lines.length) throw badRequest("A quote needs at least one line.");
  const days = Number(await settings.get("commerce.quote_validity_days", 30));
  const validUntil = body.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil) ? body.validUntil : new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  if (validUntil < new Date().toISOString().slice(0, 10)) throw badRequest("Validity date must be in the future.");
  const t = priced.totals;
  const r = await query(
    `INSERT INTO quote_versions (quote_id, version, country_code, currency, exchange_rate, incoterm, shipping_method, payment_terms, lead_time, valid_until, terms, notes,
       subtotal, discount, freight, insurance, customs_estimate, tax, invoice_tax, import_tax_estimate, other_charges, total, created_by)
     VALUES (:q, :v, :country, :cur, :rate, :inco, :method, :terms, :lead, :valid, :tterms, :notes, :subtotal, :discount, :freight, :insurance, :customs, :tax, :invoiceTax, :importTax, :other, :total, :by)`,
    {
      q: quoteId, v: version, country, cur: priced.cur.code, rate: priced.cur.rate, inco: incoterm, method: s(body.shippingMethod, 20) || null, terms: s(body.paymentTerms, 40) || "prepaid",
      lead: s(body.leadTime, 200), valid: validUntil, tterms: s(body.terms, 10000), notes: s(body.notes, 10000), subtotal: t.subtotal, discount: t.discount, freight: t.freight, insurance: t.insurance,
      customs: t.customs, tax: t.tax, invoiceTax: t.invoiceTax, importTax: t.importTax, other: t.other, total: t.total, by: userId,
    },
    conn
  );
  for (const l of priced.lines) {
    await query(
      "INSERT INTO quote_items (quote_version_id, product_id, sku, description, qty, unit_price, discount_pct, line_total, lead_time) VALUES (:v, :p, :sku, :d, :q, :u, :dp, :t, :lt)",
      { v: r.insertId, p: l.productId, sku: l.sku, d: l.description, q: l.qty, u: l.unitPrice, dp: l.discountPct, t: l.lineTotal, lt: l.leadTime },
      conn
    );
  }
  return r.insertId;
}

async function createQuote(req, body) {
  let rfq = null;
  if (body.rfqId) {
    rfq = await one("SELECT * FROM rfqs WHERE id = :id", { id: body.rfqId });
    if (!rfq) throw notFound("RFQ not found.");
  }
  const email = s(body.customerEmail || (rfq && rfq.contact_email), 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest("Enter the customer's email.");
  const user = await one("SELECT id, company_id FROM users WHERE email = :e", { e: email });
  return tx(async (conn) => {
    const number = await seq.next("quote", conn);
    const q = await query(
      `INSERT INTO quotes (quote_number, access_token, rfq_id, user_id, company_id, customer_name, customer_email, company_name, salesperson_id, created_by)
       VALUES (:n, :t, :rfq, :u, :c, :name, :email, :company, :sp, :by)`,
      {
        n: number, t: seq.token(), rfq: rfq ? rfq.id : null, u: user ? user.id : rfq ? rfq.user_id : null, c: user ? user.company_id : rfq ? rfq.company_id : null,
        name: s(body.customerName || (rfq && rfq.contact_name), 150) || email, email, company: s(body.companyName || (rfq && rfq.company_name), 200), sp: body.salespersonId || req.user.id, by: req.user.id,
      },
      conn
    );
    await saveVersion(conn, q.insertId, 1, { ...body, country: body.country || (rfq && rfq.country_code), currency: body.currency || (rfq && rfq.currency), incoterm: body.incoterm || (rfq && rfq.incoterm) }, req.user.id);
    if (rfq) await query("UPDATE rfqs SET status = 'quoted' WHERE id = :id AND status IN ('submitted','under_review','info_requested')", { id: rfq.id }, conn);
    await audit.record({ req, action: "quote.create", entityType: "quote", entityId: number, after: { rfq: rfq ? rfq.rfq_number : null } }, conn);
    return { quoteId: q.insertId, quoteNumber: number };
  });
}

/** Edit a DRAFT version in place; a SENT version can only be revised (new version). */
async function updateDraft(req, quoteId, body) {
  return tx(async (conn) => {
    const q = await one("SELECT * FROM quotes WHERE id = :id FOR UPDATE", { id: quoteId }, conn);
    if (!q) throw notFound();
    const v = await one("SELECT * FROM quote_versions WHERE quote_id = :q AND version = :v", { q: quoteId, v: q.current_version }, conn);
    if (v.status !== "draft") throw conflict("This version was already sent. Create a revision instead.");
    await query("DELETE FROM quote_items WHERE quote_version_id = :v", { v: v.id }, conn);
    await query("DELETE FROM quote_versions WHERE id = :v", { v: v.id }, conn);
    await saveVersion(conn, quoteId, v.version, body, req.user.id);
    await audit.record({ req, action: "quote.update_draft", entityType: "quote", entityId: q.quote_number }, conn);
  });
}

async function revise(req, quoteId, body) {
  return tx(async (conn) => {
    const q = await one("SELECT * FROM quotes WHERE id = :id FOR UPDATE", { id: quoteId }, conn);
    if (!q) throw notFound();
    if (["accepted", "converted"].includes(q.status)) throw conflict("An accepted quote cannot be revised.");
    const prev = await one("SELECT * FROM quote_versions WHERE quote_id = :q AND version = :v", { q: quoteId, v: q.current_version }, conn);
    if (prev.status === "draft") throw conflict("The current version is still a draft — edit it instead.");
    if (prev.status === "sent") await query("UPDATE quote_versions SET status = 'superseded' WHERE id = :id", { id: prev.id }, conn);
    const next = q.current_version + 1;
    await saveVersion(conn, quoteId, next, body, req.user.id);
    await query("UPDATE quotes SET current_version = :v, status = 'draft' WHERE id = :id", { v: next, id: quoteId }, conn);
    await audit.record({ req, action: "quote.revise", entityType: "quote", entityId: `${q.quote_number}-V${next}`, reason: body.reason }, conn);
    return next;
  });
}

/** Tax IXITEK invoices on a version (older versions predate invoice_tax: tax minus payable import charges). */
function invoiceTaxOf(v, sellerPaysImport) {
  if (v.invoice_tax !== null && v.invoice_tax !== undefined) return v.invoice_tax;
  return sellerPaysImport ? null : v.tax;
}
async function incotermPaysImport(code, conn) {
  const i = await one("SELECT seller_pays_import FROM incoterms WHERE code = :c", { c: code }, conn);
  return Boolean(i && Number(i.seller_pays_import));
}

async function send(req, quoteId) {
  return tx(async (conn) => {
    const q = await one("SELECT * FROM quotes WHERE id = :id FOR UPDATE", { id: quoteId }, conn);
    if (!q) throw notFound();
    const v = await one("SELECT * FROM quote_versions WHERE quote_id = :q AND version = :v", { q: quoteId, v: q.current_version }, conn);
    if (v.status !== "draft") throw conflict("This version was already sent.");
    if (v.country_code === "IN" && D(invoiceTaxOf(v, await incotermPaysImport(v.incoterm, conn)) || 0).gt(0) && !(await gst.sellerGst()).enabled) {
      throw conflict("Set the seller's GST state code in Admin → Finance → Invoicing before sending an Indian quotation with GST, so it can be split into CGST/SGST or IGST.");
    }
    if (v.country_code === "IN" && D(invoiceTaxOf(v, await incotermPaysImport(v.incoterm, conn)) || 0).gt(0) && v.currency !== "INR") {
      throw conflict("Indian quotations that include GST must be in INR (GST invoices are issued in rupees). Revise the quotation currency.");
    }
    await query("UPDATE quote_versions SET status = 'sent', sent_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: v.id }, conn);
    await query("UPDATE quotes SET status = 'sent' WHERE id = :id", { id: quoteId }, conn);
    await audit.record({ req, action: "quote.send", entityType: "quote", entityId: `${q.quote_number}-V${v.version}` }, conn);
    await events.emit("quote.sent", { quoteId, versionId: v.id }, conn, { key: String(v.id) });
  });
}

async function quoteJson(quoteId, { internal = false } = {}) {
  const q = await one("SELECT * FROM quotes WHERE id = :id", { id: quoteId });
  if (!q) return null;
  const versions = await query("SELECT * FROM quote_versions WHERE quote_id = :q ORDER BY version DESC", { q: quoteId });
  const vOut = [];
  for (const v of versions) {
    if (!internal && v.status === "draft") continue; // customers never see drafts
    const items = await query("SELECT product_id, sku, description, qty, unit_price, discount_pct, line_total, lead_time FROM quote_items WHERE quote_version_id = :v ORDER BY id", { v: v.id });
    vOut.push({
      id: String(v.id), version: v.version, label: `${q.quote_number}-V${v.version}`, status: v.status, country: v.country_code, currency: v.currency, incoterm: v.incoterm, shippingMethod: v.shipping_method,
      paymentTerms: v.payment_terms, leadTime: v.lead_time, validUntil: isoDate(v.valid_until), terms: v.terms, notes: v.notes, sentAt: v.sent_at, respondedAt: v.responded_at, responseNote: v.response_note,
      totals: { subtotal: v.subtotal, discount: v.discount, freight: v.freight, insurance: v.insurance, customsEstimate: v.customs_estimate, importTaxEstimate: v.import_tax_estimate, tax: v.tax, otherCharges: v.other_charges, total: v.total },
      items: items.map((i) => ({ productId: i.product_id ? String(i.product_id) : null, sku: i.sku, description: i.description, qty: i.qty, unitPrice: i.unit_price, discountPct: i.discount_pct, lineTotal: i.line_total, leadTime: i.lead_time })),
      ...(internal ? { exchangeRate: v.exchange_rate } : {}),
    });
  }
  const order = q.order_id ? await one("SELECT order_number FROM orders WHERE id = :id", { id: q.order_id }) : null;
  const rfq = internal && q.rfq_id ? await one("SELECT rfq_number FROM rfqs WHERE id = :id", { id: q.rfq_id }) : null;
  return {
    id: String(q.id), quoteNumber: q.quote_number, status: q.status, currentVersion: q.current_version, customer: { name: q.customer_name, email: q.customer_email, company: q.company_name },
    orderNumber: order ? order.order_number : null, createdAt: q.created_at, versions: vOut, ...(internal ? { rfqId: q.rfq_id ? String(q.rfq_id) : null, rfqNumber: rfq ? rfq.rfq_number : null } : {}),
  };
}

/** Customer accepts the current sent version → order at exactly the quoted prices. */
async function accept(req, quoteId, input) {
  const q0 = await one("SELECT id FROM quotes WHERE id = :id", { id: quoteId });
  if (!q0) throw notFound();
  const shipping = orders.cleanAddress(input.shipping, "Shipping");
  const billing = input.billingSameAsShipping ? { ...shipping } : orders.cleanAddress(input.billing, "Billing");
  const pm = String(input.paymentMethod || "bank_transfer");
  return tx(async (conn) => {
    const q = await one("SELECT * FROM quotes WHERE id = :id FOR UPDATE", { id: quoteId }, conn);
    if (q.status !== "sent") throw conflict(q.status === "converted" ? "This quote was already accepted." : `This quote is ${q.status}.`);
    const v = await one("SELECT * FROM quote_versions WHERE quote_id = :q AND version = :v", { q: quoteId, v: q.current_version }, conn);
    if (v.status !== "sent") throw conflict("Only the latest sent version can be accepted.");
    if (isoDate(v.valid_until) < new Date().toISOString().slice(0, 10)) throw conflict("This quotation has expired. Please ask for a revised quote.");
    const methods = await orders.paymentMethodsFor({ currency: v.currency, user: req.user });
    if (!methods.includes(pm)) throw badRequest(`Payment method not available. Choose one of: ${methods.join(", ")}.`);
    const items = await query("SELECT * FROM quote_items WHERE quote_version_id = :v ORDER BY id", { v: v.id }, conn);
    const est = {
      country: { code: v.country_code }, currency: { code: v.currency, rate: v.exchange_rate }, incoterm: { code: v.incoterm }, shipping: v.shipping_method ? { method: v.shipping_method } : null,
      lines: items.filter((i) => i.product_id).map((i) => ({ productId: String(i.product_id), unitPrice: i.unit_price, lineTotal: i.line_total, hsCode: null })),
      components: [
        { key: "goods", label: "Products", amount: D(v.subtotal).minus(v.discount).toFixed(2), includedInPayable: true },
        { key: "freight", label: "Freight", amount: v.freight, includedInPayable: true },
        { key: "tax", label: "Tax", amount: v.tax, includedInPayable: true },
      ],
      totals: { payable: v.total, tdsWithheld: null, estimatedImportCharges: v.customs_estimate !== null || v.import_tax_estimate !== null ? D(v.customs_estimate || 0).plus(v.import_tax_estimate || 0).toFixed(2) : null, estimatedLandedCost: null },
      quote: { number: `${q.quote_number}-V${v.version}` },
    };
    const invoiceTax = invoiceTaxOf(v, await incotermPaysImport(v.incoterm, conn));
    if (v.country_code === "IN" && D(invoiceTax || 0).gt(0) && !(await gst.sellerGst()).enabled) throw conflict("This quotation can't be accepted online at the moment. Please contact IXITEK sales.");
    const hsByItem = new Map();
    for (const i of items.filter((x) => x.product_id)) {
      const p = await one("SELECT id, hs_code, category_id FROM products WHERE id = :id", { id: i.product_id }, conn);
      if (p) hsByItem.set(i.id, (await landed.hsFor(p)).hs);
    }
    const { orderId, number, token } = await orders.insertOrder(conn, {
      est,
      lines: items.map((i) => ({ productId: i.product_id, qty: i.qty, unitPrice: i.unit_price, lineTotal: i.line_total, sku: i.sku, name: i.description, hsCode: hsByItem.get(i.id) || null, discount: D(i.unit_price).times(i.qty).minus(i.line_total).toFixed(2) })),
      customer: { userId: q.user_id || (req.user && req.user.id) || null, companyId: q.company_id },
      input: {
        email: q.customer_email, name: q.customer_name, phone: input.phone, companyName: q.company_name, taxId: input.taxId, poNumber: input.poNumber, paymentMethod: pm,
        paymentTerms: v.payment_terms, status: pm === "purchase_order" ? "confirmed" : "pending_payment", billing, shipping, notes: `From quotation ${q.quote_number}-V${v.version}`, idempotencyKey: `quote:${v.id}`,
      },
      source: "quote",
      quoteVersionId: v.id,
      overrideTotals: { subtotal: v.subtotal, discount: v.discount, freight: v.freight, insurance: v.insurance, customs: v.customs_estimate, importTax: v.import_tax_estimate, tax: v.tax, invoiceTax, handling: "0", other: v.other_charges, total: v.total },
    });
    await orders.reserveStock(conn, orderId, items.map((i) => ({ productId: i.product_id, qty: i.qty })), req.user ? req.user.id : null);
    await query("UPDATE quote_versions SET status = 'accepted', responded_at = CURRENT_TIMESTAMP(3), response_note = :n WHERE id = :id", { n: s(input.note, 1000) || null, id: v.id }, conn);
    await query("UPDATE quotes SET status = 'converted', order_id = :o WHERE id = :id", { o: orderId, id: q.id }, conn);
    if (q.rfq_id) await query("UPDATE rfqs SET status = 'converted' WHERE id = :id", { id: q.rfq_id }, conn);
    await audit.record({ req, actorEmail: q.customer_email, action: "quote.accept", entityType: "quote", entityId: `${q.quote_number}-V${v.version}`, after: { order: number } }, conn);
    await events.emit("order.placed", { orderId }, conn, { key: String(orderId) });
    return { orderNumber: number, accessToken: token, orderId };
  });
}

async function reject(req, quoteId, note) {
  return tx(async (conn) => {
    const q = await one("SELECT * FROM quotes WHERE id = :id FOR UPDATE", { id: quoteId }, conn);
    if (!q || q.status !== "sent") throw conflict("Only a sent quotation can be rejected.");
    await query("UPDATE quote_versions SET status = 'rejected', responded_at = CURRENT_TIMESTAMP(3), response_note = :n WHERE quote_id = :q AND version = :v", { n: s(note, 1000) || null, q: quoteId, v: q.current_version }, conn);
    await query("UPDATE quotes SET status = 'rejected' WHERE id = :id", { id: quoteId }, conn);
    await audit.record({ req, actorEmail: q.customer_email, action: "quote.reject", entityType: "quote", entityId: q.quote_number, reason: note }, conn);
    await events.emit("quote.rejected", { quoteId }, conn, { key: `${quoteId}:${q.current_version}` });
  });
}

/** Daily: expire past-validity quotes; remind 3 days before expiry (once per version). */
async function expiryJob() {
  const expired = await query("SELECT q.id, v.id AS vid FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version = q.current_version WHERE q.status = 'sent' AND v.valid_until < CURRENT_DATE()");
  for (const e of expired) {
    await tx(async (conn) => {
      await query("UPDATE quote_versions SET status = 'expired' WHERE id = :id", { id: e.vid }, conn);
      await query("UPDATE quotes SET status = 'expired' WHERE id = :id AND status = 'sent'", { id: e.id }, conn);
      await events.emit("quote.expired", { quoteId: e.id }, conn, { key: String(e.vid) });
    });
  }
  const soon = await query("SELECT q.id, v.id AS vid FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version = q.current_version WHERE q.status = 'sent' AND v.valid_until BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY)");
  for (const r of soon) await events.emit("quote.expiring", { quoteId: r.id, versionId: r.vid }, null, { key: `remind:${r.vid}` });
  return { expired: expired.length, reminded: soon.length };
}
require("../../core/jobs.js").register("quotes.expiry", expiryJob);

module.exports = { createRfq, rfqJson, createQuote, updateDraft, revise, send, quoteJson, accept, reject, expiryJob, priceVersion };
