// /api/enquiries — public submission + staff management.
const express = require("express");
const rateLimit = require("express-rate-limit");
const Enquiry = require("../models/Enquiry.js");
const { requireAuth, optionalAuth } = require("../middleware/auth.js");
const { requirePermission } = require("../core/rbac.js");
const storage = require("../core/storage.js");
const { query } = require("../core/db.js");
const audit = require("../core/audit.js");
const { ah, badRequest, notFound } = require("../core/errors.js");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESUME_TYPES = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
const MAX_RESUME_BYTES = 1.5 * 1024 * 1024;

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions from this device. Please try again shortly.", code: "RATE_LIMITED" },
});

/** Decode + validate a base64 data URL résumé; returns stored file info or null. */
async function storeResume(dataUrl, fileName) {
  if (!dataUrl) return null;
  const m = /^data:([\w/.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl));
  if (!m) throw badRequest("The attached résumé could not be read.");
  const mime = m[1];
  if (!RESUME_TYPES[mime]) throw badRequest("Résumé must be a PDF or Word document.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_RESUME_BYTES) throw badRequest("Résumé file is too large.");
  const isPdf = buf.subarray(0, 4).toString() === "%PDF";
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // docx
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf; // doc
  if ((mime === "application/pdf" && !isPdf) || (RESUME_TYPES[mime] === ".docx" && !isZip) || (RESUME_TYPES[mime] === ".doc" && !isOle)) {
    throw badRequest("Résumé file content does not match its type.");
  }
  const key = storage.newKey("resumes", fileName || `resume${RESUME_TYPES[mime]}`);
  await storage.driver().put(key, buf);
  await query("INSERT INTO files (storage_key, driver, original_name, mime, bytes, purpose) VALUES (:k, :d, :n, :m, :b, 'resume')", {
    k: key,
    d: storage.driver().name,
    n: String(fileName || "").slice(0, 255),
    m: mime,
    b: buf.length,
  });
  return { key, mime, bytes: buf.length };
}

router.post(
  "/",
  submitLimiter,
  optionalAuth,
  ah(async (req, res) => {
    const type = req.body.type === "career" ? "career" : "enquiry";
    const name = String(req.body.name || "").trim().slice(0, 150);
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!name) throw badRequest("Please enter your name.");
    if (!email || !EMAIL_RE.test(email)) throw badRequest("Enter a valid email address.");

    const resumeFileName = String(req.body.resumeFileName || "").trim().slice(0, 255);
    const stored = type === "career" ? await storeResume(req.body.resumeDataUrl, resumeFileName) : null;

    const doc = await Enquiry.create({
      type,
      name,
      company: String(req.body.company || "").trim().slice(0, 200),
      email,
      phone: String(req.body.phone || "").trim().slice(0, 40),
      category: String(req.body.category || "").trim().slice(0, 200),
      message: String(req.body.message || "").trim().slice(0, 10000),
      page: String(req.body.page || "").trim().slice(0, 500),
      resumeFileName,
      resumeFileSize: Number(req.body.resumeFileSize) || (stored ? stored.bytes : 0),
      resumeMime: stored ? stored.mime : "",
      resumeStorageKey: stored ? stored.key : null,
      userId: req.user ? req.user.id : null,
    });
    // Server-side notification to the sales inbox (outbox job; never blocks the submission).
    await require("../core/events.js").emit("enquiry.created", { enquiryId: doc.id }, null, { key: String(doc.id) }).catch(() => {});
    res.status(201).json({ record: Enquiry.toPublicJSON(doc) });
  })
);

router.use(requireAuth, requirePermission("enquiries.read"));

router.get(
  "/",
  ah(async (req, res) => {
    const { rows, total } = await Enquiry.list({
      limit: req.query.limit || 2000,
      offset: req.query.offset,
      type: ["enquiry", "career"].includes(req.query.type) ? req.query.type : undefined,
      status: ["new", "read", "responded", "archived"].includes(req.query.status) ? req.query.status : undefined,
      q: req.query.q ? String(req.query.q).slice(0, 100) : undefined,
    });
    res.json({ records: rows.map(Enquiry.toPublicJSON), total });
  })
);

router.get(
  "/:id/resume",
  ah(async (req, res) => {
    const doc = await Enquiry.findById(req.params.id);
    if (!doc || !doc.resume_storage_key) throw notFound();
    const safeName = (doc.resume_file_name || "resume").replace(/[^\w.\- ]+/g, "_");
    res.set("Content-Type", doc.resume_mime || "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename="${safeName}"`);
    res.set("Cache-Control", "private, no-store");
    storage.driver().stream(doc.resume_storage_key).on("error", () => res.status(404).end()).pipe(res);
  })
);

router.patch(
  "/:id",
  requirePermission("enquiries.manage"),
  ah(async (req, res) => {
    const status = req.body.status;
    if (!["new", "read", "responded", "archived"].includes(status)) throw badRequest("status must be new, read, responded or archived.");
    const before = await Enquiry.findById(req.params.id);
    if (!before) throw notFound();
    const doc = await Enquiry.updateStatus(req.params.id, status);
    await audit.record({ req, action: "enquiry.status", entityType: "enquiry", entityId: doc.id, before: { status: before.status }, after: { status } });
    res.json({ record: Enquiry.toPublicJSON(doc) });
  })
);

// Soft delete: the record is hidden, never destroyed.
router.delete(
  "/:id",
  requirePermission("enquiries.delete"),
  ah(async (req, res) => {
    const ok = await Enquiry.softDelete(req.params.id);
    if (ok) await audit.record({ req, action: "enquiry.delete", entityType: "enquiry", entityId: req.params.id });
    res.json({ ok: true });
  })
);

module.exports = router;
