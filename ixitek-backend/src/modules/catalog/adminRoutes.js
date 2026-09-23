// /api/admin/catalog — product information management for staff.
// Cost fields are included ONLY for users with `pricing.read_cost`.
const express = require("express");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const { query, queryText, one, tx } = require("../../core/db.js");
const audit = require("../../core/audit.js");
const { ah, badRequest, notFound, conflict } = require("../../core/errors.js");

const router = express.Router();
router.use(requireAuth, requirePermission("admin.access", "catalog.read"));

const STATUSES = ["draft", "review", "active", "coming_soon", "discontinued", "end_of_sale", "end_of_life", "archived"];

router.get(
  "/categories",
  ah(async (req, res) => {
    const cats = await query(
      `SELECT c.id, c.parent_id, c.slug, c.name, c.status, c.sort_order, c.show_in_menu, c.short_description,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS products
         FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.parent_id IS NOT NULL, c.parent_id, c.sort_order`
    );
    const fams = await query(
      `SELECT f.id, f.category_id, f.slug, f.name, f.status, f.sort_order, (SELECT COUNT(*) FROM product_family_links l WHERE l.family_id = f.id) AS products
         FROM product_families f WHERE f.deleted_at IS NULL ORDER BY f.category_id, f.sort_order`
    );
    res.json({
      categories: cats.map((c) => ({ id: String(c.id), parentId: c.parent_id ? String(c.parent_id) : null, slug: c.slug, name: c.name, status: c.status, sortOrder: c.sort_order, showInMenu: Boolean(c.show_in_menu), shortDescription: c.short_description, products: Number(c.products) })),
      families: fams.map((f) => ({ id: String(f.id), categoryId: String(f.category_id), slug: f.slug, name: f.name, status: f.status, sortOrder: f.sort_order, products: Number(f.products) })),
    });
  })
);

router.put(
  "/categories/:id",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    const before = await one("SELECT * FROM categories WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
    if (!before) throw notFound();
    const b = req.body;
    const next = {
      name: b.name !== undefined ? String(b.name).trim().slice(0, 160) : before.name,
      short: b.shortDescription !== undefined ? String(b.shortDescription).slice(0, 500) : before.short_description,
      status: ["active", "hidden", "archived"].includes(b.status) ? b.status : before.status,
      sort: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : before.sort_order,
      menu: b.showInMenu !== undefined ? (b.showInMenu ? 1 : 0) : before.show_in_menu,
      seoTitle: b.seoTitle !== undefined ? String(b.seoTitle).slice(0, 200) || null : before.seo_title,
      seoDesc: b.seoDescription !== undefined ? String(b.seoDescription).slice(0, 400) || null : before.seo_description,
    };
    if (!next.name) throw badRequest("Name is required.");
    await query("UPDATE categories SET name=:name, short_description=:short, status=:status, sort_order=:sort, show_in_menu=:menu, seo_title=:seoTitle, seo_description=:seoDesc WHERE id=:id", { ...next, id: req.params.id });
    await audit.record({ req, action: "category.update", entityType: "category", entityId: req.params.id, before, after: next });
    res.json({ ok: true });
  })
);

router.put(
  "/families/:id",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    const before = await one("SELECT * FROM product_families WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
    if (!before) throw notFound();
    const b = req.body;
    const next = {
      name: b.name !== undefined ? String(b.name).trim().slice(0, 200) : before.name,
      short: b.shortDescription !== undefined ? String(b.shortDescription).slice(0, 500) : before.short_description,
      desc: b.description !== undefined ? String(b.description).slice(0, 20000) : before.description,
      status: ["active", "hidden", "archived"].includes(b.status) ? b.status : before.status,
      sort: b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : before.sort_order,
    };
    if (!next.name) throw badRequest("Name is required.");
    await query("UPDATE product_families SET name=:name, short_description=:short, description=:desc, status=:status, sort_order=:sort WHERE id=:id", { ...next, id: req.params.id });
    await audit.record({ req, action: "family.update", entityType: "product_family", entityId: req.params.id, before, after: next });
    res.json({ ok: true });
  })
);

router.get(
  "/products",
  ah(async (req, res) => {
    const withCosts = await can(req.user, "pricing.read_cost");
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const where = ["p.deleted_at IS NULL"];
    const p = {};
    if (req.query.q) (where.push("(p.sku LIKE :q OR p.name LIKE :q OR p.description LIKE :q)"), (p.q = `%${String(req.query.q).slice(0, 100)}%`));
    if (req.query.categoryId) (where.push("p.category_id = :c"), (p.c = Number(req.query.categoryId)));
    if (STATUSES.includes(req.query.status)) (where.push("p.status = :s"), (p.s = req.query.status));
    if (req.query.price === "none") where.push("sp.selling_price_usd IS NULL");
    if (req.query.price === "override") where.push("sp.source = 'override'");
    const sorts = { sku: "p.sku", name: "p.name", updated: "p.updated_at DESC", price: "sp.selling_price_usd" };
    const order = sorts[req.query.sort] || "p.id";
    const costCols = withCosts ? ", pc.supplier_fob_cost_usd, pc.supplier_exw_cost_usd, pc.internal_cost_usd, pc.cost_basis" : "";
    const costJoin = withCosts ? "LEFT JOIN product_costs pc ON pc.product_id = p.id" : "";
    const rows = await query(
      `SELECT p.id, p.sku, p.name, p.status, p.is_featured, p.updated_at, c.name AS category, f.name AS family,
              sp.selling_price_usd, sp.source AS price_source, sp.override_price_usd,
              (SELECT status FROM product_images i WHERE i.product_id = p.id AND i.is_primary = 1 LIMIT 1) AS image_status,
              (SELECT COALESCE(SUM(l.on_hand - l.reserved),0) FROM inventory_levels l WHERE l.product_id = p.id) AS available
              ${costCols}
         FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id
         LEFT JOIN product_selling_prices sp ON sp.product_id = p.id ${costJoin}
        WHERE ${where.join(" AND ")} ORDER BY ${order}, p.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      p
    );
    const total = await one(`SELECT COUNT(*) AS c FROM products p LEFT JOIN product_selling_prices sp ON sp.product_id = p.id WHERE ${where.join(" AND ")}`, p);
    res.json({
      page, limit, total: Number(total.c), canSeeCosts: withCosts,
      items: rows.map((r) => ({
        id: String(r.id), sku: r.sku, name: r.name, status: r.status, featured: Boolean(r.is_featured), category: r.category, family: r.family,
        sellingPriceUsd: r.selling_price_usd, priceSource: r.price_source || "none", imageStatus: r.image_status || "missing", available: Number(r.available), updatedAt: r.updated_at,
        ...(withCosts ? { costs: { supplierFobCostUsd: r.supplier_fob_cost_usd, supplierExwCostUsd: r.supplier_exw_cost_usd, internalCostUsd: r.internal_cost_usd, costBasis: r.cost_basis } } : {}),
      })),
    });
  })
);

router.get(
  "/products/:id",
  ah(async (req, res) => {
    const withCosts = await can(req.user, "pricing.read_cost");
    const p = await one(
      `SELECT p.*, c.name AS category_name, f.name AS family_name, sp.selling_price_usd, sp.source AS price_source, sp.rule_id, sp.override_price_usd, sp.override_reason
         FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_families f ON f.id = p.family_id
         LEFT JOIN product_selling_prices sp ON sp.product_id = p.id WHERE p.id = :id`,
      { id: req.params.id }
    );
    if (!p) throw notFound();
    const [attrs, images, families, relations] = await Promise.all([
      query("SELECT a.code, a.name, v.value_text, v.source FROM product_attribute_values v JOIN attributes a ON a.id = v.attribute_id WHERE v.product_id = :id ORDER BY a.sort_order", { id: p.id }),
      query("SELECT id, url, alt, is_primary, status, http_status, checked_at FROM product_images WHERE product_id = :id ORDER BY is_primary DESC, sort_order", { id: p.id }),
      query("SELECT f.id, f.name, l.is_primary FROM product_family_links l JOIN product_families f ON f.id = l.family_id WHERE l.product_id = :id", { id: p.id }),
      query("SELECT r.relation_type, r.related_product_id, pp.sku FROM product_relations r JOIN products pp ON pp.id = r.related_product_id WHERE r.product_id = :id", { id: p.id }),
    ]);
    let costs;
    let calc;
    if (withCosts) {
      costs = await one("SELECT supplier_fob_cost_usd, supplier_exw_cost_usd, internal_cost_usd, cost_basis, updated_at FROM product_costs WHERE product_id = :id", { id: p.id });
      calc = await require("../pricing/pricingService.js").calculate(Number(p.id), { ignoreOverride: true });
    }
    res.json({
      canSeeCosts: withCosts,
      product: {
        id: String(p.id), sku: p.sku, slug: p.slug, name: p.name, shortDescription: p.short_description, description: p.description, status: p.status,
        featured: Boolean(p.is_featured), category: { id: String(p.category_id), name: p.category_name }, family: p.family_id ? { id: String(p.family_id), name: p.family_name } : null,
        brand: p.brand, productType: p.product_type, unit: p.unit, moq: p.moq, maxOrderQty: p.max_order_qty, weightKg: p.weight_kg, lengthMm: p.length_mm, widthMm: p.width_mm, heightMm: p.height_mm, leadTimeDays: p.lead_time_days,
        warrantyMonths: p.warranty_months, countryOfOrigin: p.country_of_origin, hsCode: p.hs_code, trackInventory: Boolean(p.track_inventory), allowBackorder: Boolean(p.allow_backorder),
        seoTitle: p.seo_title, seoDescription: p.seo_description, searchKeywords: p.search_keywords, replacementProductId: p.replacement_product_id ? String(p.replacement_product_id) : null,
        sourceRef: p.source_ref, createdAt: p.created_at, updatedAt: p.updated_at, deletedAt: p.deleted_at,
        attributes: attrs.map((a) => ({ code: a.code, name: a.name, value: a.value_text, source: a.source })),
        images: images.map((i) => ({ id: String(i.id), url: i.url, alt: i.alt, isPrimary: Boolean(i.is_primary), status: i.status, httpStatus: i.http_status, checkedAt: i.checked_at })),
        families: families.map((f) => ({ id: String(f.id), name: f.name, isPrimary: Boolean(f.is_primary) })),
        relations: relations.map((r) => ({ type: r.relation_type, productId: String(r.related_product_id), sku: r.sku })),
        pricing: {
          sellingPriceUsd: p.selling_price_usd, source: p.price_source || "none", overridePriceUsd: p.override_price_usd, overrideReason: p.override_reason,
          ...(withCosts ? { costs: costs ? { supplierFobCostUsd: costs.supplier_fob_cost_usd, supplierExwCostUsd: costs.supplier_exw_cost_usd, internalCostUsd: costs.internal_cost_usd, costBasis: costs.cost_basis, updatedAt: costs.updated_at } : null, ruleCalculation: calc } : {}),
        },
      },
    });
  })
);

const EDITABLE = {
  name: (v) => String(v).trim().slice(0, 255) || null,
  short_description: (v) => String(v).slice(0, 500),
  description: (v) => String(v).slice(0, 20000),
  status: (v) => (STATUSES.includes(v) ? v : undefined),
  is_featured: (v) => (v ? 1 : 0),
  brand: (v) => String(v).trim().slice(0, 100),
  unit: (v) => String(v).trim().slice(0, 20) || "pcs",
  moq: (v) => Math.max(1, Number.parseInt(v, 10) || 1),
  max_order_qty: (v) => (v === null || v === "" ? null : Math.max(1, Number.parseInt(v, 10) || 1)),
  weight_kg: (v) => (v === null || v === "" ? null : Number(v) > 0 ? String(Number(v)) : undefined),
  length_mm: (v) => (v === null || v === "" ? null : Number(v) > 0 ? String(Number(v)) : undefined),
  width_mm: (v) => (v === null || v === "" ? null : Number(v) > 0 ? String(Number(v)) : undefined),
  height_mm: (v) => (v === null || v === "" ? null : Number(v) > 0 ? String(Number(v)) : undefined),
  lead_time_days: (v) => (v === null || v === "" ? null : Math.max(0, Number.parseInt(v, 10) || 0)),
  warranty_months: (v) => (v === null || v === "" ? null : Math.max(0, Number.parseInt(v, 10) || 0)),
  country_of_origin: (v) => (v && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null),
  hs_code: (v) => (v ? String(v).trim().slice(0, 20) : null),
  track_inventory: (v) => (v ? 1 : 0),
  allow_backorder: (v) => (v ? 1 : 0),
  seo_title: (v) => (v ? String(v).slice(0, 200) : null),
  seo_description: (v) => (v ? String(v).slice(0, 400) : null),
  search_keywords: (v) => (v ? String(v).slice(0, 2000) : null),
  replacement_product_id: (v) => (v ? Number(v) : null),
};
const CAMEL = { shortDescription: "short_description", featured: "is_featured", maxOrderQty: "max_order_qty", weightKg: "weight_kg", lengthMm: "length_mm", widthMm: "width_mm", heightMm: "height_mm", leadTimeDays: "lead_time_days", warrantyMonths: "warranty_months", countryOfOrigin: "country_of_origin", hsCode: "hs_code", trackInventory: "track_inventory", allowBackorder: "allow_backorder", seoTitle: "seo_title", seoDescription: "seo_description", searchKeywords: "search_keywords", replacementProductId: "replacement_product_id" };

router.put(
  "/products/:id",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    const changes = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      const col = CAMEL[k] || k;
      if (!EDITABLE[col]) continue;
      const nv = EDITABLE[col](v);
      if (nv === undefined) throw badRequest(`Invalid value for ${k}.`);
      if (col === "name" && !nv) throw badRequest("Name is required.");
      changes[col] = nv;
    }
    if (req.body.sku !== undefined) throw badRequest("SKUs cannot be edited here. SKU changes require a dedicated, audited SKU change.");
    if (!Object.keys(changes).length) throw badRequest("Nothing to update.");
    if (changes.status === "archived" && !(await can(req.user, "catalog.delete"))) throw badRequest("You do not have permission to archive products.");
    await tx(async (conn) => {
      const before = await one("SELECT * FROM products WHERE id = :id AND deleted_at IS NULL FOR UPDATE", { id: req.params.id }, conn);
      if (!before) throw notFound();
      if (changes.replacement_product_id && String(changes.replacement_product_id) === String(before.id)) throw badRequest("A product cannot replace itself.");
      const sets = Object.keys(changes).map((c) => `${c} = :${c}`).join(", ");
      await query(`UPDATE products SET ${sets} WHERE id = :id`, { ...changes, id: req.params.id }, conn);
      const b = {};
      for (const c of Object.keys(changes)) b[c] = before[c];
      await audit.record({ req, action: "product.update", entityType: "product", entityId: req.params.id, before: b, after: changes, reason: req.body.reason }, conn);
    });
    res.json({ ok: true });
  })
);

router.put(
  "/products/:id/attributes",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    const list = Array.isArray(req.body.attributes) ? req.body.attributes : [];
    const attrIds = new Map((await query("SELECT id, code, data_type FROM attributes")).map((a) => [a.code, a]));
    await tx(async (conn) => {
      for (const a of list) {
        const def = attrIds.get(a.code);
        if (!def) throw badRequest(`Unknown attribute ${a.code}.`);
        if (a.value === null || a.value === "") {
          await query("DELETE FROM product_attribute_values WHERE product_id = :p AND attribute_id = :a", { p: req.params.id, a: def.id }, conn);
        } else {
          const num = Number.parseFloat(a.value);
          await query(
            `INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_number, source) VALUES (:p, :a, :t, :n, 'manual')
             ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_number = VALUES(value_number), source = 'manual'`,
            { p: req.params.id, a: def.id, t: String(a.value).slice(0, 255), n: Number.isFinite(num) ? String(num) : null },
            conn
          );
        }
      }
      await audit.record({ req, action: "product.attributes", entityType: "product", entityId: req.params.id, after: list }, conn);
    });
    res.json({ ok: true });
  })
);

router.post(
  "/products/:id/relations",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    const type = String(req.body.type || "");
    if (!["related", "compatible", "replacement", "alternative", "accessory"].includes(type)) throw badRequest("Invalid relation type.");
    const other = await one("SELECT id FROM products WHERE sku = :sku AND deleted_at IS NULL", { sku: String(req.body.sku || "") });
    if (!other) throw badRequest("No product with that SKU.");
    if (String(other.id) === String(req.params.id)) throw badRequest("A product cannot relate to itself.");
    try {
      await query("INSERT INTO product_relations (product_id, related_product_id, relation_type, note, created_by) VALUES (:a, :b, :t, :n, :u)", { a: req.params.id, b: other.id, t: type, n: req.body.note || null, u: req.user.id });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw conflict("That relation already exists.");
      throw err;
    }
    await audit.record({ req, action: "product.relation.add", entityType: "product", entityId: req.params.id, after: { type, sku: req.body.sku } });
    res.status(201).json({ ok: true });
  })
);

router.delete(
  "/products/:id/relations/:type/:otherId",
  requirePermission("catalog.write"),
  ah(async (req, res) => {
    await query("DELETE FROM product_relations WHERE product_id = :a AND related_product_id = :b AND relation_type = :t", { a: req.params.id, b: req.params.otherId, t: req.params.type });
    await audit.record({ req, action: "product.relation.remove", entityType: "product", entityId: req.params.id, before: { type: req.params.type, otherId: req.params.otherId } });
    res.json({ ok: true });
  })
);

// Soft delete only.
router.delete(
  "/products/:id",
  requirePermission("catalog.delete"),
  ah(async (req, res) => {
    if (String(req.body && req.body.confirm) !== "archive") throw badRequest("Confirm archiving by sending confirm: \"archive\".");
    const r = await query("UPDATE products SET deleted_at = CURRENT_TIMESTAMP(3), status = 'archived' WHERE id = :id AND deleted_at IS NULL", { id: req.params.id });
    if (r.affectedRows) await audit.record({ req, action: "product.archive", entityType: "product", entityId: req.params.id, reason: req.body.reason });
    res.json({ ok: true });
  })
);

// ── Data quality dashboard ──────────────────────────────────────────────
const CHECKS = {
  missing_image: "NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)",
  broken_image: "EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.is_primary = 1 AND i.status = 'broken')",
  unchecked_image: "EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.is_primary = 1 AND i.status = 'unchecked')",
  missing_description: "(p.description IS NULL OR p.description = '')",
  missing_attributes: "NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id)",
  missing_family: "p.family_id IS NULL",
  no_cost: "NOT EXISTS (SELECT 1 FROM product_costs pc WHERE pc.product_id = p.id AND (pc.supplier_fob_cost_usd IS NOT NULL OR pc.supplier_exw_cost_usd IS NOT NULL OR pc.internal_cost_usd IS NOT NULL))",
  no_selling_price: "NOT EXISTS (SELECT 1 FROM product_selling_prices sp WHERE sp.product_id = p.id AND sp.selling_price_usd IS NOT NULL)",
  missing_seo: "(p.seo_title IS NULL OR p.seo_description IS NULL)",
  suspicious_sku: "(p.sku LIKE '%99IL%99IL%' OR LOWER(p.sku) REGEXP '-xx[0-9]*$')",
  missing_hs_code: "p.hs_code IS NULL",
  missing_weight: "p.weight_kg IS NULL",
};
const CHECK_LABELS = {
  missing_image: "Missing image", broken_image: "Broken image", unchecked_image: "Image not yet validated", missing_description: "Missing description",
  missing_attributes: "No technical attributes", missing_family: "No product family", no_cost: "No supplier/internal cost", no_selling_price: "No selling price (shows Request a Quote)",
  missing_seo: "Missing SEO title/description", suspicious_sku: "SKU needs review (double prefix or XX placeholder)", missing_hs_code: "Missing HS code", missing_weight: "Missing weight",
};

router.get(
  "/quality",
  ah(async (req, res) => {
    const out = [];
    for (const [code, cond] of Object.entries(CHECKS)) {
      const r = await one(`SELECT COUNT(*) AS c FROM products p WHERE p.deleted_at IS NULL AND ${cond}`);
      out.push({ code, label: CHECK_LABELS[code], count: Number(r.c) });
    }
    const total = await one("SELECT COUNT(*) AS c FROM products WHERE deleted_at IS NULL");
    const dupes = await one("SELECT COUNT(*) AS c FROM (SELECT UPPER(sku) s FROM products GROUP BY UPPER(sku) HAVING COUNT(*) > 1) t");
    out.push({ code: "duplicate_sku_case", label: "SKUs differing only by letter case", count: Number(dupes.c) });
    res.json({ totalProducts: Number(total.c), checks: out });
  })
);

router.get(
  "/quality/:code",
  ah(async (req, res) => {
    const cond = CHECKS[req.params.code];
    if (!cond) throw notFound();
    const rows = await query(`SELECT p.id, p.sku, p.name, p.source_ref FROM products p WHERE p.deleted_at IS NULL AND ${cond} ORDER BY p.sku LIMIT 500`);
    res.json({ code: req.params.code, label: CHECK_LABELS[req.params.code], items: rows.map((r) => ({ id: String(r.id), sku: r.sku, name: r.name, sourceRef: r.source_ref })) });
  })
);

void queryText;
module.exports = router;
