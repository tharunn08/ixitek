// QuotePage — a formal quotation (latest sent version + history), PDF, and
// accept (→ order at exactly the quoted prices) or decline.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { ShopPage, ErrorNote, InfoNote, FormField, StateField, StatusBadge, Skeleton, btnPrimary, btnSecondary, inputCls, dateStr, money, openPdf } from "../../components/shop/ui.jsx";

export default function QuotePage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const navigate = useNavigate();
  const { session } = useAdminAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pm, setPm] = useState("");
  const [addr, setAddr] = useState({ contactName: session?.name || "", companyName: session?.company || "", line1: "", line2: "", city: "", state: "", postalCode: "", countryCode: "", phone: "" });
  const [taxId, setTaxId] = useState("");
  const [poNumber, setPoNumber] = useState("");

  useEffect(() => {
    apiFetch(`/api/shop/quotes/${encodeURIComponent(number)}${q}`)
      .then((r) => {
        setData(r);
        setPm(r.paymentMethods[0] || "");
        const v = r.quote.versions[0];
        if (v) setAddr((a) => ({ ...a, countryCode: v.country }));
      })
      .catch((e) => setErr(e.status === 404 ? "notfound" : e.message));
  }, [number, q]);

  if (err === "notfound") return <ShopPage title="Quotation not found" narrow><InfoNote>Open the link from your quotation email, or <Link to="/login" state={{ from: `/quote/${number}` }} className="font-semibold underline">sign in</Link>.</InfoNote></ShopPage>;
  if (!data) return <ShopPage title={`Quotation ${number}`}>{err ? <ErrorNote>{err}</ErrorNote> : <Skeleton className="h-80" />}</ShopPage>;

  const quote = data.quote;
  const v = quote.versions[0];
  const expired = v && v.validUntil < new Date().toISOString().slice(0, 10);
  const actionable = quote.status === "sent" && v?.status === "sent" && !expired;

  const accept = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiFetch(`/api/shop/quotes/${encodeURIComponent(quote.quoteNumber)}/accept${q}`, { method: "POST", body: { shipping: addr, billingSameAsShipping: true, paymentMethod: pm, taxId, poNumber, note } });
      navigate(`/order/${r.orderNumber}?token=${encodeURIComponent(r.accessToken)}`, { state: { justPlaced: true, pay: pm === "razorpay" } });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/shop/quotes/${encodeURIComponent(quote.quoteNumber)}/reject${q}`, { method: "POST", body: { note } });
      setData({ ...data, quote: r.quote });
      setMode(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const setA = (k) => (e) => setAddr({ ...addr, [k]: e.target.value });

  return (
    <ShopPage title={`Quotation ${v ? v.label : quote.quoteNumber}`} crumbs={[{ label: "Quotations" }]} actions={<StatusBadge status={expired && quote.status === "sent" ? "expired" : quote.status} />}>
      <ErrorNote className="mb-4">{err}</ErrorNote>
      {quote.orderNumber && <InfoNote className="mb-4" icon="CheckCircle2">This quotation was accepted as order <b>{quote.orderNumber}</b>.</InfoNote>}
      {!v ? (
        <InfoNote>This quotation is being prepared.</InfoNote>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Lead time</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {v.items.map((i, k) => (
                    <tr key={k} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-mono text-xs">{i.sku || "—"}</td>
                      <td className="px-3 py-2">{i.description}{Number(i.discountPct) > 0 && <span className="block text-xs text-emerald-700">less {Number(i.discountPct)}%</span>}</td>
                      <td className="px-3 py-2 text-xs text-ink-600">{i.leadTime || v.leadTime || "—"}</td>
                      <td className="px-3 py-2 text-right">{i.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(i.unitPrice, v.currency)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(i.lineTotal, v.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {v.terms && <section className="rounded-xl border border-ink-100 p-4 text-sm"><h2 className="mb-1 font-bold text-ink-900">Terms</h2><p className="whitespace-pre-line text-ink-700">{v.terms}</p></section>}
            {v.notes && <section className="rounded-xl border border-ink-100 p-4 text-sm"><h2 className="mb-1 font-bold text-ink-900">Notes</h2><p className="whitespace-pre-line text-ink-700">{v.notes}</p></section>}
            {quote.versions.length > 1 && (
              <section className="text-xs text-ink-500">
                Earlier versions: {quote.versions.slice(1).map((x) => <button key={x.id} onClick={() => openPdf(`/api/pay/quotes/${quote.quoteNumber}.pdf?version=${x.version}${token ? `&token=${encodeURIComponent(token)}` : ""}`).catch((e) => setErr(e.message))} className="mr-2 font-semibold text-brand-700 underline">{x.label} ({x.status})</button>)}
              </section>
            )}

            {actionable && mode === "accept" && (
              <form onSubmit={accept} className="rounded-xl border border-brand-200 p-4">
                <h2 className="mb-3 font-display text-base font-bold text-ink-900">Accept and place order</h2>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Contact name" required><input required value={addr.contactName} onChange={setA("contactName")} className={inputCls} /></FormField>
                  <FormField label="Company"><input value={addr.companyName} onChange={setA("companyName")} className={inputCls} /></FormField>
                  <FormField label="Delivery address" required className="sm:col-span-2"><input required value={addr.line1} onChange={setA("line1")} className={inputCls} /></FormField>
                  <FormField label="Address line 2" className="sm:col-span-2"><input value={addr.line2} onChange={setA("line2")} className={inputCls} /></FormField>
                  <FormField label="City" required><input required value={addr.city} onChange={setA("city")} className={inputCls} /></FormField>
                  <StateField country={addr.countryCode} value={addr.state} onChange={(v) => setAddr({ ...addr, state: v })} />
                  <FormField label="Postal code"><input value={addr.postalCode} onChange={setA("postalCode")} className={inputCls} /></FormField>
                  <FormField label="Country (as quoted)"><input disabled value={addr.countryCode} className={`${inputCls} bg-ink-50`} /></FormField>
                  <FormField label="Phone"><input value={addr.phone} onChange={setA("phone")} className={inputCls} /></FormField>
                  <FormField label={addr.countryCode === "IN" ? "GSTIN (optional)" : "Tax ID"}><input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputCls} /></FormField>
                  <FormField label="Your PO number"><input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputCls} /></FormField>
                  <FormField label="Payment">
                    <select value={pm} onChange={(e) => setPm(e.target.value)} className={inputCls}>
                      {data.paymentMethods.map((m) => <option key={m} value={m}>{{ razorpay: "Pay online (Razorpay)", bank_transfer: "Bank transfer", purchase_order: "Purchase order (credit terms)" }[m] || m}</option>)}
                    </select>
                  </FormField>
                </div>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy} className={btnPrimary}>Accept quotation · {money(v.totals.total, v.currency)}</button>
                  <button type="button" onClick={() => setMode(null)} className={btnSecondary}>Cancel</button>
                </div>
              </form>
            )}
            {actionable && mode === "reject" && (
              <div className="rounded-xl border border-ink-200 p-4">
                <FormField label="Tell us why (optional) — it helps us revise the quotation"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></FormField>
                <div className="mt-3 flex gap-2"><button disabled={busy} onClick={reject} className={btnSecondary}>Decline quotation</button><button onClick={() => setMode(null)} className={btnSecondary}>Back</button></div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl border border-ink-200 p-4 text-sm">
              <dl className="flex flex-col gap-1">
                <R k="Valid until" v={<span className={expired ? "font-semibold text-red-700" : ""}>{dateStr(v.validUntil)}</span>} />
                <R k="Ship to" v={v.country} />
                <R k="Incoterm" v={v.incoterm} />
                {v.shippingMethod && <R k="Shipping" v={v.shippingMethod.toUpperCase()} />}
                <R k="Payment terms" v={v.paymentTerms} />
              </dl>
              <dl className="mt-3 flex flex-col gap-1 border-t border-ink-100 pt-3">
                <R k="Subtotal" v={money(v.totals.subtotal, v.currency)} />
                {Number(v.totals.discount) > 0 && <R k="Discount" v={`− ${money(v.totals.discount, v.currency)}`} />}
                {Number(v.totals.freight) > 0 && <R k="Freight" v={money(v.totals.freight, v.currency)} />}
                {Number(v.totals.insurance) > 0 && <R k="Insurance" v={money(v.totals.insurance, v.currency)} />}
                {Number(v.totals.tax) > 0 && <R k="Tax" v={money(v.totals.tax, v.currency)} />}
                {Number(v.totals.otherCharges) > 0 && <R k="Other" v={money(v.totals.otherCharges, v.currency)} />}
                <R k="Total" v={money(v.totals.total, v.currency)} strong />
                {(v.totals.customsEstimate || v.totals.importTaxEstimate) && <R k="Est. import charges (not included)" v={[v.totals.customsEstimate, v.totals.importTaxEstimate].filter(Boolean).map((x) => money(x, v.currency)).join(" + ")} />}
              </dl>
              <button onClick={() => openPdf(`/api/pay/quotes/${quote.quoteNumber}.pdf?version=${v.version}${token ? `&token=${encodeURIComponent(token)}` : ""}`).catch((e) => setErr(e.message))} className={`${btnSecondary} mt-4 w-full`}><Icon name="FileDown" className="h-4 w-4" /> Download PDF</button>
              {actionable && !mode && (
                <div className="mt-2 flex flex-col gap-2">
                  <button onClick={() => setMode("accept")} className={btnPrimary}><Icon name="CheckCircle2" className="h-4 w-4" /> Accept quotation</button>
                  <button onClick={() => setMode("reject")} className="text-xs font-semibold text-ink-500 hover:text-red-700">Decline</button>
                </div>
              )}
              {expired && quote.status === "sent" && <InfoNote className="mt-3">This quotation has expired. <Link to="/rfq" className="font-semibold underline">Request an updated quote</Link>.</InfoNote>}
            </div>
          </aside>
        </div>
      )}
    </ShopPage>
  );
}

function R({ k, v, strong }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold text-ink-900" : "text-ink-600"}`}>
      <dt>{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  );
}
