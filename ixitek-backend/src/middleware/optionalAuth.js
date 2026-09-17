// optionalAuth — like requireAuth, but never blocks the request. Used on
// public endpoints (e.g. submitting an enquiry) where we want to tag the
// record with the signed-in customer when there is one, without forcing
// everyone to be logged in just to fill out the contact form.

const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = User.findById(payload.sub);
    if (user && user.status === "active") req.user = user;
  } catch {
    // Invalid/expired token on a public route — just proceed unauthenticated.
  }
  next();
}

module.exports = { optionalAuth };
