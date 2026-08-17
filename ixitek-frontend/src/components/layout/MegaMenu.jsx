import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { categories, getFamiliesForCategory } from "../../data/products.js";

export default function MegaMenu({ open, onClose }) {
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
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
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
