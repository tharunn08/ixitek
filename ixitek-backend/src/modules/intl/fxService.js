// fxService.js — exchange rates. USD is the authoritative base currency:
// every conversion is USD → target (never chained through other currencies).
//
// Current rate for a currency (in priority order):
//   1. an active admin OVERRIDE (pins the rate until cleared),
//   2. the most recent provider or manual rate.
// If the provider fails, the last known valid rate stays in force and the
// failure is logged; a currency with NO valid rate is reported unavailable
// (prices then show in USD) — never 0, NaN or blank.
const { query, one } = require("../../core/db.js");
const { D } = require("../../core/money.js");
const jobs = require("../../core/jobs.js");
const log = require("../../core/logger.js");
const monitor = require("../../core/monitor.js");

const PROVIDER_URL = process.env.FX_PROVIDER_URL || "https://open.er-api.com/v6/latest/USD";
const STALE_HOURS = Number(process.env.FX_STALE_HOURS || 48);

let cache = null;
let cachedAt = 0;

async function currentRates({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < 60 * 1000) return cache;
  const currencies = await query("SELECT code, name, symbol, decimals, is_active, razorpay_enabled FROM currencies ORDER BY sort_order");
  const rows = await query(
    `SELECT r.currency, r.rate, r.source, r.provider, r.observed_at
       FROM exchange_rates r
       JOIN (
         SELECT currency, MAX(CASE WHEN source = 'override' THEN id END) AS ov, MAX(CASE WHEN source <> 'override' THEN id END) AS last
           FROM exchange_rates WHERE is_active = 1 GROUP BY currency
       ) x ON r.id = COALESCE(x.ov, x.last)`
  );
  const byCur = new Map(rows.map((r) => [r.currency, r]));
  const map = new Map();
  for (const c of currencies) {
    const r = c.code === "USD" ? { rate: "1", source: "base", observed_at: new Date() } : byCur.get(c.code);
    const ageH = r ? (Date.now() - new Date(r.observed_at).getTime()) / 3.6e6 : null;
    map.set(c.code, {
      code: c.code, name: c.name, symbol: c.symbol, decimals: Number(c.decimals), isActive: Boolean(c.is_active), razorpayEnabled: Boolean(c.razorpay_enabled),
      rate: r ? String(r.rate) : null, source: r ? r.source : null, provider: r ? r.provider || null : null, observedAt: r ? r.observed_at : null,
      stale: Boolean(r && c.code !== "USD" && r.source === "provider" && ageH > STALE_HOURS),
      available: Boolean(c.is_active && r && D(r.rate).gt(0)),
    });
  }
  cache = map;
  cachedAt = Date.now();
  return map;
}

function invalidate() {
  cache = null;
}

/** Convert a USD amount to `currency`, rounded to the currency's minor units. Returns null if no valid rate. */
async function convert(usdAmount, currency) {
  const rates = await currentRates();
  const c = rates.get(currency);
  if (!c || !c.available) return null;
  return { amount: D(usdAmount).times(c.rate).toDecimalPlaces(c.decimals, 4).toFixed(c.decimals), currency, rate: c.rate, decimals: c.decimals };
}

/** Resolve the currency to actually display: requested one if it has a valid rate, else USD. */
async function effectiveCurrency(requested) {
  const rates = await currentRates();
  const c = rates.get(String(requested || "USD").toUpperCase());
  return c && c.available ? c : rates.get("USD");
}

async function recordRate({ currency, rate, source, provider = null, note = null, userId = null }) {
  const d = D(rate);
  if (!d.isFinite() || d.lte(0)) throw new Error(`Invalid rate for ${currency}`);
  await query(
    "INSERT INTO exchange_rates (currency, rate, source, provider, note, created_by) VALUES (:c, :r, :s, :p, :n, :u)",
    { c: currency, r: d.toFixed(10), s: source, p: provider, n: note, u: userId }
  );
  invalidate();
}

async function clearOverride(currency) {
  await query("UPDATE exchange_rates SET is_active = 0 WHERE currency = :c AND source = 'override' AND is_active = 1", { c: currency });
  invalidate();
}

/** Fetch rates from the provider. On failure keep last valid rates (nothing is overwritten). */
async function refreshFromProvider({ fetchImpl = fetch } = {}) {
  const codes = (await query("SELECT code FROM currencies WHERE is_active = 1 AND code <> 'USD'")).map((r) => r.code);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetchImpl(PROVIDER_URL, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const rates = body.rates || body.conversion_rates;
    if (!rates || (body.base_code && body.base_code !== "USD") || (body.base && body.base !== "USD")) throw new Error("Unexpected provider response");
    const updated = [];
    for (const code of codes) {
      const v = rates[code];
      if (v === undefined || !(Number(v) > 0)) continue;
      await recordRate({ currency: code, rate: String(v), source: "provider", provider: new URL(PROVIDER_URL).host });
      updated.push(code);
    }
    log.info("[fx] rates refreshed", { updated });
    return { ok: true, updated, missing: codes.filter((c) => !updated.includes(c)) };
  } catch (err) {
    log.warn("[fx] provider failed — keeping last known valid rates", { err: err.message });
    await monitor.event("fx_provider_failure", err.message);
    return { ok: false, error: err.message };
  }
}

jobs.register("fx.refresh", () => refreshFromProvider());

let timer = null;
function schedule() {
  if (timer || process.env.FX_AUTO_REFRESH === "false") return;
  const hours = Number(process.env.FX_REFRESH_HOURS || 6);
  jobs.enqueue("fx.refresh", {}, { idempotencyKey: `fx:${new Date().toISOString().slice(0, 13)}`, maxAttempts: 1 }).catch(() => {});
  timer = setInterval(() => jobs.enqueue("fx.refresh", {}, { idempotencyKey: `fx:${new Date().toISOString().slice(0, 13)}`, maxAttempts: 1 }).catch(() => {}), hours * 3.6e6);
  timer.unref();
}

async function history(currency, limit = 50) {
  return query(
    `SELECT r.id, r.rate, r.source, r.provider, r.observed_at, r.is_active, r.note, u.email AS created_by
       FROM exchange_rates r LEFT JOIN users u ON u.id = r.created_by WHERE r.currency = :c ORDER BY r.id DESC LIMIT ${Number(limit)}`,
    { c: currency }
  );
}

void one;
module.exports = { currentRates, convert, effectiveCurrency, recordRate, clearOverride, refreshFromProvider, schedule, history, invalidate };
