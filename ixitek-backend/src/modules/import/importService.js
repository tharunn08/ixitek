// importService.js — catalog import: upload → validate → preview → confirm
// → background import → report. Nothing is written to the catalog until an
// authorised admin confirms the preview. Supplier costs go ONLY to
// product_costs (confidential), never to public product fields.
const crypto = require("crypto");
const { query, queryText, one, tx, json } = require("../../core/db.js");
const { D, toDb, isMoney } = require("../../core/money.js");
const storage = require("../../core/storage.js");
const audit = require("../../core/audit.js");
const jobs = require("../../core/jobs.js");
const log = require("../../core/logger.js");
const { parseXlsx, parseCsvBuffer } = require("./parser.js");
const { parseAttributes, nameFromDescription } = require("../catalog/attributeParser.js");
const pricing = require("../pricing/pricingService.js");
const { badRequest, notFound, conflict } = require("../../core/errors.js");

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/+#() ]{0,99}$/;
const ROOT_CATEGORY_SLUG = "fiber-optic-cables";

function slugify(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

function money(v) {
  if (v === null || v === undefined || v === "") return { value: null };
  const raw = typeof v === "number" ? String(v) : String(v).replace(/[$,\s]/g, "");
  if (!isMoney(raw)) return { value: null, error: true };
  const exact = D(raw);
  const stored = toDb(exact);
  return { value: stored, rounded: !exact.eq(D(stored)) };
}

/** Validate one parsed row → { data, errors, warnings } (pure). */
function validateRow(r) {
  const errors = [];
  const warnings = [];
  const sku = String(r.sku || "").trim();
  if (!sku) errors.push("Missing SKU / Part#");
  else if (!SKU_RE.test(sku)) errors.push("SKU contains unsupported characters or is longer than 100 characters");
  if (/99IL.*99IL/.test(sku)) warnings.push("SKU contains the '99IL' prefix twice — please confirm it is correct (imported exactly as written)");
  if (/-xx\d*$|-xx-|xx(?=\d+$)/i.test(sku)) warnings.push("SKU contains a colour placeholder 'xx' — the ordered colour must replace XX");
  const description = String(r.description || "").trim();
  if (!description) errors.push("Missing description");

  const fob = money(r.fob);
  const exw = money(r.exw);
  if (fob.error) errors.push("US FOB cost is not a valid non-negative number");
  if (exw.error) errors.push("EXW CN cost is not a valid non-negative number");
  if (fob.value === null && exw.value === null && !fob.error && !exw.error) warnings.push("No supplier cost — product will show 'Request a Quote'");
  if (fob.rounded || exw.rounded) warnings.push("Cost had more than 4 decimal places and was stored rounded to 4");

  let imageUrl = r.imageUrl ? String(r.imageUrl).trim() : null;
  if (imageUrl && !/^https?:\/\/[^\s]+$/i.test(imageUrl)) {
    warnings.push("Image URL is not a valid http(s) URL — ignored");
    imageUrl = null;
  }
  if (!imageUrl) warnings.push("No image URL — IXITEK fallback image will be shown");
  if (r.imageLinkMismatch) warnings.push(`Cell hyperlink target differs from the visible URL; the visible URL was used (hyperlink: ${r.imageLinkMismatch})`);
  if (!r.category) errors.push("Missing category");

  const parsed = parseAttributes(description, r.group);
  const intOrNull = (v) => (v === null || v === undefined || v === "" ? null : Number.parseInt(v, 10));
  const data = {
    sheet: r.sheet,
    row: r.rowNumber,
    sku,
    name: r.name ? String(r.name).trim().slice(0, 255) : nameFromDescription(description),
    description,
    category: r.category ? String(r.category).trim() : null,
    family: r.family ? String(r.family).trim() : null,
    listedUnder: r.listedUnder || null,
    supplierFobCostUsd: fob.value,
    supplierExwCostUsd: exw.value,
    imageUrl,
    moq: intOrNull(r.moq),
    leadTimeDays: intOrNull(r.leadTimeDays),
    warrantyMonths: intOrNull(r.warrantyMonths),
    hsCode: r.hsCode ? String(r.hsCode).trim().slice(0, 20) : null,
    countryOfOrigin: r.countryOfOrigin && /^[A-Za-z]{2}$/.test(String(r.countryOfOrigin).trim()) ? String(r.countryOfOrigin).trim().toUpperCase() : null,
    weightKg: r.weightKg !== null && r.weightKg !== undefined && r.weightKg !== "" && isMoney(r.weightKg) ? String(r.weightKg) : null,
    attributes: parsed.attributes,
    notes: parsed.notes,
  };
  return { data, errors, warnings };
}

const COMPARE = [
  ["description", "description"],
  ["category", "category_source"],
  ["family", "family_source"],
  ["imageUrl", "image_url"],
  ["supplierFobCostUsd", "supplier_fob_cost_usd"],
  ["supplierExwCostUsd", "supplier_exw_cost_usd"],
];

async function loadExisting(skus) {
  const map = new Map();
  for (let i = 0; i < skus.length; i += 500) {
    const chunk = skus.slice(i, i + 500);
    if (!chunk.length) continue;
    const rows = await queryText(
      `SELECT p.id, p.sku, p.description, c.name AS category_source, f.name AS family_source,
              (SELECT url FROM product_images im WHERE im.product_id = p.id AND im.is_primary = 1 LIMIT 1) AS image_url,
              pc.supplier_fob_cost_usd, pc.supplier_exw_cost_usd, p.deleted_at
         FROM products p JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_families f ON f.id = p.family_id
         LEFT JOIN product_costs pc ON pc.product_id = p.id
        WHERE p.sku IN (?)`,
      [chunk]
    );
    for (const r of rows) map.set(r.sku, r);
  }
  return map;
}

function diff(data, existing) {
  const changes = {};
  for (const [k, col] of COMPARE) {
    let a = data[k] === undefined ? null : data[k];
    let b = existing[col] === undefined ? null : existing[col];
    if (k.endsWith("CostUsd")) {
      a = a === null ? null : toDb(a);
      b = b === null ? null : toDb(b);
    }
    if (k === "family" && a === null) continue;
    if ((a ?? null) !== (b ?? null)) changes[k] = { from: b, to: a };
  }
  if (existing.deleted_at) changes.restore = { from: "archived", to: "active" };
  return changes;
}

/** Build a preview batch. Returns the batch summary. */
async function createPreview({ buffer, fileName, mime, user, req }) {
  const lower = String(fileName || "").toLowerCase();
  const sourceType = lower.endsWith(".csv") ? "csv" : lower.endsWith(".xlsx") ? "xlsx" : null;
  if (!sourceType) throw badRequest("Upload an .xlsx or .csv file.");
  if (sourceType === "xlsx" && !(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw badRequest("That file is not a valid .xlsx workbook.");

  let parsed;
  try {
    parsed = sourceType === "xlsx" ? await parseXlsx(buffer) : parseCsvBuffer(buffer, fileName);
  } catch (err) {
    log.warn("import parse failed", { err });
    throw badRequest("The file could not be read. Check that it is a valid, unprotected .xlsx or UTF-8 .csv file.");
  }
  if (!parsed.rows.length) throw badRequest("No product rows found. The sheet needs a header row containing 'Part#' or 'SKU'.");
  if (parsed.rows.length > 50000) throw badRequest("Maximum 50,000 rows per import.");

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const key = storage.newKey("imports", fileName);
  await storage.driver().put(key, buffer);
  const fileRes = await query(
    "INSERT INTO files (storage_key, driver, original_name, mime, bytes, sha256, purpose, created_by) VALUES (:k, :d, :n, :m, :b, :s, 'catalog_import', :u)",
    { k: key, d: storage.driver().name, n: String(fileName).slice(0, 255), m: mime || "application/octet-stream", b: buffer.length, s: sha256, u: user.id }
  );

  const validated = parsed.rows.map((r) => ({ src: r, ...validateRow(r) }));
  const existing = await loadExisting([...new Set(validated.filter((v) => v.data.sku).map((v) => v.data.sku))]);

  const firstBySku = new Map();
  const rows = [];
  for (const v of validated) {
    let action;
    let changes = null;
    const { data } = v;
    if (v.errors.length) action = "invalid";
    else if (firstBySku.has(data.sku)) {
      const first = firstBySku.get(data.sku);
      const costConflict = ["supplierFobCostUsd", "supplierExwCostUsd"].filter((f) => (first.data[f] ?? null) !== (data[f] ?? null));
      if (costConflict.length) {
        action = "invalid";
        v.errors.push(`Duplicate SKU with a different ${costConflict.join(" and ")} than row ${first.data.sheet}!${first.data.row} — resolve in the file`);
      } else {
        action = "duplicate";
        v.warnings.push(`Same SKU also listed at ${first.data.sheet}!${first.data.row}; imported once and linked to "${data.family || data.category}"`);
        if ((first.data.description || "") !== (data.description || "")) {
          v.warnings.push(`Description differs from row ${first.data.sheet}!${first.data.row}; the first description was kept. This row's text: "${data.description}"`);
        }
      }
    } else {
      firstBySku.set(data.sku, v);
      const ex = existing.get(data.sku);
      if (!ex) action = "create";
      else {
        changes = diff(data, ex);
        action = Object.keys(changes).length ? "update" : "unchanged";
      }
    }
    rows.push({ sheet: data.sheet || "", row: data.row || 0, sku: data.sku || null, action, data, changes, errors: v.errors, warnings: v.warnings });
  }

  const categories = [...new Set(rows.filter((r) => r.action !== "invalid").map((r) => r.data.category))];
  const families = [...new Set(rows.filter((r) => r.action !== "invalid" && r.data.family).map((r) => `${r.data.category} › ${r.data.family}`))];
  const count = (a) => rows.filter((r) => r.action === a).length;
  const summary = {
    fileName,
    sheets: parsed.sheets,
    totalRows: rows.length,
    uniqueSkus: firstBySku.size,
    create: count("create"),
    update: count("update"),
    unchanged: count("unchanged"),
    duplicate: count("duplicate"),
    invalid: count("invalid"),
    rowsWithWarnings: rows.filter((r) => r.warnings.length).length,
    missingImage: rows.filter((r) => r.action !== "invalid" && !r.data.imageUrl).length,
    uniqueImageUrls: new Set(rows.filter((r) => r.data.imageUrl).map((r) => r.data.imageUrl)).size,
    noCost: rows.filter((r) => r.action !== "invalid" && r.data.supplierFobCostUsd === null && r.data.supplierExwCostUsd === null).length,
    categories,
    familyCount: families.length,
  };

  const publicId = crypto.randomUUID();
  const batchId = await tx(async (conn) => {
    const b = await query(
      `INSERT INTO import_batches (public_id, file_name, file_bytes, file_sha256, file_id, source_type, status, summary_json, uploaded_by)
       VALUES (:pid, :fn, :fb, :sha, :fid, :st, 'preview', :sum, :u)`,
      { pid: publicId, fn: String(fileName).slice(0, 255), fb: buffer.length, sha: sha256, fid: fileRes.insertId, st: sourceType, sum: JSON.stringify(summary), u: user.id },
      conn
    );
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => [
        b.insertId, r.sheet.slice(0, 100), r.row, r.sku, r.action, JSON.stringify(r.data), r.changes ? JSON.stringify(r.changes) : null,
        r.errors.length ? JSON.stringify(r.errors) : null, r.warnings.length ? JSON.stringify(r.warnings) : null,
      ]);
      await queryText("INSERT INTO import_rows (batch_id, sheet, row_no, sku, action, data_json, changes_json, errors_json, warnings_json) VALUES ?", [chunk], conn);
    }
    await audit.record({ req, action: "catalog.import.preview", entityType: "import_batch", entityId: b.insertId, after: { fileName, sha256, ...summary } }, conn);
    return b.insertId;
  });
  return getBatch(publicId, { withCosts: true, batchIdHint: batchId });
}

function batchJson(b) {
  return {
    id: b.public_id, fileName: b.file_name, fileBytes: b.file_bytes, sourceType: b.source_type, status: b.status,
    summary: json(b.summary_json, {}), error: b.error, createdAt: b.created_at, confirmedAt: b.confirmed_at, completedAt: b.completed_at,
    uploadedBy: b.uploaded_by_email || null, confirmedBy: b.confirmed_by_email || null,
  };
}

async function getBatch(publicId) {
  const b = await one(
    `SELECT b.*, u.email AS uploaded_by_email, c.email AS confirmed_by_email FROM import_batches b
       LEFT JOIN users u ON u.id = b.uploaded_by LEFT JOIN users c ON c.id = b.confirmed_by WHERE b.public_id = :id`,
    { id: publicId }
  );
  if (!b) throw notFound("Import not found.");
  return batchJson(b);
}

const COST_KEYS = ["supplierFobCostUsd", "supplierExwCostUsd"];
function stripCosts(obj) {
  if (!obj) return obj;
  const o = { ...obj };
  for (const k of COST_KEYS) delete o[k];
  return o;
}

async function getRows(publicId, { action, page = 1, limit = 50, withCosts = false, q } = {}) {
  const b = await one("SELECT id FROM import_batches WHERE public_id = :id", { id: publicId });
  if (!b) throw notFound("Import not found.");
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = ["batch_id = :b"];
  const p = { b: b.id };
  if (action === "warnings") where.push("warnings_json IS NOT NULL");
  else if (action) (where.push("action = :a"), (p.a = action));
  if (q) (where.push("sku LIKE :q"), (p.q = `%${String(q).slice(0, 100)}%`));
  const rows = await query(`SELECT * FROM import_rows WHERE ${where.join(" AND ")} ORDER BY id LIMIT ${lim} OFFSET ${off}`, p);
  const total = await one(`SELECT COUNT(*) AS c FROM import_rows WHERE ${where.join(" AND ")}`, p);
  return {
    total: Number(total.c),
    rows: rows.map((r) => {
      let changes = json(r.changes_json);
      if (changes && !withCosts) changes = stripCosts(changes);
      return {
        sheet: r.sheet, row: r.row_no, sku: r.sku, action: r.action, result: r.result, productId: r.product_id ? String(r.product_id) : null,
        data: withCosts ? json(r.data_json) : stripCosts(json(r.data_json)), changes, errors: json(r.errors_json, []), warnings: json(r.warnings_json, []),
      };
    }),
  };
}

async function confirm(publicId, { user, req }) {
  const b = await one("SELECT * FROM import_batches WHERE public_id = :id", { id: publicId });
  if (!b) throw notFound("Import not found.");
  if (b.status !== "preview") throw conflict(`This import is already ${b.status}.`);
  const upd = await query("UPDATE import_batches SET status = 'queued', confirmed_by = :u, confirmed_at = CURRENT_TIMESTAMP(3) WHERE id = :id AND status = 'preview'", { id: b.id, u: user.id });
  if (!upd.affectedRows) throw conflict("This import was confirmed by someone else.");
  await audit.record({ req, action: "catalog.import.confirm", entityType: "import_batch", entityId: b.id, reason: req.body && req.body.reason });
  await jobs.enqueue("catalog.import", { batchId: Number(b.id), userId: user.id }, { idempotencyKey: `catalog.import:${b.id}`, maxAttempts: 1 });
  return getBatch(publicId);
}

async function cancel(publicId, { req }) {
  const res = await query("UPDATE import_batches SET status = 'cancelled' WHERE public_id = :id AND status = 'preview'", { id: publicId });
  if (!res.affectedRows) throw conflict("Only an import that is still in preview can be cancelled.");
  await audit.record({ req, action: "catalog.import.cancel", entityType: "import_batch", entityId: publicId });
}

// ── Execution (background job) ──────────────────────────────────────────

async function ensureCategory(conn, name, cache) {
  if (cache.has(name)) return cache.get(name);
  const root = await one("SELECT id FROM categories WHERE slug = :s", { s: ROOT_CATEGORY_SLUG }, conn);
  const sourceKey = `sheet:${name}`;
  let cat = await one("SELECT id FROM categories WHERE source_key = :k OR (name = :n AND parent_id <=> :root)", { k: sourceKey, n: name, root: root ? root.id : null }, conn);
  if (!cat) {
    const base = slugify(name) || "category";
    let slug = base;
    for (let i = 2; await one("SELECT id FROM categories WHERE slug = :s", { s: slug }, conn); i++) slug = `${base}-${i}`;
    const sort = await one("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM categories WHERE parent_id <=> :root", { root: root ? root.id : null }, conn);
    const r = await query("INSERT INTO categories (parent_id, slug, name, source_key, sort_order) VALUES (:p, :slug, :name, :k, :sort)", { p: root ? root.id : null, slug, name, k: sourceKey, sort: sort.n }, conn);
    cat = { id: r.insertId };
  }
  cache.set(name, Number(cat.id));
  return Number(cat.id);
}

async function ensureFamily(conn, categoryId, categoryName, familyName, imageUrl, cache) {
  const key = `${categoryName}::${familyName}`;
  if (cache.has(key)) return cache.get(key);
  let fam = await one("SELECT id, image_url FROM product_families WHERE source_key = :k", { k: key }, conn);
  if (!fam) {
    const base = slugify(`${categoryName} ${familyName}`) || "family";
    let slug = base;
    for (let i = 2; await one("SELECT id FROM product_families WHERE slug = :s", { s: slug }, conn); i++) slug = `${base}-${i}`;
    const sort = await one("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM product_families WHERE category_id = :c", { c: categoryId }, conn);
    const r = await query("INSERT INTO product_families (category_id, slug, name, image_url, source_key, sort_order) VALUES (:c, :slug, :name, :img, :k, :sort)", { c: categoryId, slug, name: familyName, img: imageUrl, k: key, sort: sort.n }, conn);
    fam = { id: r.insertId };
  } else if (!fam.image_url && imageUrl) {
    await query("UPDATE product_families SET image_url = :img WHERE id = :id", { img: imageUrl, id: fam.id }, conn);
  }
  cache.set(key, Number(fam.id));
  return Number(fam.id);
}

async function upsertAttributes(conn, productId, attributes, attrIds) {
  await query("DELETE FROM product_attribute_values WHERE product_id = :p AND source = 'parsed'", { p: productId }, conn);
  for (const [code, v] of Object.entries(attributes)) {
    const aid = attrIds.get(code);
    if (!aid) continue;
    // Manual values always win over parsed ones.
    await query(
      `INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_number, source) VALUES (:p, :a, :t, :n, 'parsed')
       ON DUPLICATE KEY UPDATE value_text = IF(source = 'manual', value_text, VALUES(value_text)), value_number = IF(source = 'manual', value_number, VALUES(value_number))`,
      { p: productId, a: aid, t: String(v.text).slice(0, 255), n: v.number === undefined ? null : String(v.number) },
      conn
    );
  }
}

async function upsertCosts(conn, productId, data, batchId, userId) {
  await query("INSERT IGNORE INTO product_costs (product_id, cost_basis, updated_by) VALUES (:p, 'exw', :u)", { p: productId, u: userId }, conn);
  const cur = await one("SELECT supplier_fob_cost_usd, supplier_exw_cost_usd FROM product_costs WHERE product_id = :p FOR UPDATE", { p: productId }, conn);
  const pairs = [["supplier_fob_cost_usd", data.supplierFobCostUsd], ["supplier_exw_cost_usd", data.supplierExwCostUsd]];
  for (const [col, nv] of pairs) {
    const ov = cur[col] === null ? null : toDb(cur[col]);
    const newV = nv === null ? null : toDb(nv);
    if (ov === newV) continue;
    await query(`UPDATE product_costs SET ${col} = :v, updated_by = :u WHERE product_id = :p`, { v: newV, u: userId, p: productId }, conn);
    await query(
      "INSERT INTO price_history (product_id, field, old_value, new_value, reason, source, changed_by, import_batch_id) VALUES (:p, :f, :o, :n, 'Supplier catalog import', 'import', :u, :b)",
      { p: productId, f: col, o: ov, n: newV, u: userId, b: batchId },
      conn
    );
  }
}

async function upsertImage(conn, productId, url, alt) {
  const current = await one("SELECT id, url FROM product_images WHERE product_id = :p AND is_primary = 1 LIMIT 1", { p: productId }, conn);
  if (!url) return;
  if (current && current.url === url) return;
  if (current) await query("UPDATE product_images SET is_primary = 0, sort_order = sort_order + 1 WHERE product_id = :p", { p: productId }, conn);
  const known = await one("SELECT status, http_status, checked_at FROM product_images WHERE url = :u AND status <> 'unchecked' ORDER BY checked_at DESC LIMIT 1", { u: url }, conn);
  await query(
    "INSERT INTO product_images (product_id, url, alt, is_primary, sort_order, source, status, http_status, checked_at) VALUES (:p, :u, :alt, 1, 0, 'import', :st, :hs, :ca)",
    { p: productId, u: url, alt: String(alt || "").slice(0, 255), st: known ? known.status : "unchecked", hs: known ? known.http_status : null, ca: known ? known.checked_at : null },
    conn
  );
}

async function uniqueProductSlug(conn, sku) {
  const base = slugify(sku) || "product";
  let slug = base;
  for (let i = 2; await one("SELECT id FROM products WHERE slug = :s", { s: slug }, conn); i++) slug = `${base}-${i}`;
  return slug;
}

async function execute({ batchId, userId }) {
  const batch = await one("SELECT * FROM import_batches WHERE id = :id", { id: batchId });
  if (!batch || batch.status !== "queued") return { skipped: true };
  await query("UPDATE import_batches SET status = 'importing' WHERE id = :id", { id: batchId });
  const attrIds = new Map((await query("SELECT id, code FROM attributes")).map((a) => [a.code, Number(a.id)]));
  const catCache = new Map();
  const famCache = new Map();
  const touched = new Set();
  const counters = { created: 0, updated: 0, unchanged: 0, linked: 0, failed: 0 };
  const skuToId = new Map();

  try {
    const rows = await query("SELECT id, action, sku, data_json FROM import_rows WHERE batch_id = :b AND action IN ('create','update','unchanged','duplicate') ORDER BY id", { b: batchId });
    for (const r of rows) {
      const data = json(r.data_json);
      try {
        const result = await tx(async (conn) => {
          const categoryId = await ensureCategory(conn, data.category, catCache);
          const familyName = data.family;
          const familyId = familyName ? await ensureFamily(conn, categoryId, data.category, familyName, data.imageUrl, famCache) : null;

          if (r.action === "duplicate") {
            const pid = skuToId.get(data.sku) || Number((await one("SELECT id FROM products WHERE sku = :s", { s: data.sku }, conn)).id);
            if (familyId) {
              await query("INSERT IGNORE INTO product_family_links (product_id, family_id, is_primary, source_ref) VALUES (:p, :f, 0, :ref)", { p: pid, f: familyId, ref: `${data.sheet}!${data.row}` }, conn);
            }
            return { pid, result: "linked" };
          }

          let pid;
          let result;
          const existing = await one("SELECT id, deleted_at FROM products WHERE sku = :s FOR UPDATE", { s: data.sku }, conn);
          if (!existing) {
            const slug = await uniqueProductSlug(conn, data.sku);
            const ins = await query(
              `INSERT INTO products (sku, sku_search, slug, name, short_description, description, category_id, family_id, brand, product_type,
                 moq, lead_time_days, warranty_months, hs_code, country_of_origin, weight_kg, status, source_ref, last_import_batch_id)
               VALUES (:sku, :skuSearch, :slug, :name, :short, :desc, :cat, :fam, 'IXITEK', :ptype, :moq, :lead, :warranty, :hs, :coo, :weight, 'active', :ref, :batch)`,
              {
                sku: data.sku, skuSearch: data.sku.toUpperCase().replace(/[^A-Z0-9]/g, ""), slug, name: data.name, short: data.description.slice(0, 500),
                desc: data.description, cat: categoryId, fam: familyId, ptype: data.attributes.configuration ? data.attributes.configuration.text : "",
                moq: data.moq && data.moq > 0 ? data.moq : 1, lead: data.leadTimeDays, warranty: data.warrantyMonths, hs: data.hsCode, coo: data.countryOfOrigin,
                weight: data.weightKg, ref: `${data.sheet}!${data.row}`, batch: batchId,
              },
              conn
            );
            pid = Number(ins.insertId);
            result = "created";
          } else {
            pid = Number(existing.id);
            // Supplier-owned fields are refreshed; admin-curated name/SEO/status are preserved (archived items are restored).
            await query(
              `UPDATE products SET description = :desc, short_description = :short, category_id = :cat, family_id = COALESCE(:fam, family_id),
                 product_type = IF(product_type = '', :ptype, product_type), deleted_at = NULL, source_ref = :ref, last_import_batch_id = :batch
               WHERE id = :id`,
              { id: pid, desc: data.description, short: data.description.slice(0, 500), cat: categoryId, fam: familyId, ptype: data.attributes.configuration ? data.attributes.configuration.text : "", ref: `${data.sheet}!${data.row}`, batch: batchId },
              conn
            );
            result = r.action === "unchanged" ? "unchanged" : "updated";
          }
          if (familyId) {
            await query("UPDATE product_family_links SET is_primary = 0 WHERE product_id = :p AND family_id <> :f", { p: pid, f: familyId }, conn);
            await query(
              "INSERT INTO product_family_links (product_id, family_id, is_primary, source_ref) VALUES (:p, :f, 1, :ref) ON DUPLICATE KEY UPDATE is_primary = 1",
              { p: pid, f: familyId, ref: `${data.sheet}!${data.row}` },
              conn
            );
          }
          await upsertCosts(conn, pid, data, batchId, userId);
          await upsertAttributes(conn, pid, data.attributes || {}, attrIds);
          await query("DELETE FROM product_specifications WHERE product_id = :p AND source = 'import'", { p: pid }, conn);
          let order = 0;
          for (const note of data.notes || []) {
            await query("INSERT INTO product_specifications (product_id, spec_group, label, value, sort_order, source) VALUES (:p, 'Ordering', 'Note', :v, :o, 'import')", { p: pid, v: note, o: order++ }, conn);
          }
          await upsertImage(conn, pid, data.imageUrl, data.name);
          return { pid, result };
        });
        skuToId.set(data.sku, result.pid);
        touched.add(result.pid);
        counters[result.result] = (counters[result.result] || 0) + 1;
        await query("UPDATE import_rows SET result = :r, product_id = :p WHERE id = :id", { r: result.result, p: result.pid, id: r.id });
      } catch (err) {
        counters.failed++;
        log.error("import row failed", { batchId, sku: r.sku, err });
        await query("UPDATE import_rows SET result = 'failed', errors_json = :e WHERE id = :id", { id: r.id, e: JSON.stringify([`Import failed: ${err.code || "error"}`]) });
      }
    }
    await query("UPDATE import_rows SET result = 'skipped' WHERE batch_id = :b AND action IN ('invalid','skip')", { b: batchId });

    const priceResult = await pricing.recompute([...touched], { reason: "Catalog import", source: "import", actorId: userId, importBatchId: batchId });
    const summary = { ...json(batch.summary_json, {}), result: counters, pricesChanged: priceResult.changed };
    await query("UPDATE import_batches SET status = 'completed', completed_at = CURRENT_TIMESTAMP(3), summary_json = :s WHERE id = :id", { id: batchId, s: JSON.stringify(summary) });
    await audit.record({ actorId: userId, action: "catalog.import.complete", entityType: "import_batch", entityId: batchId, after: counters });
    await jobs.enqueue("catalog.check_images", { batchId }, { idempotencyKey: `images:${batchId}` });
    return counters;
  } catch (err) {
    await query("UPDATE import_batches SET status = 'failed', error = :e WHERE id = :id", { id: batchId, e: String(err.message).slice(0, 2000) });
    await audit.record({ actorId: userId, action: "catalog.import.failed", entityType: "import_batch", entityId: batchId, after: { error: err.message } });
    require("../../core/monitor.js").event("import_failure", `Catalog import batch ${batchId} failed: ${err.message}`, { batchId: String(batchId) });
    throw err;
  }
}

/** CSV report of a batch (costs included only for users allowed to see them). */
async function reportCsv(publicId, { withCosts }) {
  const { rows } = await getRows(publicId, { limit: 500, withCosts, page: 1 });
  const all = [...rows];
  for (let page = 2; all.length % 500 === 0 && all.length > 0; page++) {
    const more = await getRows(publicId, { limit: 500, withCosts, page });
    if (!more.rows.length) break;
    all.push(...more.rows);
  }
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // CSV-injection guard
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ["Sheet", "Row", "SKU", "Planned action", "Result", "Errors", "Warnings", "Description", ...(withCosts ? ["US FOB cost (USD)", "EXW CN cost (USD)"] : []), "Image URL"];
  const lines = [header.join(",")];
  for (const r of all) {
    lines.push([r.sheet, r.row, r.sku, r.action, r.result, (r.errors || []).join(" | "), (r.warnings || []).join(" | "), r.data && r.data.description, ...(withCosts ? [r.data && r.data.supplierFobCostUsd, r.data && r.data.supplierExwCostUsd] : []), r.data && r.data.imageUrl].map(esc).join(","));
  }
  return lines.join("\n");
}

jobs.register("catalog.import", execute);

module.exports = { createPreview, getBatch, getRows, confirm, cancel, execute, reportCsv, validateRow, slugify };
