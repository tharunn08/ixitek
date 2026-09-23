// storage.js — file storage behind a tiny adapter interface so business
// code never touches the filesystem directly. `local` writes under
// STORAGE_DIR (keep it OUTSIDE the deployed app folder in production).
// An S3-compatible / Cloudinary adapter can implement the same 4 methods.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("./config.js");

function safeKey(key) {
  const normalized = path.posix.normalize(String(key)).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("\0")) throw new Error("Invalid storage key");
  return normalized;
}

const local = {
  name: "local",
  async put(key, buffer) {
    const k = safeKey(key);
    const full = path.join(config.storage.localDir, k);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer, { flag: "wx" });
    return { key: k, bytes: buffer.length };
  },
  async get(key) {
    return fs.promises.readFile(path.join(config.storage.localDir, safeKey(key)));
  },
  stream(key) {
    return fs.createReadStream(path.join(config.storage.localDir, safeKey(key)));
  },
  async exists(key) {
    try {
      await fs.promises.access(path.join(config.storage.localDir, safeKey(key)));
      return true;
    } catch {
      return false;
    }
  },
};

const drivers = { local };

function driver() {
  const d = drivers[config.storage.driver];
  if (!d) throw new Error(`Unknown STORAGE_DRIVER "${config.storage.driver}"`);
  return d;
}

function newKey(prefix, originalName = "") {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}${ext}`;
}

module.exports = { driver, newKey };
