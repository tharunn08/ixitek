// imageCheck.js — validates product image URLs from the server (not the
// browser): HTTP 200 + image/* content type. Results drive the data-quality
// dashboard and let the storefront skip known-broken images (fallback shown).
const { query } = require("../../core/db.js");
const { config } = require("../../core/config.js");
const jobs = require("../../core/jobs.js");
const log = require("../../core/logger.js");

async function checkUrl(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.imageCheck.timeoutMs);
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: method === "GET" ? { Range: "bytes=0-1023" } : {} });
      const type = res.headers.get("content-type") || "";
      const len = Number(res.headers.get("content-length")) || null;
      if (res.body && method === "GET") await res.body.cancel().catch(() => {});
      return { status: res.status, ok: (res.status === 200 || res.status === 206) && type.startsWith("image/"), type, bytes: len };
    } finally {
      clearTimeout(t);
    }
  };
  try {
    let r = await attempt("HEAD");
    if (r.status === 405 || r.status === 403 || (r.status === 200 && !r.type)) r = await attempt("GET");
    return r;
  } catch (err) {
    return { status: 0, ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
  }
}

async function checkImages({ batchId = null, onlyUnchecked = false } = {}) {
  const where = batchId ? "WHERE product_id IN (SELECT product_id FROM import_rows WHERE batch_id = :b AND product_id IS NOT NULL)" : onlyUnchecked ? "WHERE status = 'unchecked'" : "";
  const urls = (await query(`SELECT DISTINCT url FROM product_images ${where}`, { b: batchId })).map((r) => r.url);
  let valid = 0;
  let broken = 0;
  let unverified = 0;
  const brokenList = [];
  const unverifiedList = [];
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      const r = await checkUrl(url);
      // Only a definite answer marks an image broken (404/410, or 200 that is not an image).
      // Timeouts, network errors, 401/403/5xx are "could not verify": the image
      // stays 'unchecked' and the browser-side fallback still protects the page.
      const definite = r.status === 404 || r.status === 410 || (r.status === 200 && !r.ok);
      const status = r.ok ? "valid" : definite ? "broken" : "unchecked";
      await query(
        "UPDATE product_images SET status = :s, http_status = :h, format = COALESCE(:f, format), bytes = COALESCE(:b, bytes), checked_at = CURRENT_TIMESTAMP(3) WHERE url = :u",
        { s: status, h: r.status, f: r.ok && r.type ? r.type.replace("image/", "").slice(0, 20) : null, b: r.ok ? r.bytes : null, u: url }
      );
      if (status === "valid") valid++;
      else if (status === "broken") {
        broken++;
        brokenList.push({ url, status: r.status, error: r.error || null });
      } else {
        unverified++;
        unverifiedList.push({ url, status: r.status, error: r.error || null });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length || 1) }, worker));
  if (broken) {
    log.warn("[images] broken product images found", { broken, sample: brokenList.slice(0, 5) });
    require("../../core/monitor.js").event("image_failure", `${broken} broken product image(s) found`, { sample: brokenList.slice(0, 5) });
  }
  if (unverified) log.warn("[images] some product images could not be verified from the server", { unverified, sample: unverifiedList.slice(0, 3) });
  return { checked: urls.length, valid, broken, unverified, brokenList: brokenList.slice(0, 200), unverifiedList: unverifiedList.slice(0, 200) };
}

jobs.register("catalog.check_images", (payload) => checkImages(payload || {}));

module.exports = { checkUrl, checkImages };
