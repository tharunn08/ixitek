// catalogApi.js — storefront catalog calls. All prices come from the server
// already calculated (selling price only); the browser never computes or
// receives costs. A small in-memory cache keeps navigation instant.
import { apiFetch } from "./api.js";

const cache = new Map();
const TTL = 60 * 1000;

// Display currency chosen by the visitor (set by LocaleContext). Prices are
// converted by the server — the browser never does currency maths.
let currency = "USD";
export function setCatalogCurrency(code) {
  currency = code || "USD";
}
export function getCatalogCurrency() {
  return currency;
}
const withCurrency = (path) => `${path}${path.includes("?") ? "&" : "?"}currency=${encodeURIComponent(currency)}`;

export async function cachedGet(rawPath, { signal } = {}) {
  const path = withCurrency(rawPath);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < TTL) return hit.data;
  const data = await apiFetch(path, { signal });
  cache.set(path, { t: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return data;
}

export const getMenu = () => cachedGet("/api/catalog/menu");
export const getCategory = (slug) => cachedGet(`/api/catalog/categories/${encodeURIComponent(slug)}`);
export const getProduct = (slug, opts) => cachedGet(`/api/catalog/products/${encodeURIComponent(slug)}`, opts);
export const listProducts = (qs, opts) => cachedGet(`/api/catalog/products?${qs}`, opts);
export const suggest = (q, opts) => apiFetch(withCurrency(`/api/catalog/search/suggest?q=${encodeURIComponent(q)}`), opts);

/** Display a server-provided price. Formatting only — no arithmetic. */
export function formatPrice(price) {
  if (!price) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency || "USD" }).format(Number(price.amount));
  } catch {
    return `${price.currency} ${price.amount}`;
  }
}

export const AVAILABILITY = {
  in_stock: { label: "In stock", tone: "text-emerald-700", dot: "bg-emerald-500" },
  incoming: { label: "Incoming", tone: "text-brand-700", dot: "bg-brand-500" },
  backorder: { label: "Available on backorder", tone: "text-amber-700", dot: "bg-amber-500" },
  out_of_stock: { label: "Out of stock", tone: "text-red-700", dot: "bg-red-500" },
  on_request: { label: "Lead time on request", tone: "text-ink-600", dot: "bg-ink-400" },
};
