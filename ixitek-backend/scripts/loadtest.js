// Load test for the public read paths (catalog listing, search, product page,
// locale data, estimate). Usage: BASE=http://localhost:5000 npm run loadtest
// Run against staging — never against production during business hours.
const autocannon = require("autocannon");
const BASE = (process.env.BASE || "http://localhost:5000").replace(/\/$/, "");
const DURATION = Number(process.env.DURATION || 15);
const CONNECTIONS = Number(process.env.CONNECTIONS || 25);

const targets = [
  ["catalog listing", "/api/catalog/products?category=lc&limit=24"],
  ["search", "/api/catalog/products?q=lc%20duplex&limit=24"],
  ["suggest", "/api/catalog/search/suggest?q=lc"],
  ["locales", "/api/intl/locales"],
  ["product page (SSR head)", process.env.PRODUCT_PATH || "/product/99il31-3021m-1m"],
];

(async () => {
  console.log(`Load test ${BASE} — ${CONNECTIONS} connections × ${DURATION}s per target\n`);
  const rows = [];
  for (const [name, path] of targets) {
    const r = await autocannon({ url: BASE + path, connections: CONNECTIONS, duration: DURATION, headers: { "accept-encoding": "gzip" } });
    const codes = r.statusCodeStats || {};
    const limited = codes["429"] ? codes["429"].count : 0;
    rows.push({ target: name, "req/s": Math.round(r.requests.average), "p50 ms": r.latency.p50, "p99 ms": r.latency.p99, "2xx": r["2xx"], "429 (rate-limited, expected)": limited, errors: r.errors + r.timeouts, "other non-2xx": r.non2xx - limited });
  }
  console.table(rows);
  console.log("429s are the per-IP API rate limiter working as designed (one load generator = one IP).");
  process.exit(rows.some((x) => x.errors || x["other non-2xx"]) ? 1 : 0);
})();
