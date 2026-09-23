// Test helpers: every test run uses a fresh database (DB_NAME_TEST, default
// ixitek_test) — never the development or production database.
process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_NAME_TEST || "ixitek_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-1234";
process.env.STORAGE_DIR = process.env.STORAGE_DIR_TEST || "/tmp/ixitek-test-storage";
process.env.JOBS_ENABLED = "false";

const request = require("supertest");
const db = require("../src/core/db.js");
const { migrate } = require("../src/core/migrate.js");
const { buildApp } = require("../src/app.js");
const User = require("../src/models/User.js");
const jobs = require("../src/core/jobs.js");

async function resetDb() {
  const rows = await db.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
  await db.queryText("SET FOREIGN_KEY_CHECKS = 0");
  for (const { t } of rows) await db.queryText(`DROP TABLE IF EXISTS \`${t}\``);
  await db.queryText("SET FOREIGN_KEY_CHECKS = 1");
  await migrate({ quiet: true });
  await require("../src/modules/commerce/orderService.js").refreshTables();
  require("../src/core/rbac.js").invalidate();
}

async function createUser(role, email = `${role}@test.local`, password = "Passw0rd!") {
  await User.create({ name: role, email, password, role });
  return { email, password };
}

/** Logged-in supertest agent carrying the session + CSRF cookies. */
async function agentFor(app, { email, password }) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrfToken;
  const wrap = (method) => (url) => agent[method](url).set("X-CSRF-Token", csrf);
  return { agent, csrf, get: (u) => agent.get(u), post: wrap("post"), put: wrap("put"), patch: wrap("patch"), del: wrap("delete") };
}

module.exports = { request, db, resetDb, buildApp, createUser, agentFor, jobs };

/**
 * Test-only fixture product (lives only in the throwaway test database).
 * Uses the seeded LC sub-category when present (so HS/customs rules apply).
 */
async function createTestProduct({ sku, exw = "65.0000", fob = "80.0000", weightKg = null, dims = null, sourceKey = "sheet:LC", attrs = {}, margin = null } = {}) {
  let cat = await db.one("SELECT id FROM categories WHERE source_key = :k", { k: sourceKey });
  if (!cat) {
    const root = await db.one("SELECT id FROM categories WHERE slug = 'fiber-optic-cables'");
    const name = sourceKey.replace("sheet:", "");
    const r = await db.query("INSERT INTO categories (parent_id, slug, name, source_key, default_hs_code) VALUES (:p, :s, :n, :k, :hs)", {
      p: root.id, s: `t-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, n: name, k: sourceKey, hs: sourceKey === "sheet:CAT" ? null : "85447090",
    });
    cat = { id: r.insertId };
  }
  const r = await db.query(
    `INSERT INTO products (sku, sku_search, slug, name, short_description, description, category_id, weight_kg, length_mm, width_mm, height_mm, status)
     VALUES (:sku, :ss, :slug, :name, :d, :d, :cat, :w, :l, :wi, :h, 'active')`,
    { sku, ss: sku.toUpperCase().replace(/[^A-Z0-9]/g, ""), slug: sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: `Test ${sku}`, d: `Test product ${sku}`, cat: cat.id, w: weightKg, l: dims ? dims[0] : null, wi: dims ? dims[1] : null, h: dims ? dims[2] : null }
  );
  const id = r.insertId;
  await db.query("INSERT INTO product_costs (product_id, supplier_exw_cost_usd, supplier_fob_cost_usd, cost_basis) VALUES (:id, :e, :f, 'exw')", { id, e: exw, f: fob });
  for (const [code, value] of Object.entries(attrs)) {
    const a = await db.one("SELECT id FROM attributes WHERE code = :c", { c: code });
    await db.query("INSERT INTO product_attribute_values (product_id, attribute_id, value_text, source) VALUES (:p, :a, :v, 'manual')", { p: id, a: a.id, v: value });
  }
  if (margin !== null) {
    const exists = await db.one("SELECT id FROM pricing_rules WHERE scope = 'global' AND is_active = 1");
    if (!exists) await db.query("INSERT INTO pricing_rules (name, scope, scope_id, cost_basis, margin_pct) VALUES ('test global', 'global', 0, 'product', :m)", { m: margin });
  }
  await require("../src/modules/pricing/pricingService.js").recompute([Number(id)]);
  return Number(id);
}

module.exports.createTestProduct = createTestProduct;
