import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { useEffect, useState } from "react";
import { categories, getFamiliesForCategory } from "../../data/products.js";
import { getMenu } from "../../lib/catalogApi.js";

// The "Fiber Optics" column is the live, database-driven online catalog
// (Fiber Optic Cables + its sub-categories with product counts, then
// Optical Transceivers). It replaces the old static Fiber Optics column so
// the menu no longer shows two fiber sections. If the catalog API is
// unreachable, the old static column is shown as a fallback.
function useCatalogMenu() {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    getMenu().then(setMenu).catch(() => setMenu(null));
  }, []);
  return menu?.categories?.length ? menu.categories : null;
}

function CatalogColumn({ categories: cats, onClose }) {
  return (
    <div className="flex flex-col gap-2">
      {cats.map((c, i) => (
        <div key={c.slug} className={i > 0 ? "mt-2" : ""}>
          <Link to={`/catalog/${c.slug}`} onClick={onClose} className="group flex items-center gap-2 focus-ring rounded-md">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
              <Icon name={c.icon || "Boxes"} className="h-4 w-4" />
            </span>
            <span className="font-display text-sm font-bold text-ink-900 group-hover:text-brand-600">{c.name}</span>
            {!c.totalProducts && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Soon</span>}
          </Link>
          {c.children.length > 0 && (
            <ul className="mt-2 flex flex-col border-l border-ink-100 pl-3">
              {c.children.map((k) => (
                <li key={k.slug}>
                  <Link to={`/catalog/${k.slug}`} onClick={onClose} className="focus-ring flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-sm text-ink-500 transition-colors hover:text-brand-600">
                    <span className="truncate">{k.name}</span>
                    <span className="text-[11px] text-ink-400">{k.totalProducts}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {c.totalProducts > 0 && (
            <Link to={`/catalog/${c.slug}`} onClick={onClose} className="focus-ring mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all {c.totalProducts} <Icon name="ArrowRight" className="h-3 w-3" />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MegaMenu({ open, onClose }) {
  const catalog = useCatalogMenu();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onMouseLeave={onClose}
          className="absolute inset-x-0 top-full z-40 border-t border-ink-100 bg-white shadow-[0_24px_48px_-12px_rgba(15,37,84,0.18)]"
        >
          <div className="container-page grid grid-cols-4 gap-6 py-6">
            {categories.map((cat) => {
              if (cat.slug === "fiber-optics" && catalog) return <CatalogColumn key={cat.id} categories={catalog} onClose={onClose} />;
              const fams = getFamiliesForCategory(cat.slug).slice(0, 5);
              return (
                <div key={cat.id} className="flex flex-col gap-2">
                  <Link
                    to={`/products/${cat.slug}`}
                    onClick={onClose}
                    className="group flex items-center gap-2 focus-ring rounded-md"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                      <Icon name={cat.icon} className="h-4 w-4" />
                    </span>
                    <span className="font-display text-sm font-bold text-ink-900 group-hover:text-brand-600">
                      {cat.name}
                    </span>
                  </Link>
                  <ul className="flex flex-col border-l border-ink-100 pl-3">
                    {cat.slug === "enterprise-solutions" && (
                      <li className="mb-1.5 border-b border-dashed border-ink-100 pb-1.5">
                        <Link
                          to="/sap"
                          onClick={onClose}
                          className="focus-ring group/sap flex items-center gap-1.5 rounded px-1.5 py-0.5 font-display text-sm font-bold text-teal-700 transition-colors hover:text-teal-800"
                        >
                          <Icon name="Layers3" className="h-3.5 w-3.5" />
                          ERP/SAP
                          <Icon
                            name="ArrowRight"
                            className="h-3 w-3 transition-transform group-hover/sap:translate-x-0.5"
                          />
                        </Link>
                      </li>
                    )}
                    {fams.map((f) => (
                      <li key={f.id}>
                        <Link
                          to={`/products/${cat.slug}/${f.slug}`}
                          onClick={onClose}
                          className="focus-ring block rounded px-1.5 py-0.5 text-sm text-ink-500 transition-colors hover:text-brand-600"
                        >
                          {f.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/products/${cat.slug}`}
                    onClick={onClose}
                    className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    View all
                    <Icon name="ArrowRight" className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="border-t border-ink-100 bg-ink-50/60">
            <div className="container-page flex items-center justify-between py-3">
              <p className="text-sm text-ink-500">
                Not sure where to start? Browse the complete catalogue or talk to our team.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/products"
                  onClick={onClose}
                  className="focus-ring text-sm font-semibold text-ink-700 hover:text-brand-600"
                >
                  All products
                </Link>
                <Link
                  to="/contact"
                  onClick={onClose}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-700 hover:shadow-[0_8px_20px_-6px_rgba(29,84,201,0.45)]"
                >
                  Get a quote
                  <Icon name="ArrowRight" className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}