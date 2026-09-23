// sequences.js — gap-free, human-readable document numbers per year:
// IXT-2026-000001 (orders), RFQ-…, QT-…, INV-…, PF-…, RMA-…, PO-…, SHP-…, CN-…
// Uses a row lock inside the caller's transaction, so numbers are unique
// even under concurrent checkouts, and never reused after a rollback-free commit.
const { query, one } = require("../../core/db.js");

const PREFIX = { order: "IXT", rfq: "RFQ", quote: "QT", invoice: "INV", proforma: "PF", rma: "RMA", po: "PO", shipment: "SHP", credit_note: "CN", ticket: "TKT", grn: "GRN" };

async function next(name, conn) {
  if (!conn) throw new Error("sequences.next must run inside a transaction");
  const year = new Date().getUTCFullYear();
  await query("INSERT IGNORE INTO sequences (name, year, next_value) VALUES (:n, :y, 1)", { n: name, y: year }, conn);
  const row = await one("SELECT next_value FROM sequences WHERE name = :n AND year = :y FOR UPDATE", { n: name, y: year }, conn);
  await query("UPDATE sequences SET next_value = next_value + 1 WHERE name = :n AND year = :y", { n: name, y: year }, conn);
  return `${PREFIX[name] || name.toUpperCase()}-${year}-${String(row.next_value).padStart(6, "0")}`;
}

const token = () => require("crypto").randomBytes(32).toString("base64url");

module.exports = { next, token, PREFIX };
