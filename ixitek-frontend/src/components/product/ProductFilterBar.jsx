import { Icon } from "../../lib/icons.jsx";
import { categories } from "../../data/products.js";

export default function ProductFilterBar({ query, onQuery, activeCategory, onCategory, resultCount }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <div className="relative">
        <Icon name="Search" className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search products, e.g. LC connector, PDU, transceiver..."
          className="focus-ring w-full rounded-lg border border-ink-200 bg-ink-50/50 py-3 pl-11 pr-4 text-sm text-ink-800 placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:bg-white"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onCategory("all")}
          className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeCategory === "all"
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600"
          }`}
        >
          All Categories
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onCategory(c.slug)}
            className={`focus-ring flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === c.slug
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600"
            }`}
          >
            <Icon name={c.icon} className="h-3.5 w-3.5" />
            {c.name}
          </button>
        ))}
        <span className="ml-auto text-xs font-medium text-ink-400">
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
