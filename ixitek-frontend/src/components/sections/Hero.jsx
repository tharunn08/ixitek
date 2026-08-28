import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import Counter from "../ui/Counter.jsx";
import HeroNetworkArt from "./HeroNetworkArt.jsx";
import HeroFiberField from "./HeroFiberField.jsx";
import { company } from "../../data/company.js";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function Hero() {
  return (
    <section className="bg-noise relative overflow-hidden bg-gradient-to-br from-brand-900 via-[#0f2454] to-brand-950">
      <div className="absolute inset-0 bg-grid opacity-[0.05]" />
      <HeroFiberField />
      <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] animate-drift-a rounded-full bg-brand-500/25 blur-[120px]" />
      <div className="absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 animate-drift-b rounded-full bg-brand-400/15 blur-[110px]" />

      <div className="container-page relative grid grid-cols-1 items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:py-14">
        <div className="flex flex-col gap-5">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <Badge tone="white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Bangalore, IN &amp; Sacramento, US
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="text-balance font-display text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-[3.4rem]"
          >
            Infrastructure for the
            <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent"> connected enterprise</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="max-w-lg text-balance text-base leading-relaxed text-ink-300 sm:text-lg"
          >
            Ixitek Solutions engineers fiber optic connectivity, network test &amp; measurement,
            and data centre infrastructure for enterprises that can't afford downtime.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="flex flex-wrap items-center gap-4 pt-1"
          >
            <Button to="/products" size="lg" icon="ArrowRight">
              Explore Products
            </Button>
            <Button to="/contact" size="lg" variant="outlineLight">
              Talk to an Engineer
            </Button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            className="mt-2 grid grid-cols-2 gap-5 border-t border-white/10 pt-5 sm:grid-cols-4"
          >
            {company.stats.map((s) => (
              <div key={s.id} className="flex flex-col gap-1">
                <span className="font-display text-2xl font-extrabold text-white sm:text-3xl">
                  <Counter value={s.value} suffix={s.suffix} />
                </span>
                <span className="text-xs leading-tight text-ink-400">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center lg:justify-end"
        >
          <HeroNetworkArt />
        </motion.div>
      </div>

      <div className="relative border-t border-white/5 bg-white/[0.02]">
        <div className="container-page flex flex-wrap items-center gap-x-8 gap-y-3 py-4 text-xs font-medium uppercase tracking-wide text-ink-400">
          <span className="text-ink-500">Trusted infrastructure for:</span>
          {["Data Centres", "Telecom Carriers", "Enterprise IT", "System Integrators", "Cloud Providers"].map((t) => (
            <span key={t} className="text-ink-300">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
