const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.js");
const enquiryRoutes = require("./routes/enquiries.js");
const adminRoutes = require("./routes/admin.js");

// Where the built React/Vite frontend lives once `npm run build` has been
// run (see ixitek-frontend/vite.config.js — default output dir is `dist`).
// This backend serves it directly so the whole site — frontend + API —
// runs from ONE Node.js process / ONE origin (e.g. https://ixitek.com),
// with no separate API subdomain. Overridable via FRONTEND_DIST_PATH for
// unusual deployment layouts; defaults to the sibling ixitek-frontend/dist.
const FRONTEND_DIST_PATH = process.env.FRONTEND_DIST_PATH
  ? path.resolve(__dirname, "..", process.env.FRONTEND_DIST_PATH)
  : path.join(__dirname, "..", "..", "ixitek-frontend", "dist");

function buildApp() {
  const app = express();

  // In production the frontend and backend are served from the SAME
  // origin, so the browser never sends a cross-origin request at all and
  // this allowlist mostly matters for local dev (Vite's dev server on a
  // different port) or if the site is ever reached from an extra origin
  // (e.g. a www. alias). Keep localhost for local development; add the
  // real production domain(s) via CORS_ORIGIN in .env — never "*" here,
  // since requests are sent with credentials (the Bearer token).
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server calls (no Origin header) and
        // any explicitly allow-listed frontend origin.
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" })); // resumes are sent as base64 data URLs
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "ixitek-backend", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/admin", adminRoutes);

  // Unmatched /api/* routes get a clean 404 instead of falling through to
  // the SPA fallback below — API paths never resolve to index.html.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Serve the built React/Vite frontend (ixitek-frontend/dist) and hand
  // every non-API GET request to index.html so React Router can handle
  // client-side routes (/, /company, /products, /sap, /admin, etc.)
  // without a 404 on direct load or refresh. Everything above this point
  // (health check, /api/auth, /api/enquiries, /api/admin, the /api 404)
  // is matched first, so API routes are never intercepted.
  if (fs.existsSync(FRONTEND_DIST_PATH)) {
    app.use(
      express.static(FRONTEND_DIST_PATH, {
        index: false, // let the catch-all below send index.html, with no caching, for every route
      })
    );
    app.get(/^\/(?!api\/).*/, (req, res) => {
      res.sendFile(path.join(FRONTEND_DIST_PATH, "index.html"));
    });
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      `[app] Frontend build not found at ${FRONTEND_DIST_PATH} — ` +
        "run `npm run build` (see root package.json) before starting the server in production."
    );
  }

  // Central error handler (e.g. CORS rejection, JSON parse errors, etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  });

  return app;
}

module.exports = { buildApp, FRONTEND_DIST_PATH };
