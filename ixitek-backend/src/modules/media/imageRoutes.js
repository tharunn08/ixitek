// GET /api/img/:id?w=320&fmt=webp|avif|jpeg
// Serves catalog images (product_images.id) resized and re-encoded with sharp,
// cached on disk (STORAGE_DIR/img-cache) and in browsers for 30 days.
// Only images registered in the catalog can be fetched (no open proxy/SSRF),
// only over http(s), with a size limit and timeout. If sharp is not installed
// or the source is not an image, the client falls back to the original URL.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { one } = require("../../core/db.js");
const { config } = require("../../core/config.js");
const log = require("../../core/logger.js");
const { ah, notFound, badRequest } = require("../../core/errors.js");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const WIDTHS = [96, 160, 320, 480, 640, 960, 1280];
const FORMATS = { webp: "image/webp", avif: "image/avif", jpeg: "image/jpeg" };
const MAX_BYTES = Number(process.env.IMAGE_MAX_MB || 15) * 1024 * 1024;
const CACHE_DIR = path.join(config.storage.localDir, "img-cache");
const inflight = new Map();

async function fetchSource(url) {
  if (!/^https?:\/\//i.test(url)) throw badRequest("Unsupported image URL.");
  const res = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 10000)), redirect: "follow" });
  if (!res.ok) throw Object.assign(new Error(`source HTTP ${res.status}`), { status: 502 });
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw Object.assign(new Error("source too large"), { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("source too large"), { status: 502 });
  return buf;
}

const router = express.Router();
router.get("/:id", ah(async (req, res) => {
  if (!sharp) throw notFound("Image optimisation is not available.");
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  const w = WIDTHS.find((x) => x >= Number(req.query.w || 640)) || WIDTHS[WIDTHS.length - 1];
  const fmt = FORMATS[req.query.fmt] ? req.query.fmt : "webp";
  const img = await one("SELECT i.url, i.status FROM product_images i JOIN products p ON p.id = i.product_id AND p.deleted_at IS NULL WHERE i.id = :id", { id });
  if (!img || img.status === "broken") throw notFound("Image not found.");
  const key = crypto.createHash("sha1").update(`${img.url}|${w}|${fmt}`).digest("hex");
  const file = path.join(CACHE_DIR, key.slice(0, 2), `${key}.${fmt}`);
  const send = (buf) => res.set({ "Content-Type": FORMATS[fmt], "Cache-Control": "public, max-age=2592000, immutable", "X-Content-Type-Options": "nosniff" }).send(buf);
  if (fs.existsSync(file)) return send(fs.readFileSync(file));
  // One conversion per key even under concurrent requests.
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      const src = await fetchSource(img.url);
      const pipeline = sharp(src, { failOn: "error", limitInputPixels: 50e6 }).rotate().resize({ width: w, withoutEnlargement: true });
      const out = fmt === "avif" ? await pipeline.avif({ quality: 55 }).toBuffer() : fmt === "jpeg" ? await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer() : await pipeline.webp({ quality: 80 }).toBuffer();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, out);
      return out;
    })().finally(() => setTimeout(() => inflight.delete(key), 1000)));
  }
  try {
    send(await inflight.get(key));
  } catch (err) {
    log.warn("[img] optimisation failed; client will use the original", { id, err: err.message });
    res.status(err.status || 502).set("Cache-Control", "no-store").json({ error: "Image unavailable." });
  }
}));

module.exports = { router, WIDTHS, available: () => Boolean(sharp) };
