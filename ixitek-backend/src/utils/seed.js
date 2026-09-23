// seed.js — ensures the owner account exists (first start / fresh DB).
// Production: OWNER_EMAIL + OWNER_PASSWORD must be set, otherwise seeding is
// skipped with a warning (no published default password is ever used).
// Development: a random password is generated and printed once.
const crypto = require("crypto");
const { config } = require("../core/config.js");
const User = require("../models/User.js");
const log = require("../core/logger.js");

async function seedOwner() {
  const email = config.owner.email || (config.isProd ? "" : "admin@ixitek.in");
  if (!email) {
    log.warn("[seed] OWNER_EMAIL not set — owner account not seeded.");
    return null;
  }
  const existing = await User.findByEmail(email);
  if (existing) {
    if (existing.role !== "owner") {
      await User.setRole(existing.id, "owner");
      log.info("[seed] Promoted existing account to role=owner.", { email });
    }
    return existing;
  }
  let password = config.owner.password;
  if (!password) {
    if (config.isProd) {
      log.warn("[seed] OWNER_PASSWORD not set — owner account not seeded.");
      return null;
    }
    password = crypto.randomBytes(9).toString("base64url");
    log.warn(`[seed] Development owner password generated: ${email} / ${password} — set OWNER_PASSWORD to choose one.`);
  }
  const owner = await User.create({ name: config.owner.name, email, password, role: "owner" });
  log.info("[seed] Created owner account", { email });
  return owner;
}

if (require.main === module) {
  const db = require("../core/db.js");
  seedOwner()
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedOwner };
