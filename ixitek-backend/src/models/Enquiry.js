// Enquiry.js — product enquiries (Contact/Enquiry form) and career
// applications (Career form). One table with a `type` column to match the
// admin dashboard's "All / Product enquiries / Career applications" tabs.

const { getDB } = require("../db.js");

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
    message: row.message,
    page: row.page,
    resumeFileName: row.resume_file_name,
    resumeFileSize: row.resume_file_size,
    resumeDataUrl: row.resume_data_url,
    status: row.status,
    createdAt: row.created_at, // epoch ms — the admin dashboard sorts on this numerically
  };
}

function findAll({ limit = 2000 } = {}) {
  const db = getDB();
  return db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?").all(limit);
}

function findById(id) {
  const db = getDB();
  return db.prepare("SELECT * FROM enquiries WHERE id = ?").get(id);
}

function create(data) {
  const db = getDB();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO enquiries (
         type, name, company, email, phone, category, message, page,
         resume_file_name, resume_file_size, resume_data_url, user_id,
         status, created_at, updated_at
       ) VALUES (
         @type, @name, @company, @email, @phone, @category, @message, @page,
         @resumeFileName, @resumeFileSize, @resumeDataUrl, @userId,
         'new', @now, @now
       )`
    )
    .run({
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
      resumeDataUrl: data.resumeDataUrl || "",
      userId: data.userId || null,
      now,
    });
  return findById(info.lastInsertRowid);
}

function updateStatus(id, status) {
  const db = getDB();
  const info = db
    .prepare("UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, Date.now(), id);
  return info.changes > 0 ? findById(id) : null;
}

function deleteById(id) {
  const db = getDB();
  const info = db.prepare("DELETE FROM enquiries WHERE id = ?").run(id);
  return info.changes > 0;
}

function stats() {
  const db = getDB();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const total = db.prepare("SELECT COUNT(*) AS c FROM enquiries").get().c;
  const newCount = db.prepare("SELECT COUNT(*) AS c FROM enquiries WHERE status = 'new'").get().c;
  const thisWeek = db.prepare("SELECT COUNT(*) AS c FROM enquiries WHERE created_at >= ?").get(weekAgo).c;
  const careers = db.prepare("SELECT COUNT(*) AS c FROM enquiries WHERE type = 'career'").get().c;
  return { total, newCount, thisWeek, careers };
}

module.exports = { toPublicJSON, findAll, findById, create, updateStatus, deleteById, stats };
