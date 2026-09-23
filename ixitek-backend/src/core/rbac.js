// rbac.js — role → permission lookup with a short in-memory cache.
// The owner role always has every permission. Frontend role claims are
// never trusted: the role is re-read from the DB on every request (auth.js).
const { query } = require("./db.js");
const { forbidden, unauthorized } = require("./errors.js");

let cache = null;
let cachedAt = 0;
const TTL_MS = 60 * 1000;

async function loadMap() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await query("SELECT role_code, permission_code FROM role_permissions");
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.role_code)) map.set(r.role_code, new Set());
    map.get(r.role_code).add(r.permission_code);
  }
  cache = map;
  cachedAt = Date.now();
  return map;
}

function invalidate() {
  cache = null;
}

async function permissionsFor(role) {
  if (!role) return new Set();
  const map = await loadMap();
  if (role === "owner") {
    const all = new Set();
    for (const set of map.values()) for (const p of set) all.add(p);
    return all;
  }
  return map.get(role) || new Set();
}

async function can(user, permission) {
  if (!user) return false;
  if (user.role === "owner") return true;
  return (await permissionsFor(user.role)).has(permission);
}

/** Express guard: requires ALL listed permissions. Use after requireAuth. */
function requirePermission(...perms) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      for (const p of perms) {
        if (!(await can(req.user, p))) return next(forbidden());
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function isStaffRole(role) {
  const rows = await query("SELECT is_staff FROM roles WHERE code = :role", { role });
  return Boolean(rows[0] && Number(rows[0].is_staff) === 1);
}

module.exports = { can, permissionsFor, requirePermission, invalidate, isStaffRole };
