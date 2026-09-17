// routes/enquiries.js — product enquiries (Contact form) + career
// applications (Career form). Submitting is public (any website visitor,
// signed in or not); reading/managing them is restricted to staff/owner
// and is what powers the admin dashboard.

const express = require("express");
const rateLimit = require("express-rate-limit");
const Enquiry = require("../models/Enquiry.js");
const { requireAuth, requireRole } = require("../middleware/auth.js");
const { optionalAuth } = require("../middleware/optionalAuth.js");

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions from this device. Please try again shortly." },
});

// ── POST /api/enquiries — public: contact/enquiry + career forms ───────
router.post("/", submitLimiter, optionalAuth, (req, res) => {
  try {
    const type = req.body.type === "career" ? "career" : "enquiry";
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();

    if (!name) return res.status(400).json({ error: "Please enter your name." });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

    const doc = Enquiry.create({
      type,
      name,
      company: (req.body.company || "").trim(),
      email,
      phone: (req.body.phone || "").trim(),
      category: (req.body.category || "").trim(),
      message: (req.body.message || "").trim(),
      page: (req.body.page || "").trim(),
      resumeFileName: (req.body.resumeFileName || "").trim(),
      resumeFileSize: Number(req.body.resumeFileSize) || 0,
      resumeDataUrl: req.body.resumeDataUrl || "",
      userId: req.user ? req.user.id : null,
    });
    return res.status(201).json({ record: Enquiry.toPublicJSON(doc) });
  } catch (err) {
    console.error("[enquiries/create]", err);
    return res.status(500).json({ error: "Could not save your submission. Please try again." });
  }
});

// Everything below is admin/staff-only.
router.use(requireAuth, requireRole("owner", "staff"));

// ── GET /api/enquiries — list (newest first) ────────────────────────────
router.get("/", (req, res) => {
  const docs = Enquiry.findAll();
  res.json({ records: docs.map(Enquiry.toPublicJSON) });
});

// ── PATCH /api/enquiries/:id — update status ────────────────────────────
router.patch("/:id", (req, res) => {
  const status = req.body.status;
  if (!status) return res.status(400).json({ error: "status is required." });
  const doc = Enquiry.updateStatus(req.params.id, status);
  if (!doc) return res.status(404).json({ error: "Not found." });
  res.json({ record: Enquiry.toPublicJSON(doc) });
});

// ── DELETE /api/enquiries/:id ────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  Enquiry.deleteById(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
