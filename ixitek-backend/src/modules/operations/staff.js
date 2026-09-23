// staff.js — validate that an id belongs to an active staff member (for assignments).
const { one } = require("../../core/db.js");
const { badRequest } = require("../../core/errors.js");

async function assertStaff(id, conn = null) {
  if (id === null || id === undefined || id === "") return null;
  const u = await one("SELECT u.id FROM users u JOIN roles r ON r.code = u.role WHERE u.id = :id AND r.is_staff = 1 AND u.status = 'active' AND u.deleted_at IS NULL", { id }, conn);
  if (!u) throw badRequest("Assign to an active team member.");
  return u.id;
}
module.exports = { assertStaff };
