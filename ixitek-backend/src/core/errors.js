// errors.js — typed application errors + the single Express error handler.
// Production responses never include stack traces, SQL or internal messages.
const log = require("./logger.js");

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

const badRequest = (message, details) => new AppError(400, "BAD_REQUEST", message, details);
const validation = (details, message = "Please correct the highlighted fields.") => new AppError(422, "VALIDATION_FAILED", message, details);
const unauthorized = (message = "Sign in required.") => new AppError(401, "UNAUTHORIZED", message);
const forbidden = (message = "You do not have permission to do that.") => new AppError(403, "FORBIDDEN", message);
const notFound = (message = "Not found.") => new AppError(404, "NOT_FOUND", message);
const conflict = (message, details) => new AppError(409, "CONFLICT", message, details);

/** Wrap an async route handler so rejections reach the error handler. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const requestId = req.id;
  if (err && err.type === "entity.too.large") err = new AppError(413, "PAYLOAD_TOO_LARGE", "That upload is too large.");
  if (err && err.code === "LIMIT_FILE_SIZE") err = new AppError(413, "PAYLOAD_TOO_LARGE", "That file is too large.");
  if (err && err.message === "Not allowed by CORS") err = new AppError(403, "CORS", "Origin not allowed.");
  if (err && err.type === "entity.parse.failed") err = badRequest("Request body is not valid JSON.");

  if (err instanceof AppError) {
    if (err.status >= 500) log.error("app error", { requestId, err });
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details, requestId });
  }

  // Unexpected: log everything server-side, reveal nothing client-side.
  log.error("unhandled error", { requestId, method: req.method, path: req.originalUrl, err });
  require("./monitor.js").event(err && err.code && String(err.code).startsWith("ER_") ? "db_error" : "http_500", `${req.method} ${req.originalUrl.split("?")[0]}: ${err && err.message}`, { requestId });
  res.status(500).json({ error: "Something went wrong on our side. Please try again.", code: "INTERNAL", requestId });
}

module.exports = { AppError, badRequest, validation, unauthorized, forbidden, notFound, conflict, ah, errorHandler };
