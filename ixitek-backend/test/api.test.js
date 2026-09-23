// Integration tests against a real MySQL test database.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { request, db, resetDb, buildApp, createUser, agentFor, jobs } = require("./helpers.js");

// The supplier workbook is CONFIDENTIAL (contains costs) and is never committed.
// Point CATALOG_XLSX at a local copy to run the import/pricing/security tests.
const WORKBOOK = process.env.CATALOG_XLSX || path.join(__dirname, "fixtures", "catalog.xlsx");
let app;
let server;
let owner;
let staff;

before(async () => {
  await resetDb();
  // One real listening server so concurrent requests share it (like production).
  server = buildApp().listen(0);
  app = server;
  owner = await agentFor(app, await createUser("owner"));
  staff = await agentFor(app, await createUser("staff"));
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test("auth: cookie session, CSRF required for writes, role from DB", async () => {
  const noCsrf = await owner.agent.post("/api/admin/inventory/warehouses").send({ code: "X1", name: "x" });
  assert.equal(noCsrf.status, 403);
  const me = await owner.get("/api/auth/me");
  assert.equal(me.body.user.role, "owner");
  const anon = await request(app).get("/api/admin/stats");
  assert.equal(anon.status, 401);
  const weak = await request(app).post("/api/auth/register").send({ name: "A", email: "a@b.co", password: "short" });
  assert.equal(weak.status, 400);
});

test("import: workbook preview → confirm → 370 products, costs private", { skip: !fs.existsSync(WORKBOOK) && "workbook fixture not present" }, async () => {
  const up = await owner.post("/api/admin/catalog/imports").attach("file", WORKBOOK, { filename: "catalog.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const s = up.body.batch.summary;
  assert.equal(s.totalRows, 379);
  assert.equal(s.uniqueSkus, 370);
  assert.equal(s.create, 370);
  assert.equal(s.duplicate, 9);
  assert.equal(s.invalid, 0);

  const staffRows = await staff.get(`/api/admin/catalog/imports/${up.body.batch.id}/rows`);
  assert.equal(staffRows.status, 403, "staff cannot open imports");

  const c = await owner.post(`/api/admin/catalog/imports/${up.body.batch.id}/confirm`).send({ confirm: true });
  assert.equal(c.status, 202);
  await jobs.drain();
  const b = await owner.get(`/api/admin/catalog/imports/${up.body.batch.id}`);
  assert.equal(b.body.batch.status, "completed");
  assert.deepEqual(b.body.batch.summary.result, { created: 370, updated: 0, unchanged: 0, linked: 9, failed: 0 });

  const again = await owner.post("/api/admin/catalog/imports").attach("file", WORKBOOK, { filename: "catalog.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(again.body.batch.summary.unchanged, 370, "re-import detects no changes");
});

test("pricing: no rule → Request a Quote; rule/override → selling price only", { skip: !fs.existsSync(WORKBOOK) && "workbook fixture not present" }, async () => {
  const before = await request(app).get("/api/catalog/products/99il31-3021m-1m");
  assert.equal(before.body.product.price, null);

  const rule = await owner.post("/api/admin/pricing/rules").send({ scope: "global", costBasis: "exw", marginPct: "30", reason: "test" });
  assert.equal(rule.status, 201);
  await jobs.drain();
  const cost = await db.one("SELECT c.supplier_exw_cost_usd FROM product_costs c JOIN products p ON p.id = c.product_id WHERE p.sku = '99IL31-3021m-1M'");
  const pub = await request(app).get("/api/catalog/products/99il31-3021m-1m");
  const expected = require("../src/modules/pricing/pricingService.js").applyRule(cost.supplier_exw_cost_usd, { margin_pct: "30", fixed_markup_usd: 0, rounding_step: "0.01" }).toFixed(2);
  assert.equal(pub.body.product.price.amount, expected);

  const id = pub.body.product.id;
  const noReason = await owner.put(`/api/admin/pricing/products/${id}/override`).send({ priceUsd: "9.99" });
  assert.equal(noReason.status, 400);
  await owner.put(`/api/admin/pricing/products/${id}/override`).send({ priceUsd: "9.99", reason: "negotiated list price" });
  const pub2 = await request(app).get("/api/catalog/products/99il31-3021m-1m");
  assert.equal(pub2.body.product.price.amount, "9.99");
  const hist = await owner.get(`/api/admin/pricing/products/${id}/history`);
  assert.ok(hist.body.history.some((h) => h.field === "override_price_usd" && h.newValue === "9.9900"));
  const auditRow = await db.one("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'pricing.override.set'");
  assert.equal(Number(auditRow.c), 1);

  const staffRules = await staff.get("/api/admin/pricing/rules");
  assert.equal(staffRules.status, 403);
  const staffProduct = await staff.get(`/api/admin/catalog/products/${id}`);
  assert.equal(staffProduct.body.canSeeCosts, false);
  assert.equal(staffProduct.body.product.pricing.costs, undefined);
});

test("security: public catalog JSON never contains cost fields or a product's own cost", { skip: !fs.existsSync(WORKBOOK) && "workbook fixture not present" }, async () => {
  const pages = ["/api/catalog/menu", "/api/catalog/products?limit=96", "/api/catalog/search/suggest?q=mpo", "/api/catalog/categories/fiber-optic-cables"];
  for (const u of pages) {
    const r = await request(app).get(u);
    assert.equal(r.status, 200, u);
    assert.doesNotMatch(JSON.stringify(r.body), /supplier|exw|fob|cost|margin/i, u);
  }
  const costs = await db.query("SELECT p.slug, c.supplier_exw_cost_usd AS e, c.supplier_fob_cost_usd AS f FROM products p JOIN product_costs c ON c.product_id = p.id ORDER BY p.id LIMIT 60");
  for (const c of costs) {
    const r = await request(app).get(`/api/catalog/products/${c.slug}`);
    const { variants, related, replacement, ...own } = r.body.product;
    void variants; void related; void replacement;
    const text = JSON.stringify(own);
    assert.doesNotMatch(text, /supplier|exw|fob|cost|margin/i);
    for (const v of [c.e, c.f]) {
      if (Number(v) < 3) continue; // tiny values collide with ids/lengths; covered by the key-name check
      assert.ok(!text.includes(`"${v}"`) && !text.includes(`"${Number(v).toFixed(2)}"`), `${c.slug} leaks ${v}`);
    }
  }
});

test("inventory: increase/decrease, no negative stock, no oversell under concurrency, ledger", { skip: !fs.existsSync(WORKBOOK) && "workbook fixture not present" }, async () => {
  const wh = await owner.post("/api/admin/inventory/warehouses").send({ code: "IN-BLR", name: "Bengaluru", countryCode: "IN" });
  assert.equal(wh.status, 201);
  const whId = Number(wh.body.warehouse.id);
  const p = await db.one("SELECT id FROM products ORDER BY id LIMIT 1");
  const adj = (op, q, reason = "test") => owner.post("/api/admin/inventory/adjust").send({ productId: p.id, warehouseId: whId, operation: op, quantity: q, reason });
  assert.equal((await adj("receive", 50)).body.level.onHand, 50);
  assert.equal((await adj("decrease", 60)).status, 409);
  assert.equal((await adj("increase", 10)).body.level.onHand, 60);
  const staffAdj = await staff.post("/api/admin/inventory/adjust").send({ productId: p.id, warehouseId: whId, operation: "increase", quantity: 1, reason: "x" });
  assert.equal(staffAdj.status, 403, "staff can view but not adjust stock");

  const results = await Promise.all(Array.from({ length: 20 }, () => adj("decrease", 5, "parallel")));
  assert.equal(results.filter((r) => r.status === 200).length, 12);
  assert.equal(results.filter((r) => r.status === 409).length, 8);
  const level = await db.one("SELECT on_hand FROM inventory_levels WHERE product_id = :p AND warehouse_id = :w", { p: p.id, w: whId });
  assert.equal(level.on_hand, 0);
  const ledger = await db.one("SELECT SUM(quantity) AS s FROM stock_movements WHERE product_id = :p AND bucket = 'on_hand'", { p: p.id });
  assert.equal(Number(ledger.s), 0, "ledger sums to the balance");
});

test("legacy routes still work: enquiry submit + staff list + soft delete", async () => {
  const sub = await request(app).post("/api/enquiries").send({ name: "Test", email: "t@example.com", message: "hello" });
  assert.equal(sub.status, 201);
  const list = await staff.get("/api/enquiries");
  assert.ok(list.body.records.length >= 1);
  const del = await staff.del(`/api/enquiries/${sub.body.record.id}`);
  assert.equal(del.status, 200);
  const row = await db.one("SELECT deleted_at FROM enquiries WHERE id = :id", { id: sub.body.record.id });
  assert.ok(row.deleted_at, "soft deleted, not destroyed");
});
