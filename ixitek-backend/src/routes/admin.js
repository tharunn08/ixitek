// routes/admin.js — everything the admin dashboard needs beyond enquiries:
// the list of registered website users (customers who signed up from the
// login page) and teammate ("staff") account management.
//
// Every route here requires a signed-in owner or staff member.

const express = require("express");
const User = require("../models/User.js");
const Enquiry = require("../models/Enquiry.js");
const { requireAuth, requireRole } = require("../middleware/auth.js");
const { runBackup, listBackups } = require("../utils/backup.js");

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

router.use(requireAuth, requireRole("owner", "staff"));

// ── GET /api/admin/users — registered customers (sign-ups) ─────────────
router.get("/users", (req, res) => {
  const users = User.findAllByRole("customer");
  res.json({ users: users.map(User.toPublicJSON) });
});

// ── GET /api/admin/staff — teammates with admin-panel access ───────────
router.get("/staff", (req, res) => {
  const staff = User.findAllByRole("staff");
  res.json({ staff: staff.map(User.toPublicJSON) });
});

// ── POST /api/admin/staff — add a teammate (owner only) ─────────────────
router.post("/staff", requireRole("owner"), async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!name) return res.status(400).json({ error: "Enter a name." });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!password || password.length < 6) return res.status(400).json({ error: "At least 6 characters." });

    const existing = User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "A teammate (or user) with this email already has access." });
    }

    const staff = await User.create({ name, email, password, role: "staff", createdBy: req.user.id });
    res.status(201).json({ staff: User.toPublicJSON(staff) });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "A teammate (or user) with this email already has access." });
    }
    console.error("[admin/staff/create]", err);
    res.status(500).json({ error: "Could not add this teammate." });
  }
});

// ── DELETE /api/admin/staff/:id — remove a teammate (owner only) ───────
router.delete("/staff/:id", requireRole("owner"), (req, res) => {
  User.deleteById(req.params.id, "staff");
  res.json({ ok: true });
});

// ── GET /api/admin/stats — quick counters for the dashboard header ─────
router.get("/stats", (req, res) => {
  const enquiryStats = Enquiry.stats();
  const totalUsers = User.findAllByRole("customer").length;
  res.json({ ...enquiryStats, totalUsers });
});

// ── GET /api/admin/backups — list existing on-disk backups (owner only) ─
router.get("/backups", requireRole("owner"), (req, res) => {
  res.json({ backups: listBackups() });
});

// ── POST /api/admin/backups — trigger an on-demand backup (owner only) ──
router.post("/backups", requireRole("owner"), async (req, res) => {
  try {
    const backup = await runBackup();
    res.status(201).json({ backup });
  } catch (err) {
    console.error("[admin/backups/create]", err);
    res.status(500).json({ error: "Could not create a backup right now." });
  }
});

module.exports = router;
