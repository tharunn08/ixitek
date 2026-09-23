// LocaleSelector — "India / ₹ INR ▾" in the header. Opens a panel with the
// current selection, country search, language and currency.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../lib/icons.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";

export function flag(code) {
  return code ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "";
}

export default function LocaleSelector({ compact = false, className = "" }) {
  const { locales, locale, country, currency, currencyUnavailable, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState(null);
  const box = useRef(null);
  const panel = useRef(null);
  // Which edge of the trigger the panel hangs from. Right-aligned by default;
  // flips to left-aligned when that would push it off the left of the screen
  // (e.g. the "Ship to" selector at the far left of the top bar).
  const [alignLeft, setAlignLeft] = useState(false);

  useEffect(() => {
    if (open) setDraft({ country: locale?.country, currency: locale?.currency, language: locale?.language || "en" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onDoc = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => (document.removeEventListener("mousedown", onDoc), document.removeEventListener("keydown", onKey));
  }, []);

  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const trigger = box.current.getBoundingClientRect();
    const width = Math.min(window.innerWidth * 0.92, 380);
    setAlignLeft(trigger.right - width < 8);
  }, [open, draft]);

  const cur = locales?.currencies.find((c) => c.code === currency);
  const list = useMemo(() => {
    const all = locales?.countries || [];
    const term = q.trim().toLowerCase();
    return term ? all.filter((c) => c.name.toLowerCase().includes(term) || c.nativeName.toLowerCase().includes(term) || c.code.toLowerCase() === term) : all;
  }, [locales, q]);
  if (!locales || !locale) return <span className={`h-9 w-28 animate-pulse rounded-full bg-ink-100 ${className}`} />;

  const pickCountry = (c) => setDraft({ country: c.code, currency: c.currency, language: locales.languages.some((l) => l.code === c.language) ? c.language : "en" });
  const langName = (code) => locales.languages.find((l) => l.code === code)?.nativeName || "English";

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700"
      >
        <span aria-hidden="true">{flag(locale.country)}</span>
        {!compact && <span className="hidden xl:inline">{country?.name} /</span>}
        <span>{cur?.symbol} {currency}</span>
        <Icon name="ChevronDown" className="h-3.5 w-3.5" />
      </button>
      {open && draft && (
        <div ref={panel} role="dialog" aria-label={t("country")} data-align={alignLeft ? "left" : "right"} style={{ maxHeight: "calc(100vh - 80px)", overflowY: "auto" }} className={`absolute ${alignLeft ? "left-0" : "right-0"} top-full z-50 mt-2 w-[min(92vw,380px)] rounded-2xl border border-ink-100 bg-white p-4 shadow-elevated`}>
          <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            {t("shipTo")}: <b className="text-ink-900">{flag(locale.country)} {country?.name}</b> · {langName(locale.language)} · <b>{cur?.symbol} {currency}</b>
            {currencyUnavailable && <div className="mt-1 text-amber-700">Prices shown in USD — no current exchange rate for {locale.currency}.</div>}
          </div>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-ink-500">{t("country")}</label>
          <div className="relative mt-1">
            <Icon name="Search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search countries" className="w-full rounded-lg border border-ink-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-brand-400" aria-label="Search countries" />
          </div>
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-ink-100" role="listbox" aria-label="Countries">
            {list.map((c) => (
              <li key={c.code}>
                <button role="option" aria-selected={draft.country === c.code} onClick={() => pickCountry(c)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${draft.country === c.code ? "bg-brand-50 font-semibold text-brand-800" : "hover:bg-ink-50"}`}>
                  <span>{flag(c.code)} {c.name}</span>
                  <span className="text-xs text-ink-400">{c.currency}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-2 text-sm text-ink-400">No match</li>}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold uppercase tracking-wide text-ink-500">
              {t("language")}
              <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-2 text-sm font-normal normal-case text-ink-800">
                {locales.languages.map((l) => <option key={l.code} value={l.code}>{l.nativeName}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-ink-500">
              {t("currency")}
              <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-2 text-sm font-normal normal-case text-ink-800">
                {locales.currencies.map((c) => <option key={c.code} value={c.code} disabled={!c.available}>{c.symbol} {c.code}{c.available ? "" : " (rate unavailable)"}</option>)}
              </select>
            </label>
          </div>
          <button onClick={() => (setLocale(draft), setOpen(false))} className="mt-4 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{t("save")}</button>
          <p className="mt-2 text-[11px] leading-snug text-ink-400">Prices are set in USD and converted at IXITEK's current exchange rate. Product information is in English.</p>
        </div>
      )}
    </div>
  );
}

export function DetectionBanner() {
  const { detected, setLocale, dismissDetection, t } = useLocale();
  if (!detected) return null;
  return (
    <div role="status" className="border-b border-brand-100 bg-brand-50">
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-brand-900">
        <span>{t("detected")} <b>{flag(detected.country)} {detected.name}</b>.</span>
        <span className="flex gap-2">
          <button onClick={() => setLocale({ country: detected.country, currency: detected.currency, language: detected.language })} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white">{t("continue")}</button>
          <button onClick={dismissDetection} className="rounded-md border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-800">{t("change")}</button>
        </span>
      </div>
    </div>
  );
}
