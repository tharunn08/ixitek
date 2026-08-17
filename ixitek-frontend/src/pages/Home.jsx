import Hero from "../components/sections/Hero.jsx";
import PartnersStrip from "../components/sections/PartnersStrip.jsx";
import ProductCategoryGrid from "../components/sections/ProductCategoryGrid.jsx";
import WhyChooseUs from "../components/sections/WhyChooseUs.jsx";
import ProcessSteps from "../components/sections/ProcessSteps.jsx";
import CTASection from "../components/sections/CTASection.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import FamilyCard from "../components/product/FamilyCard.jsx";
import { families } from "../data/products.js";

const featuredSlugs = ["transceivers-aoc-dac", "optical-switches", "pdus", "patch-cords"];

export default function Home() {
  const featured = featuredSlugs
    .map((slug) => families.find((f) => f.slug === slug))
    .filter(Boolean);

  return (
    <>
      <Hero />
      <PartnersStrip />
      <ProductCategoryGrid />

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading
            eyebrow="Featured this quarter"
            title="Popular across our catalogue"
            description="A cross-section of the products enterprise and carrier networks order most often."
          />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((f, i) => (
              <Reveal key={f.id} delay={i * 0.08}>
                <FamilyCard family={f} toneIndex={i} showCategory />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WhyChooseUs />
      <ProcessSteps />
      <CTASection />
    </>
  );
}
