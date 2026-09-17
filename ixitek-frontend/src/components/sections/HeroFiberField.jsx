import { motion } from "framer-motion";

// Ambient background texture for the homepage hero — a field of glowing
// light strands fanning across the panel with twinkling tips, styled after
// the fiber-optic bundles Ixitek actually sells (its lead product line),
// rendered as animated SVG rather than a stock photo so it can sit low-
// opacity behind copy and scale to any viewport. Positions are generated
// once with a fixed seed so the layout is stable across renders.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);

const STRANDS = Array.from({ length: 34 }).map((_, i) => {
  const originX = -60 - rand() * 80;
  const originY = 460 + rand() * 260;
  const length = 680 + rand() * 620;
  const angle = -20 - rand() * 34; // degrees, fanning up and to the right
  const rad = (angle * Math.PI) / 180;
  return {
    id: i,
    x1: originX,
    y1: originY,
    x2: originX + Math.cos(rad) * length,
    y2: originY + Math.sin(rad) * length,
    width: 0.5 + rand() * 1.1,
    delay: rand() * 5,
    dur: 3.2 + rand() * 3.2,
  };
});

export default function HeroFiberField({ className = "" }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full opacity-[0.55] mix-blend-screen"
      >
        <defs>
          <linearGradient id="fiberStrand" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        {STRANDS.map((s) => (
          <line
            key={s.id}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="url(#fiberStrand)"
            strokeWidth={s.width}
            strokeLinecap="round"
          />
        ))}
        {STRANDS.map((s) => (
          <motion.circle
            key={`tip-${s.id}`}
            cx={s.x2}
            cy={s.y2}
            r={1.4 + s.width}
            fill="#e0f2fe"
            initial={{ opacity: 0.15 }}
            animate={{ opacity: [0.15, 1, 0.15] }}
            transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
          />
        ))}
      </svg>
      {/* left-side vignette keeps hero copy readable over the strands */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-950/75 via-brand-950/20 to-transparent" />
    </div>
  );
}
