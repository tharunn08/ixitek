import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// Contact page hero art — a fifth distinct animation language: a single
// curved journey from enquiry to response (not a hub, orbit, mesh, or
// staircase), with a signal travelling the arc on loop to dramatise "we
// respond fast."

const START = { x: 50, y: 300, label: "Your enquiry", icon: "Mail" };
const CORE = { x: 220, y: 120, label: "Ixitek support", icon: "Headset" };
const END = { x: 390, y: 300, label: "Fast response", icon: "CheckCircle2" };

const PATH = `M ${START.x} ${START.y} Q ${CORE.x} ${CORE.y - 40} ${CORE.x} ${CORE.y} Q ${CORE.x} ${CORE.y - 40} ${END.x} ${END.y}`;

export default function HeroContactArt() {
  return (
    <div className="relative aspect-square w-full max-w-[480px]">
      <svg viewBox="0 0 440 360" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="contactArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#5b9bf5" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.75" />
          </linearGradient>
          <radialGradient id="contactCoreGlow">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.path
          d={PATH}
          fill="none"
          stroke="url(#contactArc)"
          strokeWidth="1.75"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* signal travelling the full journey, on loop — sampled along the
            same two quadratic bezier segments as the visible arc above */}
        <motion.circle
          r="3.4"
          fill="#dbeafe"
          initial={{ opacity: 0 }}
          animate={{
            cx: [50, 177.5, 220, 262.5, 390],
            cy: [300, 145, 120, 145, 300],
            opacity: [0, 1, 1, 1, 0],
          }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 0.9, delay: 1.1, ease: "linear" }}
        />

        <circle cx={CORE.x} cy={CORE.y} r={40} fill="url(#contactCoreGlow)" />

        <motion.circle
          cx={CORE.x}
          cy={CORE.y}
          r="24"
          fill="none"
          stroke="#5b9bf5"
          strokeWidth="1"
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: [0.5, 0, 0.5], scale: [0.9, 1.4, 0.9] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }}
        />

        {[START, END].map((n) => (
          <motion.circle
            key={n.label}
            cx={n.x}
            cy={n.y}
            r={4}
            fill="#5b9bf5"
            stroke="white"
            strokeWidth="1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: "backOut" }}
          />
        ))}
        <motion.circle
          cx={CORE.x}
          cy={CORE.y}
          r={5.5}
          fill="#1d54c9"
          stroke="white"
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "backOut" }}
        />
      </svg>

      {/* HTML overlay: icon chips + labels matched to SVG coordinates */}
      <div className="pointer-events-none absolute inset-0">
        {[START, END].map((n, i) => (
          <motion.div
            key={n.label}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.1, ease: "backOut" }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            style={{ left: `${(n.x / 440) * 100}%`, top: `${(n.y / 360) * 100}%` }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
              <Icon name={n.icon} className="h-4.5 w-4.5 text-brand-100" strokeWidth={1.7} />
            </span>
            <span className="whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200">
              {n.label}
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "backOut" }}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${(CORE.x / 440) * 100}%`, top: `${(CORE.y / 360) * 100}%` }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-brand-300/40 bg-brand-600/90 shadow-[0_0_24px_rgba(59,130,246,0.45)]">
            <Icon name={CORE.icon} className="h-6 w-6 text-white" strokeWidth={1.7} />
          </span>
          <span className="whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200">
            {CORE.label}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
