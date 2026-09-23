const { test } = require("node:test");
const assert = require("node:assert");
const { applyRule } = require("../src/modules/pricing/pricingService.js");
const { parseAttributes, nameFromDescription } = require("../src/modules/catalog/attributeParser.js");
const { validateRow } = require("../src/modules/import/importService.js");
const { D, toDb } = require("../src/core/money.js");

test("pricing: user examples (cost + margin)", () => {
  assert.equal(applyRule("65", { margin_pct: "30", fixed_markup_usd: "0", rounding_step: "0.01" }).toFixed(2), "84.50");
  assert.equal(applyRule("100", { margin_pct: "25", fixed_markup_usd: "0", rounding_step: "0.01" }).toFixed(2), "125.00");
});

test("pricing: fixed markup, rounding step, no float drift", () => {
  assert.equal(applyRule("4.1262", { margin_pct: "35", fixed_markup_usd: "0.50", rounding_step: "0.05" }).toFixed(2), "6.05");
  assert.equal(applyRule("0.1", { margin_pct: "0", fixed_markup_usd: "0.2", rounding_step: "0.01" }).toFixed(2), "0.30");
  assert.equal(D("0.1").plus("0.2").toString(), "0.3");
  assert.equal(toDb("5.053999999999999"), "5.0540");
});

test("attributes: parsed only when stated", () => {
  const a = parseAttributes("Ixitek fiber cable, LC-LC Duplex OM4, 2.0mm Magenta, 0.5m").attributes;
  assert.equal(a.connector.text, "LC-LC");
  assert.equal(a.fiber_type.text, "OM4");
  assert.equal(a.length_m.number, 0.5);
  assert.equal(a.color.text, "Magenta");
  assert.equal(a.data_rate, undefined, "no data rate is invented");
  const cat = parseAttributes("CAT6 Rated Patch Cord, Snagfree boot with labels, 3FT. XX=(BL=Blue, GN=Green)");
  assert.equal(cat.attributes.length_label.text, "3 ft");
  assert.equal(cat.attributes.color, undefined, "colour placeholder is not guessed");
  const cassette = parseAttributes("EXO Cassette: 3x12F MTP with 3 Grey Adapter to 12 LC Duplex Aqua Adapter MM OM4").attributes;
  assert.equal(cassette.color, undefined);
  assert.equal(nameFromDescription("Ixitek fiber cable, LC-LC Duplex OM3, 2.0mm Aqua, 1m"), "LC-LC Duplex OM3, 2.0mm Aqua, 1m");
});

test("import validation: errors, warnings, SKU never altered", () => {
  const ok = validateRow({ sheet: "LC", rowNumber: 3, sku: "99IL6499IL50-4020-0", description: "Adaptor", fob: 8.12, exw: 6.5, imageUrl: null, category: "MPO12" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.data.sku, "99IL6499IL50-4020-0");
  assert.ok(ok.warnings.some((w) => w.includes("prefix twice")));
  assert.ok(ok.warnings.some((w) => w.includes("No image")));
  const bad = validateRow({ sku: "", description: "", fob: "abc", exw: -1, category: "LC" });
  assert.ok(bad.errors.length >= 3);
  const noValue = validateRow({ sku: "X-1", description: "d", fob: null, exw: null, imageUrl: "#VALUE!", category: "LC" });
  assert.ok(noValue.warnings.some((w) => w.includes("Request a Quote")));
  assert.equal(noValue.data.imageUrl, null);
});
