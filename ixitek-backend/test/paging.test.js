// List pagination: every capped list now pages (?page=&limit=) and reports
// { total, page, limit }; limits are clamped and never interpolated as text.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { db, resetDb, buildApp, createUser, agentFor } = require("./helpers.js");
const { paging } = require("../src/core/paging.js");

let server;
let owner;
before(async () => {
  await resetDb();
  server = buildApp().listen(0);
  owner = await agentFor(server, await createUser("owner"));
  for (let i = 1; i <= 7; i++) {
    await db.query("INSERT INTO tickets (ticket_number, access_token, name, email, subject, status) VALUES (:n, :t, 'Buyer', 'b@test.local', :s, 'open')", { n: `TKT-T-${i}`, t: "x".repeat(43), s: i === 7 ? "Needle ticket" : `Ticket ${i}` });
    await db.query("INSERT INTO jobs (type, status, last_error) VALUES ('test.job', 'dead', 'boom')");
  }
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

test("paging helper clamps page/limit to safe integers", () => {
  assert.deepEqual(paging({ query: {} }), { limit: 50, page: 1, offset: 0, sql: "LIMIT 50 OFFSET 0" });
  assert.equal(paging({ query: { limit: "9999" } }).limit, 200);
  assert.equal(paging({ query: { limit: "-5", page: "-2" } }).sql, "LIMIT 1 OFFSET 0", "negative values clamp to the minimum");
  assert.equal(paging({ query: { limit: "10; DROP TABLE x", page: "abc" } }).sql, "LIMIT 50 OFFSET 0");
  assert.equal(paging({ query: { limit: "3", page: "2" } }).offset, 3);
});

test("admin tickets and dead jobs page through every row with a total; search narrows tickets", async () => {
  const seen = new Set();
  for (let page = 1; page <= 3; page++) {
    const r = await owner.get(`/api/admin/tickets?limit=3&page=${page}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 7);
    assert.equal(r.body.page, page);
    r.body.tickets.forEach((t) => seen.add(t.ticketNumber));
  }
  assert.equal(seen.size, 7, "no row skipped or repeated across pages");
  const q = await owner.get("/api/admin/tickets?q=Needle");
  assert.equal(q.body.total, 1);
  const jobs = await owner.get("/api/admin/monitoring/jobs?status=dead&limit=5&page=2");
  assert.equal(jobs.body.total, 7);
  assert.equal(jobs.body.jobs.length, 2);
  for (const path of ["/api/admin/companies", "/api/admin/returns", "/api/admin/procurement/purchase-orders", "/api/admin/procurement/supplier-invoices"]) {
    const r = await owner.get(`${path}?limit=5`);
    assert.equal(r.status, 200, path);
    assert.equal(typeof r.body.total, "number", `${path} reports total`);
    assert.equal(r.body.limit, 5);
  }
  const ship = await owner.get("/api/admin/shipping/queue?limit=5");
  assert.equal(ship.body.toShipPaging.total, 0);
  assert.equal(ship.body.activePaging.limit, 5);
});
