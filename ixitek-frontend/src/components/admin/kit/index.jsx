// Admin UI kit — dense, enterprise-style building blocks shared by the
// catalog, pricing and inventory modules. IXITEK blue; red only for errors
// and destructive actions.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../lib/icons.jsx";
import { apiFetch } from "../../../lib/api.js";

/** Load data from the API with loading/error/reload handling. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: "" });
  const ctrl = useRef(null);
  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await apiFetch(path, { signal: ctrl.current.signal });
      setState({ data, loading: false, error: "" });
    } catch (err) {
      if (err?.name === "AbortError") return;
      setState((s) => ({ ...s, loading: false, error: err?.message || "Could not load data." }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === "function" ? d(s.data) : d })) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const usd = (v, dp = 2) => (v === null || v === undefined || v === "" ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: Math.max(dp, 4) })}`);
export const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US"));
export const dt = (v) => (v ? new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <div className="flex flex-col gap-3 border-b border-ink-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold text-ink-900 sm:text-2xl">
          {icon && <Icon name={icon} className="h-5 w-5 text-brand-600" />}
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BTN = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:text-brand-700",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-ink-600 hover:bg-ink-100",
};
export function Btn({ variant = "secondary", icon, children, className = "", size = "md", ...props }) {
  const sz = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button type="button" className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BTN[variant]} ${sz} ${className}`} {...props}>
      {icon && <Icon name={icon} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
}

const PILL = {
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  gray: "bg-ink-100 text-ink-600 ring-ink-200",
};
export function Pill({ tone = "gray", children, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PILL[tone]}`}>
      {children}
    </span>
  );
}

export function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <Icon name="AlertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "blue", icon = "Info", children }) {
  const cls = { blue: "border-brand-100 bg-brand-50 text-brand-800", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-emerald-200 bg-emerald-50 text-emerald-800" }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${cls}`}>
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Card({ title, actions, children, className = "", pad = true }) {
  return (
    <section className={`rounded-xl border border-ink-100 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = "ink", hint }) {
  const color = { ink: "text-ink-900", blue: "text-brand-700", green: "text-emerald-700", amber: "text-amber-700", red: "text-red-700" }[tone];
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-400">{hint}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold text-ink-600">{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] text-ink-400">{hint}</span>}
      {error && <span className="text-[11px] font-medium text-red-600">{error}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50";

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="Search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-8`} aria-label={placeholder} />
    </div>
  );
}

export function Table({ columns, rows, rowKey = "id", onRowClick, empty = "Nothing to show.", loading, dense = true }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 ${c.align === "right" ? "text-right" : ""} ${c.className || ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk${i}`} className="border-t border-ink-100">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-3">
                    <div className="h-3 w-full max-w-[160px] animate-pulse rounded bg-ink-100" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && !rows?.length && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-400">
                {empty}
              </td>
            </tr>
          )}
          {rows?.map((r) => (
            <tr
              key={r[rowKey]}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-t border-ink-100 ${onRowClick ? "cursor-pointer hover:bg-brand-50/40" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${dense ? "py-2" : "py-3"} px-3 align-top ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.tdClassName || ""}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  if (!total) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
      <span>
        {num((page - 1) * limit + 1)}–{num(Math.min(page * limit, total))} of {num(total)}
      </span>
      <div className="flex items-center gap-1">
        <Btn size="sm" icon="ChevronLeft" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span className="px-2 font-semibold text-ink-700">
          {page} / {pages}
        </span>
        <Btn size="sm" icon="ChevronRight" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = "max-w-2xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className={`relative flex h-full w-full ${width} flex-col bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="focus-ring rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
            <Icon name="X" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-ink-100 px-5 py-4 font-display text-lg font-bold text-ink-900">{title}</div>
        <div className="px-5 py-4 text-sm text-ink-700">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-ink-100">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`focus-ring -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${value === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-ink-100 px-1.5 text-[11px] text-ink-600">{num(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}
