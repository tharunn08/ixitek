// Outbound notification helpers — all frontend-only, no backend/API route.
//
//  • Email: uses EmailJS (https://www.emailjs.com), a service built exactly
//    for sending real emails straight from browser JS. Its SDK is loaded
//    from a CDN on demand (no npm/build dependency), and it only activates
//    once you fill in the three EmailJS values in `.env` — see
//    ADMIN_SETUP.md. Until then it's a safe no-op: the enquiry is still
//    saved to the admin panel regardless of whether email sends.
//
//  • WhatsApp: a true "auto-deliver to WhatsApp with no user action" flow
//    needs the WhatsApp Business API running on a server, which this
//    frontend-only project intentionally doesn't have. Instead we build a
//    wa.me click-to-chat link pre-filled with the enquiry details, which
//    the visitor (or admin, from the dashboard) can open with one click.

import { ADMIN_CONFIG, isEmailNotifyConfigured } from "./adminConfig.js";

export { isEmailNotifyConfigured };

const EMAILJS_SRC = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
let emailjsLoadPromise = null;

function loadEmailJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.emailjs) return Promise.resolve(window.emailjs);
  if (emailjsLoadPromise) return emailjsLoadPromise;

  emailjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = EMAILJS_SRC;
    script.async = true;
    script.onload = () => (window.emailjs ? resolve(window.emailjs) : reject(new Error("EmailJS failed to initialise")));
    script.onerror = () => reject(new Error("Could not load the EmailJS SDK from the CDN"));
    document.head.appendChild(script);
  });
  return emailjsLoadPromise;
}

/** Fire-and-forget: sends an email via EmailJS if configured. Never throws —
 * callers should not block form success on this. */
export async function sendEmailNotification(record) {
  if (!isEmailNotifyConfigured) {
    console.info(
      "[Ixitek] Email notifications aren't configured yet — the enquiry was still saved to the admin panel. See ADMIN_SETUP.md to turn on automatic emails via EmailJS."
    );
    return { sent: false, reason: "not-configured" };
  }
  try {
    const emailjs = await loadEmailJs();
    await emailjs.send(
      ADMIN_CONFIG.emailjs.serviceId,
      ADMIN_CONFIG.emailjs.templateId,
      {
        to_email: ADMIN_CONFIG.notifyEmail,
        enquiry_type: record.type === "career" ? "Career application" : "Product enquiry",
        from_name: record.name,
        from_email: record.email,
        phone: record.phone || "-",
        company: record.company || "-",
        category: record.category || "-",
        message: record.message,
        submitted_at: new Date(record.createdAt).toLocaleString("en-IN"),
      },
      { publicKey: ADMIN_CONFIG.emailjs.publicKey }
    );
    return { sent: true };
  } catch (error) {
    console.error("[Ixitek] Email notification failed", error);
    return { sent: false, reason: "error", error };
  }
}

export function buildMessageText(record) {
  const lines = [
    `New ${record.type === "career" ? "career application" : "enquiry"} — Ixitek website`,
    `Name: ${record.name}`,
    record.company ? `Company: ${record.company}` : null,
    `Email: ${record.email}`,
    record.phone ? `Phone: ${record.phone}` : null,
    record.category ? `Interest: ${record.category}` : null,
    `Message: ${record.message}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildWhatsAppLink(record, number = ADMIN_CONFIG.whatsappNumber) {
  return `https://wa.me/${number}?text=${encodeURIComponent(buildMessageText(record))}`;
}

export function buildMailtoLink(record, to = ADMIN_CONFIG.notifyEmail) {
  const subject = encodeURIComponent(
    `${record.type === "career" ? "Career application" : "Enquiry"} from ${record.name}`
  );
  const body = encodeURIComponent(buildMessageText(record));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
