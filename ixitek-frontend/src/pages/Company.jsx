import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import Counter from "../components/ui/Counter.jsx";
import Badge from "../components/ui/Badge.jsx";
import CTASection from "../components/sections/CTASection.jsx";
import ProcessSteps from "../components/sections/ProcessSteps.jsx";
import HeroOrbitArt from "../components/sections/HeroOrbitArt.jsx";
import { Icon } from "../lib/icons.jsx";
import { company } from "../data/company.js";

export default function Company() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Company" }]} light />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge tone="white">Who we are</Badge>
              <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                A technology-led infrastructure partner, built in Bangalore.
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
                {company.description}
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center lg:justify-end"
          >
            <HeroOrbitArt />
          </motion.div>
        </div>
      </section>

      <section className="border-b border-ink-100 py-12">
        <div className="container-page grid grid-cols-2 gap-8 sm:grid-cols-4">
          {company.stats.map((s, i) => (
            <Reveal key={s.id} delay={i * 0.08} className="flex flex-col gap-1">
              <span className="font-display text-3xl font-extrabold text-brand-700 sm:text-4xl">
                <Counter value={s.value} suffix={s.suffix} />
              </span>
              <span className="text-sm text-ink-500">{s.label}</span>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-16 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-5">
            <SectionHeading eyebrow="Our story" title="Engineering excellence in data centre solutions" />
            <p className="text-base leading-relaxed text-ink-500">
              Ixitek Solutions LLP is a Bangalore-based technology company working towards
              excellence in data centre solutions, pursuing business through innovation and
              technology. We operate as a vanguard in the realm of IT and digital infrastructure —
              serving global clients across continents with fiber optic cables for data centers,
              software labs and industrial applications, offered as bulk-length spools in simplex,
              duplex and hybrid versions.
            </p>
            <p className="text-base leading-relaxed text-ink-500">
              With operations spanning our Bangalore headquarters and Sacramento, California
              office, we support enterprise rollouts across time zones — from high-speed 25G to
              400G Ethernet fabrics to full data centre build-outs and IT staff augmentation.
            </p>
            <div className="mt-2 flex flex-col gap-3">
              {company.capabilities.map((c) => (
                <div key={c} className="flex items-start gap-3">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-600" />
                  <span className="text-sm text-ink-600">{c}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {company.values.map((v, i) => (
              <div
                key={v.id}
                className="group flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                  <Icon name={["Award", "Handshake", "Sparkles", "Globe2"][i % 4]} className="h-5 w-5" />
                </span>
                <h3 className="font-display text-sm font-bold text-ink-900">{v.title}</h3>
                <p className="text-xs leading-relaxed text-ink-500">{v.description}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <ProcessSteps />

      <section className="border-t border-ink-100 bg-ink-50/40 py-14">
        <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-2">
          {company.offices.map((office, i) => (
            <Reveal key={office.id} delay={i * 0.1} className="group flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                <Icon name="MapPin" className="h-3.5 w-3.5" />
                {office.label}
              </span>
              <p className="text-sm leading-relaxed text-ink-600">{office.address}</p>
              <div className="flex flex-col gap-2 border-t border-ink-100 pt-4 text-sm">
                {office.phones.map((p) => (
                  <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="focus-ring flex w-fit items-center gap-2 text-ink-600 hover:text-brand-600">
                    <Icon name="Phone" className="h-4 w-4 text-brand-500" />
                    {p}
                  </a>
                ))}
                <a href={`mailto:${office.email}`} className="focus-ring flex w-fit items-center gap-2 text-ink-600 hover:text-brand-600">
                  <Icon name="Mail" className="h-4 w-4 text-brand-500" />
                  {office.email}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CTASection
        eyebrow="Work with us"
        title="Let's talk about your infrastructure roadmap"
        description="Whether it's a single enquiry or a multi-site rollout, our team responds fast."
        primaryLabel="Contact Our Team"
        primaryTo="/contact"
        secondaryLabel="See Our Partners"
        secondaryTo="/partners"
      />
    </>
  );
}
