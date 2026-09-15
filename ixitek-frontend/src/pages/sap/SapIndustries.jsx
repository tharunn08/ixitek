import SapPageHero from "../../components/sap/SapPageHero.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Button from "../../components/ui/Button.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { sapIndustries } from "../../data/sap.js";

export default function SapIndustries() {
  useDocumentTitle(
    "Industries We Serve — SAP Training, Implementation & Support",
    "Sector-specific SAP experience across manufacturing, retail, pharmaceuticals, automotive, energy, logistics, professional services and public sector."
  );

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "Industries" }]}
        eyebrow="Section 8"
        icon="Factory"
        title="SAP is configured differently in every industry"
        description="Our consultants bring sector-specific experience so design conversations start from an understanding of how your industry actually operates."
      />

      <section className="py-14 sm:py-16 lg:py-20">
        <div className="container-page">
          <SectionHeading eyebrow="Sector experience" title="Where our consultants have delivered" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sapIndustries.map((ind, i) => (
              <Reveal key={ind.id} delay={i * 0.06}>
                <div className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={ind.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-base font-bold text-ink-900">{ind.name}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{ind.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page">
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Icon name="Handshake" className="h-5.5 w-5.5" />
            </span>
            <h2 className="max-w-lg text-balance font-display text-2xl font-bold text-ink-900">
              Don't see your industry listed?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-600">
              Tell us about your sector and process scope — our consultants have worked across a wide range of business models beyond this list.
            </p>
            <Button to="/sap/contact" variant="teal" icon="ArrowRight">
              Tell us about your project
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
