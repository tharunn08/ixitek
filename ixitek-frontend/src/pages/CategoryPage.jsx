import { useParams, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import Breadcrumbs from "../components/layout/Breadcrumbs.jsx";
import Badge from "../components/ui/Badge.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import ProductVisual from "../components/ui/ProductVisual.jsx";
import FamilyCard from "../components/product/FamilyCard.jsx";
import CTASection from "../components/sections/CTASection.jsx";
import { Icon } from "../lib/icons.jsx";
import { getCategory, getFamiliesForCategory, categories } from "../data/products.js";

export default function CategoryPage() {
  const { categorySlug } = useParams();
  const category = getCategory(categorySlug);

  if (!category) return <Navigate to="/products" replace />;

  const catFamilies = getFamiliesForCategory(categorySlug);
  const catIndex = categories.findIndex((c) => c.slug === categorySlug);
  const otherCategories = categories.filter((c) => c.slug !== categorySlug);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950 py-12 sm:py-14">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="absolute -top-24 right-10 h-80 w-80 rounded-full bg-brand-600/25 blur-[110px]" />
        <div className="container-page relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Products", to: "/products" }, { label: category.name }]} light />
            <Badge tone="white">
              <Icon name={category.icon} className="h-3.5 w-3.5" />
              {category.stat.value} {category.stat.label}
            </Badge>
            <h1 className="max-w-xl text-balance font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
              {category.name}
            </h1>
            <p className="max-w-lg text-balance text-base leading-relaxed text-ink-300 sm:text-lg">
              {category.heroDescription}
            </p>
          </motion.div>
          <Reveal delay={0.15} className="hidden lg:block">
            <ProductVisual
              icon={category.icon}
              image={category.image}
              alt={category.name}
              toneIndex={catIndex}
              className="aspect-square w-full rounded-2xl"
              iconClassName="h-20 w-20"
              fit="cover"
            />
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Product families"
            title={`Explore ${category.name}`}
            description={category.shortDescription}
          />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catFamilies.map((f, i) => (
              <Reveal key={f.id} delay={i * 0.07}>
                <FamilyCard family={f} toneIndex={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/40 py-14">
        <div className="container-page">
          <SectionHeading eyebrow="Browse more" title="Other product categories" align="left" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {otherCategories.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.08}>
                <Link
                  to={`/products/${c.slug}`}
                  className="group flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon name={c.icon} className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-display text-sm font-bold text-ink-900">{c.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">{c.stat.value} {c.stat.label}</span>
                  </span>
                  <Icon name="ArrowRight" className="ml-auto h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={`Need help specifying ${category.name.replace(/t&m/gi, "T&M").toLowerCase()}?`}
        description="Share your project details and our engineers will recommend the right configuration."
      />
    </>
  );
}
