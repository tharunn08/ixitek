import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// An original, labeled network-topology illustration standing in for the
// hero image — modeled on how Ixitek's own product families actually
// connect: fiber backbone in from the edge, through a core switch, out to
// data centre racks, enterprise LANs and cloud/carrier uplinks, with a
// test & measurement tap watching the link. Not a stock photo or a generic
// particle field — every node/edge maps to a real part of the business.

const NODES = {
  core: { x: 210, y: 190, label: "Core Switch", icon: "Network", primary: true },
  fiber: { x: 40, y: 90, label: "Fiber Backbone", icon: "Cable" },
  dc: { x: 380, y: 70, label: "Data Centre", icon: "ServerCog" },
  enterprise: { x: 380, y: 230, label: "Enterprise Edge", icon: "Building2" },
  tm: { x: 70, y: 300, label: "Test & Monitoring", icon: "Activity" },
  cloud: { x: 230, y: 340, label: "Cloud Uplink", icon: "Globe2" },
};

const EDGES = [
  ["fiber", "core"],
  ["core", "dc"],
  ["core", "enterprise"],
  ["core", "tm"],
  ["core", "cloud"],
];

const LABELED = ["fiber", "dc", "enterprise", "tm", "cloud"];

export default function HeroNetworkArt() {
  return (
    <div className="relative aspect-square w-full max-w-[480px]">
      <svg viewBox="0 0 420 380" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#1d54c9" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="#5b9bf5" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#5b9bf5" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* connections */}
        {EDGES.map(([a, b], i) => {
          const A = NODES[a];
          const B = NODES[b];
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke="url(#edgeGrad)"
              strokeWidth="1.5"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1, delay: 0.12 * i, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}

        {/* light pulses travelling along every link, like signal on fiber */}
        {EDGES.map(([a, b], i) => {
          const A = NODES[a];
          const B = NODES[b];
          return (
            <motion.circle
              key={`pulse-${a}-${b}`}
              r="2.6"
              fill="#dbeafe"
              initial={{ opacity: 0 }}
              animate={{
                cx: [A.x, B.x],
                cy: [A.y, B.y],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                repeatDelay: 0.6,
                delay: 1 + i * 0.35,
                ease: "linear",
              }}
            />
          );
        })}

        {/* node glow halos */}
        {Object.entries(NODES).map(([key, n]) => (
          <circle
            key={`glow-${key}`}
            cx={n.x}
            cy={n.y}
            r={n.primary ? 42 : 26}
            fill={n.primary ? "url(#coreGlow)" : "url(#nodeGlow)"}
          />
        ))}

        {/* core switch: pulsing ring to signal it's the active hub */}
        <motion.circle
          cx={NODES.core.x}
          cy={NODES.core.y}
          r="26"
          fill="none"
          stroke="#5b9bf5"
          strokeWidth="1"
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: [0.5, 0, 0.5], scale: [0.9, 1.4, 0.9] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${NODES.core.x}px ${NODES.core.y}px` }}
        />

        {/* node dots (icons are overlaid as HTML below, in sync with these coordinates) */}
        {Object.entries(NODES).map(([key, n], i) => (
          <motion.circle
            key={key}
            cx={n.x}
            cy={n.y}
            r={n.primary ? 5.5 : 4}
            fill={n.primary ? "#1d54c9" : "#5b9bf5"}
            stroke="white"
            strokeWidth="1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.12 * i + 0.3, ease: "backOut" }}
          />
        ))}
      </svg>

      {/* HTML overlay: icon chips + labels positioned to match the SVG node coordinates */}
      <div className="pointer-events-none absolute inset-0">
        {Object.entries(NODES).map(([key, n], i) => {
          const leftPct = (n.x / 420) * 100;
          const topPct = (n.y / 380) * 100;
          const labelBelow = n.y < 120;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.12 * i + 0.5, ease: "backOut" }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <span
                className={`flex items-center justify-center rounded-xl border backdrop-blur-sm ${
                  n.primary
                    ? "h-14 w-14 border-brand-300/40 bg-brand-600/90 shadow-[0_0_24px_rgba(59,130,246,0.45)]"
                    : "h-10 w-10 border-white/15 bg-white/10"
                }`}
              >
                <Icon name={n.icon} className={n.primary ? "h-6 w-6 text-white" : "h-4.5 w-4.5 text-brand-100"} strokeWidth={1.7} />
              </span>
              {LABELED.includes(key) && (
                <span
                  className={`whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200 ${
                    labelBelow ? "" : ""
                  }`}
                >
                  {n.label}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
