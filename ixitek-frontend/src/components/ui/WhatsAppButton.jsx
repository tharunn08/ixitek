import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { ADMIN_CONFIG } from "../../lib/adminConfig.js";

// Floating, site-wide "chat on WhatsApp" entry point. Frontend-only sites
// can't push a message to WhatsApp automatically (that needs the WhatsApp
// Business API on a server), so this opens a click-to-chat link pre-filled
// with a starter message — the visitor sends it themselves in one tap.
export default function WhatsAppButton() {
  const [hover, setHover] = useState(false);
  const message = encodeURIComponent(
    "Hi Ixitek team, I'd like to enquire about your products/services."
  );
  const href = `https://wa.me/${ADMIN_CONFIG.whatsappNumber}?text=${message}`;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      className="focus-ring fixed bottom-6 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-500 py-3.5 pl-3.5 pr-3.5 text-white shadow-[0_12px_28px_-8px_rgba(16,185,129,0.55)] transition-shadow hover:shadow-[0_16px_36px_-8px_rgba(16,185,129,0.65)] sm:bottom-8 sm:right-8"
      aria-label="Chat with us on WhatsApp"
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-emerald-400/60" style={{ animationDuration: "2.4s" }} />
      <Icon name="MessageCircle" className="h-5 w-5 shrink-0" />
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden whitespace-nowrap text-sm font-semibold"
          >
            Chat on WhatsApp
          </motion.span>
        )}
      </AnimatePresence>
    </motion.a>
  );
}
