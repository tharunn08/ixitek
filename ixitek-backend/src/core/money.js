// money.js — all financial arithmetic goes through decimal.js.
// Never use JS floats (0.1 + 0.2) for amounts that end up on an order,
// quote or invoice. DB DECIMAL columns arrive as strings and stay exact.
const Decimal = require("decimal.js");

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

const D = (v) => new Decimal(v === null || v === undefined || v === "" ? 0 : v);

/** True if v is a finite, non-negative decimal-looking value. */
function isMoney(v) {
  if (v === null || v === undefined || v === "") return false;
  try {
    const d = new Decimal(v);
    return d.isFinite() && !d.isNegative();
  } catch {
    return false;
  }
}

/** Exact string for DECIMAL(14,4) storage. */
const toDb = (v, dp = 4) => D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
/** Display/charge amount rounded to currency minor units (2 dp default, 0 for JPY). */
const round = (v, dp = 2) => D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);

module.exports = { Decimal, D, isMoney, toDb, round };
