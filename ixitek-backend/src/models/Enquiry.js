// Enquiry model — MySQL. Résumé bytes live in file storage (core/storage.js),
// not in the row; list endpoints never ship file contents.
const { query, one } = require("../core/db.js");

const COLS = "id, type, name, company, email, phone, category, message, page, resume_file_name, resume_file_size, resume_mime, resume_storage_key, user_id, status, created_at, updated_at";

function toPublicJSON(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    type: row.type,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    category: row.category,
    message: row.message || "",
    page: row.page,
    resumeFileName: row.resume_file_name,
    resumeFileSize: row.resume_file_size,
    // Authenticated download URL (was a base64 data URL in the SQLite version).
    resumeUrl: row.resume_storage_key ? `/api/enquiries/${row.id}/resume` : "",
    status: row.status,
    createdAt: new Date(row.created_at).getTime(), // epoch ms — dashboard sorts numerically
  };
}

async function list({ limit = 50, offset = 0, type, status, q } = {}) {
  const where = ["deleted_at IS NULL"];
  const p = {};
  if (type) (where.push("type = :type"), (p.type = type));
  if (status) (where.push("status = :status"), (p.status = status));
  if (q) (where.push("(name LIKE :q OR email LIKE :q OR company LIKE :q)"), (p.q = `%${q}%`));
  const w = where.join(" AND ");
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 2000);
  const off = Math.max(Number(offset) || 0, 0);
  const rows = await query(`SELECT ${COLS} FROM enquiries WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT ${lim} OFFSET ${off}`, p);
  const total = await one(`SELECT COUNT(*) AS c FROM enquiries WHERE ${w}`, p);
  return { rows, total: Number(total.c) };
}

const findById = (id) => one(`SELECT ${COLS} FROM enquiries WHERE id = :id AND deleted_at IS NULL`, { id });

async function create(data, conn = null) {
  const res = await query(
    `INSERT INTO enquiries (type, name, company, email, phone, category, message, page,
       resume_file_name, resume_file_size, resume_mime, resume_storage_key, user_id)
     VALUES (:type, :name, :company, :email, :phone, :category, :message, :page,
       :resumeFileName, :resumeFileSize, :resumeMime, :resumeKey, :userId)`,
    {
      type: data.type,
      name: data.name,
      company: data.company || "",
      email: data.email,
      phone: data.phone || "",
      category: data.category || "",
      message: data.message || "",
      page: data.page || "",
      resumeFileName: data.resumeFileName || "",
      resumeFileSize: data.resumeFileSize || 0,
      resumeMime: data.resumeMime || "",
      resumeKey: data.resumeStorageKey || null,
      userId: data.userId || null,
    },
    conn
  );
  return findById(res.insertId);
}

async function updateStatus(id, status) {
  const res = await query("UPDATE enquiries SET status = :status WHERE id = :id AND deleted_at IS NULL", { id, status });
  return res.affectedRows > 0 ? findById(id) : null;
}

async function softDelete(id) {
  const res = await query("UPDATE enquiries SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = :id AND deleted_at IS NULL", { id });
  return res.affectedRows > 0;
}

async function stats() {
  const r = await one(
    `SELECT COUNT(*) AS total,
            SUM(status = 'new') AS newCount,
            SUM(created_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)) AS thisWeek,
            SUM(type = 'career') AS careers
       FROM enquiries WHERE deleted_at IS NULL`
  );
  return { total: Number(r.total || 0), newCount: Number(r.newCount || 0), thisWeek: Number(r.thisWeek || 0), careers: Number(r.careers || 0) };
}

module.exports = { toPublicJSON, list, findById, create, updateStatus, softDelete, stats };
