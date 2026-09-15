import SapPageHero from "../../components/sap/SapPageHero.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Button from "../../components/ui/Button.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { sapImplementation } from "../../data/sap.js";

export default function SapImplementation() {
  useDocumentTitle(
    "SAP Implementation Services Using SAP Activate",
    "New implementations, SAP S/4HANA conversions and rollouts delivered through the six phases of the SAP Activate methodology."
  );

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "Implementation" }]}
        eyebrow="Pillar two"
        icon="Workflow"
        title="Implementation succeeds or fails on discipline"
        description="Scope defined before configuration. Data cleansed before migration. Users trained before go-live. We run every engagement through the SAP Activate methodology."
      />

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal>
            <SectionHeading eyebrow="Overview" title="Run to a proven methodology" />
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4">
            {sapImplementation.overview.map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading eyebrow="Implementation types" title="Four ways to get there" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sapImplementation.types.map((t, i) => (
              <Reveal key={t.title} delay={i * 0.07}>
                <div className="group flex h-full flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={t.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-sm font-bold text-ink-900">{t.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{t.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16 lg:py-20">
        <div className="container-page">
          <SectionHeading eyebrow="Our methodology" title="The six phases of SAP Activate" description="Every implementation moves through the same disciplined sequence, scaled to the size and risk profile of the engagement." />
          <div className="relative mt-12">
            <div className="absolute left-[27px] top-2 hidden h-[calc(100%-2rem)] w-px bg-ink-200 sm:block" />
            <div className="flex flex-col gap-6">
              {sapImplementation.phases.map((phase, i) => (
                <Reveal key={phase.step} delay={i * 0.06}>
                  <div className="relative flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:flex-row sm:items-start sm:gap-6">
                    <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-600 font-display text-lg font-extrabold text-white">
                      {phase.step}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-display text-lg font-bold text-ink-900">{phase.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-500">{phase.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                        <Icon name="FileCheck2" className="h-3.5 w-3.5" />
                        Deliverable: {phase.deliverable}
                      </span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-5">
            <SectionHeading eyebrow="Scope of work" title="Core implementation workstreams" />
            <div className="flex flex-col gap-2.5">
              {sapImplementation.workstreams.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm text-ink-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-5">
            <SectionHeading eyebrow="Handover" title="What you receive" />
            <div className="flex flex-col gap-2.5">
              {sapImplementation.deliverables.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Icon name="FileText" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm text-ink-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-teal-100 bg-teal-50/60 px-6 py-12 text-center sm:px-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Icon name="Workflow" className="h-5.5 w-5.5" />
            </span>
            <h2 className="max-w-lg text-balance font-display text-2xl font-bold text-ink-900">
              Planning a move to SAP S/4HANA?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-600">
              Request a discovery assessment and we'll return an indicative timeline, effort and cost model.
            </p>
            <Button to="/sap/contact?interest=implementation" variant="teal" icon="ArrowRight">
              Request a discovery assessment
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
