// attributeParser.js — derives filterable technical attributes from the
// supplier's free-text description. Conservative by design: an attribute is
// emitted ONLY when the text states it explicitly; nothing is guessed.
// The original description is always stored verbatim alongside.

const COLOURS = ["Yellow", "Aqua", "Magenta", "Black", "Grey", "Gray", "Blue", "Orange", "Green", "Red", "Purple", "White", "Beige", "Violet"];
const FT_TO_M = 0.3048;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function connectorOf(d) {
  let m = /(?:MTP\/MPO|MPO)[^,]*?\bto\s+(\d+)\s*x\s*(?:\d+F\s+)?(?:Duplex\s+)?(?:Uniboot\s+)?(LC|SN|CS|MPO)\b/i.exec(d);
  if (m) return `MPO to ${m[1]}x ${m[2].toUpperCase()}`;
  m = /\b(LC|SN|CS|SC|FC|ST)(?:\s*\((?:UPC|APC|PC)\))?\s*(?:-|\bto\b)\s*(?:Uniboot\s+)?(LC|SN|CS|SC|FC|ST)\b/.exec(d);
  if (m) return `${m[1]}-${m[2]}`;
  if (/(MTP\/MPO|MPO)(\s*\(?\/?(APC|UPC|PC)\)?)?\s*(-|\bto\b)\s*(\d+F\s+)?(MTP\/MPO|MPO)/i.test(d)) return "MPO-MPO";
  m = /\b(SN|CS|LC|MPO|MTP\/MPO)\b[^,]*Loopback|Loopback[^,]*\b(SN|CS|LC|MPO)\b/i.exec(d);
  if (m) return `${(m[1] || m[2]).toUpperCase().replace("MTP/MPO", "MPO")} loopback`;
  if (/\bMTP\/MPO\b|\bMPO\b/i.test(d) && /Loopback/i.test(d)) return "MPO loopback";
  return null;
}

function configurationOf(d) {
  if (/Loopback/i.test(d)) return "Loopback";
  if (/Cassette:/i.test(d)) return "Cassette";
  if (/Chassis/i.test(d)) return "Chassis";
  if (/Feed\s*through\s*Plate/i.test(d)) return "Feed-through plate";
  if (/Kite Sleeve/i.test(d)) return "Accessory";
  if (/Adaptor|Adapter|Coupler/i.test(d)) return "Adapter";
  if (/Breakout|\bto\s+\d+\s*x/i.test(d)) return "Breakout";
  if (/Patch Cord/i.test(d) && /CAT\s?6/i.test(d)) return "Patch cord";
  if (/\b2x\s*1\.6\s*mm|\b2xDuplex/i.test(d)) return "2x Duplex";
  if (/Duplex/i.test(d)) return "Duplex";
  if (/Simplex/i.test(d)) return "Simplex";
  if (/Patch Cord|Strand/i.test(d)) return "Patch cord";
  return null;
}

/**
 * @param {string} description verbatim supplier description
 * @param {string} [groupLabel] workbook group heading (context only)
 * @returns {{attributes: Object<string,{text:string, number?:number}>, notes:string[]}}
 */
function parseAttributes(description, groupLabel = "") {
  const d = String(description || "");
  const out = {};
  const notes = [];
  const set = (code, text, number) => {
    if (text !== null && text !== undefined && text !== "") out[code] = number === undefined ? { text: String(text) } : { text: String(text), number };
  };

  // Fiber mode / type
  const om = /\bOM([1-5])\b/i.exec(d) || /\(OM([1-5])\)/i.exec(d);
  if (om) {
    set("fiber_mode", "Multimode");
    set("fiber_type", `OM${om[1]}`);
  } else if (/\bG\.?657\.?A2\b/i.test(d)) {
    set("fiber_mode", "Singlemode");
    set("fiber_type", "G.657.A2");
  } else if (/Single\s?mode|\bSM\b/i.test(d)) {
    set("fiber_mode", "Singlemode");
  } else if (/\bMM\b|Multimode/i.test(d)) {
    set("fiber_mode", "Multimode");
  }

  const cat = /\bCAT\s?(6A|6|5E)\b/i.exec(d);
  if (cat) set("cable_category", `CAT${cat[1].toUpperCase()}`);

  const conn = connectorOf(d);
  if (conn) set("connector", conn);

  const cfg = configurationOf(d);
  if (cfg) set("configuration", cfg);

  const fc = /\b(\d{1,3})F\b/.exec(d);
  if (fc) set("fiber_count", `${fc[1]}F`, Number(fc[1]));

  // Length: the trailing length of the assembly (not the "2FT Breakout" leg).
  const len = /(?:^|[\s,])(\d+(?:\.\d+)?)\s*(M|FT)\.?\s*(?:XX=\(.*\))?\s*$/i.exec(d);
  if (len) {
    const n = Number(len[1]);
    const unit = len[2].toUpperCase();
    if (unit === "M") {
      set("length_m", `${n} m`, n);
      set("length_label", `${n} m`);
    } else {
      set("length_m", `${round3(n * FT_TO_M)} m`, round3(n * FT_TO_M));
      set("length_label", `${n} ft`);
    }
  }

  if (/PLENUM|OFNP/i.test(d)) set("jacket_rating", "Plenum (OFNP)");
  else if (/OFNR/i.test(d)) set("jacket_rating", "Riser (OFNR)");
  else if (/LSZH/i.test(d)) set("jacket_rating", "LSZH");

  const dia = /\b(\d+x)?(\d(?:\.\d)?)\s*mm\b/i.exec(d);
  if (dia) set("jacket_diameter", `${dia[1] || ""}${dia[2]} mm`);

  const pol = new Set();
  for (const m of d.matchAll(/(?:\/|\()(APC|UPC|PC)\b/g)) pol.add(m[1]);
  if (pol.size) set("polish", [...pol].join(" / "));

  if (/XX=\(/i.test(d)) {
    notes.push("Colour is chosen by replacing XX in the part number (see description).");
  } else if (!["Cassette", "Chassis", "Feed-through plate", "Accessory"].includes(cfg)) {
    // For cassettes/panels a colour word describes a component (e.g. adapter), not the product.
    const c = new RegExp(`\\b(${COLOURS.join("|")})\\b`, "i").exec(d);
    if (c) set("color", c[1][0].toUpperCase() + c[1].slice(1).toLowerCase().replace("gray", "grey"));
  }

  void groupLabel;
  return { attributes: out, notes };
}

/** Human product name derived from the description (brand prefix removed, text otherwise verbatim). */
function nameFromDescription(description) {
  let s = String(description || "").trim().replace(/\s+/g, " ");
  s = s.replace(/^Ixitek\s+(fiber\s+cable|fiber\s+loopback|fiber)\s*,?\s*/i, (m) => (/loopback/i.test(m) ? "Loopback " : ""));
  s = s.replace(/^Ixitek\s+/i, "");
  s = s.replace(/\s*XX=\(.*\)\s*$/i, "");
  if (!s) return String(description || "").slice(0, 255);
  return (s[0].toUpperCase() + s.slice(1)).slice(0, 255);
}

module.exports = { parseAttributes, nameFromDescription };
