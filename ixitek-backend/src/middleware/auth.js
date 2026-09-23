// auth.js — sessions.
//
// The session JWT travels in an httpOnly, SameSite=Lax cookie (not readable
// by page JavaScript, so an XSS bug cannot steal it). A Bearer header is
// still accepted for API clients/scripts. Cookie-authenticated writes must
// carry X-CSRF-Token matching the `ixitek_csrf` cookie (double-submit).
// The user row — and therefore the role — is re-read from MySQL on every
// request; a role claimed by the client is never trusted.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");
const { config } = require("../core/config.js");
const { unauthorized, forbidden } = require("../core/errors.js");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function secret() {
  if (!config.auth.jwtSecret) throw new Error("JWT_SECRET is not set.");
  return config.auth.jwtSecret;
}

function signToken(user, { remember = false } = {}) {
  return jwt.sign({ sub: String(user.id), role: user.role }, secret(), {
    expiresIn: remember ? config.auth.longTtl : config.auth.shortTtl,
  });
}

function cookieOpts(remember) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}),
  };
}

/** Sets the session + CSRF cookies. Returns the CSRF token for the client. */
function issueSession(res, user, { remember = false } = {}) {
  const token = signToken(user, { remember });
  const csrf = crypto.randomBytes(24).toString("hex");
  res.cookie(config.auth.cookieName, token, cookieOpts(remember));
  res.cookie(config.auth.csrfCookieName, csrf, { ...cookieOpts(remember), httpOnly: false });
  return { token, csrf };
}

function clearSession(res) {
  res.clearCookie(config.auth.cookieName, { path: "/" });
  res.clearCookie(config.auth.csrfCookieName, { path: "/" });
}

/** Returns { token, via } from Bearer header or cookie. */
function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return { token: header.slice(7), via: "bearer" };
  const c = req.cookies && req.cookies[config.auth.cookieName];
  return c ? { token: c, via: "cookie" } : { token: null, via: null };
}

function csrfOk(req) {
  if (SAFE_METHODS.has(req.method)) return true;
  const cookie = req.cookies && req.cookies[config.auth.csrfCookieName];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || cookie.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
}

async function resolveUser(req) {
  const { token, via } = readToken(req);
  if (!token) return { user: null, reason: "none" };
  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return { user: null, reason: "expired" };
  }
  if (via === "cookie" && !csrfOk(req)) return { user: null, reason: "csrf" };
  const user = await User.findById(payload.sub);
  if (!user || user.status !== "active") return { user: null, reason: "invalid" };
  return { user, reason: null };
}

async function requireAuth(req, res, next) {
  try {
    const { user, reason } = await resolveUser(req);
    if (!user) {
      if (reason === "csrf") return next(forbidden("Security check failed. Please refresh the page and try again."));
      if (reason === "none") return next(unauthorized("Sign in required."));
      return next(unauthorized("Your session has expired. Please sign in again."));
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid session exists; never rejects. */
async function optionalAuth(req, res, next) {
  try {
    const { user } = await resolveUser(req);
    if (user) req.user = user;
  } catch {
    /* anonymous */
  }
  next();
}

/** Legacy role guard (kept for compatibility); prefer rbac.requirePermission. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

module.exports = { signToken, issueSession, clearSession, requireAuth, optionalAuth, requireRole };
