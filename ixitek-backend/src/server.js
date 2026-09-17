const path = require("path");

// Load ixitek-backend/.env regardless of the process's current working
// directory. This matters once the app is started from the repository
// root (e.g. Hostinger running `npm start` at the repo root, or the root
// package.json's own `start` script) — a bare `dotenv.config()` only ever
// looks at `process.cwd()`, which would silently miss this file. On
// Hostinger (and most Node.js hosts) real environment variables are
// injected directly into process.env by the platform, so this .env file
// is optional there; it's still loaded first for local/VPS use, and never
// overrides a variable the platform already set.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { connectDB, disconnectDB } = require("./db.js");
const { buildApp } = require("./app.js");
const { seedOwner } = require("./utils/seed.js");
const { scheduleBackups } = require("./utils/backup.js");

// Hostinger (and most Node.js hosts) assign the port at runtime via
// process.env.PORT and route the public domain to it — never hardcode a
// production port. The 5000 fallback only kicks in for local development
// when PORT isn't set.
const PORT = process.env.PORT || 5000;

async function start() {
  connectDB();
  await seedOwner().catch((err) => {
    console.error("[server] Could not seed the owner account:", err.message);
  });

  const backupTimer = scheduleBackups();

  const app = buildApp();
  const server = app.listen(PORT, () => {
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    console.log(`[server] Ixitek app (frontend + API) listening on port ${PORT} [${mode}]`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] Received ${signal}, shutting down gracefully...`);
    clearInterval(backupTimer);
    server.close(() => {
      // Close the database last, after the HTTP server has stopped taking
      // new requests, so nothing writes to it mid-shutdown.
      disconnectDB();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
