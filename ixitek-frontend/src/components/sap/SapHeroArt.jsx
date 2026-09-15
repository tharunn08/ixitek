import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// SAP hero visual — four stacked "layers" representing the module families
// (core ERP, S/4HANA, cloud, technical), gently floating to suggest a live
// system rather than a static diagram. Deliberately not an SAP screenshot or
// logo — see the legal note in data/sap.js.
const LAYERS = [
  { id: "core-erp", icon: "Layers3", label: "Core ERP", delay: 0 },
  { id: "s4", icon: "Rocket", label: "S/4HANA", delay: 0.12 },
  { id: "cloud", icon: "Cloud", label: "Cloud", delay: 0.24 },
  { id: "technical", icon: "Code2", label: "Technical", delay: 0.36 },
];

export default function SapHeroArt() {
  return (
    <div className="relative flex aspect-square w-full max-w-[420px] items-center justify-center">
      <div className="absolute h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.35)_0%,rgba(45,212,191,0)_72%)]" />

      <div className="relative flex flex-col gap-4">
        {LAYERS.map((layer, i) => (
          <motion.div
            key={layer.id}
            initial={{ opacity: 0, x: 24 - i * 8, y: 10 }}
            animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
            transition={{
              opacity: { duration: 0.6, delay: layer.delay },
              x: { duration: 0.6, delay: layer.delay },
              y: { duration: 3.4 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: layer.delay },
            }}
            className={`flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 backdrop-blur-sm ${
              i % 2 === 0 ? "self-start" : "self-end"
            }`}
            style={{ width: `${76 + i * 8}%` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-400/20 text-teal-200">
              <Icon name={layer.icon} className="h-4.5 w-4.5" strokeWidth={1.7} />
            </span>
            <span className="text-sm font-semibold text-white">{layer.label}</span>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.5, ease: "backOut" }}
        className="absolute -bottom-4 -right-2 flex items-center gap-2 rounded-full border border-teal-300/30 bg-ink-950/80 px-4 py-2 shadow-[0_0_24px_rgba(45,212,191,0.35)]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
        <span className="text-xs font-semibold text-teal-100">25 modules covered</span>
      </motion.div>
    </div>
  );
}
