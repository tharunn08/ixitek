// Customer-facing commerce API: cart, wishlist, quick order, BOM upload,
// checkout, orders, RFQs and quotations. Prices and totals are always
// computed on the server; nothing the browser sends about money is trusted.
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { query, one } = require("../../core/db.js");
const { optionalAuth, requireAuth } = require("../../middleware/auth.js");
const storage = require("../../core/storage.js");
const cart = require("./cartService.js");
const orders = require("./orderService.js");
const rq = require("./rfqQuoteService.js");
const { parseXlsx, parseCsvBuffer } = require("../import/parser.js");
const { ah, badRequest, notFound, forbidden } = require("../../core/errors.js");
const { paging, meta } = require("../../core/paging.js");

const router = express.Router();
const crypto = require("crypto");
/** Constant-time comparison for access tokens in links. */
const safeEq = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
const rfqLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" } });

router.use(optionalAuth);
const noStore = (req, res, next) => (res.set("Cache-Control", "private, no-store"), next());
router.use(noStore);

// ── Cart ──────────────────────────────────────────────────────────────────
const ctx = (req) => ({ country: req.query.country || req.body?.country, currency: req.query.currency || req.body?.currency, method: req.query.method ?? req.body?.method, incoterm: req.query.incoterm ?? req.body?.incoterm, state: req.query.state || req.body?.state });

router.get("/cart", ah(async (req, res) => res.json(await cart.view(req, await cart.resolveCart(req, res), ctx(req)))));

router.post(
  "/cart/items",
  writeLimiter,
  ah(async (req, res) => {
    const c = await cart.resolveCart(req, res, { create: true });
    const list = Array.isArray(req.body.items) ? req.body.items : [req.body];
    if (list.length > 500) throw badRequest("Up to 500 lines at a time.");
    for (const it of list) await cart.addItem(c, { productId: it.productId, sku: it.sku, slug: it.slug, qty: it.qty, mode: it.mode });
    res.status(201).json(await cart.view(req, c, ctx(req)));
  })
);

router.patch(
  "/cart/items/:id",
  writeLimiter,
  ah(async (req, res) => {
    const c = await cart.resolveCart(req, res);
    if (!c) throw notFound("Cart not found.");
    await cart.updateItem(c, req.params.id, { qty: req.body.qty, savedForLater: req.body.savedForLater });
    res.json(await cart.view(req, c, ctx(req)));
  })
);

router.delete(
  "/cart/items/:id",
  ah(async (req, res) => {
    const c = await cart.resolveCart(req, res);
    if (!c) throw notFound("Cart not found.");
    await cart.removeItem(c, req.params.id);
    res.json(await cart.view(req, c, ctx(req)));
  })
);

router.put(
  "/cart/project",
  requireAuth,
  ah(async (req, res) => {
    const c = await cart.resolveCart(req, res, { create: true });
    await query("UPDATE carts SET project_name = :n WHERE id = :id", { n: String(req.body.projectName || "").slice(0, 150) || null, id: c.id });
    res.json({ ok: true });
  })
);

// ── Quick order & BOM ─────────────────────────────────────────────────────
router.post(
  "/quick-order/validate",
  writeLimiter,
  ah(async (req, res) => {
    const lines = Array.isArray(req.body.lines) ? req.body.lines.map((l, i) => ({ line: i + 1, sku: String(l.sku || "").trim(), qty: Number(l.qty) })) : cart.parseQuickOrder(req.body.text);
    const matched = await cart.matchLines(lines);
    res.json({ lines: matched, summary: summarize(matched) });
  })
);

function summarize(lines) {
  const count = (s) => lines.filter((l) => l.status === s).length;
  return { total: lines.length, matched: count("matched"), notFound: count("not_found"), outOfStock: count("out_of_stock"), insufficientStock: count("insufficient_stock"), invalid: count("invalid") };
}

router.post(
  "/bom/upload",
  writeLimiter,
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw badRequest("Attach an Excel (.xlsx) or CSV file.");
    const name = req.file.originalname.toLowerCase();
    let rows;
    if (name.endsWith(".xlsx")) {
      if (!(req.file.buffer[0] === 0x50 && req.file.buffer[1] === 0x4b)) throw badRequest("That file is not a valid .xlsx workbook.");
      rows = (await readBomXlsx(req.file.buffer)).slice(0, 1000);
    } else if (name.endsWith(".csv")) {
      rows = readBomCsv(req.file.buffer).slice(0, 1000);
    } else throw badRequest("Upload .xlsx or .csv.");
    if (!rows.length) throw badRequest("No lines found. Use columns: SKU (or Part Number), Description, Quantity.");
    const matched = await cart.matchLines(rows);
    res.json({ lines: matched, summary: summarize(matched) });
  })
);

const HEADER = { sku: /^(sku|part\s*#?|part\s*(no|number)\.?|mpn|item)$/i, description: /^(description|desc|item description)$/i, qty: /^(qty|quantity|qty\.)$/i };
function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const v = String(c || "").trim();
    for (const [k, re] of Object.entries(HEADER)) if (re.test(v) && map[k] === undefined) map[k] = i;
  });
  return map.qty !== undefined && (map.sku !== undefined || map.description !== undefined) ? map : null;
}
function toLines(table) {
  const hIdx = table.findIndex((r) => mapHeader(r));
  if (hIdx < 0) throw badRequest("Could not find a header row with SKU/Part Number and Quantity columns.");
  const map = mapHeader(table[hIdx]);
  return table.slice(hIdx + 1).map((r, i) => ({ line: hIdx + i + 2, sku: map.sku !== undefined ? String(r[map.sku] ?? "").trim() : "", description: map.description !== undefined ? String(r[map.description] ?? "").trim() : "", qty: Number(String(r[map.qty] ?? "").replace(/,/g, "")) })).filter((l) => l.sku || l.description);
}
async function readBomXlsx(buffer) {
  const ExcelJS = require("exceljs");
  const { cellValue } = require("../import/parser.js");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const table = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (c, col) => (cells[col - 1] = cellValue(c)));
    table.push(cells);
  });
  return toLines(table);
}
function readBomCsv(buffer) {
  const { parse } = require("csv-parse/sync");
  return toLines(parse(buffer, { bom: true, relax_column_count: true, skip_empty_lines: true }));
}
void parseXlsx;
void parseCsvBuffer;

// ── Wishlist (signed-in; guests keep a local list that merges on sign-in) ─
router.get(
  "/wishlist",
  requireAuth,
  ah(async (req, res) => {
    const rows = await query(
      `SELECT p.id, p.sku, p.slug, p.name, w.created_at FROM wishlists w JOIN products p ON p.id = w.product_id AND p.deleted_at IS NULL WHERE w.user_id = :u ORDER BY w.created_at DESC`,
      { u: req.user.id }
    );
    res.json({ items: rows.map((r) => ({ productId: String(r.id), sku: r.sku, slug: r.slug, name: r.name, addedAt: r.created_at })) });
  })
);
router.post(
  "/wishlist",
  requireAuth,
  ah(async (req, res) => {
    const slugs = Array.isArray(req.body.slugs) ? req.body.slugs.slice(0, 200) : [req.body.slug];
    for (const s of slugs.filter(Boolean)) {
      const p = await one("SELECT id FROM products WHERE slug = :s AND deleted_at IS NULL", { s: String(s) });
      if (p) await query("INSERT IGNORE INTO wishlists (user_id, product_id) VALUES (:u, :p)", { u: req.user.id, p: p.id });
    }
    res.status(201).json({ ok: true });
  })
);
router.delete(
  "/wishlist/:slug",
  requireAuth,
  ah(async (req, res) => {
    await query("DELETE w FROM wishlists w JOIN products p ON p.id = w.product_id WHERE w.user_id = :u AND p.slug = :s", { u: req.user.id, s: req.params.slug });
    res.json({ ok: true });
  })
);

// ── Checkout ──────────────────────────────────────────────────────────────
router.post(
  "/checkout/options",
  ah(async (req, res) => {
    const c = await cart.resolveCart(req, res);
    const v = await cart.view(req, c, ctx(req));
    const methods = v.estimate ? await orders.paymentMethodsFor({ currency: v.estimate.currency.code, user: req.user }) : [];
    const addresses = req.user
      ? await query("SELECT id, address_type, label, contact_name, company_name, line1, line2, city, state, state_code, postal_code, country_code, phone, tax_id, is_default FROM addresses WHERE (user_id = :u OR (company_id IS NOT NULL AND company_id = :c)) AND deleted_at IS NULL ORDER BY is_default DESC, id DESC", { u: req.user.id, c: req.user.company_id || 0 })
      : [];
    res.json({ cart: v, paymentMethods: methods, razorpayKeyId: methods.includes("razorpay") ? process.env.RAZORPAY_KEY_ID : null, addresses });
  })
);

router.post(
  "/checkout/place",
  writeLimiter,
  ah(async (req, res) => {
    // A retried submit (double click, network retry) returns the order already created for this key.
    const dup = await orders.findByIdempotencyKey(req.body && req.body.idempotencyKey);
    if (dup) return res.json(dup);
    const c = await cart.resolveCart(req, res);
    if (!c) throw badRequest("Your cart is empty.");
    const out = await orders.placeFromCart(req, c, req.body || {});
    res.status(out.duplicate ? 200 : 201).json(out);
  })
);

// ── Orders (owner, company member, staff, or guest with token) ─────────────
async function loadOrderFor(req, number) {
  const o = await one("SELECT id, user_id, company_id, access_token FROM orders WHERE order_number = :n", { n: String(number) });
  if (!o || !(await orders.canView(req, o, req.query.token || req.get("x-order-token")))) throw notFound("Order not found.");
  return o;
}

router.get(
  "/orders",
  requireAuth,
  ah(async (req, res) => {
    const companyScope = req.user.company_id && ["admin", "finance", "approver", "viewer", "buyer", "technical"].includes(req.user.company_role);
    const pg = paging(req);
    const scope = `o.user_id = :u ${companyScope ? "OR o.company_id = :c" : ""}`;
    const rows = await query(
      `SELECT order_number, status, payment_status, currency, total, placed_at, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS line_count
         FROM orders o WHERE ${scope} ORDER BY o.placed_at DESC, o.id DESC ${pg.sql}`,
      { u: req.user.id, c: req.user.company_id || 0 }
    );
    const total = await one(`SELECT COUNT(*) c FROM orders o WHERE ${scope}`, { u: req.user.id, c: req.user.company_id || 0 });
    res.json({ ...meta(pg, total.c), orders: rows.map((r) => ({ orderNumber: r.order_number, status: r.status, paymentStatus: r.payment_status, currency: r.currency, total: r.total, placedAt: r.placed_at, lines: Number(r.line_count) })) });
  })
);

router.get(
  "/orders/:number",
  ah(async (req, res) => {
    const o = await loadOrderFor(req, req.params.number);
    res.json({ order: await orders.orderJson(o.id) });
  })
);

// Company approver releases an order waiting for approval.
router.post(
  "/orders/:number/approve",
  requireAuth,
  ah(async (req, res) => {
    const o = await one("SELECT id, company_id, status FROM orders WHERE order_number = :n", { n: req.params.number });
    if (!o || !o.company_id || Number(o.company_id) !== Number(req.user.company_id) || !["admin", "approver"].includes(req.user.company_role)) throw forbidden("Only a company approver can approve this order.");
    const { tx } = require("../../core/db.js");
    await tx(async (conn) => {
      const row = await one("SELECT payment_method FROM orders WHERE id = :id", { id: o.id }, conn);
      await orders.setStatus(conn, o.id, row.payment_method === "purchase_order" ? "confirmed" : "pending_payment", { note: `Approved by ${req.user.email}`, actorId: req.user.id });
      await query("UPDATE orders SET approved_by = :u, approved_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { u: req.user.id, id: o.id }, conn);
    });
    res.json({ order: await orders.orderJson(o.id) });
  })
);

// Reorder: put a past order's items back into the cart (current prices apply).
router.post(
  "/orders/:number/reorder",
  ah(async (req, res) => {
    const o = await loadOrderFor(req, req.params.number);
    const items = await query("SELECT product_id, qty FROM order_items WHERE order_id = :id AND product_id IS NOT NULL", { id: o.id });
    const c = await cart.resolveCart(req, res, { create: true });
    const skipped = [];
    for (const it of items) {
      try {
        await cart.addItem(c, { productId: it.product_id, qty: it.qty });
      } catch {
        skipped.push(String(it.product_id));
      }
    }
    res.json({ ...(await cart.view(req, c, ctx(req))), skipped });
  })
);

// ── RFQ ────────────────────────────────────────────────────────────────────
const ALLOWED_ATTACH = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "text/csv": ".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/zip": ".zip", "application/octet-stream": null };

router.post(
  "/rfq",
  rfqLimiter,
  upload.array("attachments", 5),
  ah(async (req, res) => {
    const body = req.is("multipart/form-data") ? JSON.parse(req.body.payload || "{}") : req.body;
    const fileIds = [];
    for (const f of req.files || []) {
      const ext = (f.originalname.match(/\.[a-z0-9]{1,5}$/i) || [""])[0].toLowerCase();
      if (!(f.mimetype in ALLOWED_ATTACH) || ![".pdf", ".png", ".jpg", ".jpeg", ".csv", ".xlsx", ".zip"].includes(ext)) throw badRequest(`${f.originalname}: allowed types are PDF, PNG, JPG, CSV, XLSX, ZIP.`);
      const key = storage.newKey("rfq", f.originalname);
      await storage.driver().put(key, f.buffer);
      const r = await query("INSERT INTO files (storage_key, driver, original_name, mime, bytes, purpose, owner_user_id) VALUES (:k, :d, :n, :m, :b, 'rfq_attachment', :u)", {
        k: key, d: storage.driver().name, n: f.originalname.slice(0, 255), m: f.mimetype, b: f.size, u: req.user ? req.user.id : null,
      });
      fileIds.push(r.insertId);
    }
    // "From cart": turn the current cart into an RFQ.
    if (body.fromCart) {
      const c = await cart.resolveCart(req, res);
      const items = c ? await query("SELECT product_id AS productId, qty FROM cart_items WHERE cart_id = :c AND saved_for_later = 0", { c: c.id }) : [];
      if (!items.length) throw badRequest("Your cart is empty.");
      body.items = items;
    }
    const out = await rq.createRfq(req, body, { source: ["cart", "bom", "quick_order", "sample"].includes(body.source) ? body.source : body.fromCart ? "cart" : "web", fileIds });
    res.status(201).json({ rfqNumber: out.rfqNumber, accessToken: out.accessToken });
  })
);

async function loadRfqFor(req, number) {
  const r = await one("SELECT id, user_id, company_id, access_token FROM rfqs WHERE rfq_number = :n", { n: String(number) });
  const token = req.query.token;
  const ok = r && ((req.user && (Number(r.user_id) === Number(req.user.id) || (r.company_id && Number(r.company_id) === Number(req.user.company_id)))) || safeEq(token, r.access_token));
  if (!ok) throw notFound("RFQ not found.");
  return r;
}

router.get("/rfqs", requireAuth, ah(async (req, res) => {
  const pg = paging(req);
  const rows = await query(`SELECT rfq_number, status, created_at, country_code, (SELECT COUNT(*) FROM rfq_items i WHERE i.rfq_id = r.id) AS line_count FROM rfqs r WHERE user_id = :u OR (company_id IS NOT NULL AND company_id = :c) ORDER BY id DESC ${pg.sql}`, { u: req.user.id, c: req.user.company_id || 0 });
  const rfqTotal = await one("SELECT COUNT(*) c FROM rfqs r WHERE user_id = :u OR (company_id IS NOT NULL AND company_id = :c)", { u: req.user.id, c: req.user.company_id || 0 });
  res.json({ ...meta(pg, rfqTotal.c), rfqs: rows.map((r) => ({ rfqNumber: r.rfq_number, status: r.status, createdAt: r.created_at, country: r.country_code, lines: Number(r.line_count) })) });
}));

router.get("/rfqs/:number", ah(async (req, res) => {
  const r = await loadRfqFor(req, req.params.number);
  res.json({ rfq: await rq.rfqJson(r.id) });
}));

router.post("/rfqs/:number/messages", writeLimiter, ah(async (req, res) => {
  const r = await loadRfqFor(req, req.params.number);
  const body = String(req.body.body || "").trim().slice(0, 5000);
  if (!body) throw badRequest("Write a message.");
  await query("INSERT INTO rfq_messages (rfq_id, author_user_id, author_name, is_internal, body) VALUES (:r, :u, :n, 0, :b)", { r: r.id, u: req.user ? req.user.id : null, n: req.user ? req.user.name : "Customer", b: body });
  await query("UPDATE rfqs SET status = IF(status = 'info_requested', 'under_review', status) WHERE id = :id", { id: r.id });
  res.status(201).json({ rfq: await rq.rfqJson(r.id) });
}));

// ── Quotes (customer) ────────────────────────────────────────────────────
async function loadQuoteFor(req, number) {
  const q = await one("SELECT id, user_id, company_id, customer_email, access_token FROM quotes WHERE quote_number = :n", { n: String(number).replace(/-V\d+$/, "") });
  const token = req.query.token || req.body?.token;
  const ok = q && ((req.user && (Number(q.user_id) === Number(req.user.id) || q.customer_email === req.user.email || (q.company_id && Number(q.company_id) === Number(req.user.company_id)))) || safeEq(token, q.access_token));
  if (!ok) throw notFound("Quotation not found.");
  return q;
}

router.get("/quotes", requireAuth, ah(async (req, res) => {
  const pg = paging(req);
  const w = "(q.user_id = :u OR q.customer_email = :e OR (q.company_id IS NOT NULL AND q.company_id = :c)) AND q.status <> 'draft'";
  const prm = { u: req.user.id, e: req.user.email, c: req.user.company_id || 0 };
  const rows = await query(
    `SELECT q.quote_number, q.status, q.current_version, v.total, v.currency, v.valid_until, v.sent_at FROM quotes q JOIN quote_versions v ON v.quote_id = q.id AND v.version = q.current_version
      WHERE ${w} ORDER BY q.id DESC ${pg.sql}`,
    prm
  );
  const total = await one(`SELECT COUNT(*) c FROM quotes q WHERE ${w}`, prm);
  res.json({ ...meta(pg, total.c), quotes: rows.map((r) => ({ quoteNumber: r.quote_number, label: `${r.quote_number}-V${r.current_version}`, status: r.status, total: r.total, currency: r.currency, validUntil: r.valid_until, sentAt: r.sent_at })) });
}));

router.get("/quotes/:number", ah(async (req, res) => {
  const q = await loadQuoteFor(req, req.params.number);
  const quote = await rq.quoteJson(q.id);
  if (!quote.versions.length) throw notFound("Quotation not found.");
  res.json({ quote, paymentMethods: await orders.paymentMethodsFor({ currency: quote.versions[0].currency, user: req.user }) });
}));

router.post("/quotes/:number/accept", writeLimiter, ah(async (req, res) => {
  const q = await loadQuoteFor(req, req.params.number);
  res.status(201).json(await rq.accept(req, q.id, req.body || {}));
}));

router.post("/quotes/:number/reject", writeLimiter, ah(async (req, res) => {
  const q = await loadQuoteFor(req, req.params.number);
  await rq.reject(req, q.id, req.body.note);
  res.json({ quote: await rq.quoteJson(q.id) });
}));

module.exports = router;
