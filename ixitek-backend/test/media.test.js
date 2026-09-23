// Image optimisation: catalog-only (no open proxy), WebP/AVIF resize, disk cache.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { request, db, resetDb, buildApp, createTestProduct } = require("./helpers.js");

let server;
let src;
let imgId;
let hits = 0;
before(async () => {
  await resetDb();
  const sharp = require("sharp");
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 11, g: 79, b: 156 } } }).png().toBuffer();
  src = http.createServer((req, res) => {
    hits++;
    if (req.url === "/ok.png") return res.writeHead(200, { "Content-Type": "image/png" }).end(png);
    res.writeHead(404).end();
  });
  await new Promise((r) => src.listen(0, "127.0.0.1", r));
  server = buildApp().listen(0);
  const pid = await createTestProduct({ sku: "T-IMG-1", exw: "1" });
  const r = await db.query("INSERT INTO product_images (product_id, url, alt, is_primary, status) VALUES (:p, :u, 'test', 1, 'valid')", { p: pid, u: `http://127.0.0.1:${src.address().port}/ok.png` });
  imgId = r.insertId;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => src.close(r));
  await db.close();
});

const bin = (req) => req.buffer(true).parse((res, cb) => { const b = []; res.on("data", (c) => b.push(c)); res.on("end", () => cb(null, Buffer.concat(b))); });

test("resizes to WebP/AVIF, caches, and only serves catalog images", async () => {
  const r = await bin(request(server).get(`/api/img/${imgId}?w=300&fmt=webp`));
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "image/webp");
  const meta = await require("sharp")(r.body).metadata();
  assert.equal(meta.width, 320, "snapped to the 320 px bucket");
  const before = hits;
  const again = await bin(request(server).get(`/api/img/${imgId}?w=300&fmt=webp`));
  assert.equal(again.status, 200);
  assert.equal(hits, before, "second request served from disk cache");
  const avif = await bin(request(server).get(`/api/img/${imgId}?w=160&fmt=avif`));
  assert.equal(avif.headers["content-type"], "image/avif");
  assert.equal((await request(server).get("/api/img/999999")).status, 404, "unknown ids are not proxied");
  await db.query("UPDATE product_images SET status = 'broken' WHERE id = :id", { id: imgId });
  assert.equal((await request(server).get(`/api/img/${imgId}?w=640`)).status, 404);
});
