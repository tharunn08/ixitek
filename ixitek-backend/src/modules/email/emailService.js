// emailService.js — server-side transactional email through an outbox.
//
// queue() writes an email_messages row (unique idempotency key) and a job;
// the job worker renders attachments and sends through the configured
// provider, retrying with backoff. A failed email never rolls back the order,
// payment or quote that triggered it; staff can see and resend from Admin.
//
// Providers (EMAIL_PROVIDER): smtp (any SMTP incl. Amazon SES SMTP, Gmail
// Workspace, Zoho, Hostinger mail) | resend | sendgrid | log (development:
// written to the server log, never delivered) | none.
const { query, one } = require("../../core/db.js");
const jobs = require("../../core/jobs.js");
const log = require("../../core/logger.js");
const monitor = require("../../core/monitor.js");
const settings = require("../../core/settings.js");
const templates = require("./templates.js");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function providerName() {
  return String(process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === "production" ? "none" : "log")).toLowerCase();
}

function fromAddress() {
  return process.env.EMAIL_FROM || "";
}

let smtp = null;
function smtpTransport() {
  if (!smtp) {
    const nodemailer = require("nodemailer");
    smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return smtp;
}
function resetTransport() {
  smtp = null;
}

async function httpSend(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

/** Deliver one message. Returns { provider, messageId }. Throws on failure. */
async function deliver(msg, attachments) {
  const provider = providerName();
  const fromName = await settings.get("email.from_name", "IXITEK");
  const from = fromAddress();
  if (provider === "none") throw new Error("Email provider not configured (set EMAIL_PROVIDER and credentials).");
  if (provider !== "log" && !from) throw new Error("EMAIL_FROM is not set.");
  const to = msg.to_email;
  const cc = msg.cc_email ? msg.cc_email.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (provider === "log") {
    log.info(`[email:log] (not delivered) to=${to} subject="${msg.subject}" attachments=${attachments.map((a) => a.filename).join(",") || "-"}`);
    return { provider: "log", messageId: null };
  }
  if (provider === "smtp") {
    const info = await smtpTransport().sendMail({ from: { name: fromName, address: from }, to, cc: cc.length ? cc : undefined, subject: msg.subject, html: msg.body_html, text: msg.body_text, attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) });
    return { provider, messageId: info.messageId || null };
  }
  if (provider === "resend") {
    const out = await httpSend("https://api.resend.com/emails", { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
      from: `${fromName} <${from}>`, to: [to], cc: cc.length ? cc : undefined, subject: msg.subject, html: msg.body_html, text: msg.body_text,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    });
    return { provider, messageId: (JSON.parse(out || "{}") || {}).id || null };
  }
  if (provider === "sendgrid") {
    await httpSend("https://api.sendgrid.com/v3/mail/send", { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` }, {
      personalizations: [{ to: [{ email: to }], cc: cc.length ? cc.map((email) => ({ email })) : undefined }],
      from: { email: from, name: fromName }, subject: msg.subject,
      content: [{ type: "text/plain", value: msg.body_text }, { type: "text/html", value: msg.body_html }],
      attachments: attachments.length ? attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), type: a.contentType, disposition: "attachment" })) : undefined,
    });
    return { provider, messageId: null };
  }
  throw new Error(`Unknown EMAIL_PROVIDER "${provider}".`);
}

/**
 * Queue a templated email. `key` makes it idempotent (same key → same message, sent once).
 * attachments: [{ kind: 'invoice', number } | { kind: 'quote', quoteId, version }]
 */
async function queue(template, to, data, { key, related = null, attachments = [], cc = null, createdBy = null, conn = null } = {}) {
  const email = String(to || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    log.warn(`[email] skipped ${template}: invalid recipient`);
    return null;
  }
  if (!key) throw new Error("email.queue requires an idempotency key");
  const rendered = await templates.render(template, data);
  const r = await query(
    `INSERT IGNORE INTO email_messages (template, to_email, cc_email, subject, body_html, body_text, attachments_json, related_type, related_id, idempotency_key, created_by)
     VALUES (:t, :to, :cc, :s, :h, :x, :a, :rt, :ri, :k, :u)`,
    { t: template, to: email, cc, s: rendered.subject.slice(0, 300), h: rendered.html, x: rendered.text, a: JSON.stringify(attachments), rt: related ? related.type : null, ri: related ? String(related.id) : null, k: `${template}:${key}`.slice(0, 150), u: createdBy },
    conn
  );
  const row = r.insertId ? { id: r.insertId } : await one("SELECT id FROM email_messages WHERE idempotency_key = :k", { k: `${template}:${key}`.slice(0, 150) }, conn);
  if (r.insertId) await jobs.enqueue("email.send", { id: row.id }, { idempotencyKey: `email:${row.id}`, maxAttempts: 6 }, conn);
  return row.id;
}

async function buildAttachments(list) {
  const out = [];
  const inv = require("../documents/invoiceService.js");
  for (const a of list || []) {
    if (a.kind === "invoice") {
      const row = await inv.byNumber(a.number);
      out.push({ filename: `${row.invoice_number}.pdf`, content: await inv.renderInvoicePdf(row), contentType: "application/pdf" });
    } else if (a.kind === "quote") {
      const q = await one("SELECT quote_number FROM quotes WHERE id = :id", { id: a.quoteId });
      out.push({ filename: `${q.quote_number}-V${a.version}.pdf`, content: await inv.renderQuotePdf(a.quoteId, a.version), contentType: "application/pdf" });
    }
  }
  return out;
}

async function sendJob({ id }) {
  const msg = await one("SELECT * FROM email_messages WHERE id = :id", { id });
  if (!msg || msg.status === "sent" || msg.status === "cancelled") return { skipped: true };
  await query("UPDATE email_messages SET status = 'sending', attempts = attempts + 1 WHERE id = :id", { id });
  try {
    const attachments = await buildAttachments(typeof msg.attachments_json === "string" ? JSON.parse(msg.attachments_json || "[]") : msg.attachments_json || []);
    const res = await deliver(msg, attachments);
    await query("UPDATE email_messages SET status = 'sent', provider = :p, provider_message_id = :m, sent_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = :id", { p: res.provider, m: res.messageId, id });
    return { sent: true, provider: res.provider };
  } catch (err) {
    const row = await one("SELECT attempts FROM email_messages WHERE id = :id", { id });
    await query("UPDATE email_messages SET status = 'failed', provider = :p, last_error = :e WHERE id = :id", { p: providerName(), e: String(err.message).slice(0, 1000), id });
    if (row.attempts >= 6 || providerName() === "none") monitor.event("email_failure", `Email #${id} (${msg.template} → ${msg.to_email}) failed: ${err.message}`, {});
    if (providerName() === "none") return { failed: true, reason: "not configured" }; // no point retrying until configured; staff can resend
    throw err; // job retries with backoff
  }
}
jobs.register("email.send", sendJob);

/** Staff "resend": a new outbox row linked to the original (history preserved). */
async function resend(id, userId, toOverride = null) {
  const m = await one("SELECT * FROM email_messages WHERE id = :id", { id });
  if (!m) return null;
  const to = String(toOverride || m.to_email).trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw require("../../core/errors.js").badRequest("Enter a valid email address.");
  const r = await query(
    `INSERT INTO email_messages (template, to_email, cc_email, subject, body_html, body_text, attachments_json, related_type, related_id, idempotency_key, resend_of, created_by)
     VALUES (:t, :to, :cc, :s, :h, :x, :a, :rt, :ri, :k, :of, :u)`,
    { t: m.template, to, cc: m.cc_email, s: m.subject, h: m.body_html, x: m.body_text, a: typeof m.attachments_json === "string" ? m.attachments_json : JSON.stringify(m.attachments_json || []), rt: m.related_type, ri: m.related_id, k: `resend:${id}:${Date.now()}`, of: id, u: userId }
  );
  await jobs.enqueue("email.send", { id: r.insertId }, { idempotencyKey: `email:${r.insertId}`, maxAttempts: 6 });
  return r.insertId;
}

function status() {
  const p = providerName();
  const missing = [];
  if (p !== "log" && p !== "none" && !fromAddress()) missing.push("EMAIL_FROM");
  if (p === "smtp" && !process.env.SMTP_HOST) missing.push("SMTP_HOST");
  if (p === "resend" && !process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (p === "sendgrid" && !process.env.SENDGRID_API_KEY) missing.push("SENDGRID_API_KEY");
  return { provider: p, from: fromAddress() || null, delivers: !["log", "none"].includes(p) && missing.length === 0, missing };
}

module.exports = { queue, resend, sendJob, deliver, status, resetTransport, providerName };
