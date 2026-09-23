// catalogRepo.js — PUBLIC catalog queries.
//
// SECURITY: nothing in this file may select from product_costs or
// pricing_rules. Customer JSON is built from explicit allowlists below; the
// only price exposed is product_selling_prices.selling_price_usd.
// (test/security.costs.test.js enforces this.)
const { query, queryText, one } = require("../../core/db.js");
const { publicPrice } = require("../pricing/pricingService.js");
const { availabilityFor } = require("../inventory/inventoryService.js");

const PUBLIC_STATUSES = ["active", "coming_soon", "discontinued", "end_of_sale", "end_of_life"];
const PUBLIC_STATUS_SQL = PUBLIC_STATUSES.map((s) => `'${s}'`).join(",");
const HIGHLIGHT_CODES = ["connector", "fiber_type", "fiber_mode", "fiber_count", "length_label", "jacket_rating", "polish", "cable_category", "color"];

async function categoryTree() {
  const cats = await query(
    `SELECT c.id, c.parent_id, c.slug, c.name, c.short_description, c.icon, c.image_url, c.sort_order,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL})) AS product_count,
            (SELECT COUNT(*) FROM product_families f WHERE f.category_id = c.id AND f.status = 'active' AND f.deleted_at IS NULL) AS family_count
       FROM categories c WHERE c.status = 'active' AND c.deleted_at IS NULL ORDER BY c.sort_order, c.name`
  );
  const byId = new Map(cats.map((c) => [Number(c.id), { id: String(c.id), slug: c.slug, name: c.name, shortDescription: c.short_description, icon: c.icon, imageUrl: c.image_url, productCount: Number(c.product_count), familyCount: Number(c.family_count), parentId: c.parent_id ? String(c.parent_id) : null, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(Number(c.parentId))) byId.get(Number(c.parentId)).children.push(c);
    else roots.push(c);
  }
  const total = (c) => c.productCount + c.children.reduce((s, k) => s + total(k), 0);
  for (const c of byId.values()) c.totalProducts = total(c);
  return roots;
}

async function categoryBySlug(slug) {
  const c = await one("SELECT id, parent_id, slug, name, short_description, description, icon, image_url, seo_title, seo_description FROM categories WHERE slug = :s AND status = 'active' AND deleted_at IS NULL", { s: slug });
  if (!c) return null;
  const crumbs = [];
  let pid = c.parent_id;
  for (let i = 0; pid && i < 10; i++) {
    const p = await one("SELECT id, parent_id, slug, name FROM categories WHERE id = :id", { id: pid });
    if (!p) break;
    crumbs.unshift({ slug: p.slug, name: p.name });
    pid = p.parent_id;
  }
  return { id: Number(c.id), slug: c.slug, name: c.name, shortDescription: c.short_description, description: c.description, icon: c.icon, imageUrl: c.image_url, seoTitle: c.seo_title, seoDescription: c.seo_description, breadcrumbs: crumbs };
}

async function descendantCategoryIds(rootId) {
  const ids = [Number(rootId)];
  for (let i = 0; i < ids.length && i < 1000; i++) {
    const kids = await query("SELECT id FROM categories WHERE parent_id = :id AND deleted_at IS NULL", { id: ids[i] });
    ids.push(...kids.map((k) => Number(k.id)));
  }
  return ids;
}

function availabilityJson(product, stock) {
  if (!product.track_inventory) return { status: "on_request", leadTimeDays: product.lead_time_days };
  if (!stock) return { status: "on_request", leadTimeDays: product.lead_time_days };
  if (stock.available > 0) return { status: "in_stock", quantity: stock.available, leadTimeDays: product.lead_time_days };
  if (stock.incoming > 0) return { status: "incoming", leadTimeDays: product.lead_time_days };
  if (product.allow_backorder) return { status: "backorder", leadTimeDays: product.lead_time_days };
  return { status: "out_of_stock", leadTimeDays: product.lead_time_days };
}

async function attributesFor(ids, codes = null) {
  if (!ids.length) return new Map();
  const rows = await queryText(
    `SELECT v.product_id, a.code, a.name, a.unit, v.value_text, v.value_number, a.sort_order
       FROM product_attribute_values v JOIN attributes a ON a.id = v.attribute_id
      WHERE v.product_id IN (?) ${codes ? "AND a.code IN (?)" : ""} ORDER BY a.sort_order`,
    codes ? [ids, codes] : [ids]
  );
  const map = new Map();
  for (const r of rows) {
    const k = Number(r.product_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ code: r.code, name: r.name, value: r.value_text, number: r.value_number === null ? null : Number(r.value_number) });
  }
  return map;
}

async function primaryImages(ids) {
  if (!ids.length) return new Map();
  const rows = await queryText(
    `SELECT id, product_id, url, alt, width, height, status FROM product_images
      WHERE product_id IN (?) AND is_primary = 1 AND status <> 'broken'`,
    [ids]
  );
  return new Map(rows.map((r) => [Number(r.product_id), { id: Number(r.id), url: r.url, alt: r.alt, width: r.width, height: r.height }]));
}

/** Build customer-safe cards for product rows (row must come from PRODUCT_CARD_SELECT). */
async function toCards(rows) {
  const ids = rows.map((r) => Number(r.id));
  const [attrs, images, stock] = await Promise.all([attributesFor(ids, HIGHLIGHT_CODES), primaryImages(ids), availabilityFor(ids)]);
  return rows.map((r) => {
    const id = Number(r.id);
    return {
      id: String(r.id),
      sku: r.sku,
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description,
      category: { slug: r.category_slug, name: r.category_name },
      family: r.family_slug ? { slug: r.family_slug, name: r.family_name } : null,
      image: images.get(id) || null,
      highlights: (attrs.get(id) || []).filter((a) => a.code !== "length_m").slice(0, 5).map((a) => ({ name: a.name, value: a.value })),
      price: publicPrice(r),
      availability: availabilityJson(r, stock.get(id)),
      moq: r.moq,
      unit: r.unit,
      status: r.status,
    };
  });
}

const PRODUCT_CARD_SELECT = `
  SELECT p.id, p.sku, p.slug, p.name, p.short_description, p.moq, p.unit, p.status, p.lead_time_days, p.track_inventory, p.allow_backorder,
         c.slug AS category_slug, c.name AS category_name, f.slug AS family_slug, f.name AS family_name,
         sp.selling_price_usd
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_selling_prices sp ON sp.product_id = p.id`;

const SYNONYMS = {
  singlemode: ["singlemode", "single mode", " sm"],
  "single-mode": ["singlemode", "single mode", " sm"],
  sm: ["singlemode", " sm"],
  multimode: ["multimode", " mm", "om3", "om4"],
  mtp: ["mtp", "mpo"],
  plenum: ["plenum", "ofnp"],
  riser: ["ofnr"],
  loopback: ["loopback"],
  patchcord: ["patch cord", "fiber cable"],
  adapter: ["adapter", "adaptor", "coupler"],
  adaptor: ["adapter", "adaptor", "coupler"],
};

function normalizeQuery(q) {
  return String(q || "")
    .replace(/\bsingle[\s-]+mode\b/gi, "singlemode")
    .replace(/\bmulti[\s-]+mode\b/gi, "multimode")
    .replace(/\b(\d{1,3})\s*(?:f|fiber|fibre|core)s?\b/gi, "$1F")
    .replace(/\bpatch\s+cord\b/gi, "patchcord");
}

function tokenize(q) {
  return normalizeQuery(q)
    .toLowerCase()
    .replace(/[^\w.\-/+ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
}

/** WHERE fragment + params for free-text search. Each token must match somewhere (AND). */
function searchClause(q, params, { mode = "all" } = {}) {
  const tokens = tokenize(q);
  if (!tokens.length) return null;
  const parts = tokens.map((t, i) => {
    const alts = SYNONYMS[t] || [t];
    const ors = alts.map((a, j) => {
      const k = `t${i}_${j}`;
      params[k] = `%${a.trim() === a ? a : a}%`;
      return `(p.name LIKE :${k} OR p.description LIKE :${k} OR p.sku LIKE :${k} OR c.name LIKE :${k} OR f.name LIKE :${k}
               OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.value_text LIKE :${k}))`;
    });
    // SKU-ish tokens also match the normalised SKU (ignores dashes/dots).
    const norm = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (norm.length >= 3) {
      params[`n${i}`] = `%${norm}%`;
      ors.push(`p.sku_search LIKE :n${i}`);
    }
    return `(${ors.join(" OR ")})`;
  });
  const norm = String(q).toUpperCase().replace(/[^A-Z0-9]/g, "");
  params.qExact = String(q).trim();
  params.qNorm = norm;
  params.qNormPrefix = `${norm}%`;
  params.qPhrase = `%${String(q).trim()}%`;
  return {
    where: `(${parts.join(mode === "any" ? " OR " : " AND ")})`,
    score: `(CASE WHEN p.sku = :qExact THEN 1000 WHEN p.sku_search = :qNorm THEN 900 WHEN p.sku_search LIKE :qNormPrefix THEN 500 ELSE 0 END
             + CASE WHEN p.name LIKE :qPhrase THEN 50 ELSE 0 END)`,
  };
}

// ── Typo tolerance ─────────────────────────────────────────────────────
// Vocabulary = words used in product names, family names and attribute
// values (cached 5 min). A search word that matches nothing is corrected to
// the closest vocabulary word (edit distance ≤1, or ≤2 for long words), or
// dropped and reported back to the user. (Future: Meilisearch/OpenSearch.)
let vocab = null;
let vocabAt = 0;
async function vocabulary() {
  if (vocab && Date.now() - vocabAt < 5 * 60 * 1000) return vocab;
  const rows = await query(
    `SELECT name AS t FROM products WHERE deleted_at IS NULL
     UNION SELECT name FROM product_families UNION SELECT name FROM categories
     UNION SELECT DISTINCT value_text FROM product_attribute_values`
  );
  const set = new Set();
  for (const r of rows) for (const w of tokenize(r.t)) if (w.length >= 3 && !/^\d+(\.\d+)?$/.test(w)) set.add(w.replace(/[.,]+$/, ""));
  vocab = [...set];
  vocabAt = Date.now();
  return vocab;
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

async function tokenHits(token, baseWhere, baseParams) {
  const p = { ...baseParams };
  const s = searchClause(token, p);
  const r = await one(`SELECT COUNT(*) AS c FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id LEFT JOIN product_selling_prices sp ON sp.product_id = p.id WHERE ${[...baseWhere, s.where].join(" AND ")}`, p);
  return Number(r.c);
}

/** Returns { query, corrections: [{from,to}], ignored: [] } — a query every word of which matches something. */
async function repairQuery(q, baseWhere, baseParams) {
  const words = tokenize(q);
  const kept = [];
  const corrections = [];
  const ignored = [];
  let words2 = null;
  for (const w of words) {
    if (await tokenHits(w, baseWhere, baseParams)) {
      kept.push(w);
      continue;
    }
    words2 = words2 || (await vocabulary());
    const max = w.length > 6 ? 2 : 1;
    let best = null;
    let bestD = max + 1;
    if (w.length >= 4) {
      for (const v of words2) {
        const d = editDistance(w, v, max);
        if (d < bestD) (bestD = d), (best = v);
      }
    }
    if (best && (await tokenHits(best, baseWhere, baseParams))) {
      kept.push(best);
      corrections.push({ from: w, to: best });
    } else ignored.push(w);
  }
  return { query: kept.join(" "), corrections, ignored };
}

/**
 * Paged, filtered, sorted listing + facets. Everything server-side.
 * filters: { categorySlug, familySlug, q, attrs: {code: [values]}, inStock, priced, sort, page, limit }
 */
async function listProducts(filters) {
  const limit = Math.min(Math.max(Number(filters.limit) || 24, 1), 96);
  const page = Math.max(Number(filters.page) || 1, 1);
  const params = {};
  const where = ["p.deleted_at IS NULL", `p.status IN (${PUBLIC_STATUS_SQL})`];
  let category = null;
  if (filters.categorySlug) {
    category = await categoryBySlug(filters.categorySlug);
    if (!category) return null;
    const ids = await descendantCategoryIds(category.id);
    where.push(`p.category_id IN (${ids.map(Number).join(",")})`);
  }
  if (filters.familySlug) {
    params.fam = filters.familySlug;
    where.push("EXISTS (SELECT 1 FROM product_family_links l JOIN product_families ff ON ff.id = l.family_id WHERE l.product_id = p.id AND ff.slug = :fam)");
  }
  let search = null;
  let relaxed = false;
  if (filters.q) {
    search = searchClause(filters.q, params);
    if (search) where.push(search.where);
  }
  if (filters.inStock) where.push("EXISTS (SELECT 1 FROM inventory_levels il JOIN warehouses w ON w.id = il.warehouse_id AND w.is_active = 1 WHERE il.product_id = p.id AND il.on_hand - il.reserved > 0)");
  if (filters.priced) where.push("sp.selling_price_usd IS NOT NULL");
  // Price range (already converted to USD by the route). Unpriced products are excluded when a range is set.
  if (filters.minPriceUsd != null && Number.isFinite(Number(filters.minPriceUsd))) {
    params.minP = String(filters.minPriceUsd);
    where.push("sp.selling_price_usd >= :minP");
  }
  if (filters.maxPriceUsd != null && Number.isFinite(Number(filters.maxPriceUsd))) {
    params.maxP = String(filters.maxPriceUsd);
    where.push("sp.selling_price_usd <= :maxP");
  }

  const attrs = filters.attrs || {};
  const attrWhere = (excludeCode) =>
    Object.entries(attrs)
      .filter(([code, vals]) => code !== excludeCode && vals.length)
      .map(([code, vals], i) => {
        const keys = vals.slice(0, 20).map((v, j) => {
          const k = `a_${excludeCode || "x"}_${i}_${j}`;
          params[k] = String(v).slice(0, 255);
          return `:${k}`;
        });
        const ck = `ac_${excludeCode || "x"}_${i}`;
        params[ck] = code;
        return `EXISTS (SELECT 1 FROM product_attribute_values v JOIN attributes a ON a.id = v.attribute_id WHERE v.product_id = p.id AND a.code = :${ck} AND v.value_text IN (${keys.join(",")}))`;
      });

  const from = `FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id LEFT JOIN product_selling_prices sp ON sp.product_id = p.id`;
  const fullWhere = [...where, ...attrWhere(null)].join(" AND ");

  const sorts = {
    relevance: search ? `${search.score} DESC, c.sort_order, f.sort_order, p.id` : "c.sort_order, f.sort_order, p.id",
    newest: "p.created_at DESC, p.id DESC",
    popular: "(SELECT ps.orders * 10 + ps.views FROM product_stats ps WHERE ps.product_id = p.id) IS NULL, (SELECT ps.orders * 10 + ps.views FROM product_stats ps WHERE ps.product_id = p.id) DESC, c.sort_order, p.id",
    price_asc: "sp.selling_price_usd IS NULL, sp.selling_price_usd ASC, p.sku",
    price_desc: "sp.selling_price_usd IS NULL, sp.selling_price_usd DESC, p.sku",
    sku: "p.sku",
    name: "p.name",
  };
  const order = sorts[filters.sort] || sorts.relevance;

  let rows = await query(`${PRODUCT_CARD_SELECT} WHERE ${fullWhere} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  let totalRow = await one(`SELECT COUNT(*) AS c ${from} WHERE ${fullWhere}`, params);

  // Typo / unknown-word fallback: correct or drop words that match nothing.
  let searchNote = null;
  if (filters.q && Number(totalRow.c) === 0 && search) {
    const baseWhere = where.filter((w) => w !== search.where);
    const repaired = await repairQuery(filters.q, [...baseWhere, ...attrWhere(null)], params);
    if (repaired.query) {
      const s2 = searchClause(repaired.query, params);
      const w2 = [...baseWhere, s2.where, ...attrWhere(null)].join(" AND ");
      rows = await query(`${PRODUCT_CARD_SELECT} WHERE ${w2} ORDER BY ${s2.score} DESC, c.sort_order, f.sort_order, p.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
      totalRow = await one(`SELECT COUNT(*) AS c ${from} WHERE ${w2}`, params);
      where.splice(where.indexOf(search.where), 1, s2.where);
      relaxed = true;
    }
    searchNote = { searchedFor: repaired.query, corrections: repaired.corrections, ignored: repaired.ignored };
  }

  // Facets: each attribute counted with every OTHER active filter applied.
  const facetAttrs = await query("SELECT id, code, name, unit, sort_order FROM attributes WHERE is_filterable = 1 AND code NOT IN ('length_m') ORDER BY sort_order");
  const facets = [];
  for (const a of facetAttrs) {
    const w = [...where, ...attrWhere(a.code)].join(" AND ");
    params.facetAttr = a.id;
    const vals = await query(
      `SELECT v.value_text AS value, COUNT(DISTINCT p.id) AS count, MIN(v.value_number) AS num
         ${from} JOIN product_attribute_values v ON v.product_id = p.id AND v.attribute_id = :facetAttr
        WHERE ${w} GROUP BY v.value_text ORDER BY MIN(v.value_number) IS NULL, MIN(v.value_number), v.value_text LIMIT 60`,
      params
    );
    if (vals.length) facets.push({ code: a.code, name: a.name, values: vals.map((v) => ({ value: v.value, count: Number(v.count), selected: (attrs[a.code] || []).includes(v.value) })) });
  }

  return { category, page, limit, total: Number(totalRow.c), relaxed, search: searchNote, items: await toCards(rows), facets };
}

async function productDetail(slug) {
  const p = await one(
    `${PRODUCT_CARD_SELECT.replace("SELECT p.id,", "SELECT p.id, p.description, p.brand, p.product_type, p.max_order_qty, p.weight_kg, p.length_mm, p.width_mm, p.height_mm, p.country_of_origin, p.hs_code, p.warranty_months, p.seo_title, p.seo_description, p.replacement_product_id, p.category_id, p.family_id,")}
      WHERE (p.slug = :s OR p.sku = :s) AND p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL})`,
    { s: slug }
  );
  if (!p) return null;
  const id = Number(p.id);
  const [card] = await toCards([p]);
  const [allAttrs, images, specs, docs, relations, category] = await Promise.all([
    attributesFor([id]),
    query("SELECT id, url, alt, width, height FROM product_images WHERE product_id = :id AND status <> 'broken' ORDER BY is_primary DESC, sort_order, id", { id }),
    query("SELECT spec_group, label, value FROM product_specifications WHERE product_id = :id ORDER BY spec_group, sort_order", { id }),
    query("SELECT doc_type, title, version, url, file_id FROM product_documents WHERE (product_id = :id OR family_id = :fid) AND is_public = 1 AND deleted_at IS NULL", { id, fid: p.family_id || 0 }),
    query(
      `${PRODUCT_CARD_SELECT.replace("SELECT p.id,", "SELECT r.relation_type, p.id,")}
       JOIN product_relations r ON r.related_product_id = p.id WHERE r.product_id = :id AND p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL})`,
      { id }
    ),
    categoryBySlug(p.category_slug),
  ]);

  // Variants = the other SKUs in the same primary family, with their variant axes.
  let variants = [];
  let axes = [];
  if (p.family_id) {
    const sib = await query(`${PRODUCT_CARD_SELECT} JOIN product_family_links l ON l.product_id = p.id AND l.family_id = :fid WHERE p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL}) ORDER BY p.id`, { fid: p.family_id });
    const sibAttrs = await attributesFor(sib.map((s) => Number(s.id)));
    const cards = await toCards(sib);
    const axisCodes = ["length_label", "color", "polish", "fiber_count", "configuration", "connector"];
    axes = axisCodes.filter((code) => new Set(sib.map((s) => ((sibAttrs.get(Number(s.id)) || []).find((a) => a.code === code) || {}).value || "")).size > 1);
    variants = cards.map((c) => ({
      sku: c.sku, slug: c.slug, name: c.name, price: c.price, availability: c.availability, image: c.image,
      axes: Object.fromEntries(axes.map((code) => [code, ((sibAttrs.get(Number(c.id)) || []).find((a) => a.code === code) || {}).value || null])),
      sortKey: ((sibAttrs.get(Number(c.id)) || []).find((a) => a.code === "length_m") || {}).number ?? null,
    }));
    variants.sort((a, b) => (a.sortKey ?? 1e9) - (b.sortKey ?? 1e9) || a.sku.localeCompare(b.sku));
  }

  let replacement = null;
  if (p.replacement_product_id && ["discontinued", "end_of_sale", "end_of_life"].includes(p.status)) {
    const r = await query(`${PRODUCT_CARD_SELECT} WHERE p.id = :id AND p.deleted_at IS NULL`, { id: p.replacement_product_id });
    replacement = r.length ? (await toCards(r))[0] : null;
  }
  const relCards = await toCards(relations);
  const attrLabel = { length_m: null };
  return {
    ...card,
    description: p.description,
    brand: p.brand,
    productType: p.product_type,
    maxOrderQty: p.max_order_qty,
    warrantyMonths: p.warranty_months,
    countryOfOrigin: p.country_of_origin,
    hsCode: p.hs_code,
    weightKg: p.weight_kg,
    seo: { title: p.seo_title || `${p.name} | ${p.sku} | IXITEK`, description: p.seo_description || String(p.description || "").slice(0, 160) },
    breadcrumbs: [...(category ? category.breadcrumbs : []), { slug: p.category_slug, name: p.category_name }],
    images: images.map((i) => ({ id: Number(i.id), url: i.url, alt: i.alt || p.name, width: i.width, height: i.height })),
    attributes: (allAttrs.get(id) || []).filter((a) => attrLabel[a.code] !== null).map((a) => ({ code: a.code, name: a.name, value: a.value })),
    specifications: specs.map((s) => ({ group: s.spec_group, label: s.label, value: s.value })),
    documents: docs.map((d) => ({ type: d.doc_type, title: d.title, version: d.version, url: d.url || (d.file_id ? `/api/catalog/documents/${d.file_id}` : null) })),
    variantAxes: axes,
    variants,
    related: relCards.map((c, i) => ({ ...c, relation: relations[i].relation_type })),
    replacement,
  };
}

async function familyDetail(slug) {
  const f = await one(
    `SELECT f.id, f.slug, f.name, f.short_description, f.description, f.image_url, c.slug AS category_slug, c.name AS category_name
       FROM product_families f JOIN categories c ON c.id = f.category_id WHERE f.slug = :s AND f.status = 'active' AND f.deleted_at IS NULL`,
    { s: slug }
  );
  if (!f) return null;
  return { slug: f.slug, name: f.name, shortDescription: f.short_description, description: f.description, imageUrl: f.image_url, category: { slug: f.category_slug, name: f.category_name } };
}

async function familiesForCategory(categorySlug) {
  const cat = await categoryBySlug(categorySlug);
  if (!cat) return null;
  const ids = await descendantCategoryIds(cat.id);
  const rows = await query(
    `SELECT f.id, f.slug, f.name, f.image_url, c.slug AS category_slug, c.name AS category_name,
            COUNT(DISTINCT p.id) AS product_count, MIN(sp.selling_price_usd) AS from_price
       FROM product_families f JOIN categories c ON c.id = f.category_id
       JOIN product_family_links l ON l.family_id = f.id
       JOIN products p ON p.id = l.product_id AND p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL})
       LEFT JOIN product_selling_prices sp ON sp.product_id = p.id
      WHERE f.category_id IN (${ids.map(Number).join(",")}) AND f.status = 'active' AND f.deleted_at IS NULL
      GROUP BY f.id ORDER BY c.sort_order, f.sort_order`
  );
  const members = await familyMembers(rows.map((r) => Number(r.id)));
  return rows.map((r) => {
    const m = members.get(Number(r.id)) || { variants: [], image: null };
    return {
      slug: r.slug,
      name: r.name,
      imageUrl: r.image_url,
      image: m.image,
      category: { slug: r.category_slug, name: r.category_name },
      productCount: Number(r.product_count),
      fromPrice: publicPrice({ selling_price_usd: r.from_price }),
      // Where a click on the family card lands (its product page has the variant selector).
      productSlug: m.variants[0]?.slug || null,
      // The "types available" shown under the card: one short label per SKU, e.g. "1 m", "OM4 · Aqua".
      variants: m.variants.map(({ slug, label }) => ({ slug, label })),
    };
  });
}

const VARIANT_AXES = ["length_label", "fiber_mode", "fiber_type", "fiber_count", "polish", "color", "configuration", "connector"];

/** Members of each family: a short distinguishing label per SKU (only the axes that differ), sorted by length, and a card image. */
async function familyMembers(familyIds) {
  const out = new Map();
  if (!familyIds.length) return out;
  const rows = await query(
    `SELECT l.family_id, p.id, p.slug, p.name FROM product_family_links l
       JOIN products p ON p.id = l.product_id AND p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL})
      WHERE l.family_id IN (${familyIds.map(Number).join(",")}) ORDER BY p.id`
  );
  const ids = rows.map((r) => Number(r.id));
  const [attrs, images] = await Promise.all([attributesFor(ids, [...VARIANT_AXES, "length_m"]), primaryImages(ids)]);
  const val = (id, code) => ((attrs.get(id) || []).find((a) => a.code === code) || {}).value || "";
  const num = (id) => ((attrs.get(id) || []).find((a) => a.code === "length_m") || {}).number ?? null;
  const byFamily = new Map();
  for (const r of rows) {
    const k = Number(r.family_id);
    if (!byFamily.has(k)) byFamily.set(k, []);
    byFamily.get(k).push({ id: Number(r.id), slug: r.slug, name: r.name });
  }
  for (const [fid, list] of byFamily) {
    // Cable families differ by length, so the length alone is the label ("1 m", "3 ft").
    // Otherwise (adaptors, loopbacks, panels) use whichever attributes differ.
    // A label shared by two SKUs, or an empty one, falls back to the product name.
    const varies = (code) => new Set(list.map((x) => val(x.id, code))).size > 1;
    const axes = varies("length_label") ? ["length_label"] : VARIANT_AXES.filter(varies);
    const raw = list.map((x) => axes.map((code) => val(x.id, code)).filter(Boolean).join(" · "));
    const variants = list
      .map((x, i) => ({ slug: x.slug, label: raw[i] && raw.indexOf(raw[i]) === raw.lastIndexOf(raw[i]) ? raw[i] : x.name, sortKey: num(x.id), id: x.id }))
      .sort((a, b) => (a.sortKey ?? 1e9) - (b.sortKey ?? 1e9) || a.label.localeCompare(b.label, "en", { numeric: true }));
    const withImage = variants.find((v) => images.get(v.id));
    out.set(fid, { variants, image: withImage ? images.get(withImage.id) : null });
  }
  return out;
}

async function suggest(q) {
  const params = {};
  const s = searchClause(q, params);
  if (!s) return { products: [], categories: [] };
  const rows = await query(`${PRODUCT_CARD_SELECT} WHERE p.deleted_at IS NULL AND p.status IN (${PUBLIC_STATUS_SQL}) AND ${s.where} ORDER BY ${s.score} DESC, p.sku LIMIT 8`, params);
  const cats = await query("SELECT slug, name FROM categories WHERE status = 'active' AND deleted_at IS NULL AND name LIKE :q ORDER BY sort_order LIMIT 5", { q: `%${String(q).trim()}%` });
  const images = await primaryImages(rows.map((r) => Number(r.id)));
  return {
    products: rows.map((r) => ({ sku: r.sku, slug: r.slug, name: r.name, image: images.get(Number(r.id)) || null, price: publicPrice(r), category: { slug: r.category_slug, name: r.category_name } })),
    categories: cats.map((c) => ({ slug: c.slug, name: c.name })),
  };
}

module.exports = { categoryTree, categoryBySlug, listProducts, productDetail, familyDetail, familiesForCategory, suggest, toCards, PRODUCT_CARD_SELECT, PUBLIC_STATUSES };
