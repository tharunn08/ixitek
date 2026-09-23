// /api/intl — public locale data, country detection, preferences and the
// customer-facing landed-cost estimate (never contains supplier costs).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { query, one } = require("../../core/db.js");
const { optionalAuth, requireAuth } = require("../../middleware/auth.js");
const fx = require("./fxService.js");
const landed = require("./landedCost.js");
const { ah, badRequest } = require("../../core/errors.js");

const router = express.Router();
const estimateLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

router.get(
  "/locales",
  ah(async (req, res) => {
    const [countries, languages, rates] = await Promise.all([
      query(
        `SELECT c.code, c.name, c.native_name, c.default_language, c.default_currency, c.default_incoterm, c.requires_tax_id, c.tax_id_label, c.sort_order
           FROM countries c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`
      ),
      query("SELECT code, name, native_name, is_rtl FROM languages WHERE is_active = 1 ORDER BY sort_order"),
      fx.currentRates(),
    ]);
    res.set("Cache-Control", "public, max-age=300");
    const defaultCountry = await require("../../core/settings.js").get("commerce.default_country", "IN");
    res.json({
      defaultCountry,
      countries: countries.map((c) => ({ code: c.code, name: c.name, nativeName: c.native_name, language: c.default_language, currency: c.default_currency, incoterm: c.default_incoterm, requiresTaxId: Boolean(c.requires_tax_id), taxIdLabel: c.tax_id_label, featured: c.sort_order < 20 })),
      languages: languages.map((l) => ({ code: l.code, name: l.name, nativeName: l.native_name, rtl: Boolean(l.is_rtl) })),
      // Rates are public information; availability tells the UI which currencies can be shown.
      currencies: [...rates.values()].filter((c) => c.isActive).map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, available: c.available, rateObservedAt: c.observedAt })),
    });
  })
);

// Approximate country from edge/CDN headers or Accept-Language. Never forced on the user.
router.get(
  "/detect",
  ah(async (req, res) => {
    const header = req.get("cf-ipcountry") || req.get("x-vercel-ip-country") || req.get("x-country-code") || req.get("cloudfront-viewer-country");
    let code = header && /^[A-Z]{2}$/i.test(header) ? header.toUpperCase() : null;
    let source = code ? "network" : null;
    if (!code) {
      const m = /[a-z]{2,3}-([A-Z]{2})/i.exec(req.get("accept-language") || "");
      if (m) (code = m[1].toUpperCase()), (source = "browser_language");
    }
    const c = code ? await one("SELECT code, name, default_currency, default_language FROM countries WHERE code = :c AND is_active = 1", { c: code }) : null;
    res.set("Cache-Control", "private, no-store");
    res.json({ detected: c ? { country: c.code, name: c.name, currency: c.default_currency, language: c.default_language, source } : null });
  })
);

router.put(
  "/preferences",
  requireAuth,
  ah(async (req, res) => {
    const country = String(req.body.country || "").toUpperCase();
    const currency = String(req.body.currency || "").toUpperCase();
    const language = String(req.body.language || "");
    const ok = await one(
      "SELECT (SELECT COUNT(*) FROM countries WHERE code = :c AND is_active = 1) a, (SELECT COUNT(*) FROM currencies WHERE code = :cur AND is_active = 1) b, (SELECT COUNT(*) FROM languages WHERE code = :l AND is_active = 1) c",
      { c: country, cur: currency, l: language }
    );
    if (!Number(ok.a) || !Number(ok.b) || !Number(ok.c)) throw badRequest("Unsupported country, currency or language.");
    await query("UPDATE users SET preferred_country = :c, preferred_currency = :cur, preferred_language = :l WHERE id = :id", { c: country, cur: currency, l: language, id: req.user.id });
    res.json({ ok: true });
  })
);

async function customerFor(req) {
  if (!req.user) return {};
  // Members of an APPROVED company account buy with the company's customer group (pricing, TDS).
  let group = req.user.customer_group || "retail";
  let companyId = null;
  if (req.user.company_id) {
    const c = await one("SELECT id, status, customer_group FROM companies WHERE id = :id AND deleted_at IS NULL", { id: req.user.company_id });
    if (c && c.status === "approved") (group = c.customer_group), (companyId = c.id);
  }
  const g = await one("SELECT is_business FROM customer_groups WHERE code = :c", { c: group });
  return { userId: req.user.id, companyId, customerGroup: group, isBusiness: Boolean(g && g.is_business) };
}

router.post(
  "/estimate",
  estimateLimiter,
  optionalAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const lines = Array.isArray(b.lines) ? b.lines : [{ productId: b.productId, qty: b.qty }];
    let resolved = lines;
    // Accept slugs from the storefront.
    if (lines.some((l) => l.slug && !l.productId)) {
      resolved = [];
      for (const l of lines) {
        const p = l.productId ? { id: l.productId } : await one("SELECT id FROM products WHERE slug = :s AND deleted_at IS NULL", { s: String(l.slug) });
        if (!p) throw badRequest("Unknown product.");
        resolved.push({ productId: p.id, qty: l.qty });
      }
    }
    const result = await landed.estimate({ lines: resolved, country: b.country, currency: b.currency, method: b.method, incoterm: b.incoterm, state: b.state, customer: await customerFor(req), includeInternal: false });
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  })
);

// Indian states/UTs with GST state codes (address forms and place of supply).
router.get(
  "/states/:country",
  ah(async (req, res) => {
    res.set("Cache-Control", "public, max-age=86400");
    if (String(req.params.country).toUpperCase() !== "IN") return res.json({ states: [] });
    res.json({ states: require("./gst.js").STATES.map((s) => ({ code: s.code, name: s.name })) });
  })
);

module.exports = { router, customerFor };
