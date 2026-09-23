// HeaderSearch — part-number-first global search with live suggestions.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { suggest, formatPrice } from "../../lib/catalogApi.js";
import ProductImage from "./ProductImage.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";

const RECENT = "ixitek_recent_searches_v1";
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
};

export default function HeaderSearch({ className = "", autoFocus = false, onDone }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(null);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const { currency } = useLocale();

  useEffect(() => {
    if (q.trim().length < 2) return setRes(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => suggest(q.trim(), { signal: ctrl.signal }).then(setRes).catch(() => {}), 180);
    return () => (clearTimeout(t), ctrl.abort());
  }, [q, currency]);
  useEffect(() => {
    const onDoc = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(path) {
    setOpen(false);
    onDone?.();
    navigate(path);
  }
  function submit(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (active >= 0 && res?.products[active]) return go(`/product/${res.products[active].slug}`);
    try {
      localStorage.setItem(RECENT, JSON.stringify([term, ...readRecent().filter((x) => x !== term)].slice(0, 6)));
    } catch {
      /* ignore */
    }
    go(`/search?q=${encodeURIComponent(term)}`);
  }
  const recent = readRecent();

  return (
    <div ref={box} className={`relative ${className}`}>
      <form onSubmit={submit} role="search">
        <label htmlFor="site-search" className="sr-only">Search products or part numbers</label>
        <input
          id="site-search"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(-1))}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            const n = res?.products.length || 0;
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(n - 1, a + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(-1, a - 1)));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search part number, e.g. 99IL31-3021m-1M"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          className="w-full rounded-full border border-ink-200 bg-ink-50/70 py-2.5 pl-4 pr-11 text-sm text-ink-800 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
        <button type="submit" aria-label="Search" className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700">
          <Icon name="Search" className="h-4 w-4" />
        </button>
      </form>
      {open && (res || recent.length > 0) && (
        <div id="search-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-ink-100 bg-white py-2 shadow-elevated">
          {!res && recent.length > 0 && (
            <div className="px-3 pb-1">
              <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">Recent searches</div>
              {recent.map((r) => (
                <button key={r} onClick={() => go(`/search?q=${encodeURIComponent(r)}`)} className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-50">
                  <Icon name="History" className="h-3.5 w-3.5 text-ink-400" /> {r}
                </button>
              ))}
            </div>
          )}
          {res?.categories?.length > 0 && (
            <div className="border-b border-ink-100 px-3 pb-2">
              {res.categories.map((c) => (
                <button key={c.slug} onClick={() => go(`/catalog/${c.slug}`)} className="mr-1.5 mt-1 rounded-full border border-ink-200 px-2.5 py-0.5 text-xs font-semibold text-ink-700 hover:border-brand-300">{c.name}</button>
              ))}
            </div>
          )}
          {res?.products?.map((p, i) => (
            <button
              key={p.slug}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(`/product/${p.slug}`)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-brand-50" : "hover:bg-ink-50"}`}
            >
              <ProductImage image={p.image} alt="" className="w-11 shrink-0 rounded border border-ink-100" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-800">{p.name}</span>
                <span className="font-mono text-[11px] text-ink-500">{p.sku}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-ink-700">{formatPrice(p.price) || "RFQ"}</span>
            </button>
          ))}
          {res && !res.products.length && <div className="px-4 py-3 text-sm text-ink-500">No direct matches — press Enter to search all products.</div>}
          {res && res.products.length > 0 && (
            <button onClick={submit} className="w-full px-4 pt-2 text-left text-xs font-semibold text-brand-700">See all results for “{q}” →</button>
          )}
        </div>
      )}
    </div>
  );
}
