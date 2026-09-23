// gst.js — Indian GST: CGST + SGST/UTGST for intra-state supplies, IGST for
// inter-state supplies (IGST Act s.7/s.8; place of supply for goods with
// movement = where delivery terminates, s.10(1)(a) → the ship-to state).
//
// Applies only to tax that IXITEK charges on its own invoice for deliveries
// inside India (tax rules for IN with collected_at = 'invoice') and only when
// the seller's GST state code is configured. IGST paid by an importer at
// customs is a different tax and is never split here.
//
// Rounding (all Decimal, never floating point): per line, the half-rate
// amount is rounded to the currency's decimals; CGST = SGST = that amount,
// IGST = 2 × that amount. So the tax total does not depend on the delivery
// state, and the checkout total the customer confirmed cannot move when the
// state is entered.
const { D } = require("../../core/money.js");

// GST state codes (GSTN). 25 (Daman & Diu) merged into 26 in 2020; 28 is the
// pre-2014 Andhra Pradesh code and is no longer issued.
const STATES = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh", "UT"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"],
  ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"],
  ["24", "Gujarat"], ["26", "Dadra and Nagar Haveli and Daman and Diu", "UT"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep", "UT"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman and Nicobar Islands", "UT"],
  ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh", "UT"],
].map(([code, name, kind]) => ({ code, name, utgst: kind === "UT" }));
// UTGST applies in Union Territories without a legislature; Delhi, Puducherry
// and Jammu & Kashmir have legislatures and levy SGST.
const BY_CODE = new Map(STATES.map((s) => [s.code, s]));
const norm = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const ALIASES = new Map([
  ...STATES.map((s) => [norm(s.name), s.code]),
  ["orissa", "21"], ["pondicherry", "34"], ["nctofdelhi", "07"], ["newdelhi", "07"], ["jandk", "01"], ["andamanandnicobar", "35"],
  ["damananddiu", "26"], ["dadraandnagarhaveli", "26"], ["dnhdd", "26"], ["uttaranchal", "05"],
  // ISO 3166-2:IN subdivision codes (with or without the "IN-" prefix), incl. older variants.
  ...Object.entries({
    jk: "01", hp: "02", pb: "03", ch: "04", ut: "05", uk: "05", hr: "06", dl: "07", rj: "08", up: "09", br: "10", sk: "11", ar: "12", nl: "13", mn: "14", mz: "15",
    tr: "16", ml: "17", as: "18", wb: "19", jh: "20", or: "21", od: "21", ct: "22", cg: "22", mp: "23", gj: "24", dh: "26", dn: "26", dd: "26", mh: "27", ka: "29", ga: "30",
    ld: "31", kl: "32", tn: "33", py: "34", an: "35", tg: "36", ts: "36", ap: "37", la: "38",
  }).flatMap(([k, v]) => [[k, v], [`in${k}`, v]]),
]);

/** Resolve "27", "Maharashtra", "MAHARASHTRA" … to a state {code,name,utgst}, or null. */
function resolveState(input) {
  const v = String(input || "").trim();
  if (!v) return null;
  if (/^\d{1,2}$/.test(v)) return BY_CODE.get(v.padStart(2, "0")) || null;
  const code = ALIASES.get(norm(v));
  return code ? BY_CODE.get(code) : null;
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Format + check-digit validation of a GSTIN (15 characters). */
function validateGstin(value) {
  const g = String(value || "").trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return { valid: false, reason: "A GSTIN has 15 characters: 2-digit state code, 10-character PAN, entity number, 'Z' and a check character." };
  if (!BY_CODE.has(g.slice(0, 2)) && !["97", "99"].includes(g.slice(0, 2))) return { valid: false, reason: "The GSTIN starts with an unknown state code." };
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  if (GSTIN_CHARS[(36 - (sum % 36)) % 36] !== g[14]) return { valid: false, reason: "The GSTIN check character does not match — please re-check it." };
  return { valid: true, gstin: g, stateCode: g.slice(0, 2) };
}

async function sellerGst() {
  const settings = require("../../core/settings.js");
  const state = resolveState(await settings.get("seller.state_code", ""));
  const gstin = String((await settings.get("seller.tax_id", "")) || "").trim().toUpperCase();
  return { enabled: Boolean(state), state, gstin };
}

function supplyTypeFor(sellerState, posState) {
  if (!sellerState || !posState) return null;
  return sellerState.code === posState.code ? "intra_state" : "inter_state";
}

/**
 * Split GST per line.
 * @param {{key:string, sku?:string, hsCode?:string|null, taxable:Decimal|string, ratePct:Decimal|string}[]} rows (amounts in the invoice currency)
 * @param {{sellerState, posState, decimals:number}} ctx
 */
function split(rows, { sellerState, posState, decimals = 2 }) {
  const supplyType = supplyTypeFor(sellerState, posState);
  const r = (d) => D(d).toDecimalPlaces(decimals, 4); // ROUND_HALF_UP
  const zero = D(0);
  const tot = { taxable: zero, cgst: zero, sgst: zero, igst: zero, total: zero };
  const hsn = new Map();
  const lines = rows.map((row) => {
    const taxable = r(row.taxable);
    const rate = D(row.ratePct);
    const half = r(taxable.times(rate).div(200));
    const line = { key: row.key, sku: row.sku || null, hsCode: row.hsCode || null, taxable, ratePct: rate, cgst: zero, sgst: zero, igst: zero, total: half.times(2) };
    if (supplyType === "intra_state") (line.cgst = half), (line.sgst = half);
    else if (supplyType === "inter_state") line.igst = half.times(2);
    for (const k of ["taxable", "cgst", "sgst", "igst", "total"]) tot[k] = tot[k].plus(line[k]);
    const hk = `${line.hsCode || ""}|${rate.toString()}`;
    const h = hsn.get(hk) || { hsCode: line.hsCode, ratePct: rate, taxable: zero, cgst: zero, sgst: zero, igst: zero, total: zero };
    for (const k of ["taxable", "cgst", "sgst", "igst", "total"]) h[k] = h[k].plus(line[k]);
    hsn.set(hk, h);
    return line;
  });
  const f = (d) => D(d).toFixed(decimals);
  const out = (x) => ({ ...x, taxable: f(x.taxable), ratePct: x.ratePct.toString(), cgst: f(x.cgst), sgst: f(x.sgst), igst: f(x.igst), total: f(x.total) });
  return {
    applicable: true,
    supplyType,
    sellerState: sellerState ? { code: sellerState.code, name: sellerState.name } : null,
    placeOfSupply: posState ? { code: posState.code, name: posState.name } : null,
    stateTaxLabel: posState && posState.utgst ? "UTGST" : "SGST",
    lines: lines.map(out),
    hsnSummary: [...hsn.values()].map(out),
    totals: { taxable: f(tot.taxable), cgst: f(tot.cgst), sgst: f(tot.sgst), igst: f(tot.igst), total: f(tot.total) },
  };
}

/**
 * Split a lump-sum tax (e.g. a quotation's tax figure) across lines in
 * proportion to their taxable value; the effective rate is derived. The last
 * line absorbs rounding so the parts add up exactly to `tax`.
 */
function splitLumpSum(rows, tax, { sellerState, posState, decimals = 2 }) {
  const taxD = D(tax);
  const base = rows.reduce((s, x) => s.plus(x.taxable), D(0));
  if (!base.gt(0) || !taxD.gt(0)) return null;
  const rate = taxD.div(base).times(100).toDecimalPlaces(3);
  // Compute half-amounts per line, then correct the last line so 2×Σhalf = tax (IGST/CGST+SGST add up to the quoted tax).
  const g = split(rows.map((x) => ({ ...x, ratePct: rate })), { sellerState, posState, decimals });
  const diff = taxD.minus(g.totals.total);
  if (!diff.isZero() && g.lines.length) {
    const last = g.lines[g.lines.length - 1];
    const st = g.supplyType;
    last.total = D(last.total).plus(diff).toFixed(decimals);
    if (st === "inter_state") last.igst = D(last.igst).plus(diff).toFixed(decimals);
    else if (st === "intra_state") {
      // Odd paise go to SGST so CGST stays exactly half-rounded.
      last.sgst = D(last.sgst).plus(diff).toFixed(decimals);
    }
    const t = g.totals;
    t.total = taxD.toFixed(decimals);
    if (st === "inter_state") t.igst = D(t.igst).plus(diff).toFixed(decimals);
    else if (st === "intra_state") t.sgst = D(t.sgst).plus(diff).toFixed(decimals);
    const h = g.hsnSummary.find((x) => x.hsCode === (last.hsCode || null)) || g.hsnSummary[g.hsnSummary.length - 1];
    h.total = D(h.total).plus(diff).toFixed(decimals);
    if (st === "inter_state") h.igst = D(h.igst).plus(diff).toFixed(decimals);
    else if (st === "intra_state") h.sgst = D(h.sgst).plus(diff).toFixed(decimals);
  }
  g.effectiveRate = true;
  return g;
}

/** Amount in words, Indian numbering (lakh/crore), e.g. for INR tax invoices. */
function amountInWords(amount, currency = "INR") {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");
  const words = (n) => {
    if (n === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(n / 1e7);
    if (crore) parts.push(`${words(crore)} Crore`);
    n %= 1e7;
    const lakh = Math.floor(n / 1e5);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    n %= 1e5;
    const th = Math.floor(n / 1000);
    if (th) parts.push(`${two(th)} Thousand`);
    n %= 1000;
    if (n) parts.push(three(n));
    return parts.join(" ");
  };
  const [i, f = "0"] = D(amount).abs().toFixed(2).split(".");
  const unit = currency === "INR" ? ["Rupees", "Paise"] : [currency, "Cents"];
  const paise = Number(f);
  return `${unit[0]} ${words(Number(i))}${paise ? ` and ${two(paise)} ${unit[1]}` : ""} Only`;
}

module.exports = { STATES, resolveState, validateGstin, sellerGst, supplyTypeFor, split, splitLumpSum, amountInWords };
