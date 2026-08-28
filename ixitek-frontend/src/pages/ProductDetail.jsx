import { useState } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import Button from "../components/ui/Button.jsx";
import ProductGallery from "../components/product/ProductGallery.jsx";
import SpecTable from "../components/product/SpecTable.jsx";
import VariantGrid from "../components/product/VariantGrid.jsx";
import RelatedFamilies from "../components/product/RelatedFamilies.jsx";
import EnquiryForm from "../components/forms/EnquiryForm.jsx";
import { Icon } from "../lib/icons.jsx";
import { getCategory, getFamily, getRelatedFamilies } from "../data/products.js";

export default function ProductDetail() {
  const { categorySlug, familySlug } = useParams();
  const navigate = useNavigate();
  const category = getCategory(categorySlug);
  const family = category ? getFamily(categorySlug, familySlug) : null;
  const [enquiryPreset, setEnquiryPreset] = useState("");

  if (!category || !family) return <Navigate to="/products" replace />;

  const related = getRelatedFamilies(family);

  function handleEnquire(variant) {
    setEnquiryPreset(
      variant
        ? `I'd like a quote for: ${family.name} — ${variant}`
        : `I'd like a quote for: ${family.name}`
    );
    setTimeout(() => {
      document.getElementById("enquiry-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <>
      <section className="border-b border-ink-100 bg-ink-50/40 py-6">
        <div className="container-page">
          <Breadcrumbs
            items={[
              { label: "Products", to: "/products" },
              { label: category.name, to: `/products/${category.slug}` },
              { label: family.name },
            ]}
          />
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-2">
          <Reveal>
            <ProductGallery icon={family.icon} name={family.name} image={family.image} />
          </Reveal>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <Badge>{category.name}</Badge>
              <h1 className="text-balance font-display text-3xl font-extrabold leading-tight text-ink-900 sm:text-4xl">
                {family.name}
              </h1>
              <p className="text-balance text-base leading-relaxed text-ink-500">
                {family.description}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 border-y border-ink-100 py-5">
              {family.highlights.map((h) => (
                <div key={h} className="flex items-start gap-3">
                  <Icon name="CheckCircle2" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-600" />
                  <span className="text-sm text-ink-600">{h}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button icon="Send" onClick={() => handleEnquire(null)}>
                Request a Quote
              </Button>
              <Button variant="secondary" icon="ArrowRight" onClick={() => navigate(`/products/${category.slug}`)}>
                Back to {category.name}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-t border-ink-100 py-12 sm:py-14">
        <div className="container-page grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="flex flex-col gap-5">
            <h2 className="font-display text-xl font-bold text-ink-900">Specifications</h2>
            <SpecTable specs={family.specs} />
          </Reveal>
          <Reveal delay={0.08} className="flex flex-col gap-5">
            <h2 className="font-display text-xl font-bold text-ink-900">
              Available variants
              <span className="ml-2 text-sm font-medium text-ink-400">({family.variants.length})</span>
            </h2>
            <VariantGrid variants={family.variants} onEnquire={handleEnquire} />
          </Reveal>
        </div>
      </section>

      <section id="enquiry-panel" className="border-t border-ink-100 bg-ink-50/40 py-14">
        <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Badge>Enquiry</Badge>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Request pricing &amp; availability
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-500">
              Send us your quantity, timeline and any custom specification for{" "}
              <span className="font-semibold text-ink-700">{family.name}</span> — our team
              typically responds within one business day.
            </p>
            <div className="mt-2 flex flex-col gap-2 text-sm text-ink-600">
              <span className="flex items-center gap-2">
                <Icon name="Mail" className="h-4 w-4 text-brand-500" /> sales@ixitek.in
              </span>
              <span className="flex items-center gap-2">
                <Icon name="Phone" className="h-4 w-4 text-brand-500" /> +91 99452 22724
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <EnquiryForm presetSubject={enquiryPreset} key={enquiryPreset} />
          </div>
        </div>
      </section>

      <RelatedFamilies families={related} />
    </>
  );
}
