// /api/admin — users, team (staff) with roles, stats, backups, audit log.
const express = require("express");
const User = require("../models/User.js");
const Enquiry = require("../models/Enquiry.js");
const { requireAuth } = require("../middleware/auth.js");
const { requirePermission, invalidate } = require("../core/rbac.js");
const { query, one } = require("../core/db.js");
const audit = require("../core/audit.js");
const { runBackup, listBackups } = require("../utils/backup.js");
const { ah, badRequest, conflict, notFound, forbidden } = require("../core/errors.js");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(requireAuth, requirePermission("admin.access"));

router.get(
  "/users",
  requirePermission("users.read"),
  ah(async (req, res) => {
    const users = await User.findAllByRole("customer");
    res.json({ users: users.map(User.toPublicJSON) });
  })
);

router.get(
  "/roles",
  ah(async (req, res) => {
    const roles = await query("SELECT code, name, description, is_staff FROM roles ORDER BY sort_order");
    res.json({ roles: roles.map((r) => ({ code: r.code, name: r.name, description: r.description, isStaff: Boolean(r.is_staff) })) });
  })
);

router.get(
  "/staff",
  requirePermission("users.read"),
  ah(async (req, res) => {
    const staff = await User.findStaff();
    res.json({ staff: staff.map(User.toPublicJSON) });
  })
);

router.post(
  "/staff",
  requirePermission("staff.manage"),
  ah(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "staff");
    if (!name) throw badRequest("Enter a name.");
    if (!email || !EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");
    if (password.length < 8) throw badRequest("Password must be at least 8 characters.");
    const roleRow = await one("SELECT code, is_staff FROM roles WHERE code = :role", { role });
    if (!roleRow || !Number(roleRow.is_staff) || role === "owner") throw badRequest("Choose a valid team role.");
    if (await User.findByEmail(email)) throw conflict("A teammate (or user) with this email already has access.");
    const staff = await User.create({ name, email, password, role, createdBy: req.user.id });
    await audit.record({ req, action: "staff.create", entityType: "user", entityId: staff.id, after: { email, role } });
    res.status(201).json({ staff: User.toPublicJSON(staff) });
  })
);

router.patch(
  "/staff/:id/role",
  requirePermission("staff.manage"),
  ah(async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) throw notFound();
    if (target.role === "owner") throw forbidden("The owner's role cannot be changed here.");
    const role = String(req.body.role || "");
    const roleRow = await one("SELECT is_staff FROM roles WHERE code = :role", { role });
    if (!roleRow || role === "owner") throw badRequest("Choose a valid role.");
    await User.setRole(target.id, role);
    invalidate();
    await audit.record({ req, action: "staff.role", entityType: "user", entityId: target.id, before: { role: target.role }, after: { role }, reason: req.body.reason });
    res.json({ staff: User.toPublicJSON(await User.findById(target.id)) });
  })
);

router.delete(
  "/staff/:id",
  requirePermission("staff.manage"),
  ah(async (req, res) => {
    const target = await User.findById(req.params.id);
    if (target && target.role !== "owner" && target.role !== "customer") {
      await User.softDelete(target.id);
      await audit.record({ req, action: "staff.remove", entityType: "user", entityId: target.id, before: { email: target.email, role: target.role } });
    }
    res.json({ ok: true });
  })
);

router.get(
  "/stats",
  ah(async (req, res) => {
    const [enquiryStats, totalUsers, products, lowStock] = await Promise.all([
      Enquiry.stats(),
      User.countByRole("customer"),
      one("SELECT COUNT(*) AS c FROM products WHERE deleted_at IS NULL"),
      one(`SELECT COUNT(*) AS c FROM inventory_levels WHERE reorder_point IS NOT NULL AND on_hand - reserved <= reorder_point`),
    ]);
    res.json({ ...enquiryStats, totalUsers, products: Number(products.c), lowStock: Number(lowStock.c) });
  })
);

router.get(
  "/audit",
  requirePermission("audit.read"),
  ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = [];
    const p = {};
    if (req.query.entityType) (where.push("entity_type = :et"), (p.et = String(req.query.entityType)));
    if (req.query.entityId) (where.push("entity_id = :eid"), (p.eid = String(req.query.entityId)));
    if (req.query.action) (where.push("action LIKE :ac"), (p.ac = `${String(req.query.action)}%`));
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query(
      `SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, before_json, after_json, reason, ip, created_at
         FROM audit_logs ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
      p
    );
    const total = await one(`SELECT COUNT(*) AS c FROM audit_logs ${w}`, p);
    const j = (v) => (typeof v === "string" ? JSON.parse(v) : v);
    res.json({
      total: Number(total.c),
      entries: rows.map((r) => ({
        id: String(r.id), actorId: r.actor_user_id ? String(r.actor_user_id) : null, actorEmail: r.actor_email, action: r.action,
        entityType: r.entity_type, entityId: r.entity_id, before: j(r.before_json), after: j(r.after_json), reason: r.reason, ip: r.ip,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    });
  })
);

router.get("/backups", requirePermission("backups.manage"), (req, res) => res.json({ backups: listBackups() }));

router.post(
  "/backups",
  requirePermission("backups.manage"),
  ah(async (req, res) => {
    const backup = await runBackup({ label: "admin" });
    await audit.record({ req, action: "backup.create", entityType: "backup", entityId: backup.fileName });
    res.status(201).json({ backup });
  })
);

module.exports = router;
