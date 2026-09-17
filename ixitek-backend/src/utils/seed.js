// utils/seed.js — creates the single "owner" account from environment
// variables the first time the server runs against a fresh database.
// Idempotent — safe to run on every server start — and can also be run by
// hand with `npm run seed`.

require("dotenv").config();
const { connectDB, disconnectDB } = require("../db.js");
const User = require("../models/User.js");

async function seedOwner() {
  const email = (process.env.OWNER_EMAIL || "admin@ixitek.in").trim().toLowerCase();
  const name = process.env.OWNER_NAME || "Ixitek Admin";
  const password = process.env.OWNER_PASSWORD || "Ixitek@2026";

  let owner = User.findByEmail(email);
  if (owner) {
    console.log(`[seed] Owner account already exists (${email}) — leaving password unchanged.`);
    if (owner.role !== "owner") {
      User.setRole(owner.id, "owner");
      console.log("[seed] Promoted existing account to role=owner.");
    }
    return owner;
  }

  owner = await User.create({ name, email, password, role: "owner" });
  console.log(`[seed] Created owner account → email: ${email}${process.env.OWNER_PASSWORD ? "" : " (default password — change this!)"}`);
  return owner;
}

// Only auto-run standalone (via `npm run seed`); server.js imports and
// calls seedOwner() itself after connecting.
if (require.main === module) {
  connectDB();
  seedOwner()
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedOwner };
