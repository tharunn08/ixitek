// FamilyBrowse — the default way to browse a catalog category.
// Instead of one card per SKU (e.g. 8 near-identical LC cables differing only
// by length), show one card per product, with the other types available
// listed underneath. Clicking the card opens the product page, which has the
// variant selector for all lengths/options.
//
//  • A top-level category (e.g. Fiber Optic Cables) → one card per
//    sub-category (LC, MPO12, SN …) listing the products inside it.
//  • A sub-category (e.g. LC) → one card per product (family) listing the
//    lengths/options it comes in, with the "from" price.
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { formatPrice } from "../../lib/catalogApi.js";
import ProductImage from "./ProductImage.jsx";

const familyHref = (f) => (f.productSlug ? `/product/${f.productSlug}` : `/catalog/${f.category.slug}?family=${f.slug}&all=1`);

/** Top-level category: a card per sub-category with its products listed below. */
export function SubcategoryGrid({ subcategories, families }) {
  const byCat = new Map();
  for (const f of families) {
    if (!byCat.has(f.category.slug)) byCat.set(f.category.slug, []);
    byCat.get(f.category.slug).push(f);
  }
  const cards = subcategories.filter((c) => c.totalProducts > 0 || byCat.get(c.slug)?.length);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="subcategory-grid">
      {cards.map((c) => {
        const fams = byCat.get(c.slug) || [];
        const image = fams.find((f) => f.image)?.image || null;
        return (
          <article key={c.slug} className="group flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white transition-shadow hover:shadow-[0_12px_32px_-16px_rgba(15,37,84,0.35)]">
            <Link to={`/catalog/${c.slug}`} className="focus-ring block border-b border-ink-100 bg-white p-3" aria-label={`${c.name} — ${c.totalProducts} products`}>
              <div className="transition-transform duration-300 group-hover:scale-[1.03]">
                <ProductImage image={image} alt={c.name} ratio="aspect-[16/9]" />
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-4">
              <Link to={`/catalog/${c.slug}`} className="focus-ring flex items-baseline justify-between gap-2 rounded">
                <h2 className="font-display text-base font-bold text-ink-900 hover:text-brand-700">{c.name}</h2>
                <span className="shrink-0 text-xs text-ink-400">{c.totalProducts} items</span>
              </Link>
              <ul className="mt-2 flex flex-col gap-0.5">
                {fams.slice(0, 6).map((f) => (
                  <li key={f.slug}>
                    <Link to={familyHref(f)} className="focus-ring flex items-baseline justify-between gap-2 rounded py-0.5 text-sm text-ink-600 hover:text-brand-700">
                      <span className="truncate">{f.name}</span>
                      {f.variants?.length > 1 && <span className="shrink-0 text-[11px] text-ink-400">{f.variants.length} options</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to={`/catalog/${c.slug}`} className="focus-ring mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-brand-700 hover:text-brand-800">
                {fams.length > 6 ? `View all ${fams.length} products` : `Shop ${c.name}`} <Icon name="ArrowRight" className="h-3 w-3" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Sub-category: a card per product with the lengths / options it comes in. */
export function FamilyGrid({ families }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="family-grid">
      {families.map((f) => (
        <FamilyCard key={f.slug} f={f} />
      ))}
    </div>
  );
}

const MAX_CHIPS = 8;

function FamilyCard({ f }) {
  const href = familyHref(f);
  const from = formatPrice(f.fromPrice);
  const variants = f.variants || [];
  const extra = variants.length - MAX_CHIPS;
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white transition-shadow hover:shadow-[0_12px_32px_-16px_rgba(15,37,84,0.35)]">
      <Link to={href} className="focus-ring block border-b border-ink-100 bg-white p-3" aria-label={f.name}>
        <div className="transition-transform duration-300 group-hover:scale-[1.03]">
          <ProductImage image={f.image} alt={f.name} ratio="aspect-[16/9]" />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link to={href} className="focus-ring rounded">
          <h2 className="font-display text-base font-bold leading-snug text-ink-900 hover:text-brand-700">{f.name}</h2>
        </Link>
        <div className="mt-1 text-sm">
          {from ? (
            <span className="text-ink-500">From <b className="font-display tabular-nums text-ink-900">{from}</b></span>
          ) : (
            <span className="font-semibold text-brand-700">Request a Quote</span>
          )}
        </div>
        {variants.length > 1 && (
          <div className="mt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{variants.length} options available</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {variants.slice(0, MAX_CHIPS).map((v) => (
                <li key={v.slug} className="max-w-full">
                  <Link to={`/product/${v.slug}`} title={v.label} className="focus-ring block max-w-[14rem] truncate rounded-md border border-ink-200 px-2 py-0.5 text-xs text-ink-700 hover:border-brand-400 hover:text-brand-700">
                    {v.label}
                  </Link>
                </li>
              ))}
              {extra > 0 && (
                <li>
                  <Link to={href} className="focus-ring block rounded-md px-2 py-0.5 text-xs font-semibold text-brand-700 hover:underline">+{extra} more</Link>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="mt-auto pt-4">
          <Link to={href} className="focus-ring flex items-center justify-center gap-1.5 rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            View product <Icon name="ArrowRight" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
