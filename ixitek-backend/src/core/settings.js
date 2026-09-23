// settings.js — typed key/value settings (JSON column). MySQL returns parsed
// JSON values, MariaDB returns the JSON text; both are handled here.
const { query, one } = require("./db.js");

function decode(v) {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v; // MySQL already parsed a JSON string scalar
  }
}

async function get(key, fallback = null) {
  const r = await one("SELECT value_json FROM settings WHERE setting_key = :k", { k: key });
  return r ? decode(r.value_json) : fallback;
}

async function set(key, value, userId = null) {
  await query(
    "INSERT INTO settings (setting_key, value_json, updated_by) VALUES (:k, :v, :u) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)",
    { k: key, v: JSON.stringify(value), u: userId }
  );
}

async function all(prefix = "") {
  const rows = await query("SELECT setting_key, value_json, updated_at FROM settings WHERE setting_key LIKE :p ORDER BY setting_key", { p: `${prefix}%` });
  return rows.map((r) => ({ key: r.setting_key, value: decode(r.value_json), updatedAt: r.updated_at }));
}

module.exports = { get, set, all, decode };
