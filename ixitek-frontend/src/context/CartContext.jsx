// CartContext — the visitor's server-side cart (guest cookie or account).
// Prices, freight, duties and totals always come from the server for the
// selected country/currency; the browser only displays them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { useLocale } from "./LocaleContext.jsx";
import { useAdminAuth } from "./AdminAuthContext.jsx";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { locale, currency } = useLocale();
  const { session } = useAdminAuth();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [method, setMethod] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const seq = useRef(0);

  const qs = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      if (locale?.country) p.set("country", locale.country);
      if (currency) p.set("currency", currency);
      p.set("method", extra.method ?? method);
      p.set("incoterm", extra.incoterm ?? incoterm);
      return p.toString();
    },
    [locale?.country, currency, method, incoterm]
  );

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/shop/cart?${qs()}`);
      if (id === seq.current) {
        setCart(data);
        setError("");
      }
    } catch (err) {
      if (id === seq.current) setError(err.message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [qs]);

  // Recalculate whenever the destination/currency/shipping choice or the signed-in user changes (items are kept).
  useEffect(() => {
    if (locale?.country) refresh();
  }, [refresh, locale?.country, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = useCallback(
    async (path, opts) => {
      const data = await apiFetch(`${path}${path.includes("?") ? "&" : "?"}${qs()}`, opts);
      setCart(data);
      return data;
    },
    [qs]
  );

  const add = useCallback(
    async (items, { silent = false } = {}) => {
      const list = Array.isArray(items) ? items : [items];
      const data = await mutate("/api/shop/cart/items", { method: "POST", body: list.length === 1 ? list[0] : { items: list } });
      if (!silent) setToast({ text: list.length === 1 ? "Added to cart" : `${list.length} lines added to cart`, at: Date.now() });
      return data;
    },
    [mutate]
  );
  const update = useCallback((itemId, patch) => mutate(`/api/shop/cart/items/${itemId}`, { method: "PATCH", body: patch }), [mutate]);
  const remove = useCallback((itemId) => mutate(`/api/shop/cart/items/${itemId}`, { method: "DELETE" }), [mutate]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo(
    () => ({ cart, loading, error, refresh, add, update, remove, count: cart?.count || 0, method, setMethod, incoterm, setIncoterm, toast, clearToast: () => setToast(null) }),
    [cart, loading, error, refresh, add, update, remove, method, incoterm, toast]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
