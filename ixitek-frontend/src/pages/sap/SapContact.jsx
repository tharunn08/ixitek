import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import Breadcrumbs from "../../components/layout/Breadcrumbs.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import SapEnquiryForm from "../../components/sap/SapEnquiryForm.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { company } from "../../data/company.js";
import { sapCtaBlocks } from "../../data/sap.js";

export default function SapContact() {
  useDocumentTitle(
    "Contact — SAP Training and Consulting",
    "Speak to an SAP specialist about training, implementation or support. Free initial consultation."
  );

  const [searchParams] = useSearchParams();
  const interest = searchParams.get("interest") || "";

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 left-1/3 h-80 w-80 rounded-full bg-teal-500/20 blur-[110px]" />
        <div className="container-page relative flex flex-col gap-6">
          <Breadcrumbs items={[{ label: "SAP / ERP", to: "/sap" }, { label: "Contact" }]} light />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-xs font-semibold text-teal-200">
              Let's talk
            </span>
            <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
              The next step is a conversation.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
              Whether you're choosing your first SAP course, planning a move to SAP S/4HANA, or looking for a
              support partner who answers the phone — tell us what you're trying to achieve and we'll tell you
              honestly what it takes.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="flex flex-col gap-6">
            <h2 className="font-display text-xl font-bold text-ink-900">Choose what fits</h2>
            {sapCtaBlocks.map((block) => (
              <div key={block.id} className="flex items-start gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon name={block.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-ink-900">{block.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{block.description}</p>
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Prefer to reach us directly?</span>
              <a href={`mailto:${company.email}`} className="focus-ring flex w-fit items-center gap-2 text-sm text-ink-600 hover:text-teal-700">
                <Icon name="Mail" className="h-4 w-4 text-teal-600" />
                {company.email}
              </a>
              {company.offices[0]?.phones?.[0] && (
                <a
                  href={`tel:${company.offices[0].phones[0].replace(/\s/g, "")}`}
                  className="focus-ring flex w-fit items-center gap-2 text-sm text-ink-600 hover:text-teal-700"
                >
                  <Icon name="Phone" className="h-4 w-4 text-teal-600" />
                  {company.offices[0].phones[0]}
                </a>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <h2 className="font-display text-xl font-bold text-ink-900">Tell us what you need</h2>
            <p className="mt-2 text-sm text-ink-500">
              Fill out the form and one of our SAP consultants will follow up by email or phone within one
              business day.
            </p>
            <div className="mt-6">
              <SapEnquiryForm presetInterest={interest} key={interest} />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
