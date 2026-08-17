import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { categories, getFamiliesForCategory } from "../../data/products.js";

const whoWeAreItems = [
  { label: "Company", to: "/company", icon: "Building2", description: "Our story, process & values" },
  { label: "Partners", to: "/partners", icon: "Handshake", description: "OEM alliances & clients" },
];

export default function MobileNav({ open, onClose }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-sm lg:hidden"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-[88%] max-w-sm flex-col bg-white shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                Menu
              </span>
              <button
                onClick={onClose}
                className="focus-ring rounded-md p-2 text-ink-500 hover:bg-ink-100"
                aria-label="Close menu"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-1">
                <div className="border-b border-ink-100 py-2">
                  <button
                    onClick={() => setExpanded(expanded === "who-we-are" ? null : "who-we-are")}
                    className="focus-ring flex w-full items-center justify-between rounded-md py-2 text-left"
                  >
                    <span className="flex items-center gap-2.5 font-display text-sm font-bold text-ink-900">
                      <Icon name="Users" className="h-4 w-4 text-brand-600" />
                      Who We Are
                    </span>
                    <Icon
                      name="ChevronDown"
                      className={`h-4 w-4 text-ink-400 transition-transform ${
                        expanded === "who-we-are" ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {expanded === "who-we-are" && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pl-6"
                      >
                        {whoWeAreItems.map((item) => (
                          <li key={item.to} className="py-1.5">
                            <Link to={item.to} onClick={onClose} className="flex flex-col text-sm">
                              <span className="font-semibold text-ink-700">{item.label}</span>
                              <span className="text-xs text-ink-400">{item.description}</span>
                            </Link>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
                {categories.map((cat) => {
                  const fams = getFamiliesForCategory(cat.slug);
                  const isOpen = expanded === cat.id;
                  return (
                    <div key={cat.id} className="border-b border-ink-100 py-2">
                      <button
                        onClick={() => setExpanded(isOpen ? null : cat.id)}
                        className="focus-ring flex w-full items-center justify-between rounded-md py-2 text-left"
                      >
                        <span className="flex items-center gap-2.5 font-display text-sm font-bold text-ink-900">
                          <Icon name={cat.icon} className="h-4 w-4 text-brand-600" />
                          {cat.name}
                        </span>
                        <Icon
                          name="ChevronDown"
                          className={`h-4 w-4 text-ink-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.ul
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden pl-6"
                          >
                            <li className="py-1.5">
                              <Link
                                to={`/products/${cat.slug}`}
                                onClick={onClose}
                                className="text-sm font-semibold text-brand-600"
                              >
                                View all {cat.name}
                              </Link>
                            </li>
                            {fams.map((f) => (
                              <li key={f.id} className="py-1.5">
                                <Link
                                  to={`/products/${cat.slug}/${f.slug}`}
                                  onClick={onClose}
                                  className="text-sm text-ink-500"
                                >
                                  {f.name}
                                </Link>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <Link
                  to="/career"
                  onClick={onClose}
                  className="focus-ring rounded-md py-2.5 text-sm font-semibold text-ink-700"
                >
                  Career
                </Link>
                <Link
                  to="/contact"
                  onClick={onClose}
                  className="focus-ring rounded-md py-2.5 text-sm font-semibold text-ink-700"
                >
                  Contact Us
                </Link>
              </div>
            </div>
            <div className="border-t border-ink-100 p-5">
              <Link
                to="/contact"
                onClick={onClose}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3.5 text-base font-semibold text-white hover:bg-brand-700"
              >
                Get a quote
                <Icon name="ArrowRight" className="h-5 w-5" />
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
