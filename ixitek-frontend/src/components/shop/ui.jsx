// Small storefront building blocks shared by cart, checkout, orders, RFQ,
// quotes, support and the customer portal. Formatting only — every amount
// is a server-calculated string.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api.js";
import { Icon } from "../../lib/icons.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";

export function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(Number(amount));
  } catch {
    return `${currency || ""} ${amount}`.trim();
  }
}

export function ShopPage({ title, crumbs = [], children, actions, narrow = false, docTitle }) {
  useDocumentTitle(docTitle || title);
  return (
    <div className={`container-page py-6 sm:py-8 ${narrow ? "max-w-4xl" : ""}`}>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <Icon name="ChevronRight" className="h-3 w-3" />
              {c.to ? <Link to={c.to} className="hover:text-brand-700">{c.label}</Link> : <span className="text-ink-700">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}

const CUSTOMER_STATUS = {
  pending_approval: ["Awaiting company approval", "amber"],
  pending_payment: ["Awaiting payment", "amber"],
  payment_failed: ["Payment failed", "red"],
  confirmed: ["Confirmed", "green"],
  processing: ["Processing", "blue"],
  packed: ["Packed", "blue"],
  shipped: ["Shipped", "blue"],
  in_transit: ["In transit", "blue"],
  out_for_delivery: ["Out for delivery", "blue"],
  delivered: ["Delivered", "green"],
  cancelled: ["Cancelled", "gray"],
  returned: ["Returned", "gray"],
  refunded: ["Refunded", "gray"],
  partially_refunded: ["Partially refunded", "gray"],
  unpaid: ["Unpaid", "amber"],
  paid: ["Paid", "green"],
  failed: ["Failed", "red"],
  authorized: ["Authorised", "blue"],
  submitted: ["Submitted", "blue"],
  under_review: ["Under review", "blue"],
  info_requested: ["Information requested", "amber"],
  quoted: ["Quoted", "green"],
  rejected: ["Declined", "gray"],
  closed: ["Closed", "gray"],
  converted: ["Ordered", "green"],
  sent: ["Awaiting your response", "amber"],
  accepted: ["Accepted", "green"],
  expired: ["Expired", "gray"],
  superseded: ["Superseded", "gray"],
  requested: ["Requested", "blue"],
  approved: ["Approved", "green"],
  awaiting_return: ["Awaiting return", "amber"],
  received: ["Received", "blue"],
  inspected: ["Inspected", "blue"],
  completed: ["Completed", "green"],
  open: ["Open", "blue"],
  pending_customer: ["Awaiting your reply", "amber"],
  pending_internal: ["With our team", "blue"],
  resolved: ["Resolved", "green"],
  preparing: ["Preparing", "blue"],
  exception: ["Delivery exception", "red"],
  issued: ["Issued", "blue"],
  partially_paid: ["Partially paid", "amber"],
  void: ["Void", "gray"],
  captured: ["Received", "green"],
  pending: ["Pending", "amber"],
};
const TONE = { amber: "bg-amber-50 text-amber-800 ring-amber-200", red: "bg-red-50 text-red-700 ring-red-200", green: "bg-emerald-50 text-emerald-700 ring-emerald-200", blue: "bg-brand-50 text-brand-700 ring-brand-200", gray: "bg-ink-100 text-ink-600 ring-ink-200" };
export function StatusBadge({ status }) {
  const [text, tone] = CUSTOMER_STATUS[status] || [String(status || "").replace(/_/g, " "), "gray"];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE[tone]}`}>{text}</span>;
}

export function ErrorNote({ children, className = "" }) {
  if (!children) return null;
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>
      <Icon name="AlertCircle" className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

export function InfoNote({ children, icon = "Info", className = "" }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900 ${className}`}>
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

export function Empty({ icon = "Inbox", title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center">
      <Icon name={icon} className="h-8 w-8 text-ink-300" />
      <p className="font-semibold text-ink-800">{title}</p>
      {children && <p className="max-w-md text-sm text-ink-500">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "h-40" }) {
  return <div aria-busy="true" className={`animate-pulse rounded-xl bg-ink-100 ${className}`} />;
}

export const btnPrimary = "focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300";
export const btnSecondary = "focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60";
export const inputCls = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
export const dateStr = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function FormField({ label, children, hint, required, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold text-ink-600">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

/** Build an absolute API URL for links that open in a new tab (PDF downloads). */
export function apiUrl(path) {
  const env = import.meta.env || {};
  const base = (env.VITE_API_URL || (env.PROD ? "" : "http://localhost:5000")).replace(/\/$/, "");
  return `${base}${path}`;
}

/** Download/open a protected PDF (session cookie or access token in the URL); shows server errors instead of a broken tab. */
export async function openPdf(path) {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) {
    let msg = `Could not open the document (${res.status}).`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop().split("?")[0];
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

let rzpScript = null;
/** Load Razorpay Checkout on demand (only on the payment step). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!rzpScript)
    rzpScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Payment window failed to load.")));
      s.onerror = () => ((rzpScript = null), reject(new Error("Could not load the payment window. Check your connection or disable blockers for checkout.razorpay.com.")));
      document.head.appendChild(s);
    });
  return rzpScript;
}

// ── State / province with the Indian GST state list ─────────────────────────
// For India the state is the GST place of supply, so it is chosen from the
// official list (value = state name; the server resolves names and codes).
let statesCache = null;
function useIndianStates(enabled) {
  const [states, setStates] = useState(statesCache || []);
  useEffect(() => {
    if (!enabled || statesCache) return;
    apiFetch("/api/intl/states/IN").then((r) => {
      statesCache = r.states;
      setStates(r.states);
    }).catch(() => {});
  }, [enabled]);
  return states;
}

export function StateField({ country, value, onChange, required, className = "", label = "State / province" }) {
  const india = String(country || "").toUpperCase() === "IN";
  const states = useIndianStates(india);
  if (!india) return <FormField label={label} className={className}><input value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputCls} autoComplete="address-level1" /></FormField>;
  const match = states.find((s) => s.name.toLowerCase() === String(value || "").toLowerCase() || s.code === value);
  return (
    <FormField label="State / union territory" required hint="Place of supply for GST." className={className}>
      <select required={required !== false} value={match ? match.name : ""} onChange={(e) => onChange(e.target.value)} className={inputCls} autoComplete="address-level1">
        <option value="" disabled>Choose…</option>
        {states.map((s) => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
      </select>
    </FormField>
  );
}

/** CGST/SGST/IGST lines for an estimate (`est.gst`) or an order (`order.gst`). */
export function GstBreakdown({ gst, currency, className = "" }) {
  if (!gst || gst.applicable === false) return null;
  const t = gst.totals || gst;
  if (!gst.supplyType) return <p className={`text-[11px] text-ink-500 ${className}`}>GST is charged as CGST + SGST within {gst.sellerState?.name || "our state"}, or as IGST for other states — choose the delivery state to see the split.</p>;
  const rows = gst.supplyType === "intra_state" ? [["CGST", t.cgst], [gst.stateTaxLabel || "SGST", t.sgst]] : [["IGST", t.igst]];
  return (
    <div className={`rounded-md bg-ink-50/70 px-2 py-1.5 text-xs text-ink-600 ${className}`}>
      <div className="mb-0.5 text-[11px] text-ink-500">
        Place of supply: {gst.placeOfSupply?.name} ({gst.placeOfSupply?.code}) · {gst.supplyType === "intra_state" ? "intra-state" : "inter-state"}
        {t.taxable && <> · taxable value {money(t.taxable, currency)}</>}
      </div>
      {rows.map(([l, v]) => (
        <div key={l} className="flex justify-between gap-3"><span>{l}</span><span className="tabular-nums">{money(v, currency)}</span></div>
      ))}
    </div>
  );
}
