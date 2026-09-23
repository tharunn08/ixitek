// Admin → Catalog → Product: details, confidential costs & selling price,
// stock by warehouse, price history. Cost panels render only for users with
// pricing.read_cost — and the API omits costs for everyone else anyway.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Card, Btn, Pill, Field, inputCls, ErrorBanner, Notice, Table, useApi, usd, dt, num } from "../../../components/admin/kit/index.jsx";
import StockPanel from "../inventory/StockPanel.jsx";

const STATUSES = ["draft", "review", "active", "coming_soon", "discontinued", "end_of_sale", "end_of_life", "archived"];

export default function ProductEdit() {
  const { id } = useParams();
  const { can } = useAdminAuth();
  const res = useApi(`/api/admin/catalog/products/${id}`);
  const p = res.data?.product;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });

  useEffect(() => {
    if (p)
      setForm({
        name: p.name, shortDescription: p.shortDescription || "", description: p.description || "", status: p.status, featured: p.featured,
        moq: p.moq, maxOrderQty: p.maxOrderQty ?? "", leadTimeDays: p.leadTimeDays ?? "", warrantyMonths: p.warrantyMonths ?? "", weightKg: p.weightKg ?? "",
        hsCode: p.hsCode || "", countryOfOrigin: p.countryOfOrigin || "", trackInventory: p.trackInventory, allowBackorder: p.allowBackorder,
        seoTitle: p.seoTitle || "", seoDescription: p.seoDescription || "", searchKeywords: p.searchKeywords || "",
      });
  }, [p]);

  async function save() {
    setSaving(true);
    setMsg({ ok: "", err: "" });
    try {
      await apiFetch(`/api/admin/catalog/products/${id}`, { method: "PUT", body: form });
      setMsg({ ok: "Saved.", err: "" });
      res.reload();
    } catch (err) {
      setMsg({ ok: "", err: err.message });
    } finally {
      setSaving(false);
    }
  }
  const f = (k) => ({ value: form?.[k] ?? "", onChange: (e) => setForm((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })) });

  if (res.error) return <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>;
  if (!p || !form) return <div className="h-40 animate-pulse rounded-xl bg-white" />;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/catalog/products" className="text-xs font-semibold text-brand-700 hover:underline">← All products</Link>
      <PageHeader
        title={<span className="font-mono">{p.sku}</span>}
        subtitle={`${p.category.name} › ${p.family?.name || "—"} · source ${p.sourceRef || "manual"} · updated ${dt(p.updatedAt)}`}
        actions={
          <>
            <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer"><Btn icon="ExternalLink">View on site</Btn></a>
            {can("catalog.write") && <Btn variant="primary" icon={saving ? "Loader2" : "Save"} disabled={saving} onClick={save}>Save changes</Btn>}
          </>
        }
      />
      {msg.ok && <Notice tone="green" icon="CheckCircle2">{msg.ok}</Notice>}
      <ErrorBanner>{msg.err}</ErrorBanner>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card title="Product information">
            <fieldset disabled={!can("catalog.write")} className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name" className="sm:col-span-2"><input className={inputCls} {...f("name")} /></Field>
              <Field label="SKU / part number" hint="SKUs are immutable here to protect orders and integrations."><input className={`${inputCls} font-mono`} value={p.sku} disabled /></Field>
              <Field label="Lifecycle status">
                <select className={inputCls} {...f("status")}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
              <Field label="Short description" className="sm:col-span-2"><input className={inputCls} {...f("shortDescription")} /></Field>
              <Field label="Full description (supplier text, kept verbatim on import)" className="sm:col-span-2"><textarea rows={3} className={inputCls} {...f("description")} /></Field>
              <Field label="MOQ"><input type="number" min="1" className={inputCls} {...f("moq")} /></Field>
              <Field label="Max order qty"><input type="number" min="1" className={inputCls} {...f("maxOrderQty")} /></Field>
              <Field label="Lead time (days)"><input type="number" min="0" className={inputCls} {...f("leadTimeDays")} /></Field>
              <Field label="Warranty (months)" hint="Leave empty unless confirmed by the supplier."><input type="number" min="0" className={inputCls} {...f("warrantyMonths")} /></Field>
              <Field label="Weight (kg)"><input className={inputCls} {...f("weightKg")} /></Field>
              <Field label="HS code"><input className={inputCls} {...f("hsCode")} /></Field>
              <Field label="Country of origin (ISO-2)"><input maxLength={2} className={`${inputCls} uppercase`} {...f("countryOfOrigin")} /></Field>
              <div className="flex flex-col justify-end gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={f("featured").onChange} /> Featured</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.trackInventory} onChange={f("trackInventory").onChange} /> Track inventory</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowBackorder} onChange={f("allowBackorder").onChange} /> Allow backorder</label>
              </div>
              <Field label="SEO title" className="sm:col-span-2"><input className={inputCls} {...f("seoTitle")} /></Field>
              <Field label="SEO description" className="sm:col-span-2"><textarea rows={2} className={inputCls} {...f("seoDescription")} /></Field>
              <Field label="Extra search keywords" className="sm:col-span-2"><input className={inputCls} {...f("searchKeywords")} /></Field>
            </fieldset>
          </Card>

          <Card title="Technical attributes" pad={false}>
            <Table
              rowKey="code"
              rows={p.attributes}
              empty="No attributes."
              columns={[
                { key: "name", label: "Attribute" },
                { key: "value", label: "Value", render: (a) => <span className="font-medium text-ink-800">{a.value}</span> },
                { key: "source", label: "Source", render: (a) => <Pill tone={a.source === "manual" ? "blue" : "gray"}>{a.source === "parsed" ? "from description" : a.source}</Pill> },
              ]}
            />
          </Card>

          <Card title="Images">
            <div className="flex flex-wrap gap-3">
              {p.images.map((i) => (
                <div key={i.id} className="w-40 rounded-lg border border-ink-100 p-2">
                  <img src={i.url} alt={i.alt} loading="lazy" className="h-28 w-full rounded bg-ink-50 object-contain" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  <div className="mt-1 flex items-center justify-between">
                    <Pill tone={{ valid: "green", broken: "red", unchecked: "gray" }[i.status]}>{i.status}{i.httpStatus ? ` · ${i.httpStatus}` : ""}</Pill>
                    {i.isPrimary && <Pill tone="blue">primary</Pill>}
                  </div>
                </div>
              ))}
              {!p.images.length && <span className="text-sm text-ink-400">No image — storefront shows the IXITEK fallback.</span>}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <PricingPanel product={p} canSeeCosts={res.data.canSeeCosts} onChange={res.reload} />
          <StockPanel productId={p.id} />
        </div>
      </div>
    </div>
  );
}

function PricingPanel({ product, canSeeCosts, onChange }) {
  const { can } = useAdminAuth();
  const pr = product.pricing;
  const [override, setOverride] = useState({ price: pr.overridePriceUsd ?? "", reason: "" });
  const [costs, setCosts] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const history = useApi(canSeeCosts ? `/api/admin/pricing/products/${product.id}/history` : null, [pr.sellingPriceUsd, pr.costs?.updatedAt]);

  useEffect(() => {
    if (pr.costs) setCosts({ supplierExwCostUsd: pr.costs.supplierExwCostUsd ?? "", supplierFobCostUsd: pr.costs.supplierFobCostUsd ?? "", internalCostUsd: pr.costs.internalCostUsd ?? "", costBasis: pr.costs.costBasis, reason: "" });
  }, [pr.costs]);

  async function run(fn) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const calc = pr.ruleCalculation;

  return (
    <Card title="Pricing" actions={pr.sellingPriceUsd ? <Pill tone="green">customer price {usd(pr.sellingPriceUsd)}</Pill> : <Pill tone="amber">Request a Quote</Pill>}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Customer selling price (USD)</span><b className="text-ink-900">{usd(pr.sellingPriceUsd)}</b></div>
          <div className="mt-1 flex justify-between text-xs"><span className="text-ink-500">Source</span><span>{pr.source === "override" ? `Manual override — “${pr.overrideReason}”` : pr.source === "rule" ? "Pricing rule" : "Not configured → customers see “Request a Quote”"}</span></div>
        </div>

        {canSeeCosts ? (
          <>
            <Notice tone="amber" icon="Lock">Confidential — supplier costs and margins are visible only to authorised roles and never leave the admin panel.</Notice>
            {calc && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-ink-500">Cost basis</span><span className="text-right font-semibold uppercase">{calc.costBasis || "—"}</span>
                <span className="text-ink-500">Cost used</span><span className="text-right">{usd(calc.costUsd, 4)}</span>
                <span className="text-ink-500">Margin / markup</span><span className="text-right">{calc.marginPct ? `${Number(calc.marginPct)}% + ${usd(calc.fixedMarkupUsd)}` : "no rule"}</span>
                <span className="text-ink-500">Rule price</span><span className="text-right font-semibold">{usd(calc.sellingPriceUsd)}</span>
              </div>
            )}
            {costs && (
              <fieldset disabled={!can("pricing.write") || busy} className="grid grid-cols-2 gap-2">
                <Field label="EXW CN cost (USD)"><input className={inputCls} value={costs.supplierExwCostUsd} onChange={(e) => setCosts({ ...costs, supplierExwCostUsd: e.target.value })} /></Field>
                <Field label="US FOB cost (USD)"><input className={inputCls} value={costs.supplierFobCostUsd} onChange={(e) => setCosts({ ...costs, supplierFobCostUsd: e.target.value })} /></Field>
                <Field label="Internal cost (USD)"><input className={inputCls} value={costs.internalCostUsd} onChange={(e) => setCosts({ ...costs, internalCostUsd: e.target.value })} /></Field>
                <Field label="Default cost basis">
                  <select className={inputCls} value={costs.costBasis} onChange={(e) => setCosts({ ...costs, costBasis: e.target.value })}>
                    <option value="exw">EXW CN</option><option value="fob">US FOB</option><option value="internal">Internal</option>
                  </select>
                </Field>
                <Field label="Reason for change" className="col-span-2"><input className={inputCls} value={costs.reason} placeholder="e.g. Supplier price update Q4" onChange={(e) => setCosts({ ...costs, reason: e.target.value })} /></Field>
                {can("pricing.write") && (
                  <Btn className="col-span-2" icon="Save" onClick={() => run(() => apiFetch(`/api/admin/pricing/products/${product.id}/costs`, { method: "PUT", body: costs }))}>Save costs</Btn>
                )}
              </fieldset>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-500">Supplier costs are hidden for your role.</p>
        )}

        {can("pricing.write") && (
          <div className="flex flex-col gap-2 border-t border-ink-100 pt-3">
            <div className="text-xs font-bold text-ink-700">Manual selling-price override</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Price (USD)"><input className={inputCls} value={override.price} onChange={(e) => setOverride({ ...override, price: e.target.value })} /></Field>
              <Field label="Reason (required)"><input className={inputCls} value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} /></Field>
            </div>
            <div className="flex gap-2">
              <Btn variant="primary" size="sm" icon="Save" disabled={busy} onClick={() => run(() => apiFetch(`/api/admin/pricing/products/${product.id}/override`, { method: "PUT", body: { priceUsd: override.price, reason: override.reason } }))}>Set override</Btn>
              {pr.overridePriceUsd && <Btn size="sm" icon="Undo2" disabled={busy} onClick={() => run(() => apiFetch(`/api/admin/pricing/products/${product.id}/override`, { method: "PUT", body: { priceUsd: null, reason: override.reason || "Override removed" } }))}>Remove override</Btn>}
            </div>
          </div>
        )}
        <ErrorBanner>{err}</ErrorBanner>

        {canSeeCosts && history.data?.history?.length > 0 && (
          <details className="border-t border-ink-100 pt-3">
            <summary className="cursor-pointer text-xs font-bold text-ink-700">Price & cost history ({num(history.data.history.length)})</summary>
            <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-[11px]">
              {history.data.history.map((h) => (
                <li key={h.id} className="rounded border border-ink-100 px-2 py-1">
                  <b>{h.field}</b>: {h.oldValue ?? "—"} → {h.newValue ?? "—"} <span className="text-ink-400">· {h.source}{h.changedBy ? ` · ${h.changedBy}` : ""} · {dt(h.createdAt)}</span>
                  {h.reason && <div className="text-ink-500">“{h.reason}”</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
