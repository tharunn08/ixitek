// /api/admin/catalog/imports — upload, preview, confirm, report.
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../../middleware/auth.js");
const { requirePermission, can } = require("../../core/rbac.js");
const { query, json } = require("../../core/db.js");
const { config } = require("../../core/config.js");
const jobs = require("../../core/jobs.js");
const audit = require("../../core/audit.js");
const svc = require("./importService.js");
const { TEMPLATE_HEADERS } = require("./parser.js");
const { ah, badRequest } = require("../../core/errors.js");
require("./imageCheck.js");

const router = express.Router();
const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxImportBytes, files: 1 },
  fileFilter: (req, file, cb) => (ALLOWED_MIME.has(file.mimetype) && /\.(xlsx|csv)$/i.test(file.originalname) ? cb(null, true) : cb(badRequest("Upload an .xlsx or .csv file."))),
});

router.use(requireAuth, requirePermission("admin.access", "catalog.import"));

router.get("/template.csv", (req, res) => {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="ixitek-catalog-template.csv"');
  res.send(`${TEMPLATE_HEADERS.join(",")}\n`);
});

router.get(
  "/",
  ah(async (req, res) => {
    const rows = await query(
      `SELECT b.public_id, b.file_name, b.status, b.summary_json, b.created_at, b.completed_at, u.email AS uploaded_by
         FROM import_batches b LEFT JOIN users u ON u.id = b.uploaded_by ORDER BY b.id DESC LIMIT 50`
    );
    res.json({ imports: rows.map((r) => ({ id: r.public_id, fileName: r.file_name, status: r.status, summary: json(r.summary_json, {}), createdAt: r.created_at, completedAt: r.completed_at, uploadedBy: r.uploaded_by })) });
  })
);

router.post(
  "/",
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) throw badRequest("Attach a file.");
    const batch = await svc.createPreview({ buffer: req.file.buffer, fileName: req.file.originalname, mime: req.file.mimetype, user: req.user, req });
    res.status(201).json({ batch });
  })
);

router.get("/:id", ah(async (req, res) => res.json({ batch: await svc.getBatch(req.params.id) })));

router.get(
  "/:id/rows",
  ah(async (req, res) => {
    const withCosts = await can(req.user, "pricing.read_cost");
    const allowed = ["create", "update", "unchanged", "duplicate", "invalid", "skip", "warnings"];
    const action = allowed.includes(req.query.action) ? req.query.action : undefined;
    res.json(await svc.getRows(req.params.id, { action, page: req.query.page, limit: req.query.limit, q: req.query.q, withCosts }));
  })
);

router.post(
  "/:id/confirm",
  ah(async (req, res) => {
    if (req.body.confirm !== true) throw badRequest("Confirm the import to continue.");
    const batch = await svc.confirm(req.params.id, { user: req.user, req });
    // Run promptly even if the poller is idle.
    if (config.jobs.enabled) setImmediate(() => jobs.runOne().catch(() => {}));
    res.status(202).json({ batch });
  })
);

router.post("/:id/cancel", ah(async (req, res) => (await svc.cancel(req.params.id, { req }), res.json({ ok: true }))));

router.get(
  "/:id/report.csv",
  ah(async (req, res) => {
    const withCosts = await can(req.user, "pricing.read_cost");
    const csv = await svc.reportCsv(req.params.id, { withCosts });
    await audit.record({ req, action: "catalog.import.report_download", entityType: "import_batch", entityId: req.params.id, after: { withCosts } });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="import-report-${req.params.id.slice(0, 8)}.csv"`);
    res.set("Cache-Control", "private, no-store");
    res.send(`﻿${csv}`);
  })
);

router.post(
  "/images/check",
  ah(async (req, res) => {
    const jobId = await jobs.enqueue("catalog.check_images", { onlyUnchecked: Boolean(req.body.onlyUnchecked) });
    res.status(202).json({ jobId: String(jobId) });
  })
);

module.exports = router;
