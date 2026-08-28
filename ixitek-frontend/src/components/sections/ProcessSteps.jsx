import Reveal from "../ui/Reveal.jsx";
import SectionHeading from "../ui/SectionHeading.jsx";
import { company } from "../../data/company.js";

export default function ProcessSteps() {
  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="How we work"
          title="A disciplined process, from first call to go-live"
          description="Every engagement — a single patch cord order or a full data centre build — follows the same rigorous four-stage process."
        />
        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 sm:grid-cols-2 lg:grid-cols-4">
          {company.process.map((step, i) => (
            <Reveal key={step.id} delay={i * 0.08} className="group relative flex flex-col gap-4 bg-white p-8 transition-colors hover:bg-brand-100">
              <span className="font-display text-4xl font-extrabold text-ink-100 transition-colors group-hover:text-brand-300">
                {step.step}
              </span>
              <h3 className="font-display text-lg font-bold text-ink-900">{step.title}</h3>
              <p className="text-sm leading-relaxed text-ink-500">{step.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
