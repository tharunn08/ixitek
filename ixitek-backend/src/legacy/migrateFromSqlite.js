// migrateFromSqlite.js — one-time, repeatable copy of the legacy SQLite data
// (users + enquiries/career applications) into MySQL.
//
//   node src/legacy/migrateFromSqlite.js --dry-run    analyse only, write nothing
//   node src/legacy/migrateFromSqlite.js              migrate + verify
//
// Safety:
//  • The SQLite file is copied to <file>.pre-mysql-<timestamp>.bak first and
//    is NEVER modified — rollback = redeploy the previous release, which
//    still reads it.
//  • Idempotent: every copied row is recorded in legacy_migration_log; a
//    re-run skips rows already copied (safe after a partial failure).
//  • Users are matched by email (e.g. the owner seeded on first MySQL start);
//    password hashes are carried over unchanged, so everyone keeps their
//    password.
//  • Base64 résumés move to file storage; MySQL keeps only a reference.
//  • Verification: row counts + per-row SHA-256 of key fields re-read from
//    MySQL. Any mismatch → non-zero exit.
const fs = require("fs");
const crypto = require("crypto");
const { config } = require("../core/config.js");
const db = require("../core/db.js");
const { migrate } = require("../core/migrate.js");
const storage = require("../core/storage.js");

const dryRun = process.argv.includes("--dry-run");
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const log = (...a) => console.log("[legacy-migrate]", ...a);

function openSqlite(file) {
  const { Database } = require("node-sqlite3-wasm");
  return new Database(file, { readOnly: true });
}

const userKey = (u) => ({ email: String(u.email).toLowerCase(), name: u.name, role: u.role, hash: u.password_hash });
const enqKey = (e) => ({ type: e.type, name: e.name, email: e.email, message: e.message || "", created: Number(e.created_at) });

async function run() {
  const file = config.legacySqlitePath;
  if (!fs.existsSync(file)) {
    log(`No SQLite database at ${file} — nothing to migrate.`);
    return { ok: true, nothing: true };
  }
  if (!dryRun) {
    const bak = `${file}.pre-mysql-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    fs.copyFileSync(file, bak);
    log(`SQLite backup written: ${bak}`);
    await migrate();
  }
  const lite = openSqlite(file);
  const users = lite.all("SELECT * FROM users ORDER BY id");
  const enquiries = lite.all("SELECT * FROM enquiries ORDER BY id");
  lite.close();
  log(`SQLite: ${users.length} users, ${enquiries.length} enquiries/applications`);
  if (dryRun) {
    const roles = users.reduce((m, u) => ((m[u.role] = (m[u.role] || 0) + 1), m), {});
    const withResume = enquiries.filter((e) => e.resume_data_url).length;
    log("dry run:", { roles, withResume });
    return { ok: true, dryRun: true };
  }

  const done = new Set((await db.query("SELECT CONCAT(source_table, ':', source_id) AS k FROM legacy_migration_log")).map((r) => r.k));
  const userMap = new Map((await db.query("SELECT source_id, target_id FROM legacy_migration_log WHERE source_table = 'users'")).map((r) => [String(r.source_id), Number(r.target_id)]));
  let usersCopied = 0;
  let usersMatched = 0;

  for (const u of users) {
    if (done.has(`users:${u.id}`)) continue;
    await db.tx(async (conn) => {
      const email = String(u.email).trim().toLowerCase();
      const existing = await db.one("SELECT id, last_login_at FROM users WHERE email = :e", { e: email }, conn);
      let targetId;
      if (existing) {
        targetId = Number(existing.id);
        usersMatched++;
        // An account auto-seeded in MySQL but never used yet takes over the
        // real (SQLite) password, so the owner keeps the password they know.
        if (!existing.last_login_at) {
          await db.query("UPDATE users SET password_hash = :h, name = :n WHERE id = :id", { h: u.password_hash, n: u.name, id: targetId }, conn);
        }
      } else {
        const r = await db.query(
          `INSERT INTO users (name, email, phone, company, password_hash, role, status, last_login_at, last_login_ip, created_at, updated_at)
           VALUES (:name, :email, :phone, :company, :hash, :role, :status, :lla, :llip, :ca, :ua)`,
          {
            name: u.name, email, phone: u.phone || "", company: u.company || "", hash: u.password_hash,
            role: ["customer", "staff", "owner"].includes(u.role) ? u.role : "customer", status: u.status === "disabled" ? "disabled" : "active",
            lla: u.last_login_at ? new Date(Number(u.last_login_at)) : null, llip: u.last_login_ip || null,
            ca: new Date(Number(u.created_at)), ua: new Date(Number(u.updated_at || u.created_at)),
          },
          conn
        );
        targetId = Number(r.insertId);
        usersCopied++;
      }
      userMap.set(String(u.id), targetId);
      await db.query("INSERT INTO legacy_migration_log (source_table, source_id, target_id, checksum) VALUES ('users', :s, :t, :c)", { s: String(u.id), t: targetId, c: sha(userKey(u)) }, conn);
    });
  }

  let enqCopied = 0;
  let resumes = 0;
  for (const e of enquiries) {
    if (done.has(`enquiries:${e.id}`)) continue;
    let resume = null;
    if (e.resume_data_url) {
      const m = /^data:([\w/.+-]+);base64,(.+)$/s.exec(e.resume_data_url);
      if (m) {
        const buf = Buffer.from(m[2], "base64");
        const key = storage.newKey("resumes", e.resume_file_name || "resume");
        await storage.driver().put(key, buf);
        resume = { key, mime: m[1], bytes: buf.length };
        resumes++;
      }
    }
    await db.tx(async (conn) => {
      if (resume) {
        await db.query("INSERT INTO files (storage_key, driver, original_name, mime, bytes, purpose) VALUES (:k, :d, :n, :m, :b, 'resume')", { k: resume.key, d: storage.driver().name, n: e.resume_file_name || "", m: resume.mime, b: resume.bytes }, conn);
      }
      const r = await db.query(
        `INSERT INTO enquiries (type, name, company, email, phone, category, message, page, resume_file_name, resume_file_size, resume_mime, resume_storage_key, user_id, status, created_at, updated_at)
         VALUES (:type, :name, :company, :email, :phone, :category, :message, :page, :rfn, :rfs, :rmime, :rkey, :uid, :status, :ca, :ua)`,
        {
          type: e.type === "career" ? "career" : "enquiry", name: e.name, company: e.company || "", email: e.email, phone: e.phone || "", category: e.category || "",
          message: e.message || "", page: e.page || "", rfn: e.resume_file_name || "", rfs: Number(e.resume_file_size) || 0, rmime: resume ? resume.mime : "",
          rkey: resume ? resume.key : null, uid: e.user_id ? userMap.get(String(e.user_id)) || null : null,
          status: ["new", "read", "responded", "archived"].includes(e.status) ? e.status : "new",
          ca: new Date(Number(e.created_at)), ua: new Date(Number(e.updated_at || e.created_at)),
        },
        conn
      );
      await db.query("INSERT INTO legacy_migration_log (source_table, source_id, target_id, checksum) VALUES ('enquiries', :s, :t, :c)", { s: String(e.id), t: r.insertId, c: sha(enqKey(e)) }, conn);
    });
    enqCopied++;
  }

  // ── Verification ──
  const problems = [];
  const logRows = await db.query("SELECT source_table, source_id, target_id, checksum FROM legacy_migration_log");
  const byKey = new Map(logRows.map((r) => [`${r.source_table}:${r.source_id}`, r]));
  for (const u of users) {
    const l = byKey.get(`users:${u.id}`);
    if (!l) { problems.push(`user ${u.id} not migrated`); continue; }
    const t = await db.one("SELECT email FROM users WHERE id = :id", { id: l.target_id });
    if (!t || t.email !== String(u.email).trim().toLowerCase()) problems.push(`user ${u.id} email mismatch`);
  }
  for (const e of enquiries) {
    const l = byKey.get(`enquiries:${e.id}`);
    if (!l) { problems.push(`enquiry ${e.id} not migrated`); continue; }
    const t = await db.one("SELECT type, name, email, message, created_at FROM enquiries WHERE id = :id", { id: l.target_id });
    const got = t && sha({ type: t.type, name: t.name, email: t.email, message: t.message || "", created: new Date(t.created_at).getTime() });
    if (got !== l.checksum) problems.push(`enquiry ${e.id} content mismatch after copy`);
  }
  const summary = { sqliteUsers: users.length, usersCopied, usersMatchedByEmail: usersMatched, sqliteEnquiries: enquiries.length, enquiriesCopied: enqCopied, resumesMoved: resumes, problems };
  log("result", summary);
  return { ok: problems.length === 0, ...summary };
}

if (require.main === module) {
  run()
    .then(async (r) => {
      await db.close();
      process.exit(r.ok ? 0 : 2);
    })
    .catch(async (err) => {
      console.error(err);
      await db.close().catch(() => {});
      process.exit(1);
    });
}

module.exports = { run };
