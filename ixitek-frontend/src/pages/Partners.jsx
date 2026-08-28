import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import CTASection from "../components/sections/CTASection.jsx";
import HeroMeshArt from "../components/sections/HeroMeshArt.jsx";
import { Icon } from "../lib/icons.jsx";
import { partners, partnerHighlights, clientIndustries } from "../data/partners.js";

export default function Partners() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 left-0 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Partners" }]} light />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge tone="white">Partners &amp; clients</Badge>
              <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                Backed by the manufacturers enterprise networks trust.
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
                We partner directly with connectivity and power-infrastructure OEMs to deliver
                genuine, standards-compliant hardware — backed by engineers trained on every product line.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center lg:justify-end"
          >
            <HeroMeshArt />
          </motion.div>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Technology partners"
            title="OEM alliances across connectivity & power infrastructure"
            description="Every partner below is a manufacturer whose products we actively source, stock, and support."
          />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.07}>
                <div className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-ink-900 font-display text-lg font-extrabold text-white">
                      {p.name.charAt(0)}
                    </span>
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-500">
                      {p.category}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink-900">{p.name}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{p.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-ink-100 bg-ink-50/40 py-14">
        <div className="container-page grid grid-cols-1 gap-6 sm:grid-cols-3">
          {partnerHighlights.map((h, i) => (
            <Reveal key={h.id} delay={i * 0.08} className="group flex flex-col gap-3 rounded-2xl bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                <Icon name={["Boxes", "Globe2", "BadgeCheck"][i % 3]} className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base font-bold text-ink-900">{h.title}</h3>
              <p className="text-sm leading-relaxed text-ink-500">{h.description}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Who we serve"
            title="Clients across data centre & telecom infrastructure"
            description="We're a team of experienced network professionals supporting operators, carriers and integrators."
          />
          <div className="mt-10 flex flex-wrap gap-3">
            {clientIndustries.map((c, i) => (
              <Reveal key={c} delay={i * 0.05}>
                <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 hover:shadow-card">
                  <Icon name="Boxes" className="h-4 w-4 text-brand-500" />
                  {c}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Become a partner"
        title="Interested in partnering with Ixitek?"
        description="We're always open to new OEM alliances and channel partnerships across connectivity and infrastructure."
        primaryLabel="Get in Touch"
        primaryTo="/contact"
        secondaryLabel="View Products"
        secondaryTo="/products"
      />
    </>
  );
}
