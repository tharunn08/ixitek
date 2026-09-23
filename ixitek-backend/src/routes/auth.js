// /api/auth — register, login, logout, me. Response shapes match the
// previous SQLite version ({ user }) plus `csrfToken` and `permissions`.
const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User.js");
const { issueSession, clearSession, requireAuth } = require("../middleware/auth.js");
const { permissionsFor } = require("../core/rbac.js");
const { config } = require("../core/config.js");
const audit = require("../core/audit.js");
const { ah, badRequest, conflict, unauthorized, AppError } = require("../core/errors.js");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
});
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

function validatePassword(pw) {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

async function sessionPayload(res, user, remember) {
  const { csrf } = issueSession(res, user, { remember });
  const permissions = [...(await permissionsFor(user.role))].sort();
  return { user: User.toPublicJSON(user), permissions, csrfToken: csrf };
}

router.post(
  "/register",
  registerLimiter,
  ah(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const company = String(req.body.company || "").trim();
    const password = String(req.body.password || "");

    if (!name) throw badRequest("Please enter your name.");
    if (!email || !EMAIL_RE.test(email) || email.length > 254) throw badRequest("Enter a valid email address.");
    const pwErr = validatePassword(password);
    if (pwErr) throw badRequest(pwErr);
    if (await User.findByEmail(email)) throw conflict("An account with this email already exists. Try signing in instead.");

    let user;
    try {
      user = await User.create({ name, email, phone, company, password, role: "customer" });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw conflict("An account with this email already exists. Try signing in instead.");
      throw err;
    }
    await audit.record({ req, actorId: user.id, actorEmail: user.email, action: "user.register", entityType: "user", entityId: user.id });
    res.status(201).json(await sessionPayload(res, user, true));
  })
);

router.post(
  "/login",
  loginLimiter,
  ah(async (req, res) => {
    const identifier = String(req.body.identifier ?? req.body.email ?? req.body.username ?? "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const remember = Boolean(req.body.remember);
    if (!identifier || !password) throw badRequest("Enter your email/username and password.");

    const generic = unauthorized("The email/username or password you entered is incorrect.");
    const user = await User.findByEmail(identifier);
    if (!user || user.status !== "active") throw generic;
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError(423, "LOCKED", `Too many failed attempts. Try again in about ${config.auth.lockMinutes} minutes.`);
    }
    if (!(await User.comparePassword(password, user.password_hash))) {
      await User.recordFailedLogin(user.id, config.auth.maxFailedLogins, config.auth.lockMinutes);
      await audit.record({ req, actorId: null, actorEmail: identifier, action: "auth.login_failed", entityType: "user", entityId: user.id });
      throw generic;
    }
    await User.recordLogin(user.id, req.ip);
    const fresh = await User.findById(user.id);
    res.json(await sessionPayload(res, fresh, remember));
  })
);

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const permissions = [...(await permissionsFor(req.user.role))].sort();
    res.json({ user: User.toPublicJSON(req.user), permissions });
  })
);

module.exports = router;
