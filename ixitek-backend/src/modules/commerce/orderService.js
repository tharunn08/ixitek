// orderService.js — checkout → order. Everything is recalculated on the
// server; the order row stores an immutable snapshot (names, SKUs, unit
// prices, charges, currency and exchange rate) so later price, FX or rule
// changes never alter historical orders.
const { query, one, tx, json } = require("../../core/db.js");
const { D } = require("../../core/money.js");
const { config } = require("../../core/config.js");
const audit = require("../../core/audit.js");
const events = require("../../core/events.js");
const seq = require("./sequences.js");
const landed = require("../intl/landedCost.js");
const inventory = require("../inventory/inventoryService.js");
const gst = require("../intl/gst.js");
const { badRequest, conflict, notFound, forbidden } = require("../../core/errors.js");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRANSITIONS = {
  pending_approval: ["pending_payment", "confirmed", "cancelled"],
  pending_payment: ["confirmed", "payment_failed", "cancelled"],
  payment_failed: ["pending_payment", "confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "processing"],
  shipped: ["in_transit", "out_for_delivery", "delivered"],
  in_transit: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered", "in_transit"],
  delivered: ["returned"],
  cancelled: [],
  returned: ["refunded", "partially_refunded"],
  refunded: [],
  partially_refunded: ["refunded"],
};

function cleanAddress(a, label) {
  if (!a || typeof a !== "object") throw badRequest(`${label} address is required.`);
  const s = (v, n) => String(v || "").trim().slice(0, n);
  const out = {
    contact_name: s(a.contactName || a.name, 150), company_name: s(a.companyName, 200), line1: s(a.line1, 200), line2: s(a.line2, 200),
    city: s(a.city, 100), state: s(a.state, 100), postal_code: s(a.postalCode, 20), country_code: s(a.countryCode || a.country, 2).toUpperCase(), phone: s(a.phone, 40), tax_id: s(a.taxId, 60),
  };
  const missing = ["contact_name", "line1", "city", "country_code"].filter((k) => !out[k]);
  if (missing.length) throw badRequest(`${label} address is incomplete (${missing.join(", ").replace(/_/g, " ")}).`);
  out.state_code = null;
  if (out.country_code === "IN") {
    // Indian addresses need a recognised state/UT: it is the GST place of supply.
    const st = gst.resolveState(a.stateCode || out.state);
    if (!st) throw badRequest(`${label} address: select the state or union territory.`);
    out.state = st.name;
    out.state_code = st.code;
  }
  return out;
}

async function paymentMethodsFor({ currency, user }) {
  const methods = [];
  const cur = await one("SELECT razorpay_enabled FROM currencies WHERE code = :c", { c: currency });
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && cur && Number(cur.razorpay_enabled)) methods.push("razorpay");
  methods.push("bank_transfer");
  if (user && user.company_id) {
    const c = await one("SELECT status, payment_terms, credit_limit_usd FROM companies WHERE id = :id", { id: user.company_id });
    // Purchase-order (credit) terms only for approved companies with terms AND a credit limit set by IXITEK.
    if (c && c.status === "approved" && c.payment_terms !== "prepaid" && D(c.credit_limit_usd).gt(0) && ["admin", "buyer", "approver", "finance"].includes(user.company_role)) methods.push("purchase_order");
  }
  return methods;
}

/** Reserve stock for tracked items that have inventory records. */
async function reserveStock(conn, orderId, items, userId) {
  const notes = [];
  for (const it of items) {
    if (!it.productId) continue; // custom quoted item — not a stock item
    const p = await one("SELECT id, sku, track_inventory, allow_backorder FROM products WHERE id = :id", { id: it.productId }, conn);
    if (!p || !p.track_inventory) continue;
    const levels = await query(
      `SELECT l.warehouse_id, l.on_hand - l.reserved AS free FROM inventory_levels l JOIN warehouses w ON w.id = l.warehouse_id AND w.is_active = 1
        WHERE l.product_id = :p ORDER BY w.is_default DESC, free DESC`,
      { p: p.id },
      conn
    );
    if (!levels.length) {
      notes.push(`${p.sku}: made to order (lead time on request)`);
      continue;
    }
    let need = it.qty;
    for (const l of levels) {
      if (need <= 0) break;
      const take = Math.min(need, Math.max(0, Number(l.free)));
      if (take <= 0) continue;
      await inventory.adjust({ productId: p.id, warehouseId: l.warehouse_id, operation: "reserve", quantity: take, reason: `Order reservation`, referenceType: "order", referenceId: String(orderId), userId }, conn);
      await query("INSERT INTO stock_reservations (order_id, product_id, warehouse_id, qty) VALUES (:o, :p, :w, :q)", { o: orderId, p: p.id, w: l.warehouse_id, q: take }, conn);
      need -= take;
    }
    if (need > 0) {
      if (!p.allow_backorder) throw conflict(`${p.sku}: only ${it.qty - need} available in stock. Reduce the quantity or request a quote.`);
      notes.push(`${p.sku}: ${need} on backorder`);
    }
  }
  return notes;
}

async function releaseReservations(conn, orderId, userId, reason) {
  const rows = await query("SELECT * FROM stock_reservations WHERE order_id = :o AND status = 'reserved' FOR UPDATE", { o: orderId }, conn);
  for (const r of rows) {
    await inventory.adjust({ productId: r.product_id, warehouseId: r.warehouse_id, operation: "release", quantity: r.qty, reason, referenceType: "order", referenceId: String(orderId), userId }, conn);
    await query("UPDATE stock_reservations SET status = 'released' WHERE id = :id", { id: r.id }, conn);
  }
}

/** On shipment: reserved stock leaves on-hand. */
async function consumeReservations(conn, orderId, userId) {
  const rows = await query("SELECT * FROM stock_reservations WHERE order_id = :o AND status = 'reserved' FOR UPDATE", { o: orderId }, conn);
  for (const r of rows) {
    await inventory.adjust({ productId: r.product_id, warehouseId: r.warehouse_id, operation: "release", quantity: r.qty, reason: "Shipped", referenceType: "order", referenceId: String(orderId), userId }, conn);
    await inventory.adjust({ productId: r.product_id, warehouseId: r.warehouse_id, operation: "decrease", quantity: r.qty, reason: "Shipped", referenceType: "order", referenceId: String(orderId), userId }, conn);
    await query("UPDATE stock_reservations SET status = 'consumed' WHERE id = :id", { id: r.id }, conn);
  }
}

function pick(est, key) {
  const c = est.components.find((x) => x.key === key);
  return c ? c : null;
}
const amt = (c, payableOnly = true) => (c && c.amount !== null && (!payableOnly || c.includedInPayable) ? c.amount : "0");

/**
 * Indian GST split for a new order, or null when no Indian GST is charged.
 * Web orders take the per-line split the customer reviewed (rule rates);
 * quote orders split the quoted tax across lines by taxable value (effective rate).
 */
async function gstForOrder({ est, lines, input, overrideTotals }) {
  if (est.country.code !== "IN") return null;
  const posState = gst.resolveState(input.shipping && (input.shipping.state_code || input.shipping.state));
  if (!overrideTotals) {
    const g = est.gst;
    if (!g || !g.applicable || !D(g.totals.total).gt(0)) return null;
    if (!g.supplyType || !g.placeOfSupply) throw badRequest("Select the delivery state so GST can be calculated.");
    if (!posState || posState.code !== g.placeOfSupply.code) throw conflict("The delivery state changed after the GST was calculated. Please review your order again.");
    return g;
  }
  const invoiceTax = overrideTotals.invoiceTax;
  if (invoiceTax === null || invoiceTax === undefined || !D(invoiceTax).gt(0)) return null;
  const seller = await gst.sellerGst();
  if (!seller.enabled || !posState) return null;
  const decimals = D(overrideTotals.total).decimalPlaces() || 2;
  // Taxable value = line amounts + freight/insurance/other allocated by line share (incidental charges are part of the value of supply).
  const extras = D(overrideTotals.freight || 0).plus(overrideTotals.insurance || 0).plus(overrideTotals.other || 0);
  const goods = lines.reduce((sum, l) => sum.plus(l.lineTotal || 0), D(0));
  if (!goods.gt(0)) return null;
  let allocated = D(0);
  const rows = lines.map((l, i) => {
    const share = i === lines.length - 1 ? extras.minus(allocated) : extras.times(D(l.lineTotal || 0)).div(goods).toDecimalPlaces(decimals, 4);
    allocated = allocated.plus(share);
    return { key: String(i), sku: l.sku, hsCode: l.hsCode || null, taxable: D(l.lineTotal || 0).plus(share) };
  });
  return gst.splitLumpSum(rows, invoiceTax, { sellerState: seller.state, posState, decimals: Math.max(decimals, 2) });
}

/** Insert the order + snapshot (inside `conn`). `lines` = [{productId, qty, unitPrice?, name?, sku?}] */
async function insertOrder(conn, { est, lines, customer, input, source = "web", quoteVersionId = null, overrideTotals = null }) {
  const number = await seq.next("order", conn);
  const token = seq.token();
  const t = overrideTotals || {
    subtotal: amt(pick(est, "goods")), freight: amt(pick(est, "freight")), insurance: amt(pick(est, "insurance")),
    customs: pick(est, "customs") && pick(est, "customs").amount !== null ? pick(est, "customs").amount : null,
    importTax: pick(est, "import_tax") && pick(est, "import_tax").amount !== null ? pick(est, "import_tax").amount : null,
    tax: D(amt(pick(est, "invoice_tax"))).plus(pick(est, "customs") && pick(est, "customs").includedInPayable ? amt(pick(est, "customs")) : 0).plus(pick(est, "import_tax") && pick(est, "import_tax").includedInPayable ? amt(pick(est, "import_tax")) : 0).toFixed(2),
    handling: amt(pick(est, "handling")), other: D(amt(pick(est, "other"))).plus(amt(pick(est, "other_import"))).toFixed(2), discount: "0",
    total: est.totals.payable,
  };
  if (t.total === null || t.total === undefined) throw conflict("This order cannot be priced automatically. Please request a quote.");
  const totalUsd = D(t.total).div(est.currency.rate).toFixed(4);
  const g = await gstForOrder({ est, lines, input, overrideTotals });
  const r = await query(
    `INSERT INTO orders (order_number, access_token, user_id, company_id, customer_email, customer_name, customer_phone, company_name, tax_id, po_number,
       country_code, currency, exchange_rate, incoterm, shipping_method, status, payment_method, payment_terms, subtotal, discount, freight, insurance,
       customs_estimate, import_tax_estimate, tax, place_of_supply, gst_supply_type, state_tax_label, gst_taxable_value, cgst, sgst, igst, gst_rate_basis,
       handling, other_charges, total, tds_amount, import_charges_estimate, landed_estimate, total_usd,
       estimate_json, notes, source, quote_version_id, idempotency_key)
     VALUES (:num, :tok, :uid, :cid, :email, :name, :phone, :company, :taxId, :po, :country, :cur, :rate, :inco, :method, :status, :pm, :terms,
       :subtotal, :discount, :freight, :insurance, :customs, :importTax, :tax, :pos, :gstType, :gstLabel, :gstTaxable, :cgst, :sgst, :igst, :gstBasis,
       :handling, :other, :total, :tds, :importCharges, :landed, :totalUsd,
       :est, :notes, :source, :qv, :idem)`,
    {
      num: number, tok: token, uid: customer.userId || null, cid: customer.companyId || null, email: input.email, name: input.name, phone: input.phone || "",
      company: input.companyName || "", taxId: input.taxId || "", po: input.poNumber || "", country: est.country.code, cur: est.currency.code, rate: est.currency.rate,
      inco: est.incoterm.code, method: est.shipping ? est.shipping.method : null, status: input.status, pm: input.paymentMethod, terms: input.paymentTerms || "prepaid",
      subtotal: t.subtotal, discount: t.discount, freight: t.freight, insurance: t.insurance, customs: t.customs, importTax: t.importTax, tax: t.tax, handling: t.handling, other: t.other,
      total: t.total, tds: est.totals.tdsWithheld ? est.totals.tdsWithheld.amount : null, importCharges: est.totals.estimatedImportCharges, landed: est.totals.estimatedLandedCost,
      pos: g ? g.placeOfSupply.code : null, gstType: g ? g.supplyType : null, gstLabel: g ? g.stateTaxLabel : null, gstTaxable: g ? g.totals.taxable : null,
      cgst: g ? g.totals.cgst : null, sgst: g ? g.totals.sgst : null, igst: g ? g.totals.igst : null, gstBasis: g ? (g.effectiveRate ? "effective" : "rule") : null,
      totalUsd, est: JSON.stringify(est), notes: String(input.notes || "").slice(0, 2000), source, qv: quoteVersionId, idem: input.idempotencyKey || null,
    },
    conn
  );
  const orderId = r.insertId;
  const byId = new Map(est.lines.map((l) => [l.productId, l]));
  for (const [idx, l] of lines.entries()) {
    const e = l.productId ? byId.get(String(l.productId)) : null;
    const gl = g ? g.lines.find((x) => x.key === (g.effectiveRate ? String(idx) : String(l.productId))) : null;
    // Quoted custom lines (no catalog product) keep the SKU/description from the quotation.
    const p = l.productId ? await one("SELECT id, sku, name FROM products WHERE id = :id", { id: l.productId }, conn) : { id: null, sku: l.sku || "CUSTOM", name: l.name || "Custom item" };
    const attrs = l.productId ? await query("SELECT a.name, v.value_text AS value FROM product_attribute_values v JOIN attributes a ON a.id = v.attribute_id WHERE v.product_id = :id ORDER BY a.sort_order", { id: l.productId }, conn) : [];
    const unit = l.unitPrice !== undefined ? l.unitPrice : e.unitPrice;
    const lineTotal = l.lineTotal !== undefined ? l.lineTotal : e.lineTotal;
    if (unit === null || unit === undefined) throw conflict(`${p.sku} has no price. Please request a quote.`);
    await query(
      `INSERT INTO order_items (order_id, product_id, sku, name, attributes_json, hs_code, qty, unit_price, discount, line_total, unit_price_usd, gst_taxable_value, gst_rate, cgst, sgst, igst)
       VALUES (:o, :p, :sku, :name, :attrs, :hs, :qty, :unit, :disc, :total, :usd, :gt, :gr, :cg, :sg, :ig)`,
      {
        o: orderId, p: p.id, sku: l.sku || p.sku, name: l.name || p.name, attrs: JSON.stringify(attrs), hs: (e && e.hsCode) || l.hsCode || null, qty: l.qty, unit, disc: l.discount || 0, total: lineTotal, usd: D(unit).div(est.currency.rate).toFixed(4),
        gt: gl ? gl.taxable : null, gr: gl ? gl.ratePct : null, cg: gl ? gl.cgst : null, sg: gl ? gl.sgst : null, ig: gl ? gl.igst : null,
      },
      conn
    );
  }
  for (const [type, a] of [["billing", input.billing], ["shipping", input.shipping]]) {
    await query(
      `INSERT INTO order_addresses (order_id, address_type, contact_name, company_name, line1, line2, city, state, state_code, postal_code, country_code, phone, tax_id)
       VALUES (:o, :t, :contact_name, :company_name, :line1, :line2, :city, :state, :state_code, :postal_code, :country_code, :phone, :tax_id)`,
      { o: orderId, t: type, state_code: null, ...a },
      conn
    );
  }
  await query("INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (:o, NULL, :s, :n, :u)", { o: orderId, s: input.status, n: `Order placed (${source})`, u: customer.userId || null }, conn);
  return { orderId, number, token };
}

/** Checkout: server recalculates everything from the cart. Idempotent per key. */
async function findByIdempotencyKey(key) {
  const k = String(key || "");
  if (!/^[\w-]{16,100}$/.test(k)) return null;
  const o = await one("SELECT order_number, access_token FROM orders WHERE idempotency_key = :k", { k });
  return o ? { orderNumber: o.order_number, accessToken: o.access_token, duplicate: true } : null;
}

async function placeFromCart(req, cart, input) {
  const idem = String(input.idempotencyKey || "").slice(0, 100);
  if (!/^[\w-]{16,100}$/.test(idem)) throw badRequest("Missing checkout idempotency key.");
  const existing = await one("SELECT order_number, access_token FROM orders WHERE idempotency_key = :k", { k: idem });
  if (existing) return { orderNumber: existing.order_number, accessToken: existing.access_token, duplicate: true };

  const email = String(input.email || (req.user && req.user.email) || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");
  const name = String(input.name || (req.user && req.user.name) || "").trim().slice(0, 150);
  if (!name) throw badRequest("Enter your name.");
  if (!input.acceptTerms) throw badRequest("Please accept the terms of sale.");
  const shipping = cleanAddress(input.shipping, "Shipping");
  const billing = input.billingSameAsShipping ? { ...shipping } : cleanAddress(input.billing, "Billing");
  const cty = await one("SELECT code, requires_tax_id, tax_id_label FROM countries WHERE code = :c AND is_active = 1", { c: shipping.country_code });
  if (!cty) throw badRequest("We don't ship to that country online yet. Please request a quote.");
  let taxId = String(input.taxId || billing.tax_id || "").trim().slice(0, 60);
  if (cty.requires_tax_id && !taxId) throw badRequest(`${cty.tax_id_label} is required for ${cty.code}.`);
  if (taxId && cty.code === "IN") {
    const v = gst.validateGstin(taxId);
    if (!v.valid) throw badRequest(`GSTIN: ${v.reason}`);
    taxId = v.gstin;
  }

  const items = await query(
    "SELECT ci.product_id, ci.qty FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = :c AND ci.saved_for_later = 0 AND p.deleted_at IS NULL",
    { c: cart.id }
  );
  if (!items.length) throw badRequest("Your cart is empty.");
  const { customerFor } = require("../intl/publicRoutes.js");
  const customer = await customerFor(req);
  const lines = items.map((i) => ({ productId: Number(i.product_id), qty: i.qty }));
  const est = await landed.estimate({ lines, country: shipping.country_code, currency: input.currency, method: input.shippingMethod, incoterm: input.incoterm, state: shipping.state_code, customer });
  if (!est.canCheckout) throw conflict(est.blockers.map((b) => b.message).join(" "), { blockers: est.blockers });
  // The customer confirms the total they saw; if anything moved (price, FX, rules) they must review again.
  if (input.expectedTotal !== undefined && String(input.expectedTotal) !== String(est.totals.payable)) {
    throw conflict("Prices or charges changed since you reviewed your order. Please review the updated total.", { newTotal: est.totals.payable, currency: est.currency.code });
  }
  const methods = await paymentMethodsFor({ currency: est.currency.code, user: req.user });
  const pm = String(input.paymentMethod || "");
  if (!methods.includes(pm)) throw badRequest(`Payment method not available. Choose one of: ${methods.join(", ")}.`);

  let status = pm === "purchase_order" ? "confirmed" : "pending_payment";
  let paymentTerms = "prepaid";
  if (req.user && req.user.company_id) {
    const c = await one("SELECT payment_terms, order_approval_threshold_usd, credit_limit_usd FROM companies WHERE id = :id", { id: req.user.company_id });
    const totalUsd = D(est.totals.payable).div(est.currency.rate);
    if (pm === "purchase_order") {
      paymentTerms = c.payment_terms;
      // Credit exposure = unpaid purchase-order orders not cancelled + this order.
      const open = await one("SELECT COALESCE(SUM(total_usd - amount_paid / exchange_rate), 0) AS v FROM orders WHERE company_id = :c AND payment_method = 'purchase_order' AND payment_status <> 'paid' AND status NOT IN ('cancelled','refunded')", { c: req.user.company_id });
      if (D(open.v).plus(totalUsd).gt(c.credit_limit_usd)) throw conflict("This order exceeds your company's available credit. Choose another payment method or contact your account manager.");
    }
    if (c.order_approval_threshold_usd !== null && totalUsd.gt(c.order_approval_threshold_usd) && !["admin", "approver"].includes(req.user.company_role)) status = "pending_approval";
  }

  const result = await tx(async (conn) => {
    const locked = await one("SELECT id, status FROM carts WHERE id = :id FOR UPDATE", { id: cart.id }, conn);
    if (!locked || locked.status !== "active") throw conflict("This cart was already checked out.");
    const { orderId, number, token } = await insertOrder(conn, {
      est, lines, customer,
      input: { email, name, phone: input.phone, companyName: input.companyName || shipping.company_name, taxId, poNumber: input.poNumber, paymentMethod: pm, paymentTerms, status, billing, shipping, notes: input.notes, idempotencyKey: idem },
    });
    const notes = await reserveStock(conn, orderId, lines, customer.userId);
    if (notes.length) await query("UPDATE orders SET notes = CONCAT(notes, :n) WHERE id = :id", { n: `${notes.join("; ")}`, id: orderId }, conn);
    await query("UPDATE carts SET status = 'converted' WHERE id = :id", { id: cart.id }, conn);
    for (const l of lines) await query("INSERT INTO product_stats (product_id, orders, units_sold) VALUES (:p, 1, :q) ON DUPLICATE KEY UPDATE orders = orders + 1, units_sold = units_sold + VALUES(units_sold)", { p: l.productId, q: l.qty }, conn);
    await audit.record({ req, action: "order.place", entityType: "order", entityId: number, after: { total: est.totals.payable, currency: est.currency.code, paymentMethod: pm, status } }, conn);
    await events.emit("order.placed", { orderId }, conn, { key: String(orderId) });
    return { orderId, number, token };
  });
  return { orderNumber: result.number, accessToken: result.token, orderId: result.orderId };
}

async function setStatus(conn, orderId, to, { note = "", actorId = null, force = false } = {}) {
  const o = await one("SELECT id, order_number, status FROM orders WHERE id = :id FOR UPDATE", { id: orderId }, conn);
  if (!o) throw notFound("Order not found.");
  if (o.status === to) return o;
  if (!force && !(TRANSITIONS[o.status] || []).includes(to)) throw conflict(`An order cannot move from “${o.status}” to “${to}”.`);
  await query("UPDATE orders SET status = :s WHERE id = :id", { s: to, id: orderId }, conn);
  await query("INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_user_id) VALUES (:o, :f, :t, :n, :u)", { o: orderId, f: o.status, t: to, n: String(note).slice(0, 1000), u: actorId }, conn);
  if (to === "cancelled") await releaseReservations(conn, orderId, actorId, "Order cancelled");
  await events.emit(`order.status.${to}`, { orderId, from: o.status }, conn, { key: `${orderId}:${to}:${Date.now()}` });
  return { ...o, status: to };
}

/** Serialize an order for its owner / admin. Never includes supplier costs (none are stored on orders). */
async function orderJson(orderId, { includeInternal = false } = {}) {
  const o = await one("SELECT * FROM orders WHERE id = :id", { id: orderId });
  if (!o) return null;
  const [items, addresses, history, payments, invoices, shipments] = await Promise.all([
    query("SELECT id, product_id, sku, name, attributes_json, hs_code, qty, unit_price, discount, line_total, qty_shipped, qty_returned, gst_taxable_value, gst_rate, cgst, sgst, igst FROM order_items WHERE order_id = :id ORDER BY id", { id: orderId }),
    query("SELECT * FROM order_addresses WHERE order_id = :id", { id: orderId }),
    query(`SELECT from_status, to_status, note, is_internal, created_at FROM order_status_history WHERE order_id = :id ${includeInternal ? "" : "AND is_internal = 0"} ORDER BY id`, { id: orderId }),
    tableExists("payments") ? query("SELECT id, provider, provider_payment_id, status, amount, currency, method, created_at FROM payments WHERE order_id = :id ORDER BY id", { id: orderId }) : [],
    tableExists("invoices") ? query("SELECT invoice_number, invoice_type, status, total, currency, issued_at, due_date FROM invoices WHERE order_id = :id ORDER BY id", { id: orderId }) : [],
    tableExists("shipments") ? require("../operations/shipmentService.js").listForOrder(orderId, { internal: includeInternal }) : [],
  ]);
  const est = json(o.estimate_json, {});
  return {
    orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status, paymentMethod: o.payment_method, paymentTerms: o.payment_terms,
    placedAt: o.placed_at, currency: o.currency, exchangeRate: includeInternal ? o.exchange_rate : undefined, country: o.country_code, incoterm: o.incoterm, shippingMethod: o.shipping_method,
    customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone, company: o.company_name, taxId: o.tax_id, poNumber: o.po_number },
    totals: { subtotal: o.subtotal, discount: o.discount, freight: o.freight, insurance: o.insurance, customsEstimate: o.customs_estimate, importTaxEstimate: o.import_tax_estimate, tax: o.tax, handling: o.handling, otherCharges: o.other_charges, total: o.total, tds: o.tds_amount, importChargesEstimate: o.import_charges_estimate, landedEstimate: o.landed_estimate, amountPaid: o.amount_paid, amountRefunded: o.amount_refunded, balanceDue: D(o.total).minus(o.amount_paid).isNegative() ? "0.00" : D(o.total).minus(o.amount_paid).toFixed(2) },
    components: est.components || [],
    gst: gstJson(o),
    disclaimer: est.disclaimer,
    items: items.map((i) => ({ id: String(i.id), productId: i.product_id ? String(i.product_id) : null, sku: i.sku, name: i.name, attributes: json(i.attributes_json, []), hsCode: i.hs_code, qty: i.qty, unitPrice: i.unit_price, discount: i.discount, lineTotal: i.line_total, qtyShipped: i.qty_shipped, qtyReturned: i.qty_returned, gst: i.gst_rate === null ? null : { taxable: i.gst_taxable_value, ratePct: String(Number(i.gst_rate)), cgst: i.cgst, sgst: i.sgst, igst: i.igst } })),
    addresses: Object.fromEntries(addresses.map((a) => [a.address_type, { contactName: a.contact_name, companyName: a.company_name, line1: a.line1, line2: a.line2, city: a.city, state: a.state, stateCode: a.state_code, postalCode: a.postal_code, countryCode: a.country_code, phone: a.phone, taxId: a.tax_id }])),
    history: history.map((h) => ({ from: h.from_status, to: h.to_status, note: h.note, at: h.created_at, ...(includeInternal ? { internal: Boolean(h.is_internal) } : {}) })),
    payments: payments.map((p) => ({ id: String(p.id), provider: p.provider, reference: p.provider_payment_id, status: p.status, amount: p.amount, currency: p.currency, method: p.method, at: p.created_at })),
    invoices: invoices.map((i) => ({ number: i.invoice_number, type: i.invoice_type, status: i.status, total: i.total, currency: i.currency, issuedAt: i.issued_at, dueDate: i.due_date })),
    shipments,
    notes: o.notes,
    source: o.source,
    ...(includeInternal ? { id: String(o.id), userId: o.user_id ? String(o.user_id) : null, companyId: o.company_id ? String(o.company_id) : null, totalUsd: o.total_usd } : {}),
  };
}

function gstJson(o) {
  if (!o.gst_supply_type) return null;
  const st = gst.resolveState(o.place_of_supply);
  return {
    supplyType: o.gst_supply_type, placeOfSupply: { code: o.place_of_supply, name: st ? st.name : o.place_of_supply }, stateTaxLabel: o.state_tax_label || "SGST",
    taxable: o.gst_taxable_value, cgst: o.cgst, sgst: o.sgst, igst: o.igst, rateBasis: o.gst_rate_basis,
  };
}

const existingTables = new Set();
function tableExists(name) {
  return existingTables.has(name);
}
async function refreshTables() {
  const rows = await query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
  existingTables.clear();
  rows.forEach((r) => existingTables.add(r.t));
}

/** Access check: owner (user), same company (company roles), or guest token. */
async function canView(req, o, token) {
  if (req.user) {
    if (o.user_id && Number(o.user_id) === Number(req.user.id)) return true;
    if (o.company_id && req.user.company_id && Number(o.company_id) === Number(req.user.company_id) && req.user.company_role) return true;
    if (await require("../../core/rbac.js").can(req.user, "orders.read")) return true;
  }
  if (token && typeof token === "string" && token.length === o.access_token.length && require("crypto").timingSafeEqual(Buffer.from(token), Buffer.from(o.access_token))) return true;
  return false;
}

void config;
void forbidden;
module.exports = { gstJson, findByIdempotencyKey, TRANSITIONS, paymentMethodsFor, placeFromCart, insertOrder, reserveStock, releaseReservations, consumeReservations, setStatus, orderJson, canView, cleanAddress, refreshTables };
