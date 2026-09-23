// parser.js — turns an uploaded .xlsx / .csv into flat candidate rows.
//
// Two layouts are recognised automatically:
//  1. IXITEK supplier catalog (the 2026 workbook): each sheet holds one or
//     more groups; a group starts with a header row whose "Part#" cell has
//     the group title immediately to its left. Later group headers may omit
//     price columns — the column map carries forward within the sheet.
//  2. Flat template: first non-empty row is a header containing "SKU" or
//     "Part#" (see TEMPLATE_HEADERS); category/family come from columns.
//
// Formula cells whose cached result is an Excel error (e.g. the IMAGE()
// formulas that show "#VALUE!") are treated as EMPTY, never imported.
const ExcelJS = require("exceljs");
const { parse: parseCsv } = require("csv-parse/sync");

const HEADER_ALIASES = {
  sku: ["part#", "part #", "part number", "part no", "part no.", "sku"],
  description: ["description", "product description"],
  name: ["name", "product name"],
  fob: ["us fob price (usd)", "us fob price", "fob", "fob price", "supplier fob cost usd", "supplier_fob_cost_usd", "us fob cost (usd)"],
  exw: ["exw cn price (usd)", "exw cn price", "exw", "exw price", "supplier exw cost usd", "supplier_exw_cost_usd", "exw cn cost (usd)"],
  imageUrl: ["url location", "image url", "image", "image_url"],
  category: ["category", "subcategory", "sheet"],
  family: ["family", "product family", "group"],
  moq: ["moq"],
  leadTimeDays: ["lead time (days)", "lead time", "lead_time_days"],
  hsCode: ["hs code", "hs_code"],
  countryOfOrigin: ["country of origin", "coo", "country_of_origin"],
  weightKg: ["weight (kg)", "weight_kg", "weight"],
  warrantyMonths: ["warranty (months)", "warranty_months"],
  ignored: ["image from url"],
};
const TEMPLATE_HEADERS = ["SKU", "Name", "Description", "Category", "Family", "Supplier FOB Cost USD", "Supplier EXW Cost USD", "Image URL", "MOQ", "Lead Time (days)", "HS Code", "Country of Origin", "Weight (kg)", "Warranty (months)"];

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fieldFor(header) {
  const h = norm(header);
  if (!h) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(h)) return field;
  return null;
}

/** Plain value of an exceljs cell; Excel errors → null. */
function cellValue(cell) {
  let v = cell && cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    if ("error" in v) return null;
    if ("formula" in v || "sharedFormula" in v) {
      v = v.result;
      if (v === null || v === undefined || (typeof v === "object" && "error" in v)) return null;
    } else if ("richText" in v) {
      v = v.richText.map((r) => r.text).join("");
    } else if ("text" in v && "hyperlink" in v) {
      // The visible text is what the catalog owner sees and maintains; a
      // differing (stale) hyperlink target is reported, not used.
      v = typeof v.text === "string" && v.text.trim() ? v.text : v.hyperlink;
    } else if ("text" in v) {
      v = v.text;
    }
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (/^#(VALUE|REF|N\/A|NAME\?|DIV\/0|NUM|NULL)!?$/i.test(t)) return null;
    return t === "" ? null : t;
  }
  return v;
}

function rowsFromWorksheet(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = [];
    const links = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col] = cellValue(cell);
      const v = cell.value;
      if (v && typeof v === "object" && "hyperlink" in v && v.hyperlink && typeof v.text === "string" && v.text.trim() !== v.hyperlink.trim()) {
        links[col] = v.hyperlink.trim();
      }
    });
    rows.push({ rowNumber, cells, links });
  });
  return rows;
}

/** Layout 1: grouped supplier catalog. */
function parseGroupedSheet(sheetName, rows) {
  const out = [];
  let colMap = null;
  let group = null;
  for (const { rowNumber, cells, links = [] } of rows) {
    const skuHeaderCol = cells.findIndex((v) => typeof v === "string" && HEADER_ALIASES.sku.includes(norm(v)));
    if (skuHeaderCol > 0) {
      const map = { ...(colMap || {}) };
      cells.forEach((v, col) => {
        const f = fieldFor(v);
        if (f && f !== "ignored") map[f] = col;
      });
      map.sku = skuHeaderCol;
      colMap = map;
      const label = cells[skuHeaderCol - 1];
      group = typeof label === "string" && label.trim() ? label.trim() : group;
      continue;
    }
    if (!colMap) continue;
    const sku = cells[colMap.sku];
    if (sku === null || sku === undefined || String(sku).trim() === "") continue;
    const listedUnder = colMap.sku > 1 ? cells[colMap.sku - 1] : null;
    out.push({
      sheet: sheetName,
      rowNumber,
      group,
      listedUnder: typeof listedUnder === "string" ? listedUnder.trim() : null,
      sku: String(sku).trim(),
      description: cells[colMap.description] != null ? String(cells[colMap.description]).trim() : "",
      name: colMap.name ? cells[colMap.name] : null,
      fob: colMap.fob ? cells[colMap.fob] : null,
      exw: colMap.exw ? cells[colMap.exw] : null,
      imageUrl: colMap.imageUrl ? cells[colMap.imageUrl] : null,
      imageLinkMismatch: colMap.imageUrl ? links[colMap.imageUrl] || null : null,
      category: sheetName,
      family: group,
    });
  }
  return out;
}

/** Layout 2: flat table with one header row. */
function parseFlat(sheetName, rows) {
  const headerIdx = rows.findIndex(({ cells }) => cells.some((v) => fieldFor(v) === "sku"));
  if (headerIdx < 0) return [];
  const map = {};
  rows[headerIdx].cells.forEach((v, col) => {
    const f = fieldFor(v);
    if (f && f !== "ignored") map[f] = col;
  });
  const out = [];
  for (const { rowNumber, cells } of rows.slice(headerIdx + 1)) {
    const sku = cells[map.sku];
    if (sku === null || sku === undefined || String(sku).trim() === "") continue;
    const get = (f) => (map[f] !== undefined ? cells[map[f]] : null);
    out.push({
      sheet: sheetName,
      rowNumber,
      group: get("family"),
      listedUnder: null,
      sku: String(sku).trim(),
      description: get("description") != null ? String(get("description")).trim() : "",
      name: get("name"),
      fob: get("fob"),
      exw: get("exw"),
      imageUrl: get("imageUrl"),
      category: get("category") || sheetName,
      family: get("family"),
      moq: get("moq"),
      leadTimeDays: get("leadTimeDays"),
      hsCode: get("hsCode"),
      countryOfOrigin: get("countryOfOrigin"),
      weightKg: get("weightKg"),
      warrantyMonths: get("warrantyMonths"),
    });
  }
  return out;
}

function isGrouped(rows) {
  return rows.some(({ cells }) => {
    const i = cells.findIndex((v) => typeof v === "string" && HEADER_ALIASES.sku.includes(norm(v)));
    return i > 1 && typeof cells[i - 1] === "string" && fieldFor(cells[i - 1]) === null;
  });
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const all = [];
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = rowsFromWorksheet(ws);
    const hasSku = rows.some(({ cells }) => cells.some((v) => fieldFor(v) === "sku"));
    if (!hasSku) {
      sheets.push({ name: ws.name, layout: "skipped (no Part#/SKU header)", rows: 0 });
      return;
    }
    const grouped = isGrouped(rows);
    const parsed = grouped ? parseGroupedSheet(ws.name, rows) : parseFlat(ws.name, rows);
    sheets.push({ name: ws.name, layout: grouped ? "grouped catalog" : "flat table", rows: parsed.length });
    all.push(...parsed);
  });
  return { rows: all, sheets };
}

function parseCsvBuffer(buffer, fileName = "upload.csv") {
  const records = parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: true });
  const rows = records.map((rec, i) => ({ rowNumber: i + 1, cells: [null, ...rec.map((v) => (String(v).trim() === "" ? null : String(v).trim()))] }));
  const sheet = fileName.replace(/\.csv$/i, "");
  const grouped = isGrouped(rows);
  const parsed = grouped ? parseGroupedSheet(sheet, rows) : parseFlat(sheet, rows);
  return { rows: parsed, sheets: [{ name: sheet, layout: grouped ? "grouped catalog" : "flat table", rows: parsed.length }] };
}

module.exports = { parseXlsx, parseCsvBuffer, cellValue, TEMPLATE_HEADERS };
