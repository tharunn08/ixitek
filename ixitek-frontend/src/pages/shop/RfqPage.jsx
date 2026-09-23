// RfqPage — request for quotation (products from the catalog, cart, quick
// order or free-text part numbers), destination, required date, message and
// attachments. RfqView shows a submitted request and lets the customer reply.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { ShopPage, ErrorNote, InfoNote, FormField, StatusBadge, Skeleton, btnPrimary, btnSecondary, inputCls, dateStr, money } from "../../components/shop/ui.jsx";

const blank = () => ({ sku: "", description: "", qty: 1, targetPrice: "" });

export default function RfqPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { locale, locales, currency } = useLocale();
  const { session } = useAdminAuth();
  const { cart, refresh } = useCart();
  const fromCart = params.get("fromCart") === "1";
  const [lines, setLines] = useState([blank()]);
  const [f, setF] = useState({ name: session?.name || "", email: session?.email || "", phone: session?.phone || "", companyName: session?.company || "", country: locale?.country || "", destination: "", requiredDate: "", incoterm: "", message: "" });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (locale?.country && !f.country) setF((x) => ({ ...x, country: locale.country }));
  }, [locale?.country]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill: a product (?product=slug&qty=), quick-order/BOM lines, or the cart.
  useEffect(() => {
    const slug = params.get("product");
    if (slug) {
      apiFetch(`/api/catalog/products/${encodeURIComponent(slug)}`)
        .then(({ product }) => setLines([{ sku: product.sku, description: product.name, qty: Number(params.get("qty")) || product.moq || 1, targetPrice: "" }]))
        .catch(() => {});
      return;
    }
    if (params.get("from") === "quick-order") {
      try {
        const saved = JSON.parse(sessionStorage.getItem("ixitek_rfq_lines") || "[]");
        if (saved.length) setLines(saved.map((l) => ({ ...blank(), ...l })));
      } catch {
        /* ignore */
      }
    }
  }, [params]);
  useEffect(() => {
    if (fromCart && cart?.items?.length) setLines(cart.items.map((i) => ({ sku: i.sku, description: i.name, qty: i.qty, targetPrice: "" })));
  }, [fromCart, cart]);

  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const payload = {
        ...f,
        currency,
        incoterm: f.incoterm || undefined,
        source: fromCart ? "cart" : params.get("from") === "quick-order" ? "quick_order" : "web",
        fromCart: fromCart || undefined,
        items: fromCart ? undefined : lines.filter((l) => l.sku.trim() || l.description.trim()).map((l) => ({ sku: l.sku.trim(), description: l.description.trim(), qty: Number(l.qty), targetPrice: l.targetPrice || undefined })),
      };
      let out;
      if (files.length) {
        const form = new FormData();
        form.append("payload", JSON.stringify(payload));
        for (const file of files) form.append("attachments", file);
        out = await apiFetch("/api/shop/rfq", { method: "POST", form });
      } else out = await apiFetch("/api/shop/rfq", { method: "POST", body: payload });
      sessionStorage.removeItem("ixitek_rfq_lines");
      if (fromCart) refresh();
      navigate(`/rfq/${out.rfqNumber}?token=${encodeURIComponent(out.accessToken)}`, { replace: true, state: { justSent: true } });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ShopPage title="Request a quotation" crumbs={[{ label: "Request a quote" }]}>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-ink-100 p-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink-900">Products</h2>
            {fromCart ? (
              <InfoNote>All {cart?.items?.length || 0} line(s) in your cart will be included. <Link to="/cart" className="font-semibold underline">Edit cart</Link></InfoNote>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <tr><th className="pb-1 pr-2">Part number</th><th className="pb-1 pr-2">Description</th><th className="w-24 pb-1 pr-2">Qty</th><th className="w-32 pb-1 pr-2">Target unit price ({currency})</th><th /></tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2"><input value={l.sku} onChange={(e) => setLine(i, "sku", e.target.value)} className={`${inputCls} font-mono`} aria-label={`Part number line ${i + 1}`} /></td>
                          <td className="py-1 pr-2"><input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} className={inputCls} aria-label={`Description line ${i + 1}`} placeholder="e.g. MPO trunk 24F OM4 30 m" /></td>
                          <td className="py-1 pr-2"><input type="number" min={1} required value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} className={inputCls} aria-label={`Quantity line ${i + 1}`} /></td>
                          <td className="py-1 pr-2"><input inputMode="decimal" value={l.targetPrice} onChange={(e) => setLine(i, "targetPrice", e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} aria-label={`Target price line ${i + 1}`} placeholder="optional" /></td>
                          <td className="py-1"><button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [blank()])} aria-label="Remove line" className="p-1 text-ink-400 hover:text-red-700"><Icon name="Trash2" className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => setLines([...lines, blank()])} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">+ Add line</button>
              </>
            )}
          </section>

          <section className="rounded-xl border border-ink-100 p-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink-900">Delivery</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Destination country" required>
                <select required value={f.country} onChange={set("country")} className={inputCls}>
                  <option value="" disabled>Choose…</option>
                  {(locales?.countries || []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="City / site"><input value={f.destination} onChange={set("destination")} className={inputCls} maxLength={200} /></FormField>
              <FormField label="Required by"><input type="date" value={f.requiredDate} onChange={set("requiredDate")} className={inputCls} /></FormField>
              <FormField label="Preferred Incoterm">
                <select value={f.incoterm} onChange={set("incoterm")} className={inputCls}>
                  <option value="">No preference</option>
                  {["EXW", "FCA", "FOB", "CIF", "CPT", "CIP", "DAP", "DDP"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Message / technical requirements" className="mt-3"><textarea rows={4} value={f.message} onChange={set("message")} className={inputCls} maxLength={10000} /></FormField>
            <FormField label="Attachments" hint="Up to 5 files, 5 MB each: PDF, PNG, JPG, CSV, XLSX, ZIP" className="mt-3">
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.zip" onChange={(e) => setFiles([...e.target.files].slice(0, 5))} className="text-sm" />
            </FormField>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-xl border border-ink-200 p-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink-900">Your details</h2>
            <div className="flex flex-col gap-3">
              <FormField label="Name" required><input required value={f.name} onChange={set("name")} className={inputCls} autoComplete="name" /></FormField>
              <FormField label="Email" required><input type="email" required value={f.email} onChange={set("email")} className={inputCls} autoComplete="email" /></FormField>
              <FormField label="Phone"><input value={f.phone} onChange={set("phone")} className={inputCls} autoComplete="tel" /></FormField>
              <FormField label="Company"><input value={f.companyName} onChange={set("companyName")} className={inputCls} autoComplete="organization" /></FormField>
            </div>
            <ErrorNote className="mt-3">{err}</ErrorNote>
            <button disabled={busy} className={`${btnPrimary} mt-4 w-full`}><Icon name={busy ? "Loader2" : "Send"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Submit request</button>
            <p className="mt-2 text-[11px] text-ink-400">We reply with a formal quotation (PDF) you can accept online. Quotations are valid for the period shown on them.</p>
          </section>
        </aside>
      </form>
    </ShopPage>
  );
}

export function RfqView() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const [rfq, setRfq] = useState(null);
  const [err, setErr] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch(`/api/shop/rfqs/${encodeURIComponent(number)}${q}`).then((r) => setRfq(r.rfq)).catch((e) => setErr(e.status === 404 ? "This request was not found. Use the link from your email or sign in." : e.message));
  useEffect(() => {
    load();
  }, [number, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiFetch(`/api/shop/rfqs/${encodeURIComponent(number)}/messages${q}`, { method: "POST", body: { body: reply } });
      setRfq(r.rfq);
      setReply("");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (!rfq) return <ShopPage title={`Request ${number}`}>{err ? <ErrorNote>{err}</ErrorNote> : <Skeleton className="h-64" />}</ShopPage>;
  return (
    <ShopPage title={`Request ${rfq.rfqNumber}`} crumbs={[{ label: "Requests for quote" }]} actions={<StatusBadge status={rfq.status} />}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {rfq.quotes.filter((x) => x.status !== "draft").map((x) => (
            <Link key={x.id} to={`/quote/${x.number}?token=${encodeURIComponent(x.accessToken || "")}`} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
              Quotation {x.number}-V{x.version} is ready <span>View →</span>
            </Link>
          ))}
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Part number</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Target price</th></tr></thead>
              <tbody>
                {rfq.items.map((i) => (
                  <tr key={i.id} className="border-t border-ink-100"><td className="px-3 py-2 font-mono text-xs">{i.sku || "—"}</td><td className="px-3 py-2">{i.description}</td><td className="px-3 py-2 text-right">{i.qty}</td><td className="px-3 py-2 text-right">{i.targetPrice ? money(i.targetPrice, rfq.currency) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="rounded-xl border border-ink-100 p-4">
            <h2 className="mb-2 font-display text-base font-bold text-ink-900">Conversation</h2>
            {rfq.message && <p className="mb-3 whitespace-pre-line rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{rfq.message}</p>}
            <ul className="flex flex-col gap-2">
              {rfq.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-ink-100 p-3 text-sm"><div className="mb-1 text-xs text-ink-500"><b className="text-ink-800">{m.author}</b> · {new Date(m.at).toLocaleString()}</div><p className="whitespace-pre-line">{m.body}</p></li>
              ))}
            </ul>
            {!["converted", "closed", "rejected"].includes(rfq.status) && (
              <form onSubmit={send} className="mt-3 flex flex-col gap-2">
                <textarea required rows={3} value={reply} onChange={(e) => setReply(e.target.value)} className={inputCls} aria-label="Reply" placeholder="Add details or answer our questions" />
                <button disabled={busy || !reply.trim()} className={`${btnPrimary} self-start`}>Send</button>
              </form>
            )}
            <ErrorNote className="mt-2">{err}</ErrorNote>
          </section>
        </div>
        <aside className="rounded-xl border border-ink-100 p-4 text-sm">
          <dl className="flex flex-col gap-1.5">
            <div className="flex justify-between"><dt className="text-ink-500">Submitted</dt><dd>{dateStr(rfq.createdAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Destination</dt><dd>{[rfq.destination, rfq.country].filter(Boolean).join(", ")}</dd></div>
            {rfq.requiredDate && <div className="flex justify-between"><dt className="text-ink-500">Required by</dt><dd>{dateStr(rfq.requiredDate)}</dd></div>}
            {rfq.incoterm && <div className="flex justify-between"><dt className="text-ink-500">Incoterm</dt><dd>{rfq.incoterm}</dd></div>}
            {rfq.attachments.length > 0 && <div><dt className="text-ink-500">Attachments</dt><dd className="text-xs">{rfq.attachments.map((a) => a.name).join(", ")}</dd></div>}
          </dl>
          <Link to="/catalog" className={`${btnSecondary} mt-4 w-full`}>Continue browsing</Link>
        </aside>
      </div>
    </ShopPage>
  );
}
