import { motion } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";

// Career page hero art — a fourth distinct animation language again: an
// ascending step path (career growth) with a signal climbing it on loop,
// rather than a hub, an orbit, or a mesh. Each step corresponds to one of
// the open hiring areas, ending in a flag node for "join the team."

const STEPS = [
  { id: "sales", label: "Sales & Marketing", icon: "TrendingUp", x: 60, y: 300 },
  { id: "digital", label: "Digital Marketing", icon: "Megaphone", x: 168, y: 230 },
  { id: "accounts", label: "Accounts", icon: "Calculator", x: 276, y: 160 },
  { id: "join", label: "Join the team", icon: "Flag", x: 384, y: 90 },
];

export default function HeroCareerArt() {
  return (
    <div className="relative aspect-square w-full max-w-[480px]">
      <svg viewBox="0 0 440 380" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="careerPath" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#5b9bf5" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* baseline the steps sit on */}
        <motion.path
          d={`M ${STEPS[0].x} 340 L ${STEPS[0].x} ${STEPS[0].y} L ${STEPS[1].x} ${STEPS[1].y} L ${STEPS[2].x} ${STEPS[2].y} L ${STEPS[3].x} ${STEPS[3].y}`}
          fill="none"
          stroke="url(#careerPath)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 10"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* step platforms */}
        {STEPS.map((s, i) => (
          <motion.rect
            key={`platform-${s.id}`}
            x={s.x - 34}
            y={s.y + 14}
            width="68"
            height="6"
            rx="3"
            fill="#5b9bf5"
            fillOpacity="0.35"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: 0.15 * i, ease: "backOut" }}
            style={{ transformOrigin: `${s.x}px ${s.y + 17}px` }}
          />
        ))}

        {/* signal climbing the steps, looping */}
        <motion.circle
          r="4"
          fill="#dbeafe"
          initial={{ opacity: 0 }}
          animate={{
            cx: STEPS.map((s) => s.x),
            cy: STEPS.map((s) => s.y),
            opacity: [0, 1, 1, 1, 0],
          }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            repeatDelay: 0.8,
            delay: 1,
            ease: "easeInOut",
            times: [0, 0.05, 0.35, 0.7, 1],
          }}
        />

        {STEPS.map((s, i) => (
          <motion.circle
            key={`node-${s.id}`}
            cx={s.x}
            cy={s.y}
            r={i === STEPS.length - 1 ? 5.5 : 4}
            fill={i === STEPS.length - 1 ? "#1d54c9" : "#5b9bf5"}
            stroke="white"
            strokeWidth="1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 * i + 0.2, ease: "backOut" }}
          />
        ))}
      </svg>

      {/* HTML overlay: icon chips + labels matched to SVG coordinates */}
      <div className="pointer-events-none absolute inset-0">
        {STEPS.map((s, i) => {
          const leftPct = (s.x / 440) * 100;
          const topPct = (s.y / 380) * 100;
          const isLast = i === STEPS.length - 1;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 * i + 0.35, ease: "backOut" }}
              className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1.5 pb-3"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <span
                className={`whitespace-nowrap rounded-full border border-white/10 bg-ink-950/70 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-ink-200`}
              >
                {s.label}
              </span>
              <span
                className={`flex items-center justify-center rounded-xl border backdrop-blur-sm ${
                  isLast
                    ? "h-14 w-14 border-brand-300/40 bg-brand-600/90 shadow-[0_0_24px_rgba(59,130,246,0.45)]"
                    : "h-10 w-10 border-white/15 bg-white/10"
                }`}
              >
                <Icon name={s.icon} className={isLast ? "h-6 w-6 text-white" : "h-4.5 w-4.5 text-brand-100"} strokeWidth={1.7} />
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
