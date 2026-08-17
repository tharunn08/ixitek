import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import ProductFilterBar from "../components/product/ProductFilterBar.jsx";
import FamilyCard from "../components/product/FamilyCard.jsx";
import CTASection from "../components/sections/CTASection.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import { Icon } from "../lib/icons.jsx";
import { families } from "../data/products.js";

export default function Products() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return families.filter((f) => {
      const matchesCategory = activeCategory === "all" || f.categorySlug === activeCategory;
      const matchesQuery =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.shortDescription.toLowerCase().includes(q) ||
        f.variants.some((v) => v.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [query, activeCategory]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 right-10 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative flex flex-col gap-6">
          <Breadcrumbs items={[{ label: "Products & Solutions" }]} light />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge tone="white">Full catalogue</Badge>
            <h1 className="mt-5 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
              Every product family, in one searchable catalogue.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
              Filter by category or search by name to find the exact connector, cable, switch or
              service your build requires.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <ProductFilterBar
            query={query}
            onQuery={setQuery}
            activeCategory={activeCategory}
            onCategory={setActiveCategory}
            resultCount={filtered.length}
          />

          {filtered.length > 0 ? (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((f, i) => (
                <Reveal key={f.id} delay={Math.min(i, 6) * 0.05}>
                  <FamilyCard family={f} toneIndex={i} showCategory />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                <Icon name="Search" className="h-6 w-6" />
              </span>
              <h3 className="font-display text-lg font-bold text-ink-800">No products match your search</h3>
              <p className="max-w-sm text-sm text-ink-500">
                Try a different keyword or clear filters — or send us your requirement directly.
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setActiveCategory("all");
                }}
                className="focus-ring mt-2 rounded-md border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-600"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </section>

      <CTASection
        title="Can't find what you're looking for?"
        description="Our catalogue covers hundreds of SKUs beyond what's listed here — send us your spec and we'll source it."
      />
    </>
  );
}
