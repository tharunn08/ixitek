// Per-product stock: levels by warehouse, increase/decrease form, ledger.
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { Card, Btn, Field, inputCls, ErrorBanner, Notice, Pill, useApi, num, dt } from "../../../components/admin/kit/index.jsx";

const OPS = [
  { code: "receive", label: "Receive stock (+)", sign: "+" },
  { code: "increase", label: "Increase – adjustment (+)", sign: "+" },
  { code: "decrease", label: "Decrease – adjustment (−)", sign: "−" },
  { code: "count", label: "Set counted quantity (=)", sign: "=" },
  { code: "damage", label: "Move to damaged (−)", sign: "−" },
  { code: "writeoff_damaged", label: "Write off damaged (−)", sign: "−" },
  { code: "incoming", label: "Expected incoming (+)", sign: "+" },
  { code: "incoming_cancel", label: "Cancel incoming (−)", sign: "−" },
];

export default function StockPanel({ productId, compact = false }) {
  const { can } = useAdminAuth();
  const res = useApi(`/api/admin/inventory/products/${productId}`);
  const [form, setForm] = useState({ warehouseId: "", operation: "receive", quantity: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const levels = res.data?.levels || [];
  const warehouseId = form.warehouseId || levels[0]?.warehouseId || "";
  const op = OPS.find((o) => o.code === form.operation);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ ok: "", err: "" });
    try {
      const out = await apiFetch("/api/admin/inventory/adjust", {
        method: "POST",
        body: { productId, warehouseId, operation: form.operation, quantity: Number(form.quantity), reason: form.reason, idempotencyKey: crypto.randomUUID?.() },
      });
      setMsg({ ok: out.unchanged ? "No change — quantity already matches." : `Done. Available now: ${num(out.level.available)}.`, err: "" });
      setForm((f) => ({ ...f, quantity: "", reason: "" }));
      res.reload();
    } catch (err) {
      setMsg({ ok: "", err: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Stock" actions={res.data && <Pill tone={levels.some((l) => l.available > 0) ? "green" : "gray"}>{num(levels.reduce((s, l) => s + l.available, 0))} available</Pill>}>
      <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>
      {res.data && !levels.length && (
        <Notice tone="amber" icon="Warehouse">
          No warehouses yet. <Link to="/admin/inventory/warehouses" className="font-semibold underline">Add a warehouse</Link> to start tracking stock. Until then the storefront shows “Lead time on request”.
        </Notice>
      )}
      {levels.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wide text-ink-400">
              <tr><th className="py-1">Warehouse</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th className="text-right">Incoming</th><th className="text-right">Damaged</th></tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.warehouseId} className="border-t border-ink-100 tabular-nums">
                  <td className="py-1.5 font-semibold text-ink-800">{l.warehouseCode}{!l.warehouseActive && <span className="ml-1 text-ink-400">(inactive)</span>}</td>
                  <td className="text-right">{num(l.onHand)}</td>
                  <td className="text-right">{num(l.reserved)}</td>
                  <td className={`text-right font-bold ${l.available > 0 ? "text-emerald-700" : "text-ink-400"}`}>{num(l.available)}</td>
                  <td className="text-right">{num(l.incoming)}</td>
                  <td className="text-right">{num(l.damaged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can("inventory.adjust") && levels.length > 0 && (
        <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-100 pt-4">
          <Field label="Warehouse">
            <select className={inputCls} value={warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              {levels.map((l) => <option key={l.warehouseId} value={l.warehouseId}>{l.warehouseCode} — {l.warehouseName}</option>)}
            </select>
          </Field>
          <Field label="Operation">
            <select className={inputCls} value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>
              {OPS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </Field>
          <Field label={form.operation === "count" ? "Counted quantity" : "Quantity"}>
            <div className="flex items-center gap-1">
              <span className={`w-6 text-center text-lg font-bold ${op.sign === "−" ? "text-red-600" : "text-brand-600"}`}>{op.sign}</span>
              <input required type="number" min={form.operation === "count" ? 0 : 1} step="1" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
          </Field>
          <Field label="Reason / reference"><input required minLength={3} className={inputCls} placeholder="e.g. PO-1042 received" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Btn type="submit" variant={op.sign === "−" ? "danger" : "primary"} icon={busy ? "Loader2" : op.sign === "−" ? "PackageMinus" : "PackagePlus"} disabled={busy} className="col-span-2">
            Apply stock change
          </Btn>
          {msg.ok && <div className="col-span-2 text-xs font-semibold text-emerald-700">{msg.ok}</div>}
          {msg.err && <div className="col-span-2"><ErrorBanner>{msg.err}</ErrorBanner></div>}
        </form>
      )}

      {!compact && res.data?.movements?.length > 0 && (
        <details className="mt-4 border-t border-ink-100 pt-3" open>
          <summary className="cursor-pointer text-xs font-bold text-ink-700">Recent movements</summary>
          <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto text-[11px]">
            {res.data.movements.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 rounded border border-ink-100 px-2 py-1">
                <span>
                  <b className={m.quantity < 0 ? "text-red-700" : "text-emerald-700"}>{m.quantity > 0 ? "+" : ""}{num(m.quantity)}</b> {m.bucket.replace("_", " ")} · {m.type.replace(/_/g, " ")} · {m.warehouseCode}
                  <span className="block text-ink-500">{m.reason}</span>
                </span>
                <span className="shrink-0 text-right text-ink-400">bal. {num(m.balanceAfter)}<br />{m.user || "system"} · {dt(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
