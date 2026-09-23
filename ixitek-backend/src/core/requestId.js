const crypto = require("crypto");
/** Attaches req.id (from X-Request-Id if sane, else random) and echoes it back. */
module.exports = function requestId(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  next();
};
