require("dotenv").config();

const { connectDB, disconnectDB } = require("./db.js");
const { buildApp } = require("./app.js");
const { seedOwner } = require("./utils/seed.js");
const { scheduleBackups } = require("./utils/backup.js");

const PORT = process.env.PORT || 5000;

async function start() {
  connectDB();
  await seedOwner().catch((err) => {
    console.error("[server] Could not seed the owner account:", err.message);
  });

  const backupTimer = scheduleBackups();

  const app = buildApp();
  const server = app.listen(PORT, () => {
    console.log(`[server] Ixitek backend listening on http://localhost:${PORT}`);
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
