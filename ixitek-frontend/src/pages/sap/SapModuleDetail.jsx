import { useParams, Navigate, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Breadcrumbs from "../../components/layout/Breadcrumbs.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Button from "../../components/ui/Button.jsx";
import ModuleCard from "../../components/sap/ModuleCard.jsx";
import SapEnquiryForm from "../../components/sap/SapEnquiryForm.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { getModule, getModuleFamily, getRelatedModules } from "../../data/sap.js";

export default function SapModuleDetail() {
  const { moduleSlug } = useParams();
  const navigate = useNavigate();
  const module = getModule(moduleSlug);

  useDocumentTitle(
    module ? `SAP ${module.name} Training — Functions & Benefits` : "SAP Module",
    module ? `Learn what SAP ${module.name} does, the key functions it covers, the business benefits it delivers and who should learn it.` : undefined
  );

  if (!module) return <Navigate to="/sap/modules" replace />;

  const family = getModuleFamily(module.familySlug);
  const related = getRelatedModules(module);

  return (
    <>
      <section className="border-b border-ink-100 bg-ink-50/40 py-6">
        <div className="container-page">
          <Breadcrumbs
            items={[
              { label: "SAP / ERP", to: "/sap" },
              { label: "Modules", to: "/sap/modules" },
              { label: family?.name, to: `/sap/modules?family=${family?.slug}` },
              { label: module.name },
            ]}
          />
        </div>
      </section>

      <section className="py-14 sm:py-16 lg:py-20">
        <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-gradient-to-br from-teal-700 via-teal-900 to-ink-950 p-8 sm:p-10">
              <div className="absolute inset-0 bg-grid opacity-[0.12] mix-blend-overlay" />
              <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex flex-col gap-6">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
                  <Icon name={module.icon} className="h-8 w-8 text-white" strokeWidth={1.5} />
                </span>
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-teal-200">{module.code}</span>
                  <h1 className="mt-2 text-balance font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    SAP {module.name}
                  </h1>
                </div>
                {family && (
                  <Link
                    to={`/sap/modules?family=${family.slug}`}
                    className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-white/10"
                  >
                    <Icon name={family.icon} className="h-3.5 w-3.5" />
                    {family.name}
                  </Link>
                )}
              </div>
            </div>
          </Reveal>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold text-ink-900">Overview</h2>
              <p className="text-balance text-base leading-relaxed text-ink-500">{module.overview}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button to="/sap/contact" icon="Send" variant="teal">
                Enquire about {module.code}
              </Button>
              <Button variant="secondary" icon="ArrowRight" onClick={() => navigate("/sap/modules")}>
                Back to all modules
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-ink-100 py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-5">
            <h2 className="font-display text-xl font-bold text-ink-900">Key functions</h2>
            <div className="flex flex-col gap-2.5">
              {module.keyFunctions.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-3.5 shadow-card">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm leading-relaxed text-ink-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.08} className="flex flex-col gap-5">
            <h2 className="font-display text-xl font-bold text-ink-900">Business benefits</h2>
            <div className="flex flex-col gap-2.5">
              {module.benefits.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3.5">
                  <Icon name="TrendingUp" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm leading-relaxed text-ink-700">{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">
                <Icon name="Users2" className="h-3.5 w-3.5 text-teal-600" />
                Who should learn this module
              </span>
              <p className="text-sm leading-relaxed text-ink-600">{module.audience}</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="enquiry-panel" className="border-t border-ink-100 bg-ink-50/40 py-14">
        <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
              Enquiry
            </span>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Ask about {module.name}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-500">
              Share your background and timeline — our team typically responds within one business day.
            </p>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <SapEnquiryForm presetInterest="training" presetMessage={`I'd like to learn more about SAP ${module.name} (${module.code}).`} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="py-14 sm:py-16">
          <div className="container-page">
            <h2 className="font-display text-xl font-bold text-ink-900">
              More in {family?.name}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((m, i) => (
                <Reveal key={m.slug} delay={i * 0.07}>
                  <ModuleCard module={m} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
