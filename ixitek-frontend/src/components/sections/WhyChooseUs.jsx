import Reveal from "../ui/Reveal.jsx";
import SectionHeading from "../ui/SectionHeading.jsx";
import { Icon } from "../../lib/icons.jsx";
import { company } from "../../data/company.js";

const icons = ["Gauge", "Handshake", "Sparkles", "Globe2"];

export default function WhyChooseUs() {
  return (
    <section className="py-14 sm:py-16">
      <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            eyebrow="Why Ixitek"
            title="Built for teams who can't afford network downtime"
            description="We combine engineering rigor with a lean, responsive team — so procurement decisions turn into working infrastructure, fast."
          />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {company.values.map((v, i) => (
            <Reveal key={v.id} delay={i * 0.08}>
              <div className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Icon name={icons[i % icons.length]} className="h-5 w-5" />
                </span>
                <h3 className="font-display text-base font-bold text-ink-900">{v.title}</h3>
                <p className="text-sm leading-relaxed text-ink-500">{v.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
