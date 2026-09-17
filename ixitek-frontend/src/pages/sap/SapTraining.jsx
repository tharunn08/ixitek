import { Link } from "react-router-dom";
import SapPageHero from "../../components/sap/SapPageHero.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { sapTraining } from "../../data/sap.js";

export default function SapTraining() {
  useDocumentTitle(
    "SAP Training Courses with Hands-On System Access",
    "Instructor-led, virtual and self-paced SAP courses across functional, technical and cloud tracks, with certification preparation."
  );

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "Training" }]}
        eyebrow="Pillar one"
        icon="GraduationCap"
        title="SAP training that makes users independent"
        description="Live system access, realistic master data and end-to-end business scenarios — not isolated screen walkthroughs."
      />

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal>
            <SectionHeading eyebrow="Overview" title="Built around real system access" />
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4">
            {sapTraining.overview.map((p, i) => (
              <p key={i} className="text-base leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading eyebrow="Delivery modes" title="Learn the way that fits your schedule" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sapTraining.deliveryModes.map((mode, i) => (
              <Reveal key={mode.title} delay={i * 0.06}>
                <div className="group flex h-full flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-card-hover">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                    <Icon name={mode.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-sm font-bold text-ink-900">{mode.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500">{mode.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-5">
            <SectionHeading eyebrow="Included with every course" title="What every course includes" />
            <div className="flex flex-col gap-2.5">
              {sapTraining.includes.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm text-ink-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col gap-5">
            <SectionHeading eyebrow="Who it's for" title="Who our training is for" />
            <div className="flex flex-col gap-2.5">
              {sapTraining.audience.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Icon name="Check" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-teal-600" />
                  <span className="text-sm text-ink-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14 sm:py-16">
        <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-2">
          <Reveal className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon name="BadgeCheck" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-bold text-ink-900">Certification preparation</h3>
            {sapTraining.certification.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon name="ClipboardList" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-bold text-ink-900">Typical course structure</h3>
            {sapTraining.structure.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-500">{p}</p>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-teal-100 bg-teal-50/60 px-6 py-12 text-center sm:px-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
              <Icon name="Layers3" className="h-5.5 w-5.5" />
            </span>
            <h2 className="max-w-lg text-balance font-display text-2xl font-bold text-ink-900">
              Not sure which course fits your background?
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-600">
              Book a free career guidance call and we'll recommend a path based on your experience and goals.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/sap/contact?interest=training"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                Book a guidance call
                <Icon name="ArrowRight" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
