// server.js — process entry point (`npm start`).
// Order: validate config → migrate schema → seed owner → start jobs &
// backups → listen. Shuts down gracefully on SIGINT/SIGTERM.
const { config, assertProductionSafe } = require("./core/config.js");
const log = require("./core/logger.js");
const db = require("./core/db.js");
const { migrate } = require("./core/migrate.js");
const jobs = require("./core/jobs.js");
const { buildApp } = require("./app.js");
const { seedOwner } = require("./utils/seed.js");
const { scheduleBackups } = require("./utils/backup.js");

async function start() {
  const problems = assertProductionSafe();
  if (problems.length) {
    for (const p of problems) log.error(`[config] ${p}`);
    if (config.isProd) process.exit(1);
  }
  for (const w of require("./core/config.js").productionWarnings()) log.warn(`[config] ${w}`);

  if (process.env.AUTO_MIGRATE !== "false") await migrate();
  await db.ping();
  await require("./modules/commerce/orderService.js").refreshTables();
  await seedOwner().catch((err) => log.error("[server] could not seed the owner account", { err }));

  jobs.start();
  require("./modules/intl/fxService.js").schedule();
  if (process.env.JOBS_ENABLED !== "false") {
    const scheduler = require("./core/scheduler.js");
    scheduler.every("quotes.expiry", { periodHours: 24 });
    scheduler.every("payments.reconcile", { periodHours: 0.25, checkMinutes: 5 });
    // Weekly proof that backups restore (only when a scratch database is configured).
    if (config.backups.restoreTestDb) scheduler.every("backup.restore_test", { periodHours: 24 * 7, checkMinutes: 60 });
  }
  process.on("unhandledRejection", (err) => require("./core/monitor.js").event("http_500", `Unhandled rejection: ${err && err.message}`, {}));
  const backupTimer = process.env.BACKUPS_ENABLED === "false" ? null : scheduleBackups();

  const app = buildApp();
  const server = app.listen(config.port, () => {
    log.info(`[server] IXITEK app (frontend + API) listening on port ${config.port} [${config.isProd ? "production" : "development"}]`);
  });

  const shutdown = (signal) => {
    log.info(`[server] ${signal} received, shutting down gracefully`);
    jobs.stop();
    if (backupTimer) clearInterval(backupTimer);
    require("./core/scheduler.js").stopAll();
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (err) => log.error("unhandledRejection", { err }));

start().catch((err) => {
  log.error("[server] fatal startup error", { err });
  process.exit(1);
});
