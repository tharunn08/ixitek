// convertPrices — converts every public {amount, currency:"USD"} price object
// in a catalog response to the visitor's currency (server-side, decimal-safe).
const { D } = require("../../core/money.js");
const fx = require("./fxService.js");

async function convertPrices(payload, requested) {
  const cur = await fx.effectiveCurrency(requested);
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object" && !Array.isArray(v) && v.currency === "USD" && typeof v.amount === "string" && Object.keys(v).length === 2) {
        node[k] = cur.code === "USD" ? v : { amount: D(v.amount).times(cur.rate).toDecimalPlaces(cur.decimals, 4).toFixed(cur.decimals), currency: cur.code };
      } else walk(v);
    }
  };
  walk(payload);
  payload.displayCurrency = { code: cur.code, symbol: cur.symbol, decimals: cur.decimals, requested: requested ? String(requested).toUpperCase() : null, fallback: Boolean(requested && String(requested).toUpperCase() !== cur.code) };
  return payload;
}

module.exports = { convertPrices };
