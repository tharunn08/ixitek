// User model — MySQL. Same public JSON shape as the SQLite version so the
// existing frontend keeps working; adds `permissions` where useful.
const bcrypt = require("bcryptjs");
const { query, one } = require("../core/db.js");

const SALT_ROUNDS = 12;
const COLS = "id, name, email, phone, company, password_hash, role, customer_group, company_id, company_role, status, failed_login_count, locked_until, last_login_at, last_login_ip, preferred_country, preferred_currency, preferred_language, created_by, created_at, updated_at";

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

function toPublicJSON(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    role: row.role,
    customerGroup: row.customer_group,
    companyId: row.company_id ? String(row.company_id) : null,
    companyRole: row.company_role || null,
    preferences: { country: row.preferred_country || null, currency: row.preferred_currency || null, language: row.preferred_language || null },
    status: row.status,
    createdAt: iso(row.created_at),
    lastLoginAt: iso(row.last_login_at),
  };
}

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

const findByEmail = (email) =>
  one(`SELECT ${COLS} FROM users WHERE email = :email AND deleted_at IS NULL`, { email: (email || "").trim().toLowerCase() });

const findById = (id) => one(`SELECT ${COLS} FROM users WHERE id = :id AND deleted_at IS NULL`, { id });

function findAllByRole(role) {
  return query(`SELECT ${COLS} FROM users WHERE role = :role AND deleted_at IS NULL ORDER BY created_at DESC`, { role });
}

function findStaff() {
  return query(
    `SELECT ${COLS.split(", ").map((c) => "u." + c).join(", ")} FROM users u JOIN roles r ON r.code = u.role
      WHERE r.is_staff = 1 AND u.role <> 'owner' AND u.deleted_at IS NULL ORDER BY u.created_at DESC`
  );
}

async function countByRole(role) {
  const r = await one("SELECT COUNT(*) AS c FROM users WHERE role = :role AND deleted_at IS NULL", { role });
  return Number(r.c);
}

async function create({ name, email, phone = "", company = "", password, role = "customer", createdBy = null }, conn = null) {
  const passwordHash = await hashPassword(password);
  const res = await query(
    `INSERT INTO users (name, email, phone, company, password_hash, role, created_by, password_changed_at)
     VALUES (:name, :email, :phone, :company, :passwordHash, :role, :createdBy, CURRENT_TIMESTAMP(3))`,
    {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: (phone || "").trim(),
      company: (company || "").trim(),
      passwordHash,
      role,
      createdBy,
    },
    conn
  );
  return findById(res.insertId);
}

function recordLogin(id, ip) {
  return query(
    "UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3), last_login_ip = :ip, failed_login_count = 0, locked_until = NULL WHERE id = :id",
    { id, ip: ip || "" }
  );
}

function recordFailedLogin(id, maxFailed, lockMinutes) {
  return query(
    `UPDATE users SET failed_login_count = failed_login_count + 1,
       locked_until = IF(failed_login_count + 1 >= :maxFailed, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL :lock MINUTE), locked_until)
     WHERE id = :id`,
    { id, maxFailed, lock: lockMinutes }
  );
}

const setRole = (id, role) => query("UPDATE users SET role = :role WHERE id = :id", { id, role });

/** Soft delete (keeps history, frees nothing). */
async function softDelete(id, { role } = {}) {
  const res = await query(
    `UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3), status = 'disabled',
       email = CONCAT('deleted+', id, '+', email)
     WHERE id = :id AND deleted_at IS NULL ${role ? "AND role = :role" : ""}`,
    { id, role: role || null }
  );
  return res.affectedRows > 0;
}

module.exports = {
  toPublicJSON,
  hashPassword,
  comparePassword,
  findByEmail,
  findById,
  findAllByRole,
  findStaff,
  countByRole,
  create,
  recordLogin,
  recordFailedLogin,
  setRole,
  softDelete,
};
