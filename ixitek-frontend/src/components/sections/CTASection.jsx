import Button from "../ui/Button.jsx";
import Reveal from "../ui/Reveal.jsx";

export default function CTASection({
  eyebrow = "Get started",
  title = "Ready to spec your next build?",
  description = "Send us your requirements and our engineering team will respond with a tailored proposal within one business day.",
  primaryLabel = "Request a Quote",
  primaryTo = "/contact",
  secondaryLabel = "View Products",
  secondaryTo = "/products",
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-[#0f2454] to-brand-950 py-14 sm:py-16">
      <div className="absolute inset-0 bg-grid opacity-[0.06]" />
      <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-[130px]" />
      <div className="container-page relative flex flex-col items-center gap-6 text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-200">
            {eyebrow}
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="max-w-2xl text-balance font-display text-3xl font-extrabold text-white sm:text-4xl">
            {title}
          </h2>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="max-w-xl text-balance text-base leading-relaxed text-ink-300">
            {description}
          </p>
        </Reveal>
        <Reveal delay={0.2} className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button to={primaryTo} size="lg" icon="ArrowRight">
            {primaryLabel}
          </Button>
          <Button to={secondaryTo} size="lg" variant="outlineLight">
            {secondaryLabel}
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
