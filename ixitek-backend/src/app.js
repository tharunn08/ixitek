// app.js — builds the Express app (no listening; server.js does that, tests
// use it directly). One Node process serves the API under /api/* and the
// built React frontend for every other path (Hostinger one-app deployment).
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const { config } = require("./core/config.js");
const requestId = require("./core/requestId.js");
const { errorHandler, notFound } = require("./core/errors.js");
const db = require("./core/db.js");

const authRoutes = require("./routes/auth.js");
const enquiryRoutes = require("./routes/enquiries.js");
const adminRoutes = require("./routes/admin.js");
const catalogPublic = require("./modules/catalog/publicRoutes.js");
const catalogAdmin = require("./modules/catalog/adminRoutes.js");
const importRoutes = require("./modules/import/routes.js");
const pricingRoutes = require("./modules/pricing/routes.js");
const inventoryRoutes = require("./modules/inventory/routes.js");
const intlPublic = require("./modules/intl/publicRoutes.js").router;
const intlAdmin = require("./modules/intl/adminRoutes.js");
const shopRoutes = require("./modules/commerce/publicRoutes.js");
const commerceAdmin = require("./modules/commerce/adminRoutes.js");
const payments = require("./modules/payments/routes.js");
const ops = require("./modules/operations/routes.js");
const companies = require("./modules/operations/companies.js");
const crm = require("./modules/operations/crm.js");
const procurement = require("./modules/operations/procurement.js");
const monitoringRoutes = require("./modules/monitoring/routes.js");
const seo = require("./modules/seo/seo.js");
const images = require("./modules/media/imageRoutes.js");
const compression = require("compression");
require("./modules/notifications/handlers.js"); // event → email/document handlers (run in the job worker)
require("./utils/restore.js"); // registers the backup.restore_test job

const FRONTEND_DIST_PATH = process.env.FRONTEND_DIST_PATH
  ? path.resolve(__dirname, "..", process.env.FRONTEND_DIST_PATH)
  : path.join(__dirname, "..", "..", "ixitek-frontend", "dist");

function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  // Behind Hostinger's proxy: needed for correct client IPs (rate limits, audit).
  app.set("trust proxy", /^\d+$/.test(String(config.trustProxy)) ? Number(config.trustProxy) : config.trustProxy);

  app.use(requestId);
  // gzip/deflate for HTML, JSON, JS and CSS (PDF downloads and images are already compressed).
  app.use(compression({ threshold: 1024, filter: (req, res) => !/^(application\/pdf|image\/)/.test(String(res.getHeader("Content-Type") || "")) && compression.filter(req, res) }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "script-src": ["'self'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com"],
          "connect-src": ["'self'", "https://api.emailjs.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
          "frame-src": ["'self'", "https://dunsregistered.dnb.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
          "upgrade-insecure-requests": config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  // CORS applies to the API only. Same-origin requests (the site calling its
  // own /api) are always allowed; other origins must be listed in CORS_ORIGIN.
  // Static assets are never CORS-blocked (browsers send Origin on module scripts).
  app.use(
    "/api",
    cors((req, cb) => {
      const origin = req.get("origin");
      const self = `${req.protocol}://${req.get("host")}`;
      if (!origin || origin === self || config.corsOrigins.includes(origin)) return cb(null, { origin: true, credentials: true });
      return cb(new Error("Not allowed by CORS"));
    })
  );
  // Webhooks need the raw body for HMAC verification → mounted before the JSON parser.
  app.use("/api/webhooks", payments.webhookRouter);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  morgan.token("id", (req) => req.id);
  app.use(morgan(config.isProd ? ':id :remote-addr ":method :url" :status :res[content-length] - :response-time ms' : "dev", { skip: () => config.isTest }));

  app.get("/api/health", async (req, res) => {
    let dbOk = false;
    try {
      dbOk = await db.ping();
    } catch {
      dbOk = false;
    }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, service: "ixitek-backend", db: dbOk ? "up" : "down", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/catalog", catalogPublic);
  app.use("/api/img", images.router);
  app.use("/api/intl", intlPublic);
  app.use("/api/admin/intl", intlAdmin);
  app.use("/api/shop", shopRoutes);
  app.use("/api/admin/commerce", commerceAdmin);
  app.use("/api/pay", payments.publicRouter);
  app.use("/api/admin/finance", payments.adminRouter);
  app.use("/api/account/company", companies.account);
  app.use("/api/account", ops.account);
  app.use("/api/support", ops.support);
  app.use("/api/admin/shipping", ops.shipping);
  app.use("/api/admin/returns", ops.returns);
  app.use("/api/admin/tickets", ops.tickets);
  app.use("/api/admin/companies", companies.admin);
  app.use("/api/admin/crm", crm.router);
  app.use("/api/admin/procurement", procurement.router);
  app.use("/api/admin/monitoring", monitoringRoutes);
  app.use("/api/admin/catalog/imports", importRoutes);
  app.use("/api/admin/catalog", catalogAdmin);
  app.use("/api/admin/pricing", pricingRoutes);
  app.use("/api/admin/inventory", inventoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", (req, res, next) => next(notFound("API route not found.")));
  app.use(seo.router); // /robots.txt, /sitemap.xml

  if (fs.existsSync(FRONTEND_DIST_PATH)) {
    // Hashed build assets are immutable → cache for a year; index.html never cached.
    app.use("/assets", express.static(path.join(FRONTEND_DIST_PATH, "assets"), { immutable: true, maxAge: "365d", index: false }));
    app.use(express.static(FRONTEND_DIST_PATH, { index: false, maxAge: "1h" }));
    // SPA shell with route-specific <head> (title, description, canonical, OG/Twitter, JSON-LD).
    app.get(/^\/(?!api\/).*/, seo.spaHandler(FRONTEND_DIST_PATH));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp, FRONTEND_DIST_PATH };
