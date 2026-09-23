// Admin → Pricing & margins. Cost-based selling prices:
//   supplier cost (EXW CN / US FOB / internal) × (1 + margin%) + fixed markup
// Most specific active rule wins (product > family > category > global).
// Preview before saving; every change is audited and recorded in history.
import { useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { PageHeader, Card, Stat, Table, Pill, Btn, Field, inputCls, ErrorBanner, Notice, Modal, useApi, usd, num } from "../../components/admin/kit/index.jsx";

const EMPTY = { name: "", scope: "global", scopeId: "", costBasis: "product", marginPct: "", fixedMarkupUsd: "0", roundingStep: "0.01", minQty: 1, customerGroup: "", countryCode: "", currency: "", priority: 0, reason: "" };
const BASIS = { product: "Product default", exw: "EXW CN", fob: "US FOB", internal: "Internal cost" };

export default function Pricing() {
  const { can } = useAdminAuth();
  const summary = useApi("/api/admin/pricing/summary");
  const rules = useApi("/api/admin/pricing/rules");
  const cats = useApi("/api/admin/catalog/categories");
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const s = summary.data;

  async function doPreview() {
    setErr("");
    setBusy(true);
    try {
      setPreview(await apiFetch("/api/admin/pricing/rules/preview", { method: "POST", body: edit }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setErr("");
    setBusy(true);
    try {
      await apiFetch(edit.id ? `/api/admin/pricing/rules/${edit.id}` : "/api/admin/pricing/rules", { method: edit.id ? "PUT" : "POST", body: edit });
      setEdit(null);
      setPreview(null);
      setConfirm(false);
      rules.reload();
      setTimeout(summary.reload, 1500);
    } catch (e) {
      setErr(e.message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(r) {
    const reason = window.prompt(`Deactivate rule “${r.name || r.scope}”? Enter a reason:`);
    if (!reason) return;
    try {
      await apiFetch(`/api/admin/pricing/rules/${r.id}/deactivate`, { method: "POST", body: { reason } });
      rules.reload();
      setTimeout(summary.reload, 1500);
    } catch (e) {
      setErr(e.message);
    }
  }
  const f = (k) => ({ value: edit?.[k] ?? "", onChange: (e) => (setPreview(null), setEdit({ ...edit, [k]: e.target.value })) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon="Percent"
        title="Pricing & margins"
        subtitle="Selling price = supplier cost × (1 + margin %) + fixed markup. Customers only ever see the resulting selling price — never the cost, basis or margin. No rule = “Request a Quote”."
        actions={can("pricing.write") && <Btn variant="primary" icon="Plus" onClick={() => (setEdit({ ...EMPTY }), setPreview(null))}>New pricing rule</Btn>}
      />
      <Notice tone="amber" icon="Lock">Confidential commercial data. Access is restricted to Owner, Super Admin, Pricing Manager and Finance Manager roles. All changes are audited.</Notice>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Products" value={num(s?.products)} />
        <Stat label="With selling price" value={num(s?.priced)} tone="green" />
        <Stat label="Request a Quote" value={num(s?.requestQuote)} tone={s?.requestQuote ? "amber" : "ink"} />
        <Stat label="Manual overrides" value={num(s?.overridden)} tone="blue" />
        <Stat label="Without cost" value={num(s?.withoutCost)} tone={s?.withoutCost ? "red" : "ink"} />
      </div>
      <ErrorBanner>{err}</ErrorBanner>

      <Card title="Pricing rules" pad={false}>
        <Table
          loading={rules.loading}
          rows={rules.data?.rules}
          empty="No pricing rules yet — every product shows “Request a Quote”. Create a global rule to start."
          onRowClick={can("pricing.write") ? (r) => (setEdit({ ...r, reason: "" }), setPreview(null)) : undefined}
          columns={[
            { key: "name", label: "Rule", render: (r) => <b className="text-ink-800">{r.name || "—"}</b> },
            { key: "scope", label: "Applies to", render: (r) => (r.scope === "global" ? "All products" : `${r.scope}: ${r.scopeName || r.scopeId}`) },
            { key: "basis", label: "Cost basis", render: (r) => BASIS[r.costBasis] },
            { key: "margin", label: "Margin", align: "right", render: (r) => `${Number(r.marginPct)}%` },
            { key: "markup", label: "+ Fixed", align: "right", render: (r) => usd(r.fixedMarkupUsd) },
            { key: "cond", label: "Conditions", render: (r) => [r.customerGroup && `group ${r.customerGroup}`, r.countryCode && `country ${r.countryCode}`, r.currency, r.minQty > 1 && `qty ≥ ${r.minQty}`].filter(Boolean).join(" · ") || "—" },
            { key: "st", label: "Status", render: (r) => <Pill tone={r.isActive ? "green" : "gray"}>{r.isActive ? "active" : "inactive"}</Pill> },
            { key: "x", label: "", render: (r) => r.isActive && can("pricing.write") && <Btn size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), deactivate(r))}>Deactivate</Btn> },
          ]}
        />
      </Card>
      <Card title="How prices are resolved">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
          <li>A <b>manual override</b> on a product always wins (set on the product page, reason required).</li>
          <li>Otherwise the most specific active rule applies: <b>product → family → category (nearest first) → global</b>; then rules for a specific customer group, country or currency beat generic ones, and higher minimum quantities apply to larger orders.</li>
          <li>If there is no rule, or the chosen cost is missing, the product shows <b>Request a Quote</b> — the cost is never shown instead.</li>
          <li>Orders and invoices store the selling price at the time of purchase, so later cost or margin changes never alter them.</li>
        </ol>
      </Card>

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit pricing rule" : "New pricing rule"}
        footer={
          <>
            <Btn onClick={() => setEdit(null)}>Cancel</Btn>
            <Btn icon="Eye" disabled={busy} onClick={doPreview}>Preview</Btn>
            <Btn variant="primary" icon="Save" disabled={busy || !preview || !edit?.reason} onClick={() => setConfirm(true)}>Save rule</Btn>
          </>
        }
      >
        {edit && (
          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rule name" className="col-span-2"><input className={inputCls} placeholder="e.g. Standard EXW +30%" {...f("name")} /></Field>
              <Field label="Applies to">
                <select className={inputCls} {...f("scope")}>
                  <option value="global">All products</option><option value="category">A category</option><option value="family">A product family</option><option value="product">One product (ID)</option>
                </select>
              </Field>
              {edit.scope === "category" && (
                <Field label="Category"><select className={inputCls} {...f("scopeId")}><option value="">Choose…</option>{cats.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}</select></Field>
              )}
              {edit.scope === "family" && (
                <Field label="Family"><select className={inputCls} {...f("scopeId")}><option value="">Choose…</option>{cats.data?.families.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              )}
              {edit.scope === "product" && <Field label="Product ID"><input className={inputCls} {...f("scopeId")} /></Field>}
              {edit.scope === "global" && <div />}
              <Field label="Cost basis" hint="Product default = each product's own basis (EXW CN unless changed)">
                <select className={inputCls} {...f("costBasis")}>{Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </Field>
              <Field label="Margin %"><input className={inputCls} inputMode="decimal" placeholder="30" {...f("marginPct")} /></Field>
              <Field label="Fixed markup (USD)"><input className={inputCls} inputMode="decimal" {...f("fixedMarkupUsd")} /></Field>
              <Field label="Round to (USD)" hint="0.01 = cents, 0.05, 1…"><input className={inputCls} inputMode="decimal" {...f("roundingStep")} /></Field>
              <Field label="Min. quantity" hint="Volume tier"><input type="number" min="1" className={inputCls} {...f("minQty")} /></Field>
              <Field label="Customer group (optional)"><input className={inputCls} placeholder="e.g. distributor" {...f("customerGroup")} /></Field>
              <Field label="Country (optional, ISO-2)"><input maxLength={2} className={`${inputCls} uppercase`} {...f("countryCode")} /></Field>
              <Field label="Priority" hint="Tie-breaker"><input type="number" className={inputCls} {...f("priority")} /></Field>
              <Field label="Reason for this change (required)" className="col-span-2"><input className={inputCls} {...f("reason")} /></Field>
            </div>
            <Notice>Example: EXW CN cost $65.00 with 30% margin → selling price <b>$84.50</b>. Customers see $84.50 only.</Notice>
            <ErrorBanner>{err}</ErrorBanner>
            {preview && (
              <div className="rounded-lg border border-ink-100">
                <div className="border-b border-ink-100 bg-ink-50 px-3 py-2 text-xs font-bold text-ink-700">Preview (first {preview.sample.length} products in scope)</div>
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-left text-[10px] uppercase text-ink-400"><tr><th className="px-2 py-1">SKU</th><th className="text-right">Cost</th><th className="text-right">Current</th><th className="px-2 text-right">New</th></tr></thead>
                  <tbody>
                    {preview.sample.map((p) => (
                      <tr key={p.productId} className="border-t border-ink-100">
                        <td className="px-2 py-1 font-mono">{p.sku}</td>
                        <td className="text-right">{usd(p.costUsd, 4)} <span className="uppercase text-ink-400">{p.costBasis}</span></td>
                        <td className="text-right">{p.currentPriceUsd ? usd(p.currentPriceUsd) : "RFQ"}{p.overridden && " *"}</td>
                        <td className="px-2 text-right font-bold text-brand-700">{p.newPriceUsd ? usd(p.newPriceUsd) : "RFQ (no cost)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-1.5 text-[11px] text-ink-400">* manual override stays in force.</div>
              </div>
            )}
          </div>
        )}
      </Modal>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Apply pricing change?" footer={<><Btn onClick={() => setConfirm(false)}>Cancel</Btn><Btn variant="primary" icon="Check" disabled={busy} onClick={save}>Yes, apply</Btn></>}>
        This recalculates the customer selling price for every product in scope. Existing orders, quotes and invoices keep their original prices. The change is recorded in the audit log with your reason.
      </Modal>
    </div>
  );
}
