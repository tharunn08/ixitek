const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.js");
const enquiryRoutes = require("./routes/enquiries.js");
const adminRoutes = require("./routes/admin.js");

function buildApp() {
  const app = express();

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

  // 404
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Central error handler (e.g. CORS rejection, JSON parse errors, etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  });

  return app;
}

module.exports = { buildApp };
