// pdf.js — server-side PDF rendering for invoices, proformas, credit notes
// and quotations (pdfkit, built-in Helvetica; no remote assets). Documents are
// rendered from immutable snapshots, so a re-download is byte-for-byte the
// same business content as the original.
const PDFDocument = require("pdfkit");

const BLUE = "#0b4f9c";
const GREY = "#555555";
const LINE = "#d0d7e2";

function fmt(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const [i, f] = String(amount).split(".");
  const neg = i.startsWith("-");
  const digits = neg ? i.slice(1) : i;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${currency ? `${currency} ` : ""}${grouped}${f !== undefined ? `.${f}` : ""}`;
}

/** Latin-1 safe text for the built-in fonts (non-Latin characters are transliterated to '?'). */
const safe = (s) => String(s === null || s === undefined ? "" : s).replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");

function toBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Producer: "IXITEK", Creator: "IXITEK" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function header(doc, { title, number, date, extra = [] }, seller) {
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(20).text("IXITEK", 40, 40);
  doc.fillColor(GREY).font("Helvetica").fontSize(8);
  const sellerLines = [seller.legalName, ...String(seller.address || "").split(/\r?\n/), seller.stateLine || "", seller.taxId ? `${seller.taxIdLabel || "Tax ID"}: ${seller.taxId}` : "", seller.email, seller.phone].filter(Boolean);
  doc.text(safe(sellerLines.join("\n")), 40, 66, { width: 260 });
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(16).text(safe(title), 320, 40, { width: 235, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#000");
  const meta = [[`No.`, number], ["Date", date], ...extra].filter((m) => m[1]);
  let y = 64;
  for (const [k, v] of meta) {
    doc.fillColor(GREY).text(safe(k), 320, y, { width: 90 });
    doc.fillColor("#000").text(safe(v), 410, y, { width: 145, align: "right" });
    y += 13;
  }
  return Math.max(doc.y, y) + 14;
}

function addressBlock(doc, y, blocks, { taxIdLabel = "Tax ID", buyerTaxId = "" } = {}) {
  const w = (555 - 40) / blocks.length;
  let maxY = y;
  blocks.forEach(([label, a], i) => {
    const x = 40 + i * w;
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8).text(safe(label.toUpperCase()), x, y, { width: w - 10 });
    const tid = a && (a.taxId || (i === 0 ? buyerTaxId : ""));
    const lines = a ? [a.companyName, a.contactName, a.line1, a.line2, [a.city, a.state && a.stateCode ? `${a.state} (${a.stateCode})` : a.state, a.postalCode].filter(Boolean).join(", "), a.countryCode, a.phone, tid ? `${taxIdLabel}: ${tid}` : ""].filter(Boolean) : ["—"];
    doc.fillColor("#000").font("Helvetica").fontSize(9).text(safe(lines.join("\n")), x, y + 12, { width: w - 10 });
    maxY = Math.max(maxY, doc.y);
  });
  return maxY + 14;
}

/** Items table with automatic page breaks. cols: [{key,label,width,align}] */
function table(doc, y, cols, rows) {
  const drawHead = (yy) => {
    doc.rect(40, yy, 515, 18).fill("#eef3fa");
    let x = 40;
    doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8);
    for (const c of cols) {
      doc.text(safe(c.label), x + 4, yy + 5, { width: c.width - 8, align: c.align || "left" });
      x += c.width;
    }
    return yy + 22;
  };
  y = drawHead(y);
  doc.font("Helvetica").fontSize(8.5).fillColor("#000");
  for (const r of rows) {
    const h = Math.max(...cols.map((c) => doc.heightOfString(safe(r[c.key]), { width: c.width - 8 }))) + 6;
    if (y + h > 760) {
      doc.addPage();
      y = drawHead(40);
      doc.font("Helvetica").fontSize(8.5).fillColor("#000");
    }
    let x = 40;
    for (const c of cols) {
      doc.text(safe(r[c.key]), x + 4, y, { width: c.width - 8, align: c.align || "left" });
      x += c.width;
    }
    y += h;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor(LINE).lineWidth(0.5).stroke();
  }
  return y + 6;
}

function totals(doc, y, rows) {
  if (y + rows.length * 15 > 770) {
    doc.addPage();
    y = 40;
  }
  for (const [label, value, bold] of rows) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9).fillColor("#000");
    doc.text(safe(label), 330, y, { width: 125, align: "right" });
    doc.text(safe(value), 460, y, { width: 95, align: "right" });
    y += bold ? 17 : 14;
  }
  return y + 6;
}

function paragraph(doc, y, title, text) {
  if (!text) return y;
  if (y > 720) {
    doc.addPage();
    y = 40;
  }
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8).text(safe(title.toUpperCase()), 40, y);
  doc.fillColor(GREY).font("Helvetica").fontSize(8).text(safe(text), 40, doc.y + 2, { width: 515 });
  return doc.y + 10;
}

function signature(doc, y, legalName) {
  if (y > 700) {
    doc.addPage();
    y = 40;
  }
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9).text(safe(`For ${legalName || "IXITEK"}`), 330, y + 6, { width: 225, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text("Authorised signatory", 330, y + 44, { width: 225, align: "right" });
  return y + 62;
}

module.exports = { signature, toBuffer, header, addressBlock, table, totals, paragraph, fmt, safe };
