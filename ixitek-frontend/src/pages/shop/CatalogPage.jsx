// CatalogPage — B2B product listing: category tabs, sub-category chips,
// faceted filters, sort, grid/list, server-side pagination. All filtering,
// sorting and searching happens in MySQL; the browser renders one page.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { getCategory, listProducts, getMenu } from "../../lib/catalogApi.js";
import { getCompare, toggleCompare, onCompareChange, clearCompare, MAX_COMPARE } from "../../lib/compareStore.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { useLocale } from "../../context/LocaleContext.jsx";
import CategoryTabs, { PRIMARY } from "../../components/catalog/CategoryTabs.jsx";
import ProductCard, { ProductCardSkeleton } from "../../components/catalog/ProductCard.jsx";
import { SubcategoryGrid, FamilyGrid } from "../../components/catalog/FamilyBrowse.jsx";

const SORTS = [
  { id: "relevance", label: "Relevance" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
  { id: "newest", label: "Newest" },
  { id: "sku", label: "Part number (A–Z)" },
];
const LIMIT = 24;

function parseF(str) {
  const out = {};
  for (const pair of (str || "").split(",").filter(Boolean)) {
    const i = pair.indexOf(":");
    if (i > 0) (out[pair.slice(0, i)] = out[pair.slice(0, i)] || []).push(decodeURIComponent(pair.slice(i + 1)));
  }
  return out;
}
function stringifyF(obj) {
  return Object.entries(obj)
    .flatMap(([k, vals]) => vals.map((v) => `${k}:${encodeURIComponent(v)}`))
    .join(",");
}

export default function CatalogPage({ searchMode = false }) {
  const { slug: routeSlug } = useParams();
  const slug = searchMode ? null : routeSlug || "fiber-optic-cables";
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const sort = params.get("sort") || "relevance";
  const view = params.get("view") || "grid";
  const inStock = params.get("inStock") === "1";
  const family = params.get("family") || "";
  const showAll = params.get("all") === "1"; // flat list of every SKU instead of grouped cards
  const filters = useMemo(() => parseF(params.get("f")), [params]);

  const [cat, setCat] = useState(null);
  const [menu, setMenu] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false);
  const { currency } = useLocale();
  const [compare, setCompare] = useState(getCompare);
  useEffect(() => onCompareChange(setCompare), []);

  useDocumentTitle(searchMode ? `Search: ${q}` : cat?.category?.name || "Products");

  useEffect(() => {
    getMenu().then(setMenu).catch(() => {});
  }, []);
  useEffect(() => {
    if (!slug) return setCat(null);
    getCategory(slug).then(setCat).catch(() => setCat(null));
  }, [slug, currency]); // family "from" prices are in the display currency

  const qs = useMemo(() => {
    const s = new URLSearchParams({ page, limit: LIMIT, sort });
    if (slug) s.set("category", slug);
    if (q) s.set("q", q);
    if (family) s.set("family", family);
    if (inStock) s.set("inStock", "1");
    const f = stringifyF(filters);
    if (f) s.set("f", f);
    return s.toString();
  }, [slug, q, page, sort, family, inStock, filters]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    listProducts(qs, { signal: ctrl.signal })
      .then((d) => (setData(d), setLoading(false)))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [qs, currency]); // re-price instantly when the visitor changes currency

  const update = (changes, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || v === false) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage) next.delete("page");
    setParams(next);
  };
  const toggleFilter = (code, value) => {
    const next = { ...filters };
    const set = new Set(next[code] || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size) next[code] = [...set];
    else delete next[code];
    update({ f: stringifyF(next) });
  };

  const rootSlug = cat?.category?.breadcrumbs?.[0]?.slug || slug;
  const root = menu?.categories?.find((c) => c.slug === rootSlug);
  const counts = Object.fromEntries((menu?.categories || []).map((c) => [c.slug, c.totalProducts]));
  const activeChips = Object.entries(filters).flatMap(([code, vals]) => vals.map((v) => ({ code, v, name: data?.facets?.find((f) => f.code === code)?.name || code })));
  const pages = Math.max(1, Math.ceil((data?.total || 0) / LIMIT));
  // Family chips only on leaf categories (a root like “Fiber Optic Cables” has 40+ families; sub-category chips cover it).
  const families = cat?.category?.children?.length ? [] : cat?.families || [];
  // Grouped browsing (one card per product with its options listed below) is the
  // default for a category page; searching, filtering, sorting or "show all"
  // switches to the flat SKU grid.
  const catReady = cat?.category?.slug === slug;
  const browse = !searchMode && catReady && !showAll && !family && activeChips.length === 0 && !inStock && sort === "relevance" && (cat.families?.length > 0);
  const isRoot = browse && cat.category.children?.length > 0;

  const facetPanel = (
    <Facets facets={data?.facets} filters={filters} onToggle={toggleFilter} inStock={inStock} onInStock={(v) => update({ inStock: v ? "1" : "" })} onClear={() => update({ f: "", inStock: "" })} />
  );

  return (
    <div className="bg-ink-50/50">
      <div className="border-b border-ink-100 bg-white">
        <div className="container-page pt-5">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
            <Link to="/" className="hover:text-brand-700">Home</Link>
            <Icon name="ChevronRight" className="h-3 w-3" />
            <Link to="/catalog" className="hover:text-brand-700">Products</Link>
            {cat?.category?.breadcrumbs?.map((b) => (
              <span key={b.slug} className="flex items-center gap-1">
                <Icon name="ChevronRight" className="h-3 w-3" />
                <Link to={`/catalog/${b.slug}`} className="hover:text-brand-700">{b.name}</Link>
              </span>
            ))}
            {cat && (
              <span className="flex items-center gap-1">
                <Icon name="ChevronRight" className="h-3 w-3" />
                <span className="font-semibold text-ink-700">{cat.category.name}</span>
              </span>
            )}
            {searchMode && (
              <span className="flex items-center gap-1"><Icon name="ChevronRight" className="h-3 w-3" /><span className="font-semibold text-ink-700">Search</span></span>
            )}
          </nav>
          {!searchMode && <div className="mt-4"><CategoryTabs active={rootSlug} counts={counts} /></div>}
          {!searchMode && root?.children?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-4" aria-label="Sub-categories">
              <Chip to={`/catalog/${root.slug}`} active={slug === root.slug}>All {root.name}<Count n={root.totalProducts} /></Chip>
              {root.children.map((c) => (
                <Chip key={c.slug} to={`/catalog/${c.slug}`} active={slug === c.slug}>{c.name}<Count n={c.totalProducts} /></Chip>
              ))}
            </div>
          )}
          {searchMode && (
            <div className="py-5">
              <h1 className="font-display text-2xl font-bold text-ink-900">Results for “{q}”</h1>
              {data?.search && (data.search.corrections.length > 0 || data.search.ignored.length > 0) && (
                <p className="mt-1 text-sm text-ink-600">
                  Showing results for <b>“{data.search.searchedFor}”</b>
                  {data.search.ignored.length > 0 && <> — no matches for <span className="text-ink-400 line-through">{data.search.ignored.join(", ")}</span></>}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container-page grid gap-6 py-6 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{facetPanel}</aside>
        <section className="min-w-0">
          {!searchMode && cat && (
            <div className="mb-4">
              <h1 className="font-display text-2xl font-bold text-ink-900">{cat.category.name}</h1>
              {cat.category.shortDescription && <p className="mt-1 max-w-3xl text-sm text-ink-500">{cat.category.shortDescription}</p>}
              {!browse && families.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Product families">
                  <button onClick={() => update({ family: "" })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${!family ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-brand-300"}`}>All families</button>
                  {families.map((f) => (
                    <button key={f.slug} onClick={() => update({ family: family === f.slug ? "" : f.slug })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${family === f.slug ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-brand-300"}`}>
                      {f.name} <span className="opacity-60">({f.productCount})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <button className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-700 lg:hidden" onClick={() => setMobileFilters(true)}>
                <Icon name="SlidersHorizontal" className="h-4 w-4" /> Filters{activeChips.length ? ` (${activeChips.length})` : ""}
              </button>
              {browse ? (
                <span className="text-sm text-ink-600">
                  <b className="text-ink-900">{isRoot ? cat.category.children.filter((c) => c.totalProducts > 0).length : cat.families.length}</b> {isRoot ? "product ranges" : "products"}
                  <span className="text-ink-400"> · {(cat.category.totalProducts ?? data?.total ?? 0).toLocaleString()} part numbers</span>
                </span>
              ) : (
                <span className="text-sm text-ink-600"><b className="text-ink-900">{loading && !data ? "…" : (data?.total ?? 0).toLocaleString()}</b> products</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!searchMode && catReady && cat.families?.length > 0 && (
                <div className="flex rounded-lg border border-ink-200 text-xs font-semibold" role="group" aria-label="Browse mode">
                  <button aria-pressed={browse} onClick={() => update({ all: "", family: "", f: "", inStock: "", sort: "" })} className={`focus-ring rounded-l-lg px-2.5 py-1.5 ${browse ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-800"}`}>By product</button>
                  <button aria-pressed={!browse} onClick={() => update({ all: "1" })} className={`focus-ring rounded-r-lg border-l border-ink-200 px-2.5 py-1.5 ${!browse ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-800"}`}>All part numbers</button>
                </div>
              )}
              <label className="sr-only" htmlFor="sort">Sort</label>
              <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value === "relevance" ? "" : e.target.value })} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-700">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className={`${browse ? "hidden" : "flex"} rounded-lg border border-ink-200`} role="group" aria-label="View">
                {["grid", "list"].map((v) => (
                  <button key={v} aria-pressed={view === v} onClick={() => update({ view: v === "grid" ? "" : v }, false)} className={`focus-ring px-2 py-1.5 ${view === v ? "bg-brand-50 text-brand-700" : "text-ink-400 hover:text-ink-700"}`} aria-label={`${v} view`}>
                    <Icon name={v === "grid" ? "LayoutGrid" : "List"} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeChips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {activeChips.map((c) => (
                <button key={`${c.code}${c.v}`} onClick={() => toggleFilter(c.code, c.v)} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                  {c.name}: {c.v} <Icon name="X" className="h-3 w-3" />
                </button>
              ))}
              <button onClick={() => update({ f: "", inStock: "" })} className="text-xs font-semibold text-ink-500 underline">Clear all</button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error} <button className="font-semibold underline" onClick={() => update({}, false)}>Retry</button>
            </div>
          )}

          {browse && (isRoot ? <SubcategoryGrid subcategories={cat.category.children} families={cat.families} /> : <FamilyGrid families={cat.families} />)}

          {!browse && !error && loading && !data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
          )}

          {!browse && !error && data && data.items.length === 0 && (
            <EmptyState searchMode={searchMode} q={q} slug={slug} hasFilters={activeChips.length > 0 || inStock} onClear={() => update({ f: "", inStock: "" })} />
          )}

          {!browse && !error && data && data.items.length > 0 && (
            <div className={`${loading ? "opacity-60" : ""} transition-opacity`}>
              {view === "list" ? (
                <div className="overflow-hidden rounded-xl border border-ink-100">{data.items.map((p) => <ProductCard key={p.id} p={p} view="list" />)}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((p) => <ProductCard key={p.id} p={p} onCompare={(x) => setCompare(toggleCompare(x))} compared={compare.some((c) => c.slug === p.slug)} />)}
                </div>
              )}
            </div>
          )}

          {!browse && pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-1" aria-label="Pagination">
              <PageBtn disabled={page <= 1} onClick={() => update({ page: page - 1 }, false)} label="Previous"><Icon name="ChevronLeft" className="h-4 w-4" /></PageBtn>
              {pageList(page, pages).map((p, i) =>
                p === "…" ? <span key={`e${i}`} className="px-2 text-ink-400">…</span> : <PageBtn key={p} active={p === page} onClick={() => update({ page: p }, false)} label={`Page ${p}`}>{p}</PageBtn>
              )}
              <PageBtn disabled={page >= pages} onClick={() => update({ page: page + 1 }, false)} label="Next"><Icon name="ChevronRight" className="h-4 w-4" /></PageBtn>
            </nav>
          )}
        </section>
      </div>

      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <span className="font-display font-bold">Filters</span>
              <button onClick={() => setMobileFilters(false)} aria-label="Close filters"><Icon name="X" className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{facetPanel}</div>
            <div className="border-t border-ink-100 p-3">
              <button onClick={() => setMobileFilters(false)} className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white">Show {data?.total ?? 0} products</button>
            </div>
          </div>
        </div>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 shadow-[0_-8px_24px_-12px_rgba(15,37,84,0.25)] backdrop-blur">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <b className="text-ink-800">Compare ({compare.length}/{MAX_COMPARE})</b>
              {compare.map((c) => <span key={c.slug} className="rounded border border-ink-200 px-2 py-0.5 font-mono">{c.sku}</span>)}
            </div>
            <div className="flex gap-2">
              <button onClick={clearCompare} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600">Clear</button>
              <Link to={`/compare?p=${compare.map((c) => c.slug).join(",")}`} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Compare now</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Count({ n }) {
  return <span className="ml-1.5 rounded bg-black/5 px-1.5 text-[11px] font-medium">{n}</span>;
}
function Chip({ to, active, children }) {
  return (
    <Link to={to} className={`focus-ring inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700"}`}>
      {children}
    </Link>
  );
}
function PageBtn({ children, active, disabled, onClick, label }) {
  return (
    <button aria-label={label} aria-current={active ? "page" : undefined} disabled={disabled} onClick={onClick} className={`focus-ring min-w-9 rounded-lg border px-2.5 py-1.5 text-sm font-semibold disabled:opacity-40 ${active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"}`}>
      {children}
    </button>
  );
}
function pageList(page, pages) {
  const out = new Set([1, pages, page, page - 1, page + 1]);
  const list = [...out].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const res = [];
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) res.push("…");
    res.push(p);
  });
  return res;
}

function Facets({ facets, filters, onToggle, inStock, onInStock, onClear }) {
  const [open, setOpen] = useState({});
  if (!facets) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold text-ink-900">Filter by</span>
        <button onClick={onClear} className="text-xs font-semibold text-brand-700 hover:underline">Reset</button>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm">
        <input type="checkbox" checked={inStock} onChange={(e) => onInStock(e.target.checked)} className="accent-brand-600" /> In stock only
      </label>
      {facets.map((f) => {
        const expanded = open[f.code] ?? true;
        const values = expanded && f.values.length > 8 && !open[`${f.code}_all`] ? f.values.slice(0, 8) : f.values;
        return (
          <div key={f.code} className="rounded-lg border border-ink-100 bg-white">
            <button onClick={() => setOpen({ ...open, [f.code]: !expanded })} aria-expanded={expanded} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-ink-800">
              {f.name}
              <Icon name="ChevronDown" className={`h-4 w-4 text-ink-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
              <ul className="flex flex-col gap-0.5 px-3 pb-2.5">
                {values.map((v) => (
                  <li key={v.value}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] text-ink-700 hover:bg-ink-50">
                      <input type="checkbox" className="accent-brand-600" checked={(filters[f.code] || []).includes(v.value)} onChange={() => onToggle(f.code, v.value)} />
                      <span className="flex-1">{v.value}</span>
                      <span className="text-[11px] text-ink-400">{v.count}</span>
                    </label>
                  </li>
                ))}
                {f.values.length > 8 && (
                  <button onClick={() => setOpen({ ...open, [`${f.code}_all`]: !open[`${f.code}_all`] })} className="mt-1 text-left text-xs font-semibold text-brand-700">
                    {open[`${f.code}_all`] ? "Show less" : `Show all ${f.values.length}`}
                  </button>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ searchMode, q, slug, hasFilters, onClear }) {
  const isTransceivers = slug === "optical-transceivers";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
      <Icon name={isTransceivers ? "Zap" : "SearchX"} className="h-10 w-10 text-brand-600" />
      <h2 className="font-display text-lg font-bold text-ink-900">
        {isTransceivers ? "Optical transceiver catalog coming soon" : searchMode ? `No products match “${q}”` : "No products match these filters"}
      </h2>
      <p className="max-w-md text-sm text-ink-500">
        {isTransceivers
          ? "Our transceiver range is being added to the online catalog. Tell us the form factor, data rate, reach and host platform and our engineers will quote compatible optics."
          : "Try a part number, a connector type (e.g. “LC-LC”) or fewer filters. Our team can also source parts that are not listed."}
      </p>
      <div className="flex gap-2">
        {hasFilters && <button onClick={onClear} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700">Clear filters</button>}
        <Link to={`/contact?subject=${encodeURIComponent(isTransceivers ? "Optical transceiver quote request" : `Product enquiry${q ? `: ${q}` : ""}`)}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Request a Quote</Link>
      </div>
    </div>
  );
}

void PRIMARY;
