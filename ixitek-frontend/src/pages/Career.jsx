import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import CareerApplicationForm from "../components/forms/CareerApplicationForm.jsx";
import HeroCareerArt from "../components/sections/HeroCareerArt.jsx";
import { Icon } from "../lib/icons.jsx";
import { company } from "../data/company.js";

const openAreas = [
  {
    id: "sales-marketing",
    title: "Sales and Marketing",
    icon: "TrendingUp",
    description:
      "Drive growth across our data centre and connectivity product lines — from enterprise outreach to channel partnerships.",
  },
  {
    id: "digital-marketing",
    title: "Digital Marketing",
    icon: "Megaphone",
    description:
      "Shape how Ixitek shows up online — content, campaigns, and demand generation for a technical B2B audience.",
  },
  {
    id: "accounts",
    title: "Accounts",
    icon: "Calculator",
    description:
      "Keep the numbers precise — accounts, billing and financial operations across our India and US entities.",
  },
];

export default function Career() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 right-10 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Career" }]} light />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge tone="white">
                <Icon name="Briefcase" className="h-3.5 w-3.5" />
                Join Ixitek
              </Badge>
              <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                Build the infrastructure behind connected enterprise, with us.
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
                We are always on the lookout for talented individuals who can contribute across
                sales, marketing and operations.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center lg:justify-end"
          >
            <HeroCareerArt />
          </motion.div>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Where you can contribute"
            title="Areas we're hiring for"
            description="We are always in look out for talented individuals who can contribute in areas of:"
          />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {openAreas.map((area, i) => (
              <Reveal key={area.id} delay={i * 0.08}>
                <div className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                    <Icon name={area.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-base font-bold text-ink-900">{area.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{area.description}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2} className="mt-8 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-5 py-4 text-sm text-ink-600">
            <Icon name="Mail" className="h-4 w-4 text-brand-500" />
            Please submit your CV at
            <a href={`mailto:${company.careersEmail}`} className="focus-ring font-semibold text-brand-600 hover:text-brand-700">
              {company.careersEmail}
            </a>
            — or use the form below.
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-16 sm:py-20 lg:py-24">
        <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Badge>Apply now</Badge>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Submit your application
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-500">
              Attach your CV, tell us a little about yourself, and our team will follow up if
              there's a fit for an open or upcoming role.
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm text-ink-600">
              <Icon name="Paperclip" className="h-4 w-4 text-brand-500" />
              PDF or Word, up to 10MB
            </div>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <CareerApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}
