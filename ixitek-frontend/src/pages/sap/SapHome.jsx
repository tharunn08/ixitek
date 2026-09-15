import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Counter from "../../components/ui/Counter.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import SapHeroArt from "../../components/sap/SapHeroArt.jsx";
import ModuleCard from "../../components/sap/ModuleCard.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import {
  sapHero,
  sapIntro,
  sapPillars,
  sapTrustStats,
  sapAbout,
  sapWhyChooseUs,
  sapCtaBlocks,
  sapModules,
  sapIndustries,
} from "../../data/sap.js";

const valueIcons = ["ShieldCheck", "Award", "Headset", "BookOpen"];

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function SapHome() {
  useDocumentTitle(
    "SAP Training, Implementation & Support",
    "Independent SAP training, full-lifecycle implementation and managed application support — delivered by consultants with real project experience."
  );

  const featuredModules = sapModules.filter((m) =>
    ["fi-financial-accounting", "mm-materials-management", "s4-finance", "abap"].includes(m.slug)
  );

  return (
    <>
      {/* Hero */}
      <section className="bg-noise relative overflow-hidden bg-gradient-to-br from-ink-950 via-[#0b2b2a] to-ink-950">
        <div className="absolute inset-0 bg-grid opacity-[0.05]" />
        <div className="absolute -top-40 left-1/4 h-[480px] w-[480px] animate-drift-a rounded-full bg-teal-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] translate-x-1/4 animate-drift-b rounded-full bg-brand-500/15 blur-[110px]" />

        <div className="container-page relative grid grid-cols-1 items-center gap-10 py-14 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col gap-5">
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                {sapHero.eyebrow}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="text-balance font-display text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl lg:text-[3rem]"
            >
              {sapHero.headline}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={2}
              className="max-w-lg text-balance text-base leading-relaxed text-ink-300 sm:text-lg"
            >
              {sapHero.subheadline}
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="flex flex-wrap items-center gap-4 pt-1">
              {sapHero.ctas.map((cta) => (
                <Button
                  key={cta.to}
                  to={cta.to}
                  size="lg"
                  variant={cta.variant === "primary" ? "teal" : cta.variant === "secondary" ? "secondary" : "outlineLight"}
                  icon={cta.variant === "primary" ? "ArrowRight" : undefined}
                >
                  {cta.label}
                </Button>
              ))}
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={4}
              className="mt-2 grid grid-cols-2 gap-5 border-t border-white/10 pt-5 sm:grid-cols-4"
            >
              {sapTrustStats.map((s) => (
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
            <SapHeroArt />
          </motion.div>
        </div>
      </section>

      {/* Intro */}
      <section className="py-16 sm:py-20">
        <div className="container-page grid grid-cols-1 gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal>
            <SectionHeading eyebrow="Why it matters" title="One partner for skills, systems and support" />
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4">
            {sapIntro.paragraphs.map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-ink-500">
                {p}
              </p>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Three pillars */}
      <section className="border-y border-ink-100 bg-ink-50/40 py-16 sm:py-20">
        <div className="container-page">
          <SectionHeading eyebrow="What we deliver" title="Training, implementation and support — under one roof" align="center" className="mx-auto items-center text-center" />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {sapPillars.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.1}>
                <Link
                  to={p.to}
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-teal-200 hover:shadow-card-hover"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={p.icon} className="h-5.5 w-5.5" />
                  </span>
                  <h3 className="font-display text-lg font-bold text-ink-900">{p.title}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-ink-500">{p.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">
                    Learn more
                    <Icon name="ArrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section className="py-16 sm:py-20">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-5">
            <SectionHeading eyebrow="Who we are" title="An independent, SAP-focused services team" />
            {sapAbout.whoWeAre.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-500">{p}</p>
            ))}
            <div className="mt-2 flex flex-col gap-2.5">
              {sapAbout.approach.slice(0, 3).map((a) => (
                <div key={a.title} className="flex items-start gap-3">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm text-ink-600">
                    <span className="font-semibold text-ink-800">{a.title}.</span> {a.description}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {sapAbout.values.map((v, i) => (
              <div
                key={v.id}
                className="group flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition-colors duration-300 group-hover:bg-teal-600 group-hover:text-white">
                  <Icon name={valueIcons[i % valueIcons.length]} className="h-5 w-5" />
                </span>
                <h3 className="font-display text-sm font-bold text-ink-900">{v.title}</h3>
                <p className="text-xs leading-relaxed text-ink-500">{v.description}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Why choose us */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              eyebrow="Why our consultants"
              title="Practitioners first, trainers second"
              description="Every person who teaches a course or leads a project has delivered that module on live engagements — not just documented it."
            />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {sapWhyChooseUs.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.06}>
                <div className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={v.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-base font-bold text-ink-900">{v.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{v.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured modules */}
      <section className="border-t border-ink-100 bg-ink-50/40 py-16 sm:py-20">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading eyebrow="25 modules covered" title="A guide to what each SAP module actually does" description="Core ERP, SAP S/4HANA lines of business, cloud solutions and technical modules — functions, benefits and who should learn each one." />
            <Link to="/sap/modules" className="focus-ring mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-teal-300 hover:text-teal-700">
              Browse all modules
              <Icon name="ArrowRight" className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredModules.map((m, i) => (
              <Reveal key={m.slug} delay={i * 0.07}>
                <ModuleCard module={m} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Industries strip */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <SectionHeading eyebrow="Sector experience" title="Industries we serve" description="SAP is configured differently in every industry. Our consultants bring sector-specific experience to every engagement." />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {sapIndustries.map((ind, i) => (
              <Reveal key={ind.id} delay={i * 0.05}>
                <div className="flex flex-col items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-4 py-6 text-center shadow-card">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon name={ind.icon} className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-ink-700">{ind.name}</span>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Link to="/sap/industries" className="focus-ring inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800">
              See industry detail
              <Icon name="ArrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA blocks */}
      <section className="bg-noise relative overflow-hidden bg-gradient-to-br from-ink-950 via-[#0b2b2a] to-ink-950 py-16 sm:py-20 lg:py-24">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/20 blur-[130px]" />
        <div className="container-page relative flex flex-col gap-10">
          <Reveal className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">
              Get started
            </span>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance font-display text-3xl font-extrabold text-white sm:text-4xl">
              Whatever stage you're at, the next step is a conversation
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {sapCtaBlocks.map((block, i) => (
              <Reveal key={block.id} delay={i * 0.1}>
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-400/15 text-teal-200">
                    <Icon name={block.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-base font-bold text-white">{block.title}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-ink-300">{block.description}</p>
                  <Link
                    to={`${block.to}?interest=${block.preset}`}
                    className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-xs font-semibold text-ink-950 transition-colors hover:bg-teal-400"
                  >
                    {block.ctaLabel}
                    <Icon name="ArrowRight" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
