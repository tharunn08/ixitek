import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductImage from "./ProductImage.jsx";
import { Icon } from "../../lib/icons.jsx";
import { formatPrice, AVAILABILITY } from "../../lib/catalogApi.js";
import { useCart } from "../../context/CartContext.jsx";

const BUYABLE = ["active", "coming_soon", "discontinued", "end_of_sale", "end_of_life"];
/** A priced, orderable product can go straight into the cart (at its minimum order quantity). */
export const isPurchasable = (p) => Boolean(p.price) && p.availability?.status !== "out_of_stock" && (!p.status || BUYABLE.includes(p.status));

/** Add to cart / Buy now for listings. Prices are re-checked on the server; nothing here is trusted. */
export function CartButtons({ p, size = "sm", className = "" }) {
  const { add } = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const qty = Math.max(1, Number(p.moq) || 1);
  const go = async (buyNow) => {
    setBusy(true);
    setErr("");
    try {
      await add({ slug: p.slug, qty }, { silent: buyNow });
      if (buyNow) navigate("/checkout");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const pad = size === "sm" ? "px-2.5 py-2 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => go(false)} aria-label={`Add ${p.sku} to cart`} className={`focus-ring inline-flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300 ${pad}`}>
          <Icon name={busy ? "Loader2" : "ShoppingCart"} className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Add to cart
        </button>
        <button type="button" disabled={busy} onClick={() => go(true)} aria-label={`Buy ${p.sku} now`} className={`focus-ring inline-flex min-w-[5.5rem] flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-brand-600 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60 ${pad}`}>
          Buy now
        </button>
      </div>
      {qty > 1 && <span className="text-[11px] text-ink-400">Adds the minimum order of {qty}{p.unit ? ` ${p.unit}` : ""}.</span>}
      {err && <span role="alert" className="text-[11px] font-medium text-red-700">{err}</span>}
    </div>
  );
}

export function Availability({ a, className = "" }) {
  const meta = AVAILABILITY[a?.status] || AVAILABILITY.on_request;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.tone} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {a?.status === "in_stock" && a.quantity ? `${a.quantity.toLocaleString()} in stock` : meta.label}
      {a?.leadTimeDays ? <span className="font-normal text-ink-400">· ships in ~{a.leadTimeDays} days</span> : null}
    </span>
  );
}

export function Price({ price, size = "md" }) {
  const text = formatPrice(price);
  if (!text) return <span className={`font-semibold text-brand-700 ${size === "lg" ? "text-lg" : "text-sm"}`}>Request a Quote</span>;
  return (
    <span className={`font-display font-bold tabular-nums text-ink-900 ${size === "lg" ? "text-3xl" : "text-lg"}`}>
      {text}
      <span className="ml-1 text-xs font-medium text-ink-400">/ unit</span>
    </span>
  );
}

export default function ProductCard({ p, view = "grid", onCompare, compared }) {
  const href = `/product/${p.slug}`;
  if (view === "list") {
    return (
      <article className="grid grid-cols-[96px_1fr] gap-4 border-b border-ink-100 bg-white p-4 sm:grid-cols-[120px_1fr_200px]">
        <Link to={href} className="focus-ring block rounded-lg border border-ink-100">
          <ProductImage image={p.image} alt={p.name} />
        </Link>
        <div className="min-w-0">
          <Link to={href} className="focus-ring font-semibold leading-snug text-ink-900 hover:text-brand-700">{p.name}</Link>
          <div className="mt-1 font-mono text-xs text-ink-500">#{p.sku}</div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {p.highlights.map((h) => (
              <li key={h.name} className="rounded border border-ink-100 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600">
                <span className="text-ink-400">{h.name}:</span> {h.value}
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
          <Price price={p.price} />
          <Availability a={p.availability} />
          {isPurchasable(p) ? (
            <>
              <CartButtons p={p} className="w-full sm:w-auto" />
              <Link to={href} className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                View details <Icon name="ArrowRight" className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : (
            <Link to={href} className="focus-ring inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              {p.price ? "View details" : "Request a Quote"} <Icon name="ArrowRight" className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </article>
    );
  }
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <Link to={href} className="focus-ring block border-b border-ink-100">
        <ProductImage image={p.image} alt={p.name} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <Link to={href} className="focus-ring line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug text-ink-900 hover:text-brand-700">{p.name}</Link>
        <div className="font-mono text-[11px] text-ink-500">#{p.sku}</div>
        <ul className="flex flex-col gap-0.5 text-[11px] text-ink-600">
          {p.highlights.slice(0, 3).map((h) => (
            <li key={h.name} className="truncate"><span className="text-ink-400">{h.name}:</span> {h.value}</li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <Price price={p.price} />
          <Availability a={p.availability} />
        </div>
        {isPurchasable(p) && <CartButtons p={p} className="pt-1" />}
        <div className="flex items-center gap-2 pt-1">
          <Link to={href} className={`focus-ring flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold ${isPurchasable(p) ? "border border-ink-200 text-ink-700 hover:border-brand-300 hover:text-brand-700" : "bg-brand-600 text-white hover:bg-brand-700"}`}>
            {p.price ? "View details" : "Request a Quote"}
          </Link>
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(p)}
              aria-pressed={compared}
              title="Compare"
              className={`focus-ring rounded-lg border px-2.5 py-2 text-xs ${compared ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500 hover:text-brand-700"}`}
            >
              <Icon name="Scale" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white">
      <div className="aspect-square animate-pulse bg-ink-100/70" />
      <div className="flex flex-col gap-2 p-3.5">
        <div className="h-3.5 w-5/6 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  );
}
