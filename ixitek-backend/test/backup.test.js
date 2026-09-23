// Backups: create → verify → restore into a scratch database → compare. Also
// checks that JSON columns (settings) and DECIMAL money survive exactly.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ixitek-bk-"));
process.env.BACKUP_RESTORE_TEST_DB = process.env.DB_NAME_RESTORE_TEST || "ixitek_restore_test";
const { db, resetDb, createTestProduct } = require("./helpers.js");
const settings = require("../src/core/settings.js");
const mysql = require("mysql2/promise");

const connOpts = (database) => ({ host: process.env.DB_HOST || "127.0.0.1", port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, decimalNumbers: false });
let restoreDbReachable = true;
before(async () => {
  await resetDb();
  await createTestProduct({ sku: "T-BK-1", exw: "12.3456", weightKg: "0.25", margin: 30 });
  await settings.set("seller.legal_name", "Test Legal Name — “quotes” & 'apostrophes'\nline two");
  try {
    const c = await mysql.createConnection(connOpts(process.env.BACKUP_RESTORE_TEST_DB));
    await c.end();
  } catch {
    restoreDbReachable = false;
  }
});
after(async () => {
  fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
  await db.close();
});

test("backup is verified, tampering is detected, and a restore reproduces every table", async (t) => {
  const { runBackup, verifyBackup } = require("../src/utils/backup.js");
  const b = await runBackup({ label: "manual" });
  assert.equal(b.verified, true);
  const copy = b.path.replace(".sql.gz", "-copy.sql.gz");
  fs.copyFileSync(b.path, copy);
  fs.copyFileSync(b.path.replace(".sql.gz", ".manifest.json"), copy.replace(".sql.gz", ".manifest.json"));
  fs.appendFileSync(copy, Buffer.from("garbage"));
  assert.equal((await verifyBackup(copy)).ok, false, "tampered backup must fail verification");
  fs.rmSync(copy);
  fs.rmSync(copy.replace(".sql.gz", ".manifest.json"));

  if (!restoreDbReachable) return t.skip(`restore database ${process.env.BACKUP_RESTORE_TEST_DB} not reachable`);
  const { restore } = require("../src/utils/restore.js");
  await restore(b.path, process.env.BACKUP_RESTORE_TEST_DB);
  const c = await mysql.createConnection(connOpts(process.env.BACKUP_RESTORE_TEST_DB));
  try {
    const manifest = JSON.parse(fs.readFileSync(b.path.replace(".sql.gz", ".manifest.json"), "utf8"));
    for (const [tbl, n] of Object.entries(manifest.tables)) {
      const [[r]] = await c.query(`SELECT COUNT(*) AS c FROM \`${tbl}\``);
      assert.equal(Number(r.c), n, `row count ${tbl}`);
    }
    const [[s]] = await c.query("SELECT value_json FROM settings WHERE setting_key = 'seller.legal_name'");
    assert.equal(settings.decode(s.value_json), "Test Legal Name — “quotes” & 'apostrophes'\nline two");
    const [[cost]] = await c.query("SELECT pc.supplier_exw_cost_usd FROM product_costs pc JOIN products p ON p.id = pc.product_id WHERE p.sku = 'T-BK-1'");
    assert.equal(String(cost.supplier_exw_cost_usd), "12.3456");
    await c.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const tbl of Object.keys(manifest.tables)) await c.query(`DROP TABLE IF EXISTS \`${tbl}\``);
  } finally {
    await c.end();
  }
});
