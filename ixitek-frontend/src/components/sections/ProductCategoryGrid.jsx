import { Link } from "react-router-dom";
import Reveal from "../ui/Reveal.jsx";
import SectionHeading from "../ui/SectionHeading.jsx";
import ProductVisual from "../ui/ProductVisual.jsx";
import { Icon } from "../../lib/icons.jsx";
import { categories } from "../../data/products.js";

export default function ProductCategoryGrid() {
  return (
    <section className="bg-ink-50/40 py-14 sm:py-16">
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            eyebrow="Products &amp; solutions"
            title="Four product families. One infrastructure partner."
            description="From the fiber strand to the finished rack, we source, test and support the components enterprise networks run on."
          />
          <Link
            to="/products"
            className="focus-ring hidden shrink-0 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-600 sm:inline-flex"
          >
            View all products
            <Icon name="ArrowRight" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat, i) => (
            <Reveal key={cat.id} delay={i * 0.08}>
              <Link
                to={`/products/${cat.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover"
              >
                <ProductVisual icon={cat.icon} toneIndex={i} className="h-40 w-full" iconClassName="h-10 w-10" />
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {cat.stat.value} {cat.stat.label}
                  </span>
                  <h3 className="font-display text-lg font-bold text-ink-900">{cat.name}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-ink-500">{cat.shortDescription}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                    Explore
                    <Icon name="ArrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 sm:hidden">
          <Link
            to="/products"
            className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700"
          >
            View all products
            <Icon name="ArrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
