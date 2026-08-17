import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import ProductVisual from "../ui/ProductVisual.jsx";
import { getCategory } from "../../data/products.js";

export default function FamilyCard({ family, toneIndex = 0, showCategory = false }) {
  const category = showCategory ? getCategory(family.categorySlug) : null;

  return (
    <Link
      to={`/products/${family.categorySlug}/${family.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-card-hover"
    >
      <div className="relative">
        <ProductVisual icon={family.icon} toneIndex={toneIndex} className="h-44 w-full" />
        <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-brand-600 opacity-0 shadow-md backdrop-blur transition-all duration-300 group-hover:opacity-100">
          <Icon name="ZoomIn" className="h-4 w-4" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        {category && (
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-brand-600">
            {category.name}
          </span>
        )}
        <h3 className="font-display text-base font-bold text-ink-900">{family.name}</h3>
        <p className="flex-1 text-sm leading-relaxed text-ink-500">{family.shortDescription}</p>
        <div className="flex items-center justify-between border-t border-ink-100 pt-4">
          <span className="text-xs font-medium text-ink-400">
            {family.variants.length} variant{family.variants.length !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
            View details
            <Icon name="ArrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}
