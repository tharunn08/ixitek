// Centralised, frontend-only configuration for the admin area.
//
// Override any of these by creating a `.env` file at the project root (copy
// `.env.example`) — Vite inlines every `VITE_*` variable into the compiled
// bundle at build time, so changes require a rebuild/redeploy.
//
// IMPORTANT — please read before going live:
// This project has no backend, so authentication, enquiry storage and the
// automatic email notification all run entirely in the browser. That means:
//   • Enquiries are stored in whichever browser the admin opens the
//     dashboard in (localStorage) — they do not sync across devices.
//   • The admin password hash below ships inside the compiled JS bundle.
//     Hashing means the raw password isn't sitting in plain text, but it
//     is still a static-site login, not a real access-control system — it
//     will not stand up to a determined attacker. Treat it as a basic
//     deterrent to keep casual visitors out of the enquiry list, and change
//     the default credentials before sharing the site link with anyone.
// See ADMIN_SETUP.md for full setup instructions.

const DEFAULT_PASSWORD_HASH =
  "47368da5d9147c9d4572a04dd3289526ec101d65d37eb5b7cf188c95ef6b0fdc"; // sha256("Ixitek@2026")

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};

export const ADMIN_CONFIG = {
  // Sign-in credentials for /admin/login.
  username: clean(env.VITE_ADMIN_USERNAME) || "admin",
  passwordHash: clean(env.VITE_ADMIN_PASSWORD_HASH) || DEFAULT_PASSWORD_HASH,
  // Only meaningful while passwordHash still equals DEFAULT_PASSWORD_HASH —
  // shown on first run so the default login is discoverable, never used for
  // the actual auth check.
  isDefaultPassword: !clean(env.VITE_ADMIN_PASSWORD_HASH),
  defaultPasswordHint: "Ixitek@2026",

  // Where the automatic "new enquiry" email should land.
  notifyEmail: clean(env.VITE_ADMIN_EMAIL) || "sales@ixitek.in",

  // WhatsApp number (with country code, digits only) used for the
  // "Continue on WhatsApp" click-to-chat links across the site.
  whatsappNumber: clean(env.VITE_ADMIN_WHATSAPP).replace(/\D/g, "") || "919945222724",

  // EmailJS (https://www.emailjs.com) lets a static frontend send real
  // emails without a backend. Leave these blank to disable automatic email
  // sending — enquiries are still saved to the admin panel either way.
  emailjs: {
    serviceId: clean(env.VITE_EMAILJS_SERVICE_ID),
    templateId: clean(env.VITE_EMAILJS_TEMPLATE_ID),
    publicKey: clean(env.VITE_EMAILJS_PUBLIC_KEY),
  },
};

export const isEmailNotifyConfigured = Boolean(
  ADMIN_CONFIG.emailjs.serviceId && ADMIN_CONFIG.emailjs.templateId && ADMIN_CONFIG.emailjs.publicKey
);
