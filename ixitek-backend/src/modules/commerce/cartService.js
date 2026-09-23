// cartService.js — persistent carts for guests (httpOnly cookie token) and
// signed-in users (merged on sign-in). Items are never silently deleted:
// lines that become unavailable are flagged, not removed.
const crypto = require("crypto");
const { query, queryText, one, tx } = require("../../core/db.js");
const { badRequest, notFound } = require("../../core/errors.js");
const landed = require("../intl/landedCost.js");
const { customerFor } = require("../intl/publicRoutes.js");

const COOKIE = "ixitek_cart";
const MAX_LINES = 500;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const PUBLIC_STATUSES = ["active", "coming_soon", "discontinued", "end_of_sale", "end_of_life"];

function setCookie(res, t) {
  res.cookie(COOKIE, t, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 90 * 24 * 3600 * 1000 });
}

/** Find (or create when `create`) the caller's active cart; merges a guest cart into the user's cart on sign-in. */
async function resolveCart(req, res, { create = false } = {}) {
  const t = req.cookies && req.cookies[COOKIE];
  let guest = t ? await one("SELECT * FROM carts WHERE token_hash = :h AND status = 'active'", { h: hash(t) }) : null;
  if (req.user) {
    let cart = await one("SELECT * FROM carts WHERE user_id = :u AND status = 'active' ORDER BY id DESC LIMIT 1", { u: req.user.id });
    if (guest && guest.user_id === null && (!cart || cart.id !== guest.id)) {
      if (!cart) {
        await query("UPDATE carts SET user_id = :u, token_hash = NULL WHERE id = :id", { u: req.user.id, id: guest.id });
        cart = { ...guest, user_id: req.user.id };
      } else {
        await tx(async (conn) => {
          const lines = await query("SELECT product_id, qty, saved_for_later FROM cart_items WHERE cart_id = :c", { c: guest.id }, conn);
          for (const l of lines) {
            await query(
              `INSERT INTO cart_items (cart_id, product_id, qty, saved_for_later) VALUES (:c, :p, :q, :s)
               ON DUPLICATE KEY UPDATE qty = LEAST(qty + VALUES(qty), 1000000)`,
              { c: cart.id, p: l.product_id, q: l.qty, s: l.saved_for_later },
              conn
            );
          }
          await query("UPDATE carts SET status = 'merged', token_hash = NULL WHERE id = :id", { id: guest.id }, conn);
        });
      }
      res.clearCookie(COOKIE, { path: "/" });
    }
    if (!cart && create) {
      const r = await query("INSERT INTO carts (user_id) VALUES (:u)", { u: req.user.id });
      cart = await one("SELECT * FROM carts WHERE id = :id", { id: r.insertId });
    }
    return cart;
  }
  if (!guest && create) {
    const nt = crypto.randomBytes(32).toString("base64url");
    const r = await query("INSERT INTO carts (token_hash) VALUES (:h)", { h: hash(nt) });
    setCookie(res, nt);
    guest = await one("SELECT * FROM carts WHERE id = :id", { id: r.insertId });
  }
  return guest;
}

async function productBySkuOrId({ productId, sku, slug }) {
  if (productId) return one(`SELECT id, sku, moq, max_order_qty, status FROM products WHERE id = :id AND deleted_at IS NULL`, { id: productId });
  if (slug) return one(`SELECT id, sku, moq, max_order_qty, status FROM products WHERE slug = :s AND deleted_at IS NULL`, { s: slug });
  if (sku) return one(`SELECT id, sku, moq, max_order_qty, status FROM products WHERE sku = :s AND deleted_at IS NULL`, { s: String(sku).trim() });
  return null;
}

async function addItem(cart, { productId, sku, slug, qty, mode = "add", savedForLater = false }) {
  const q = Math.floor(Number(qty));
  if (!(q >= 1) || q > 1e6) throw badRequest("Quantity must be a whole number of at least 1.");
  const p = await productBySkuOrId({ productId, sku, slug });
  if (!p || !PUBLIC_STATUSES.includes(p.status)) throw notFound("Product not found.");
  const count = await one("SELECT COUNT(*) c FROM cart_items WHERE cart_id = :c", { c: cart.id });
  if (Number(count.c) >= MAX_LINES) throw badRequest(`A cart can hold up to ${MAX_LINES} lines.`);
  const price = await one("SELECT selling_price_usd FROM product_selling_prices WHERE product_id = :p", { p: p.id });
  await query(
    `INSERT INTO cart_items (cart_id, product_id, qty, saved_for_later, price_seen_usd) VALUES (:c, :p, :q, :s, :pr)
     ON DUPLICATE KEY UPDATE qty = ${mode === "set" ? "VALUES(qty)" : "LEAST(qty + VALUES(qty), 1000000)"}, price_seen_usd = VALUES(price_seen_usd)`,
    { c: cart.id, p: p.id, q, s: savedForLater ? 1 : 0, pr: price ? price.selling_price_usd : null }
  );
  await query("UPDATE carts SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = :id", { id: cart.id });
  return p;
}

async function updateItem(cart, itemId, { qty, savedForLater }) {
  const item = await one("SELECT * FROM cart_items WHERE id = :id AND cart_id = :c", { id: itemId, c: cart.id });
  if (!item) throw notFound("Cart line not found.");
  if (qty !== undefined) {
    const q = Math.floor(Number(qty));
    if (!(q >= 1) || q > 1e6) throw badRequest("Quantity must be a whole number of at least 1.");
    await query("UPDATE cart_items SET qty = :q WHERE id = :id", { q, id: itemId });
  }
  if (savedForLater !== undefined && Boolean(savedForLater) !== Boolean(item.saved_for_later)) {
    await tx(async (conn) => {
      const clash = await one("SELECT id, qty FROM cart_items WHERE cart_id = :c AND product_id = :p AND saved_for_later = :s FOR UPDATE", { c: cart.id, p: item.product_id, s: savedForLater ? 1 : 0 }, conn);
      if (clash) {
        await query("UPDATE cart_items SET qty = LEAST(qty + :q, 1000000) WHERE id = :id", { q: item.qty, id: clash.id }, conn);
        await query("DELETE FROM cart_items WHERE id = :id", { id: itemId }, conn);
      } else await query("UPDATE cart_items SET saved_for_later = :s WHERE id = :id", { s: savedForLater ? 1 : 0, id: itemId }, conn);
    });
  }
}

async function removeItem(cart, itemId) {
  await query("DELETE FROM cart_items WHERE id = :id AND cart_id = :c", { id: itemId, c: cart.id });
}

/** Cart view with server-side prices and a landed-cost estimate for the chosen destination. */
async function view(req, cart, { country, currency, method, incoterm, state } = {}) {
  if (!cart) return { items: [], saved: [], estimate: null, count: 0 };
  const rows = await query(
    `SELECT ci.id, ci.product_id, ci.qty, ci.saved_for_later, ci.price_seen_usd, p.sku, p.slug, p.name, p.status, p.moq, p.max_order_qty, p.deleted_at,
            sp.selling_price_usd, (SELECT url FROM product_images i WHERE i.product_id = p.id AND i.is_primary = 1 AND i.status <> 'broken' LIMIT 1) AS image_url,
            (SELECT id FROM product_images i WHERE i.product_id = p.id AND i.is_primary = 1 AND i.status <> 'broken' LIMIT 1) AS image_id
       FROM cart_items ci JOIN products p ON p.id = ci.product_id LEFT JOIN product_selling_prices sp ON sp.product_id = p.id
      WHERE ci.cart_id = :c ORDER BY ci.id`,
    { c: cart.id }
  );
  const avail = await require("../inventory/inventoryService.js").availabilityFor(rows.map((r) => Number(r.product_id)));
  const shape = (r) => ({
    id: String(r.id), productId: String(r.product_id), sku: r.sku, slug: r.slug, name: r.name, qty: r.qty, moq: r.moq, maxOrderQty: r.max_order_qty,
    image: r.image_url ? { id: String(r.image_id), url: r.image_url } : null,
    available: !r.deleted_at && PUBLIC_STATUSES.includes(r.status),
    priceOnRequest: r.selling_price_usd === null,
    priceChanged: r.price_seen_usd !== null && r.selling_price_usd !== null && String(r.price_seen_usd) !== String(r.selling_price_usd),
    stock: avail.get(Number(r.product_id)) || null,
  });
  const items = rows.filter((r) => !r.saved_for_later).map(shape);
  const saved = rows.filter((r) => r.saved_for_later).map(shape);
  const upd = {};
  if (country) upd.country = String(country).toUpperCase().slice(0, 2);
  if (currency) upd.currency = String(currency).toUpperCase().slice(0, 3);
  if (method !== undefined) upd.shipping_method = method || null;
  if (incoterm !== undefined) upd.incoterm = incoterm || null;
  if (Object.keys(upd).length) {
    await query(`UPDATE carts SET ${Object.keys(upd).map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`, { ...upd, id: cart.id });
    Object.assign(cart, upd);
  }
  let estimate = null;
  let estimateError = null;
  const lines = items.filter((i) => i.available).map((i) => ({ productId: Number(i.productId), qty: i.qty }));
  if (lines.length && cart.country) {
    try {
      estimate = await landed.estimate({ lines, country: cart.country, currency: cart.currency, method: cart.shipping_method, incoterm: cart.incoterm, state: state || null, customer: await customerFor(req) });
      // Line prices come from the estimate (customer group / volume / contract pricing applied).
      const byId = new Map(estimate.lines.map((l) => [l.productId, l]));
      for (const i of items) {
        const l = byId.get(i.productId);
        if (l) Object.assign(i, { unitPrice: l.unitPrice, lineTotal: l.lineTotal });
      }
    } catch (err) {
      estimateError = err.expose ? err.message : "Estimate unavailable.";
    }
  }
  return {
    id: String(cart.id), country: cart.country, currency: estimate ? estimate.currency.code : cart.currency, shippingMethod: cart.shipping_method, incoterm: cart.incoterm,
    items, saved, count: items.reduce((s, i) => s + i.qty, 0), lines: items.length, estimate, estimateError,
    unavailable: items.filter((i) => !i.available).map((i) => i.sku),
  };
}

/** Parse "SKU  qty" lines (tabs, spaces, commas or semicolons). */
function parseQuickOrder(text) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 500) throw badRequest("Up to 500 lines at a time.");
  lines.forEach((line, i) => {
    const m = /^(\S+)[\s,;\t]+(\d+)\s*$/.exec(line) || /^(\S+)$/.exec(line);
    if (!m) out.push({ line: i + 1, raw: line, error: "Use: SKU quantity" });
    else out.push({ line: i + 1, raw: line, sku: m[1], qty: m[2] ? Number(m[2]) : 1 });
  });
  return out;
}

/** Match requested SKUs/descriptions against the catalog (exact SKU, normalised SKU, exact description). */
async function matchLines(lines) {
  const valid = lines.filter((l) => l.sku || l.description);
  const skus = [...new Set(valid.map((l) => l.sku).filter(Boolean))];
  const norms = [...new Set(skus.map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")))];
  const descs = [...new Set(valid.filter((l) => !l.sku && l.description).map((l) => l.description))];
  const bySku = new Map();
  const byNorm = new Map();
  const byDesc = new Map();
  const sel = `SELECT p.id, p.sku, p.slug, p.name, p.description, p.sku_search, p.status, p.moq, p.track_inventory, p.allow_backorder, sp.selling_price_usd
                 FROM products p LEFT JOIN product_selling_prices sp ON sp.product_id = p.id WHERE p.deleted_at IS NULL AND p.status IN (?)`;
  if (skus.length) for (const r of await queryText(`${sel} AND (p.sku IN (?) OR p.sku_search IN (?))`, [PUBLIC_STATUSES, skus, norms])) (bySku.set(r.sku, r), byNorm.set(r.sku_search, r));
  if (descs.length) for (const r of await queryText(`${sel} AND p.description IN (?)`, [PUBLIC_STATUSES, descs])) byDesc.set(r.description, r);
  const ids = [...new Set([...bySku.values(), ...byDesc.values()].map((r) => Number(r.id)))];
  const avail = await require("../inventory/inventoryService.js").availabilityFor(ids);
  return lines.map((l) => {
    if (l.error) return { ...l, status: "invalid" };
    if (!(l.qty >= 1) || l.qty > 1e6) return { ...l, status: "invalid", error: "Quantity must be a whole number ≥ 1" };
    const p = (l.sku && (bySku.get(l.sku) || byNorm.get(l.sku.toUpperCase().replace(/[^A-Z0-9]/g, "")))) || (l.description && byDesc.get(l.description));
    if (!p) return { ...l, status: "not_found" };
    const st = avail.get(Number(p.id));
    let status = "matched";
    if (p.track_inventory && st && st.available < l.qty && !p.allow_backorder) status = st.available > 0 ? "insufficient_stock" : "out_of_stock";
    return { ...l, status, matchedBy: bySku.has(l.sku) ? "sku" : l.sku ? "normalised_sku" : "description", product: { id: String(p.id), sku: p.sku, slug: p.slug, name: p.name, moq: p.moq, priceOnRequest: p.selling_price_usd === null }, stock: st || null };
  });
}

module.exports = { COOKIE, resolveCart, addItem, updateItem, removeItem, view, parseQuickOrder, matchLines };
