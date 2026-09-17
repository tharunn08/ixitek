// Centralised, frontend-only configuration for notifications shown/sent
// from the browser (WhatsApp links + EmailJS). Sign-in credentials are no
// longer configured here — the owner/admin account lives in the backend
// database and is seeded from ixitek-backend/.env (OWNER_EMAIL /
// OWNER_PASSWORD). See ixitek-backend/README.md.
//
// Override any of these by creating a `.env` file at the project root (copy
// `.env.example`) — Vite inlines every `VITE_*` variable into the compiled
// bundle at build time, so changes require a rebuild/redeploy.

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};

export const ADMIN_CONFIG = {
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
