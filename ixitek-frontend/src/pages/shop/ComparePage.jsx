// ComparePage — side-by-side technical comparison. Columns come from the
// products' own attributes (union), never a hard-coded list.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProduct } from "../../lib/catalogApi.js";
import { toggleCompare, clearCompare } from "../../lib/compareStore.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { useLocale } from "../../context/LocaleContext.jsx";
import ProductImage from "../../components/catalog/ProductImage.jsx";
import { Availability, Price, CartButtons, isPurchasable } from "../../components/catalog/ProductCard.jsx";

export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const slugs = (params.get("p") || "").split(",").filter(Boolean).slice(0, 4);
  const [items, setItems] = useState(null);
  const { currency } = useLocale();
  useDocumentTitle("Compare products");
  useEffect(() => {
    Promise.all(slugs.map((s) => getProduct(s).then((r) => r.product).catch(() => null))).then((r) => setItems(r.filter(Boolean)));
  }, [params, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!slugs.length) return <div className="container-page py-20 text-center text-ink-500"><h1 className="mb-2 font-display text-2xl font-bold text-ink-900">Compare products</h1>Nothing to compare yet. <Link to="/catalog" className="font-semibold text-brand-700">Browse products →</Link></div>;
  if (!items) return <div className="container-page py-20"><div className="h-64 animate-pulse rounded-xl bg-ink-100" /></div>;

  const attrNames = [];
  for (const p of items) for (const a of p.attributes) if (!attrNames.some((x) => x.code === a.code)) attrNames.push({ code: a.code, name: a.name });
  const remove = (p) => {
    toggleCompare(p);
    setParams({ p: slugs.filter((s) => s !== p.slug).join(",") });
  };

  return (
    <div className="container-page py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Compare products</h1>
        <button onClick={() => (clearCompare(), setParams({}))} className="text-sm font-semibold text-ink-500 underline">Clear all</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <tbody>
            <tr>
              <th className="w-44 bg-ink-50 p-3" />
              {items.map((p) => (
                <td key={p.slug} className="border-l border-ink-100 p-3 align-top">
                  <ProductImage image={p.images[0]} alt={p.name} className="mb-2 rounded-lg border border-ink-100" />
                  <Link to={`/product/${p.slug}`} className="line-clamp-2 font-semibold text-ink-900 hover:text-brand-700">{p.name}</Link>
                  <button onClick={() => remove(p)} className="mt-1 text-xs text-ink-400 underline">Remove</button>
                </td>
              ))}
            </tr>
            <Row label="Part number">{items.map((p) => <span key={p.slug} className="font-mono text-xs">{p.sku}</span>)}</Row>
            <Row label="Price">{items.map((p) => <Price key={p.slug} price={p.price} />)}</Row>
            <Row label="Availability">{items.map((p) => <Availability key={p.slug} a={p.availability} />)}</Row>
            <Row label="Buy">
              {items.map((p) =>
                isPurchasable(p) ? <CartButtons key={p.slug} p={p} /> : <Link key={p.slug} to={`/rfq?product=${encodeURIComponent(p.slug)}`} className="text-xs font-semibold text-brand-700 underline">Request a Quote</Link>
              )}
            </Row>
            {attrNames.map((a) => (
              <Row key={a.code} label={a.name} highlight={new Set(items.map((p) => p.attributes.find((x) => x.code === a.code)?.value || "—")).size > 1}>
                {items.map((p) => <span key={p.slug}>{p.attributes.find((x) => x.code === a.code)?.value || "—"}</span>)}
              </Row>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-400">Rows that differ are highlighted.</p>
    </div>
  );
}
function Row({ label, children, highlight }) {
  return (
    <tr className={`border-t border-ink-100 ${highlight ? "bg-amber-50/50" : ""}`}>
      <th scope="row" className="bg-ink-50 p-3 text-left text-xs font-semibold text-ink-500">{label}</th>
      {children.map((c, i) => <td key={i} className="border-l border-ink-100 p-3 text-ink-800">{c}</td>)}
    </tr>
  );
}
