import { motion } from "framer-motion";
import Reveal from "../ui/Reveal.jsx";
import { partners } from "../../data/partners.js";

// Types out a partner name letter by letter on first mount. The first two
// names in the strip render instantly (per request — no typing delay on the
// names visible the moment the page loads); everything after that, and the
// looped duplicate pass used to make the marquee seamless, render as plain
// text so the effect only plays once per name, not on every loop.
function TypedName({ text, animate, delay = 0 }) {
  if (!animate) {
    return <span>{text}</span>;
  }
  return (
    <span>
      {text.split("").map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.05, delay: delay + i * 0.045 }}
        >
          {ch === " " ? " " : ch}
        </motion.span>
      ))}
    </span>
  );
}

export default function PartnersStrip() {
  const loop = [...partners, ...partners];

  return (
    <section className="border-y border-ink-100 bg-ink-50/50 py-12">
      <div className="container-page">
        <Reveal className="mb-6 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
            OEM &amp; Technology Partners
          </p>
        </Reveal>
      </div>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-50/50 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-50/50 to-transparent" />
        <div className="flex w-max animate-marquee gap-16 pr-16 [animation-play-state:running] hover:[animation-play-state:paused]">
          {loop.map((p, i) => {
            const isFirstPass = i < partners.length;
            const skipTyping = i < 2;
            return (
              <div
                key={`${p.id}-${i}`}
                className="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-lg font-display font-bold tracking-tight text-brand-600 transition-all duration-200 hover:-translate-y-1 hover:scale-110 hover:bg-white hover:text-brand-700 hover:shadow-card"
              >
                <TypedName
                  text={p.name}
                  animate={isFirstPass && !skipTyping}
                  delay={0.3 + i * 0.5}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
