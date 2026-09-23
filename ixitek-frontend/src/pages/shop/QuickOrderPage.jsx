// QuickOrderPage — paste "SKU quantity" lines or upload a BOM (.xlsx/.csv).
// The server matches each line (exact SKU, normalised SKU — always flagged —
// or exact description) and reports stock; nothing is changed silently.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useCart } from "../../context/CartContext.jsx";
import { ShopPage, ErrorNote, InfoNote, btnPrimary, btnSecondary, inputCls } from "../../components/shop/ui.jsx";

const STATUS = {
  matched: ["Matched", "bg-emerald-50 text-emerald-700"],
  not_found: ["Not found", "bg-red-50 text-red-700"],
  out_of_stock: ["Out of stock", "bg-amber-50 text-amber-800"],
  insufficient_stock: ["Limited stock", "bg-amber-50 text-amber-800"],
  invalid: ["Check line", "bg-red-50 text-red-700"],
};

export default function QuickOrderPage() {
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const navigate = useNavigate();

  const validate = async () => {
    setBusy(true);
    setErr("");
    setAdded(false);
    try {
      if (tab === "paste") setResult(await apiFetch("/api/shop/quick-order/validate", { method: "POST", body: { text } }));
      else {
        const form = new FormData();
        form.append("file", file);
        setResult(await apiFetch("/api/shop/bom/upload", { method: "POST", form }));
      }
    } catch (e) {
      setErr(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const orderable = (result?.lines || []).filter((l) => l.product && ["matched", "insufficient_stock"].includes(l.status) && !l.product.priceOnRequest);
  const quoteOnly = (result?.lines || []).filter((l) => l.product && (l.product.priceOnRequest || l.status === "out_of_stock"));
  const unmatched = (result?.lines || []).filter((l) => !l.product);

  const addAll = async () => {
    setBusy(true);
    setErr("");
    try {
      await add(orderable.map((l) => ({ productId: l.product.id, qty: l.qty })));
      setAdded(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const toRfq = () => {
    const lines = (result?.lines || []).filter((l) => l.status !== "invalid").map((l) => ({ sku: l.product ? l.product.sku : l.sku || "", description: l.product ? l.product.name : l.description || "", qty: l.qty }));
    sessionStorage.setItem("ixitek_rfq_lines", JSON.stringify(lines));
    navigate("/rfq?from=quick-order");
  };

  return (
    <ShopPage title="Quick order & BOM upload" crumbs={[{ label: "Quick order" }]}>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="flex flex-col gap-3">
          <div role="tablist" className="flex gap-1 border-b border-ink-100">
            {[["paste", "Paste part numbers"], ["bom", "Upload BOM"]].map(([id, l]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => (setTab(id), setResult(null))} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500"}`}>{l}</button>
            ))}
          </div>
          {tab === "paste" ? (
            <>
              <label htmlFor="qo" className="text-sm text-ink-600">One line per item: part number, then quantity (space, tab or comma separated). Up to 500 lines.</label>
              <textarea id="qo" rows={12} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} font-mono`} placeholder={"99IL31-3021M-1M 10\n99IL31-3021M-2M, 25"} />
            </>
          ) : (
            <>
              <p className="text-sm text-ink-600">Excel (.xlsx) or CSV with a header row: <b>SKU</b> (or Part Number / MPN), <b>Description</b>, <b>Quantity</b>. Up to 1,000 lines, 5 MB.</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" aria-label="BOM file" />
            </>
          )}
          <button onClick={validate} disabled={busy || (tab === "paste" ? !text.trim() : !file)} className={btnPrimary}>
            <Icon name={busy ? "Loader2" : "Search"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Check availability
          </button>
          <ErrorNote>{err}</ErrorNote>
        </div>

        <div>
          {!result ? (
            <InfoNote icon="ListChecks">Results appear here with the matched product, stock status and what can be ordered online. Lines we can't match can still go into a quotation request.</InfoNote>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-ink-100 px-2 py-1 font-semibold">{result.summary.total} lines</span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">{result.summary.matched} matched</span>
                {result.summary.notFound > 0 && <span className="rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700">{result.summary.notFound} not found</span>}
                {result.summary.outOfStock + result.summary.insufficientStock > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-800">{result.summary.outOfStock + result.summary.insufficientStock} stock issues</span>}
                {result.summary.invalid > 0 && <span className="rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700">{result.summary.invalid} to fix</span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-ink-100">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">You entered</th><th className="px-3 py-2">Matched product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2">Status</th></tr>
                  </thead>
                  <tbody>
                    {result.lines.map((l) => (
                      <tr key={l.line} className="border-t border-ink-100 align-top">
                        <td className="px-3 py-2 text-ink-400">{l.line}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.sku || l.description || l.raw}</td>
                        <td className="px-3 py-2">
                          {l.product ? (
                            <>
                              <Link to={`/product/${l.product.slug}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{l.product.sku}</Link>
                              <div className="text-xs text-ink-600">{l.product.name}</div>
                              {l.matchedBy !== "sku" && <div className="text-[11px] text-amber-700">Matched by {l.matchedBy === "normalised_sku" ? "part number ignoring spaces/punctuation" : "description"} — please confirm</div>}
                              {l.product.priceOnRequest && <div className="text-[11px] text-brand-700">Price on request</div>}
                              {l.product.moq > 1 && l.qty < l.product.moq && <div className="text-[11px] text-amber-700">MOQ {l.product.moq}</div>}
                            </>
                          ) : (
                            <span className="text-xs text-ink-400">{l.error || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.qty ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${(STATUS[l.status] || STATUS.invalid)[1]}`}>{(STATUS[l.status] || STATUS.invalid)[0]}</span>
                          {l.stock?.available !== undefined && l.status === "insufficient_stock" && <div className="text-[11px] text-ink-500">{l.stock.available} available</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy || !orderable.length} onClick={addAll} className={btnPrimary}><Icon name="ShoppingCart" className="h-4 w-4" /> Add {orderable.length} orderable line{orderable.length === 1 ? "" : "s"} to cart</button>
                {(quoteOnly.length > 0 || unmatched.length > 0 || orderable.length > 0) && <button onClick={toRfq} className={btnSecondary}><Icon name="FileText" className="h-4 w-4" /> Request a quote for all lines</button>}
                {added && <Link to="/cart" className={btnSecondary}>View cart →</Link>}
              </div>
              {(quoteOnly.length > 0 || unmatched.length > 0) && <p className="text-xs text-ink-500">{quoteOnly.length + unmatched.length} line(s) can't be ordered online (price on request, out of stock or not in the catalog). Include them in a quotation request and our team will reply.</p>}
            </div>
          )}
        </div>
      </div>
    </ShopPage>
  );
}
