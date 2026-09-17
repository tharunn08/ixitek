import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

const items = [
  {
    label: "Company",
    to: "/company",
    description: "Our story, process & values",
    icon: "Building2",
  },
  {
    label: "Partners",
    to: "/partners",
    description: "OEM alliances & clients",
    icon: "Handshake",
  },
];

export default function WhoWeAreMenu({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onMouseLeave={onClose}
          className="absolute left-0 top-full z-40 w-72 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-[0_24px_48px_-12px_rgba(15,37,84,0.18)]"
        >
          <div className="flex flex-col p-2">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-brand-50/70"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Icon name={item.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="flex flex-col">
                  <span className="font-display text-sm font-bold text-ink-900 group-hover:text-brand-700">
                    {item.label}
                  </span>
                  <span className="text-xs text-ink-500">{item.description}</span>
                </span>
                <Icon
                  name="ArrowRight"
                  className="ml-auto h-3.5 w-3.5 text-ink-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600 group-hover:opacity-100"
                />
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
