// logger.js — structured (JSON-lines in production) logging with redaction.
// Never logs passwords, tokens, card data or secrets: any key matching
// REDACT_RE is replaced before output.
const REDACT_RE = /pass(word)?|secret|token|authorization|cookie|card|cvv|api[-_]?key/i;
const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

function redact(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 5) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code, stack: isProd ? undefined : value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT_RE.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

function write(level, msg, meta) {
  if (isTest && level !== "error" && !process.env.LOG_IN_TESTS) return;
  const entry = { t: new Date().toISOString(), level, msg, ...(meta ? redact(meta) : {}) };
  const line = isProd ? JSON.stringify(entry) : `[${entry.t}] ${level.toUpperCase()} ${msg}${meta ? " " + JSON.stringify(redact(meta)) : ""}`;
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

module.exports = {
  info: (m, meta) => write("info", m, meta),
  warn: (m, meta) => write("warn", m, meta),
  error: (m, meta) => write("error", m, meta),
  debug: (m, meta) => (process.env.LOG_LEVEL === "debug" ? write("debug", m, meta) : undefined),
  redact,
};
