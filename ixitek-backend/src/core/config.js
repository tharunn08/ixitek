// config.js — every environment variable the backend reads, in one place.
// Nothing secret is hard-coded; production refuses to start with unsafe
// defaults (see assertProductionSafe).
const path = require("path");

// Load ixitek-backend/.env (never overrides variables the host already set).
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

function int(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}
function bool(v, d = false) {
  if (v === undefined || v === "") return d;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const backendRoot = path.join(__dirname, "..", "..");

const config = {
  isProd,
  isTest,
  port: int(env.PORT, 5000),
  corsOrigins: (env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY !== undefined ? env.TRUST_PROXY : isProd ? "1" : "0",

  db: {
    host: env.DB_HOST || "127.0.0.1",
    port: int(env.DB_PORT, 3306),
    user: env.DB_USER || "",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "",
    connectionLimit: int(env.DB_POOL_SIZE, 10),
    ssl: bool(env.DB_SSL)
  ? {
      rejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, true),
      ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {}),
    }
  : undefined,
    slowQueryMs: int(env.DB_SLOW_QUERY_MS, 500),
  },

  // Legacy SQLite file — only read by the one-time migration script.
  legacySqlitePath: env.LEGACY_SQLITE_PATH
    ? path.resolve(backendRoot, env.LEGACY_SQLITE_PATH)
    : env.DB_PATH
      ? path.resolve(backendRoot, env.DB_PATH)
      : path.join(backendRoot, "data", "ixitek.db"),

  auth: {
    jwtSecret: env.JWT_SECRET || "",
    cookieName: env.AUTH_COOKIE_NAME || "ixitek_session",
    csrfCookieName: "ixitek_csrf",
    cookieSecure: env.COOKIE_SECURE !== undefined ? bool(env.COOKIE_SECURE) : isProd,
    shortTtl: env.JWT_TTL_SHORT || "8h",
    longTtl: env.JWT_TTL_LONG || "30d",
    maxFailedLogins: int(env.AUTH_MAX_FAILED_LOGINS, 8),
    lockMinutes: int(env.AUTH_LOCK_MINUTES, 15),
  },

  owner: {
    name: env.OWNER_NAME || "Ixitek Admin",
    email: (env.OWNER_EMAIL || "").trim().toLowerCase(),
    password: env.OWNER_PASSWORD || "",
  },

  storage: {
    driver: env.STORAGE_DRIVER || "local",
    localDir: env.STORAGE_DIR ? path.resolve(backendRoot, env.STORAGE_DIR) : path.join(backendRoot, "data", "storage"),
  },

  backups: {
    dir: env.BACKUP_DIR ? path.resolve(backendRoot, env.BACKUP_DIR) : path.join(backendRoot, "data", "backups"),
    intervalHours: int(env.BACKUP_INTERVAL_HOURS, 6),
    retention: int(env.BACKUP_RETENTION, 30),
    // Tiered retention (daily / weekly / monthly / interval / other such as manual & pre-migration).
    keep: { daily: int(env.BACKUP_KEEP_DAILY, 7), weekly: int(env.BACKUP_KEEP_WEEKLY, 5), monthly: int(env.BACKUP_KEEP_MONTHLY, 12), interval: int(env.BACKUP_KEEP_INTERVAL, 8), other: int(env.BACKUP_KEEP_OTHER, 10) },
    restoreTestDb: env.BACKUP_RESTORE_TEST_DB || "",
    preMigration: env.PRE_MIGRATION_BACKUP !== "false",
  },

  jobs: {
    enabled: env.JOBS_ENABLED !== undefined ? bool(env.JOBS_ENABLED) : !isTest,
    pollMs: int(env.JOBS_POLL_MS, 2000),
  },

  uploads: {
    maxImportBytes: int(env.MAX_IMPORT_MB, 15) * 1024 * 1024,
  },

  imageCheck: {
    timeoutMs: int(env.IMAGE_CHECK_TIMEOUT_MS, 8000),
  },
};

function assertProductionSafe() {
  const problems = [];
  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32 || config.auth.jwtSecret.startsWith("replace-this")) {
    problems.push("JWT_SECRET must be set to a random string of at least 32 characters.");
  }
  if (!config.db.user || !config.db.database) problems.push("DB_USER and DB_NAME (MySQL) must be set.");
  if (isProd && config.owner.password && config.owner.password === "Ixitek@2026") {
    problems.push("OWNER_PASSWORD is still the published default. Set a new one.");
  }
  if (isProd && config.corsOrigins.includes("*")) problems.push("CORS_ORIGIN must not be '*'.");
  if (isProd && !/^https:\/\//.test(env.PUBLIC_SITE_URL || "")) problems.push("PUBLIC_SITE_URL must be set to the https:// address of the site (used in emails, sitemap and canonical links).");
  if (isProd && env.RAZORPAY_KEY_ID && !env.RAZORPAY_WEBHOOK_SECRET) problems.push("RAZORPAY_WEBHOOK_SECRET must be set when Razorpay keys are configured (webhooks confirm payments if the browser closes).");
  if (isProd && String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") && !String(env.RAZORPAY_KEY_SECRET || "")) problems.push("RAZORPAY_KEY_SECRET is missing.");
  if (isProd && (env.EMAIL_PROVIDER || "none") === "log") problems.push("EMAIL_PROVIDER=log only prints emails; use smtp, resend, sendgrid or none in production.");
  return problems;
}

/** Non-fatal production warnings (logged at start-up and visible in Admin → Monitoring). */
function productionWarnings() {
  const w = [];
  if (!isProd) return w;
  if (!env.EMAIL_PROVIDER || env.EMAIL_PROVIDER === "none") w.push("No email provider configured — customers will not receive order, invoice or quote emails.");
  if (!env.RAZORPAY_KEY_ID) w.push("Razorpay is not configured — online payment is hidden; bank transfer and RFQ remain available.");
  if (!env.BACKUP_DIR) w.push("BACKUP_DIR is not set — backups are stored inside the app folder and could be lost on redeploy.");
  if (!env.STORAGE_DIR) w.push("STORAGE_DIR is not set — uploads are stored inside the app folder and could be lost on redeploy.");
  if (!env.BACKUP_RESTORE_TEST_DB) w.push("BACKUP_RESTORE_TEST_DB is not set — automated restore tests are disabled.");
  return w;
}

module.exports = { config, assertProductionSafe, productionWarnings, backendRoot };
