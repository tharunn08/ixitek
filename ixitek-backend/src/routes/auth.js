// routes/auth.js — the single login page on the frontend talks to these
// two endpoints: POST /register (Create account — customers only) and
// POST /login (Sign in — works for customers, staff and the owner/admin;
// the frontend redirects based on the `role` returned in the response).

const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User.js");
const { signToken, requireAuth } = require("../middleware/auth.js");

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

// ── POST /api/auth/register — create a customer account ────────────────
router.post("/register", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const phone = (req.body.phone || "").trim();
    const company = (req.body.company || "").trim();
    const password = req.body.password || "";

    if (!name) return res.status(400).json({ error: "Please enter your name." });
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Try signing in instead." });
    }

    const user = await User.create({ name, email, phone, company, password, role: "customer" });

    const token = signToken(user, { remember: true });
    return res.status(201).json({ token, user: User.toPublicJSON(user) });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "An account with this email already exists. Try signing in instead." });
    }
    console.error("[auth/register]", err);
    return res.status(500).json({ error: "Could not create your account right now. Please try again." });
  }
});

// ── POST /api/auth/login — sign in as customer, staff or owner ─────────
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const identifier = (req.body.identifier ?? req.body.email ?? req.body.username ?? "").trim().toLowerCase();
    const password = req.body.password || "";
    const remember = Boolean(req.body.remember);

    if (!identifier || !password) {
      return res.status(400).json({ error: "Enter your email/username and password." });
    }

    const user = User.findByEmail(identifier);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "The email/username or password you entered is incorrect." });
    }

    const ok = await User.comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "The email/username or password you entered is incorrect." });
    }

    User.recordLogin(user.id, req.ip);
    const refreshed = User.findById(user.id);

    const token = signToken(refreshed, { remember });
    return res.json({ token, user: User.toPublicJSON(refreshed) });
  } catch (err) {
    console.error("[auth/login]", err);
    return res.status(500).json({ error: "Sign-in failed. Please try again." });
  }
});

// ── GET /api/auth/me — current session's user ───────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: User.toPublicJSON(req.user) });
});

module.exports = router;
