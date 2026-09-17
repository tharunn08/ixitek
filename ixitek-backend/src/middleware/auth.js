const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing tokens with `undefined`.
  console.error("[auth] JWT_SECRET is not set. Add it to your .env file before starting the server.");
  process.exit(1);
}

const JWT_EXPIRES_IN_SHORT = "8h";
const JWT_EXPIRES_IN_LONG = "30d";

function signToken(user, { remember = false } = {}) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: remember ? JWT_EXPIRES_IN_LONG : JWT_EXPIRES_IN_SHORT }
  );
}

/** Reads the Bearer token, verifies it, and attaches req.user (the DB row). */
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Sign in required." });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = User.findById(payload.sub);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

/** Use after requireAuth. Restricts a route to one or more roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, JWT_SECRET };
