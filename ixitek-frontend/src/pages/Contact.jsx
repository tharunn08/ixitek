import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import EnquiryForm from "../components/forms/EnquiryForm.jsx";
import HeroContactArt from "../components/sections/HeroContactArt.jsx";
import { Icon } from "../lib/icons.jsx";
import { company } from "../data/company.js";

export default function Contact() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 left-1/3 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Contact & Enquiry" }]} light />
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge tone="white">Let's talk</Badge>
              <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                Tell us what you're building. We'll help you spec it.
              </h1>
              <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
                Whether it's a single enquiry or a multi-site infrastructure rollout, our solutions
                team responds within one business day.
              </p>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center lg:justify-end"
          >
            <HeroContactArt />
          </motion.div>
        </div>
      </section>

      <section className="py-12 sm:py-14">
        <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="flex flex-col gap-6">
            <h2 className="font-display text-xl font-bold text-ink-900">Reach us directly</h2>
            {company.offices.map((office) => (
              <div key={office.id} className="group flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                  <Icon name="MapPin" className="h-3.5 w-3.5" />
                  {office.label}
                </span>
                <p className="text-sm leading-relaxed text-ink-600">{office.address}</p>
                <div className="flex flex-col gap-2 border-t border-ink-100 pt-3 text-sm">
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
              </div>
            ))}
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-6 text-xs text-ink-500">
              <span className="font-semibold text-ink-600">D-U-N-S&reg; Number</span>
              <span>{company.duns}</span>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <h2 className="font-display text-xl font-bold text-ink-900">Drop your questions here</h2>
            <p className="mt-2 text-sm text-ink-500">
              Fill out the form and our solutions team will follow up by email or phone.
            </p>
            <div className="mt-6">
              <EnquiryForm />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
