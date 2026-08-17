import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// Company page hero art — deliberately different animation language from the
// homepage's network topology: our four operating values orbit continuously
// around the Ixitek core, rather than radiating out along fixed spokes. The
// rotation itself is the metaphor (steady, always-on) instead of a one-shot
// signal pulse.

const VALUES = [
  { id: "precision", label: "Precision", icon: "Award", radius: 152, angle: -20, duration: 30 },
  { id: "partnership", label: "Partnership", icon: "Handshake", radius: 152, angle: 160, duration: 30 },
  { id: "innovation", label: "Innovation", icon: "Sparkles", radius: 96, angle: 70, duration: 20 },
  { id: "reliability", label: "Reliability", icon: "Globe2", radius: 96, angle: 250, duration: 20 },
];

export default function HeroOrbitArt() {
  return (
    <div className="relative flex aspect-square w-full max-w-[440px] items-center justify-center">
      {/* orbit paths */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="absolute h-[304px] w-[304px] rounded-full border border-dashed border-white/15"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="absolute h-[192px] w-[192px] rounded-full border border-dashed border-white/10"
      />

      {/* orbiting value nodes */}
      {VALUES.map((v, i) => (
        <motion.div
          key={v.id}
          className="absolute left-1/2 top-1/2 h-0 w-0"
          initial={{ rotate: v.angle, opacity: 0 }}
          animate={{ rotate: [v.angle, v.angle + 360], opacity: 1 }}
          transition={{
            rotate: { duration: v.duration, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.5, delay: 0.3 + i * 0.1 },
          }}
        >
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: v.radius, top: 0 }}
          >
            <motion.div
              className="flex flex-col items-center gap-1.5"
              initial={{ rotate: -v.angle }}
              animate={{ rotate: [-v.angle, -(v.angle + 360)] }}
              transition={{ duration: v.duration, repeat: Infinity, ease: "linear" }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <Icon name={v.icon} className="h-5 w-5 text-brand-100" strokeWidth={1.7} />
              </span>
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200">
                {v.label}
              </span>
            </motion.div>
          </div>
        </motion.div>
      ))}

      {/* core */}
      <div className="absolute h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(147,197,253,0.55)_0%,rgba(147,197,253,0)_72%)]" />
      <motion.div
        initial={{ opacity: 0.5, scale: 0.9 }}
        animate={{ opacity: [0.5, 0, 0.5], scale: [0.9, 1.35, 0.9] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute h-16 w-16 rounded-full border border-brand-300"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: "backOut" }}
        className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-brand-300/40 bg-brand-600/90 shadow-[0_0_24px_rgba(59,130,246,0.45)]"
      >
        <Icon name="Building2" className="h-6 w-6 text-white" strokeWidth={1.7} />
      </motion.div>
    </div>
  );
}
