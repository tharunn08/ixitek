// EstimateBox — server-calculated delivered-cost estimate for the visitor's
// country and currency: products, freight, insurance, duties, import tax,
// other charges, Incoterm split and TDS. Every estimate is labelled as such.
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useLocale } from "../../context/LocaleContext.jsx";
import { Icon } from "../../lib/icons.jsx";
import { GstBreakdown } from "../shop/ui.jsx";

const STATUS = {
  estimated: null,
  default_estimate: { label: "standard estimate", cls: "text-amber-700" },
  partial: { label: "partial estimate", cls: "text-amber-700" },
  rfq_required: { label: "quoted separately", cls: "text-brand-700" },
  not_configured: { label: "confirmed on quote", cls: "text-ink-500" },
  requires_verification: { label: "requires customs verification", cls: "text-red-700" },
};

export function money(amount, currency) {
  if (amount === null || amount === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

export function EstimateTable({ est, compact = false }) {
  const c = est.currency.code;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <table className="w-full">
        <tbody>
          {est.components.map((x) => [
            <tr key={x.key} className={`${x.key === "invoice_tax" && est.gst?.applicable ? "" : "border-b"} border-dashed border-ink-100 last:border-0`}>
              <td className="py-1.5 pr-2 text-ink-600">
                {x.label}
                {x.paidAt === "destination_import" && <span className="block text-[11px] text-ink-400">paid by importer at customs</span>}
                {x.paidAt === "buyer_arranged" && <span className="block text-[11px] text-ink-400">arranged by buyer ({est.incoterm.code})</span>}
                {STATUS[x.status] && <span className={`block text-[11px] ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>}
                {x.note && !compact && <span className="block text-[11px] text-ink-400">{x.note}</span>}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-ink-900">{x.amount === null ? "—" : money(x.amount, c)}</td>
            </tr>,
            x.key === "invoice_tax" && est.gst?.applicable && (
              <tr key="gst-split" className="border-b border-dashed border-ink-100">
                <td colSpan={2} className="pb-1.5"><GstBreakdown gst={est.gst} currency={c} /></td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
      <div className="rounded-lg bg-ink-50 p-3">
        <Row label={`Payable to IXITEK (${est.incoterm.code})`} value={est.totals.payable === null ? "On quotation" : money(est.totals.payable, c)} strong />
        {est.totals.estimatedImportCharges !== null && <Row label="Estimated import charges" value={money(est.totals.estimatedImportCharges, c)} />}
        <Row label={`Estimated landed cost${est.totals.landedIsPartial ? " (partial)" : ""}`} value={money(est.totals.estimatedLandedCost, c)} />
        {est.totals.tdsWithheld && <Row label={`${est.totals.tdsWithheld.name} (${est.totals.tdsWithheld.ratePct}%, withheld by buyer)`} value={`− ${money(est.totals.tdsWithheld.amount, c)}`} />}
        {est.totals.netPayableAfterTds && <Row label="Net payable after TDS" value={money(est.totals.netPayableAfterTds, c)} strong />}
      </div>
      {est.currency.fallbackFrom && <p className="text-[11px] text-amber-700">Shown in USD: no current exchange rate for {est.currency.fallbackFrom}.</p>}
      {[...est.blockers, ...est.notices].map((n, i) => (
        <p key={i} className={`flex items-start gap-1.5 text-xs ${n.code === "trade_remedy" ? "text-red-700" : "text-ink-600"}`}>
          <Icon name="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n.message}
        </p>
      ))}
      {!compact && <p className="text-[11px] leading-snug text-ink-400">{est.disclaimer}</p>}
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between gap-3 py-0.5 ${strong ? "font-bold text-ink-900" : "text-ink-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function EstimateBox({ lines, defaultOpen = false, onEstimate }) {
  const { locale, currency, country } = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const [method, setMethod] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [est, setEst] = useState(null);
  const [err, setErr] = useState("");
  const key = JSON.stringify(lines);

  useEffect(() => {
    if (!open || !locale?.country || !lines.length) return undefined;
    const ctrl = new AbortController();
    setErr("");
    apiFetch("/api/intl/estimate", { method: "POST", body: { lines, country: locale.country, currency, method: method || undefined, incoterm: incoterm || undefined }, signal: ctrl.signal })
      .then((r) => (setEst(r), onEstimate?.(r)))
      .catch((e) => e.name !== "AbortError" && setErr(e.message));
    return () => ctrl.abort();
  }, [open, key, locale?.country, currency, method, incoterm]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-ink-200">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink-800">
        <span className="flex items-center gap-2"><Icon name="Truck" className="h-4 w-4 text-brand-600" /> Delivered cost to {country?.name || "…"}</span>
        <Icon name="ChevronDown" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-ink-100 px-4 py-3">
          {est && (
            <div className="mb-3 flex flex-wrap gap-2">
              {est.availableMethods.length > 0 && (
                <select aria-label="Shipping method" value={method || est.shipping?.method || ""} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs">
                  {est.availableMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
              )}
              <select aria-label="Incoterm" value={incoterm || est.incoterm.code} onChange={(e) => setIncoterm(e.target.value)} className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs">
                {["DAP", "DDP", "CIP", "CPT", "FCA", "EXW"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {est.shipping?.chargeable?.chargeableKg && <span className="self-center text-[11px] text-ink-500">Chargeable weight {est.shipping.chargeable.chargeableKg} kg</span>}
            </div>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          {!est && !err && <div className="h-24 animate-pulse rounded bg-ink-100" />}
          {est && <EstimateTable est={est} />}
        </div>
      )}
    </div>
  );
}
