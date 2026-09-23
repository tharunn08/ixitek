// /api/catalog — public, customer-facing catalog API. Read-only, cacheable,
// never includes supplier costs, margins or cost basis.
const express = require("express");
const rateLimit = require("express-rate-limit");
const repo = require("./catalogRepo.js");
const { ah, notFound } = require("../../core/errors.js");
const { convertPrices } = require("../intl/convertPrices.js");
const fx = require("../intl/fxService.js");
const { query } = require("../../core/db.js");
const Decimal = require("decimal.js");

/** Convert a price-filter bound entered in the display currency back to USD (base). */
async function boundToUsd(value, currency) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const c = await fx.effectiveCurrency(currency);
  return new Decimal(String(value)).div(c.rate).toDecimalPlaces(4).toFixed(4);
}
const viewLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

// Every response is converted USD → visitor currency (?currency=XXX) on the server.
const send = async (req, res, payload) => res.json(await convertPrices(payload, req.query.currency));

const router = express.Router();
const searchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

const cache = (seconds) => (req, res, next) => {
  res.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
  next();
};

function parseAttrs(query) {
  // ?attr.connector=LC-LC&attr.connector=SN-SN  or  ?f=connector:LC-LC,fiber_type:OM4
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    const m = /^attr\.([a-z_]{1,60})$/.exec(k);
    if (m) out[m[1]] = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
  }
  if (query.f) {
    for (const pair of String(query.f).split(",")) {
      const i = pair.indexOf(":");
      if (i > 0) {
        const code = pair.slice(0, i).trim();
        if (/^[a-z_]{1,60}$/.test(code)) (out[code] = out[code] || []).push(decodeURIComponent(pair.slice(i + 1)));
      }
    }
  }
  return out;
}

router.get("/menu", cache(120), ah(async (req, res) => res.json({ categories: await repo.categoryTree() })));

router.get(
  "/categories/:slug",
  cache(120),
  ah(async (req, res) => {
    const category = await repo.categoryBySlug(req.params.slug);
    if (!category) throw notFound("Category not found.");
    const tree = await repo.categoryTree();
    const find = (list) => {
      for (const c of list) {
        if (c.slug === category.slug) return c;
        const f = find(c.children);
        if (f) return f;
      }
      return null;
    };
    const node = find(tree);
    const { id, ...pub } = category;
    void id;
    await send(req, res, { category: { ...pub, children: node ? node.children : [], totalProducts: node ? node.totalProducts : 0 }, families: await repo.familiesForCategory(req.params.slug) });
  })
);

router.get(
  "/products",
  searchLimiter,
  cache(30),
  ah(async (req, res) => {
    const result = await repo.listProducts({
      categorySlug: req.query.category ? String(req.query.category) : null,
      familySlug: req.query.family ? String(req.query.family) : null,
      q: req.query.q ? String(req.query.q).slice(0, 120) : null,
      attrs: parseAttrs(req.query),
      inStock: req.query.inStock === "1",
      priced: req.query.priced === "1",
      minPriceUsd: await boundToUsd(req.query.minPrice, req.query.currency),
      maxPriceUsd: await boundToUsd(req.query.maxPrice, req.query.currency),
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });
    if (!result) throw notFound("Category not found.");
    const { category, ...rest } = result;
    await send(req, res, { ...rest, category: category ? { slug: category.slug, name: category.name, breadcrumbs: category.breadcrumbs } : null });
  })
);

router.get(
  "/products/:slug",
  cache(60),
  ah(async (req, res) => {
    const product = await repo.productDetail(String(req.params.slug));
    if (!product) throw notFound("Product not found.");
    await send(req, res, { product });
  })
);

// Anonymous view counter used for the "popular" sort. Only active products are counted.
router.post(
  "/products/:slug/view",
  viewLimiter,
  ah(async (req, res) => {
    const [p] = await query("SELECT id FROM products WHERE slug = :slug AND status IN (:st) AND deleted_at IS NULL", { slug: String(req.params.slug).slice(0, 255), st: repo.PUBLIC_STATUSES });
    if (!p) throw notFound("Product not found.");
    await query("INSERT INTO product_stats (product_id, views) VALUES (:id, 1) ON DUPLICATE KEY UPDATE views = views + 1", { id: p.id });
    res.status(204).end();
  })
);

router.get(
  "/families/:slug",
  cache(60),
  ah(async (req, res) => {
    const family = await repo.familyDetail(req.params.slug);
    if (!family) throw notFound("Product family not found.");
    const list = await repo.listProducts({ familySlug: req.params.slug, limit: 96, sort: req.query.sort, attrs: parseAttrs(req.query) });
    await send(req, res, { family, ...list, category: undefined });
  })
);

router.get(
  "/search/suggest",
  searchLimiter,
  cache(30),
  ah(async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q.length < 2) return res.json({ products: [], categories: [] });
    await send(req, res, await repo.suggest(q));
  })
);

module.exports = router;
