import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// Partners page hero art — a third, distinct animation language again: no
// single dominant hub (Home) and no rotation (Company). Instead, five
// partner/client categories sit in a ring, connected to each other AND to
// the Ixitek centre, with signal dashes flowing continuously around the
// ring itself — reading as an alliance network rather than a topology or an
// orbit.

const CENTER = { x: 210, y: 190 };

const NODES = [
  { id: "optical", label: "Optical Networking", icon: "Cable", x: 210, y: 40 },
  { id: "power", label: "Power Distribution", icon: "Zap", x: 352, y: 144 },
  { id: "racks", label: "DC Infrastructure", icon: "ServerCog", x: 298, y: 311 },
  { id: "enterprise", label: "Enterprise Clients", icon: "Building2", x: 122, y: 311 },
  { id: "testing", label: "Test & Support", icon: "Activity", x: 67, y: 144 },
];

const RING_EDGES = [
  ["optical", "power"],
  ["power", "racks"],
  ["racks", "enterprise"],
  ["enterprise", "testing"],
  ["testing", "optical"],
];

export default function HeroMeshArt() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <div className="relative aspect-square w-full max-w-[480px]">
      <svg viewBox="0 0 420 380" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="meshSpoke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1d54c9" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="meshNodeGlow">
            <stop offset="0%" stopColor="#5b9bf5" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#5b9bf5" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="meshCoreGlow">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* spokes from every partner node to the alliance centre */}
        {NODES.map((n, i) => (
          <motion.line
            key={`spoke-${n.id}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke="url(#meshSpoke)"
            strokeWidth="1.25"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}

        {/* the ring connecting every partner node to its neighbours, with a
            continuously flowing dash to suggest live traffic between allies */}
        {RING_EDGES.map(([a, b], i) => {
          const A = byId[a];
          const B = byId[b];
          return (
            <motion.line
              key={`ring-${a}-${b}`}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke="#93c5fd"
              strokeWidth="1.25"
              strokeOpacity="0.45"
              strokeDasharray="2 8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, strokeDashoffset: [0, -40] }}
              transition={{
                opacity: { duration: 0.6, delay: 0.6 + i * 0.06 },
                strokeDashoffset: { duration: 6, repeat: Infinity, ease: "linear" },
              }}
            />
          );
        })}

        {/* pulses travelling from each partner into the alliance centre */}
        {NODES.map((n, i) => (
          <motion.circle
            key={`pulse-${n.id}`}
            r="2.4"
            fill="#dbeafe"
            initial={{ opacity: 0 }}
            animate={{
              cx: [n.x, CENTER.x],
              cy: [n.y, CENTER.y],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              repeatDelay: 0.9,
              delay: 1.1 + i * 0.3,
              ease: "linear",
            }}
          />
        ))}

        {/* node glow halos */}
        {NODES.map((n) => (
          <circle key={`glow-${n.id}`} cx={n.x} cy={n.y} r={26} fill="url(#meshNodeGlow)" />
        ))}
        <circle cx={CENTER.x} cy={CENTER.y} r={42} fill="url(#meshCoreGlow)" />

        {/* alliance centre: pulsing ring */}
        <motion.circle
          cx={CENTER.x}
          cy={CENTER.y}
          r="26"
          fill="none"
          stroke="#5b9bf5"
          strokeWidth="1"
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: [0.5, 0, 0.5], scale: [0.9, 1.4, 0.9] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}
        />

        {NODES.map((n, i) => (
          <motion.circle
            key={`dot-${n.id}`}
            cx={n.x}
            cy={n.y}
            r={4}
            fill="#5b9bf5"
            stroke="white"
            strokeWidth="1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 * i + 0.3, ease: "backOut" }}
          />
        ))}
        <motion.circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={5.5}
          fill="#1d54c9"
          stroke="white"
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "backOut" }}
        />
      </svg>

      {/* HTML overlay: icon chips + labels positioned to match the SVG coordinates */}
      <div className="pointer-events-none absolute inset-0">
        {NODES.map((n, i) => {
          const leftPct = (n.x / 420) * 100;
          const topPct = (n.y / 380) * 100;
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 * i + 0.5, ease: "backOut" }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <Icon name={n.icon} className="h-4.5 w-4.5 text-brand-100" strokeWidth={1.7} />
              </span>
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200">
                {n.label}
              </span>
            </motion.div>
          );
        })}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.32, ease: "backOut" }}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${(CENTER.x / 420) * 100}%`, top: `${(CENTER.y / 380) * 100}%` }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-brand-300/40 bg-brand-600/90 shadow-[0_0_24px_rgba(59,130,246,0.45)]">
            <Icon name="Handshake" className="h-6 w-6 text-white" strokeWidth={1.7} />
          </span>
        </motion.div>
      </div>
    </div>
  );
}
