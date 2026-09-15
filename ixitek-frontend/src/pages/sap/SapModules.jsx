import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SapPageHero from "../../components/sap/SapPageHero.jsx";
import ModuleCard from "../../components/sap/ModuleCard.jsx";
import SectionHeading from "../../components/ui/SectionHeading.jsx";
import Reveal from "../../components/ui/Reveal.jsx";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { moduleFamilies, sapModules, searchModules } from "../../data/sap.js";

export default function SapModules() {
  useDocumentTitle(
    "SAP Modules Explained — Functions & Business Benefits",
    "A guide to 25 SAP modules across core ERP, SAP S/4HANA, cloud solutions and technical areas."
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const familyParam = searchParams.get("family") || "all";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const base = query.trim() ? searchModules(query) : sapModules;
    if (familyParam === "all") return base;
    return base.filter((m) => m.familySlug === familyParam);
  }, [query, familyParam]);

  function setFamily(slug) {
    if (slug === "all") {
      searchParams.delete("family");
    } else {
      searchParams.set("family", slug);
    }
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <>
      <SapPageHero
        crumbs={[{ label: "Modules" }]}
        eyebrow="Section 6"
        icon="Layers3"
        title="25 SAP modules explained"
        description="Core ERP functional modules, SAP S/4HANA lines of business, cloud solutions and technical modules — what each one does, the benefits it delivers, and who should learn it."
      />

      <section className="py-14 sm:py-16">
        <div className="container-page">
          <SectionHeading eyebrow="Browse by family" title="Find the right module" />

          <div className="mt-8 flex flex-col gap-5 rounded-2xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
            <div className="relative">
              <Icon name="Search" className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules, e.g. FI, procurement, ABAP..."
                className="focus-ring w-full rounded-lg border border-ink-200 bg-ink-50/50 py-3 pl-11 pr-4 text-sm text-ink-800 placeholder:text-ink-400 focus-visible:border-teal-400 focus-visible:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFamily("all")}
                className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  familyParam === "all"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-teal-300 hover:text-teal-700"
                }`}
              >
                All modules ({sapModules.length})
              </button>
              {moduleFamilies.map((f) => (
                <button
                  key={f.slug}
                  onClick={() => setFamily(f.slug)}
                  className={`focus-ring flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    familyParam === f.slug
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-teal-300 hover:text-teal-700"
                  }`}
                >
                  <Icon name={f.icon} className="h-3.5 w-3.5" />
                  {f.name}
                </button>
              ))}
              <span className="ml-auto text-xs font-medium text-ink-400">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {familyParam !== "all" && (
              <p className="text-sm text-ink-500">
                {moduleFamilies.find((f) => f.slug === familyParam)?.description}
              </p>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-14 flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                <Icon name="Search" className="h-6 w-6" />
              </span>
              <h3 className="font-display text-lg font-bold text-ink-800">No modules match</h3>
              <p className="max-w-sm text-sm text-ink-500">Try a different search term or clear the family filter.</p>
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m, i) => (
                <Reveal key={m.slug} delay={Math.min(i * 0.04, 0.4)}>
                  <ModuleCard module={m} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
