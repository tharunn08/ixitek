// User.js — everyone who can sign in from the site's login page: regular
// website visitors who create an account ("customer"), teammates given
// access to the admin panel ("staff"), and the site owner / primary
// administrator ("owner"). One table (with a `role` column) rather than
// three, so the admin panel can list "everyone who has ever signed up"
// with a single query while still being able to filter by role.

const bcrypt = require("bcryptjs");
const { getDB } = require("../db.js");

const SALT_ROUNDS = 12;

function toPublicJSON(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  };
}

function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

function findByEmail(email) {
  const db = getDB();
  return db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").trim().toLowerCase());
}

function findById(id) {
  const db = getDB();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function findAllByRole(role) {
  const db = getDB();
  return db.prepare("SELECT * FROM users WHERE role = ? ORDER BY created_at DESC").all(role);
}

async function create({ name, email, phone = "", company = "", password, role = "customer", createdBy = null }) {
  const db = getDB();
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO users (name, email, phone, company, password_hash, role, created_by, created_at, updated_at)
       VALUES (@name, @email, @phone, @company, @passwordHash, @role, @createdBy, @now, @now)`
    )
    .run({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company.trim(),
      passwordHash,
      role,
      createdBy,
      now,
    });
  return findById(info.lastInsertRowid);
}

function recordLogin(id, ip) {
  const db = getDB();
  db.prepare("UPDATE users SET last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?").run(
    Date.now(),
    ip || "",
    Date.now(),
    id
  );
}

function setRole(id, role) {
  const db = getDB();
  db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, Date.now(), id);
}

function deleteById(id, role) {
  const db = getDB();
  // `role` guard avoids accidentally deleting an owner/customer account
  // through a route that's only meant to remove staff.
  const stmt = role
    ? db.prepare("DELETE FROM users WHERE id = ? AND role = ?")
    : db.prepare("DELETE FROM users WHERE id = ?");
  const info = role ? stmt.run(id, role) : stmt.run(id);
  return info.changes > 0;
}

module.exports = {
  toPublicJSON,
  hashPassword,
  comparePassword,
  findByEmail,
  findById,
  findAllByRole,
  create,
  recordLogin,
  setRole,
  deleteById,
};
