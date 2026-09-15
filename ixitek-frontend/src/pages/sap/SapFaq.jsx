import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SapPageHero from "../../components/sap/SapPageHero.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Button from "../../components/ui/Button.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { sapFaqs } from "../../data/sap.js";

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
      <button
        onClick={onToggle}
        className="focus-ring flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-display text-sm font-bold text-ink-900 sm:text-base">{item.q}</span>
        <Icon
          name="ChevronDown"
          className={`h-4.5 w-4.5 shrink-0 text-teal-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="border-t border-ink-100 px-6 py-5 text-sm leading-relaxed text-ink-500">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SapFaq() {
  useDocumentTitle(
    "SAP Training & Implementation — Frequently Asked Questions",
    "Answers to common questions about SAP training, certification, implementation timelines and support engagements."
  );

  const [openIndex, setOpenIndex] = useState(0);

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "FAQs" }]}
        eyebrow="Section 9"
        icon="MessageCircle"
        title="Frequently asked questions"
        description="Honest answers about learning paths, certification, implementation timelines and support — including when the honest answer is inconvenient."
      />

      <section className="py-14 sm:py-16">
        <div className="container-page mx-auto max-w-3xl">
          <div className="flex flex-col gap-4">
            {sapFaqs.map((item, i) => (
              <Reveal key={item.q} delay={Math.min(i * 0.04, 0.3)}>
                <FaqItem item={item} isOpen={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? -1 : i)} />
              </Reveal>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Icon name="MessageCircle" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-bold text-ink-900">Still have a question?</h3>
            <p className="max-w-sm text-sm text-ink-500">
              Send it to us directly and a consultant will reply within one business day.
            </p>
            <Button to="/sap/contact" variant="teal" icon="ArrowRight">
              Ask our team
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
