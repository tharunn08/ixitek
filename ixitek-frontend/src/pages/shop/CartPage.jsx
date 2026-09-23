// CartPage — server-priced cart with destination-aware freight, duties and
// taxes. Changing the country/currency recalculates; items are never dropped.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { apiFetch } from "../../lib/api.js";
import ProductImage from "../../components/catalog/ProductImage.jsx";
import { EstimateTable } from "../../components/intl/EstimateBox.jsx";
import LocaleSelector from "../../components/intl/LocaleSelector.jsx";
import { ShopPage, money, ErrorNote, Empty, Skeleton, btnPrimary, btnSecondary, InfoNote } from "../../components/shop/ui.jsx";

const INCOTERMS = ["DAP", "DDP", "CIP", "CPT", "FCA", "EXW"];

export default function CartPage() {
  const { cart, loading, error, update, remove, method, setMethod, incoterm, setIncoterm } = useCart();
  const { country } = useLocale();
  const { isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  const act = async (id, fn) => {
    setBusy(id);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const est = cart?.estimate;
  const cur = est?.currency.code || cart?.currency;
  const canCheckout = Boolean(est?.canCheckout) && cart.items.every((i) => i.available && !i.priceOnRequest);
  const rfqFromCart = async () => {
    navigate("/rfq?fromCart=1");
  };

  if (!cart && loading) return <ShopPage title="Shopping cart"><Skeleton className="h-72" /></ShopPage>;

  return (
    <ShopPage title="Shopping cart" crumbs={[{ label: "Cart" }]}>
      <ErrorNote className="mb-4">{error || err}</ErrorNote>
      {!cart?.items?.length && !cart?.saved?.length ? (
        <Empty icon="ShoppingCart" title="Your cart is empty" action={<div className="mt-2 flex gap-2"><Link to="/catalog" className={btnPrimary}>Browse products</Link><Link to="/quick-order" className={btnSecondary}>Quick order by part number</Link></div>}>
          Add products from the catalog, paste part numbers, or upload a BOM.
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-ink-100">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((i) => (
                    <tr key={i.id} className="border-t border-ink-100 align-top">
                      <td className="px-3 py-3">
                        <div className="flex gap-3">
                          <Link to={`/product/${i.slug}`} className="w-16 shrink-0 overflow-hidden rounded-lg border border-ink-100"><ProductImage image={i.image} alt="" /></Link>
                          <div className="min-w-0">
                            <Link to={`/product/${i.slug}`} className="line-clamp-2 font-semibold text-ink-900 hover:text-brand-700">{i.name}</Link>
                            <div className="font-mono text-xs text-ink-500">{i.sku}</div>
                            {!i.available && <div className="text-xs font-semibold text-red-700">No longer available</div>}
                            {i.priceOnRequest && <div className="text-xs font-semibold text-brand-700">Price on request — use “Request a quote”</div>}
                            {i.priceChanged && <div className="text-xs text-amber-700">Price updated since you added it</div>}
                            {i.stock?.status === "out_of_stock" && <div className="text-xs text-amber-700">Currently out of stock</div>}
                            {i.moq > 1 && i.qty < i.moq && <div className="text-xs text-amber-700">Minimum order quantity is {i.moq}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{i.unitPrice ? money(i.unitPrice, cur) : "—"}</td>
                      <td className="px-3 py-3">
                        <QtyInput key={`${i.id}-${i.qty}`} value={i.qty} min={1} disabled={busy === i.id} onCommit={(q) => act(i.id, () => update(i.id, { qty: q }))} />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{i.lineTotal ? money(i.lineTotal, cur) : "—"}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-1 text-xs">
                          <button disabled={busy === i.id} onClick={() => act(i.id, () => update(i.id, { savedForLater: true }))} className="font-semibold text-brand-700 hover:underline">Save for later</button>
                          <button disabled={busy === i.id} onClick={() => act(i.id, () => remove(i.id))} className="font-semibold text-ink-500 hover:text-red-700">Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cart.saved.length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-base font-bold text-ink-900">Saved for later ({cart.saved.length})</h2>
                <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {cart.saved.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <Link to={`/product/${i.slug}`} className="min-w-0 truncate"><span className="font-mono text-xs text-ink-500">{i.sku}</span> · {i.name} × {i.qty}</Link>
                      <span className="flex shrink-0 gap-3 text-xs font-semibold">
                        <button onClick={() => act(i.id, () => update(i.id, { savedForLater: false }))} className="text-brand-700 hover:underline">Move to cart</button>
                        <button onClick={() => act(i.id, () => remove(i.id))} className="text-ink-500 hover:text-red-700">Remove</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to="/catalog" className={btnSecondary}><Icon name="ArrowLeft" className="h-4 w-4" /> Continue shopping</Link>
              <Link to="/quick-order" className={btnSecondary}><Icon name="ListChecks" className="h-4 w-4" /> Add by part number</Link>
              {isAuthenticated && <SaveProject />}
            </div>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-ink-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink-700">Delivering to</span>
                <LocaleSelector />
              </div>
              {est && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-ink-600">
                    Shipping
                    <select value={method || est.shipping?.method || ""} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm font-normal">
                      {est.availableMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                      {!est.availableMethods.length && <option value="">Quoted separately</option>}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-ink-600">
                    Incoterm
                    <select value={incoterm || est.incoterm.code} onChange={(e) => setIncoterm(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm font-normal">
                      {INCOTERMS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {loading && !est && <Skeleton className="h-40" />}
              {cart.estimateError && <ErrorNote>{cart.estimateError}</ErrorNote>}
              {est && <EstimateTable est={est} />}
              {!est && !loading && !cart.estimateError && <p className="text-sm text-ink-500">Choose your country to see delivery charges.</p>}
              <div className="mt-4 flex flex-col gap-2">
                <button disabled={!canCheckout} onClick={() => navigate("/checkout")} className={btnPrimary}>
                  <Icon name="Lock" className="h-4 w-4" /> Proceed to checkout
                </button>
                <button onClick={rfqFromCart} className={btnSecondary}><Icon name="FileText" className="h-4 w-4" /> Request a quote for this cart</button>
              </div>
              {est && !canCheckout && (
                <InfoNote className="mt-3">
                  {est.blockers.length ? est.blockers.map((b) => b.message).join(" ") : "Some items need a quotation before they can be ordered online."} You can request a quote for the whole cart to {country?.name || "your country"}.
                </InfoNote>
              )}
            </div>
          </aside>
        </div>
      )}
    </ShopPage>
  );
}

function QtyInput({ value, min = 1, onCommit, disabled }) {
  const [v, setV] = useState(String(value));
  const commit = (n) => {
    const q = Math.max(min, Math.min(1000000, Math.floor(Number(n)) || min));
    setV(String(q));
    if (q !== value) onCommit(q);
  };
  return (
    <div className="mx-auto flex w-28 items-center rounded-lg border border-ink-200" role="group" aria-label="Quantity">
      <button disabled={disabled || value <= min} onClick={() => commit(value - 1)} className="px-2 py-1.5 text-ink-600 disabled:opacity-40" aria-label="Decrease"><Icon name="Minus" className="h-3.5 w-3.5" /></button>
      <input aria-label="Quantity" inputMode="numeric" disabled={disabled} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} onBlur={() => commit(v)} onKeyDown={(e) => e.key === "Enter" && commit(v)} className="w-full border-x border-ink-200 py-1.5 text-center text-sm font-semibold outline-none" />
      <button disabled={disabled} onClick={() => commit(value + 1)} className="px-2 py-1.5 text-ink-600" aria-label="Increase"><Icon name="Plus" className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function SaveProject() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await apiFetch("/api/shop/cart/project", { method: "PUT", body: { projectName: name } }).catch(() => {});
        setSaved(true);
      }}
      className="flex items-center gap-2"
    >
      <input value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} placeholder="Project / reference name" aria-label="Project name" className="rounded-lg border border-ink-200 px-3 py-2 text-sm" maxLength={150} />
      <button className={btnSecondary} disabled={!name.trim()}>{saved ? "Saved" : "Save name"}</button>
    </form>
  );
}
