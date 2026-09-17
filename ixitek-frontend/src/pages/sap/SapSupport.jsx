import SapPageHero from "../../components/sap/SapPageHero.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import Button from "../../components/ui/Button.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { sapSupport } from "../../data/sap.js";

export default function SapSupport() {
  useDocumentTitle(
    "SAP Support and Application Management Services",
    "Incident resolution, enhancements, release management and monitoring under a defined service level agreement."
  );

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "Support" }]}
        eyebrow="Pillar three"
        icon="LifeBuoy"
        title="An SAP system is never finished"
        description="Application management that keeps your landscape stable, secure and current — so your internal team can focus on business change, not ticket handling."
      />

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal>
            <SectionHeading eyebrow="Overview" title="Ongoing ownership of your landscape" />
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4">
            {sapSupport.overview.map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading eyebrow="Support scope" title="What's covered" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sapSupport.scope.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.06}>
                <div className="group flex h-full flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-sm font-bold text-ink-900">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{s.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading eyebrow="Engagement models" title="Coverage that fits your risk profile" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sapSupport.engagementModels.map((m, i) => (
              <Reveal key={m.title} delay={i * 0.07}>
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon name={m.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-sm font-bold text-ink-900">{m.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{m.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon name="Gauge" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-bold text-ink-900">Service levels</h3>
            {sapSupport.serviceLevels.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon name="RefreshCw" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-bold text-ink-900">Transition &amp; onboarding</h3>
            {sapSupport.transition.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-teal-100 bg-teal-50/60 px-6 py-12 text-center sm:px-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Icon name="LifeBuoy" className="h-5.5 w-5.5" />
            </span>
            <h2 className="max-w-lg text-balance font-display text-2xl font-bold text-ink-900">
              Need a support partner who answers the phone?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-600">
              Share your landscape details and coverage requirements — we'll size an engagement and propose service levels.
            </p>
            <Button to="/sap/contact?interest=support" variant="teal" icon="ArrowRight">
              Request a support proposal
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
