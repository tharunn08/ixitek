import { motion } from "framer-motion";
import Breadcrumbs from "../layout/Breadcrumbs.jsx";
import { Icon } from "../../lib/icons.jsx";

// Shared dark hero band for every inner /sap/* page — visually related to the
// rest of the site's dark hero sections (CategoryPage, Contact, Company) but
// tinted teal instead of brand-blue, so the SAP micro-site reads as its own
// zone while staying on-family with ixitek.in.
export default function SapPageHero({ crumbs = [], eyebrow, icon, title, description, stat }) {
  return (
    <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
      <div className="absolute inset-0 bg-grid opacity-[0.06]" />
      <div className="absolute -top-24 right-10 h-80 w-80 rounded-full bg-teal-500/20 blur-[110px]" />
      <div className="container-page relative flex flex-col gap-6">
        <Breadcrumbs items={[{ label: "SAP / ERP", to: "/sap" }, ...crumbs]} light />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-teal-200">
                {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
                {eyebrow}
              </span>
            )}
            {stat && (
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">{stat}</span>
            )}
          </div>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-[2.75rem]">
            {title}
          </h1>
          {description && (
            <p className="max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">{description}</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
