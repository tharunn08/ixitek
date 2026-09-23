// seo.js — robots.txt, sitemap.xml and server-rendered <head> metadata for
// the single-page app (title, description, canonical, Open Graph, Twitter,
// JSON-LD Organization / Product / BreadcrumbList). Search engines and link
// previews get correct metadata without executing JavaScript. All values come
// from the catalog; nothing is invented (offers appear only with a real price).
const fs = require("fs");
const path = require("path");
const express = require("express");
const { query, one } = require("../../core/db.js");
const repo = require("../catalog/catalogRepo.js");
const log = require("../../core/logger.js");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const xml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const siteUrl = (req) => (process.env.PUBLIC_SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const SITE_NAME = "Ixitek Solutions";
const DEFAULT_DESC = "Ixitek Solutions — fiber optic connectivity, network test & measurement, and data centre infrastructure for enterprise networks.";

const PRIVATE = ["/admin", "/api/", "/account", "/checkout", "/cart", "/order/", "/quote/", "/rfq/", "/support/tickets/", "/login", "/signup"];

const router = express.Router();

router.get("/robots.txt", (req, res) => {
  res.type("text/plain").set("Cache-Control", "public, max-age=3600");
  res.send(["User-agent: *", ...PRIVATE.map((p) => `Disallow: ${p}`), "Allow: /", "", `Sitemap: ${siteUrl(req)}/sitemap.xml`, ""].join("\n"));
});

let sitemapCache = { at: 0, body: "" };
router.get("/sitemap.xml", async (req, res, next) => {
  try {
    if (Date.now() - sitemapCache.at > 15 * 60 * 1000 || !sitemapCache.body) {
      const base = siteUrl(req);
      const stat = ["/", "/catalog", "/solutions", "/services", "/resources", "/resources/shipping-and-duties", "/support", "/quick-order", "/rfq", "/company", "/partners", "/career", "/contact", "/products", "/sap", "/sap/training", "/sap/implementation", "/sap/support", "/sap/industries", "/sap/faq", "/sap/contact"];
      const cats = await query("SELECT slug, updated_at FROM categories WHERE status = 'active' AND deleted_at IS NULL");
      const prods = await query("SELECT slug, updated_at FROM products WHERE deleted_at IS NULL AND status IN (?) ORDER BY id LIMIT 45000", [repo.PUBLIC_STATUSES]);
      const url = (loc, lastmod, pri) => `<url><loc>${xml(base + loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}${pri ? `<priority>${pri}</priority>` : ""}</url>`;
      sitemapCache = {
        at: Date.now(),
        body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
          ...stat.map((p) => url(p, null, p === "/" ? "1.0" : "0.6")),
          ...cats.map((c) => url(`/catalog/${c.slug}`, c.updated_at, "0.7")),
          ...prods.map((p) => url(`/product/${p.slug}`, p.updated_at, "0.8")),
        ].join("\n")}\n</urlset>\n`,
      };
    }
    res.type("application/xml").set("Cache-Control", "public, max-age=900").send(sitemapCache.body);
  } catch (err) {
    next(err);
  }
});

// ── <head> injection for the SPA shell ──
let shell = null;
function loadShell(distPath) {
  if (shell && process.env.NODE_ENV === "production") return shell;
  const file = path.join(distPath, "index.html");
  shell = fs.readFileSync(file, "utf8");
  return shell;
}

async function metaFor(req) {
  const base = siteUrl(req);
  const p = req.path;
  const canonical = `${base}${p === "/" ? "/" : p.replace(/\/$/, "")}`;
  const org = { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: base, logo: `${base}/favicon-48x48.png` };
  let m = { title: `${SITE_NAME} — Data Centre & Network Infrastructure`, description: DEFAULT_DESC, canonical, type: "website", image: null, jsonld: [org], noindex: PRIVATE.some((x) => p.startsWith(x)) };

  let match;
  if ((match = /^\/product\/([^/]+)\/?$/.exec(p))) {
    const prod = await repo.productDetail(decodeURIComponent(match[1]));
    if (!prod) return { ...m, status: 404, title: `Product not found | ${SITE_NAME}`, noindex: true };
    const crumbs = [{ name: "Products", url: `${base}/catalog` }, ...prod.breadcrumbs.map((b) => ({ name: b.name, url: `${base}/catalog/${b.slug}` })), { name: prod.sku, url: canonical }];
    const img = prod.images[0] ? prod.images[0].url : null;
    m = {
      ...m,
      title: prod.seo.title,
      description: prod.seo.description || m.description,
      type: "product",
      image: img,
      jsonld: [
        org,
        {
          "@context": "https://schema.org", "@type": "Product", name: prod.name, sku: prod.sku, mpn: prod.sku, brand: { "@type": "Brand", name: prod.brand || "IXITEK" }, description: String(prod.description || "").slice(0, 5000),
          ...(prod.images.length ? { image: prod.images.map((i) => i.url) } : {}),
          url: canonical,
          ...(prod.price ? { offers: { "@type": "Offer", priceCurrency: prod.price.currency, price: prod.price.amount, url: canonical, availability: prod.availability.status === "in_stock" ? "https://schema.org/InStock" : prod.availability.status === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/PreOrder", seller: { "@type": "Organization", name: SITE_NAME } } } : {}),
        },
        breadcrumbLd(crumbs),
      ],
    };
  } else if ((match = /^\/catalog\/([^/]+)\/?$/.exec(p))) {
    const c = await repo.categoryBySlug(decodeURIComponent(match[1]));
    if (!c) return { ...m, status: 404, noindex: true };
    m = { ...m, title: c.seoTitle || `${c.name} | ${SITE_NAME}`, description: c.seoDescription || c.shortDescription || m.description, jsonld: [org, breadcrumbLd([{ name: "Products", url: `${base}/catalog` }, ...c.breadcrumbs.map((b) => ({ name: b.name, url: `${base}/catalog/${b.slug}` }))])] };
  } else {
    const titles = { "/catalog": "Product catalog", "/solutions": "Solutions", "/services": "Services", "/resources": "Resources", "/resources/shipping-and-duties": "Shipping, duties & taxes", "/support": "Help & support", "/quick-order": "Quick order & BOM upload", "/rfq": "Request a quotation", "/company": "Company", "/partners": "Partners", "/career": "Careers", "/contact": "Contact us", "/compare": "Compare products", "/track-order": "Track your order" };
    if (titles[p]) m.title = `${titles[p]} | ${SITE_NAME}`;
  }
  return m;
}

function breadcrumbLd(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })) };
}

function render(html, m) {
  const head = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    m.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:type" content="${esc(m.type)}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}" />` : "",
    `<meta name="twitter:card" content="${m.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}" />` : "",
    ...m.jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ].filter(Boolean).join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace("</head>", `    ${head}\n  </head>`);
}

/** Express handler for the SPA fallback: index.html with route-specific metadata. */
function spaHandler(distPath) {
  return async (req, res) => {
    res.set("Cache-Control", "no-cache");
    let html;
    try {
      html = loadShell(distPath);
    } catch (err) {
      log.error("[seo] index.html missing", { err: err.message });
      return res.status(500).send("Site build missing.");
    }
    try {
      const m = await metaFor(req);
      res.status(m.status || 200).type("html").send(render(html, m));
    } catch (err) {
      log.warn("[seo] metadata failed; serving plain shell", { err: err.message });
      res.type("html").send(html);
    }
  };
}

module.exports = { router, spaHandler, metaFor, render };
void one;
