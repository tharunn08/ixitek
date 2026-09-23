// Admin → Returns (RMA): review, approve/reject, receive (with restock) and resolve.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Table, Pagination, SearchInput, useDebounced, Btn, Pill, Drawer, Field, inputCls, ErrorBanner, Notice, useApi, dt, num } from "../../../components/admin/kit/index.jsx";
import { StatusPill, label, useAction } from "./common.jsx";

const STATUSES = ["requested", "approved", "awaiting_return", "received", "inspected", "completed", "rejected", "cancelled"];
const CONDITIONS = ["", "unopened", "good", "damaged", "defective"];
const warrantyPill = (w) => (w === null || w === undefined ? <Pill tone="gray">warranty unverified</Pill> : w ? <Pill tone="green">in warranty</Pill> : <Pill tone="amber">out of warranty</Pill>);

const PAGE = 50;

export default function Returns() {
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, dq]);
  const list = useApi(`/api/admin/returns?${new URLSearchParams({ ...(status && { status }), ...(dq && { q: dq }), page, limit: PAGE })}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="RotateCcw" title="Returns & warranty" subtitle="Return, replacement, repair, refund and warranty requests. New requests are listed first. Receiving a return can put units back into stock." />
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search return, order or customer" className="md:w-80" />
        <select className={`${inputCls} md:w-56`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Return status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="rmaNumber"
        rows={list.data?.returns}
        onRowClick={(r) => setOpen(r.rmaNumber)}
        empty="No returns."
        columns={[
          { key: "rmaNumber", label: "Return", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.rmaNumber}</span> },
          { key: "createdAt", label: "Requested", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
          { key: "order", label: "Order", render: (r) => <span className="font-mono text-xs">{r.orderNumber}</span> },
          { key: "customer", label: "Customer", render: (r) => <span className="line-clamp-1">{r.customer}</span> },
          { key: "kind", label: "Type", render: (r) => label(r.kind) },
          { key: "reason", label: "Reason", render: (r) => <span className="text-xs">{label(r.reason)}</span> },
          { key: "warranty", label: "Warranty", render: (r) => (r.kind === "warranty" ? warrantyPill(r.withinWarranty) : "—") },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
        ]}
      />
      <Pagination page={page} limit={PAGE} total={list.data?.total} onPage={setPage} />
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `Return ${open}` : ""} width="max-w-3xl">
        {open && <ReturnDetail key={open} number={open} onChanged={list.reload} />}
      </Drawer>
    </div>
  );
}

function ReturnDetail({ number, onChanged }) {
  const det = useApi(`/api/admin/returns/${encodeURIComponent(number)}`);
  const r = det.data?.return;
  if (det.error) return <ErrorBanner onRetry={det.reload}>{det.error}</ErrorBanner>;
  if (!r) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={r.status} />
        <Pill tone="blue">{label(r.kind)}</Pill>
        <Pill tone="gray">{label(r.reason)}</Pill>
        {r.kind === "warranty" && warrantyPill(r.withinWarranty)}
        <Link to={`/admin/orders/${encodeURIComponent(r.orderNumber)}`} className="ml-auto font-mono text-xs font-semibold text-brand-700 hover:underline">Order {r.orderNumber} →</Link>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-500">Requested</dt><dd>{dt(r.createdAt)}</dd>
        <dt className="text-ink-500">Assignee</dt><dd>{r.assignee || "—"}</dd>
        <dt className="text-ink-500">Return tracking</dt><dd className="font-mono text-xs">{r.returnTracking || "—"}</dd>
        <dt className="text-ink-500">Resolution</dt><dd>{r.resolution || "—"}</dd>
      </dl>
      {r.notes && (
        <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Customer’s description</div>
          <p className="whitespace-pre-line">{r.notes}</p>
        </div>
      )}
      <Table
        rowKey="orderItemId"
        rows={r.items}
        columns={[
          { key: "sku", label: "Item", render: (i) => <div><div className="font-mono text-xs font-semibold">{i.sku}</div><div className="line-clamp-1 text-[11px] text-ink-400">{i.name}</div></div> },
          { key: "qty", label: "Qty", align: "right", render: (i) => num(i.qty) },
          { key: "unitPrice", label: "Unit price (order currency)", align: "right", render: (i) => <span className="text-xs text-ink-500">{i.unitPrice ?? "—"}</span> },
          { key: "restock", label: "Restocked", render: (i) => (i.restock === null || i.restock === undefined ? "—" : i.restock ? <Pill tone="green">yes</Pill> : <Pill tone="gray">no</Pill>) },
          { key: "condition", label: "Condition", render: (i) => <span className="text-xs">{i.condition || "—"}</span> },
        ]}
      />
      <UpdateForm key={`${r.status}-${r.history.length}`} r={r} onDone={() => (det.reload(), onChanged())} />
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">History</h3>
        <ol className="flex flex-col gap-2 border-l border-ink-100 pl-4">
          {[...r.history].reverse().map((h, idx) => (
            <li key={idx} className={`rounded-lg px-3 py-2 text-sm ${h.internal ? "border border-amber-200 bg-amber-50" : "bg-ink-50"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill status={h.status} />
                {h.internal && <Pill tone="amber">internal</Pill>}
                <span className="text-ink-400">{dt(h.at)}</span>
              </div>
              {h.note && <p className="mt-1 whitespace-pre-line text-ink-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function UpdateForm({ r, onDone }) {
  const [run, busy, error, setError] = useAction();
  const [f, setF] = useState({ status: "", note: "", internal: false, resolution: r.resolution || "", returnTracking: r.returnTracking || "", warranty: r.withinWarranty === null ? "" : r.withinWarranty ? "yes" : "no" });
  const [restock, setRestock] = useState(() => Object.fromEntries(r.items.map((i) => [i.orderItemId, { qty: String(i.qty), warehouseId: "", condition: "" }])));
  const receiving = f.status === "received";
  const whs = useApi(receiving ? "/api/admin/returns/meta/warehouses" : null);
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const upR = (id, k) => (e) => setRestock((x) => ({ ...x, [id]: { ...x[id], [k]: e.target.value } }));
  const transitions = r.transitions || [];

  const submit = (e) => {
    e.preventDefault();
    if (f.status === "rejected" && f.note.trim().length < 3) return setError("Explain why the request is rejected (the note is sent to the customer).");
    if (f.status === "completed" && !f.resolution.trim()) return setError("Record the resolution (e.g. refunded, replaced, repaired).");
    const body = { note: f.note.trim(), internal: f.internal };
    if (f.status) body.status = f.status;
    if (f.resolution.trim() !== (r.resolution || "")) body.resolution = f.resolution.trim();
    if (f.returnTracking.trim() !== (r.returnTracking || "")) body.returnTracking = f.returnTracking.trim();
    const w = f.warranty === "" ? null : f.warranty === "yes";
    if (w !== r.withinWarranty) body.withinWarranty = w;
    if (receiving) {
      const lines = r.items.map((i) => ({ orderItemId: i.orderItemId, qty: Math.floor(Number(restock[i.orderItemId].qty) || 0), warehouseId: restock[i.orderItemId].warehouseId, condition: restock[i.orderItemId].condition }));
      const bad = lines.find((l, idx) => l.qty < 0 || l.qty > r.items[idx].qty);
      if (bad) return setError("Restock quantity must be between 0 and the returned quantity.");
      if (lines.some((l) => l.qty > 0 && !l.warehouseId)) return setError("Choose the warehouse for every item you restock.");
      body.restock = lines.map((l) => (l.qty > 0 ? l : { orderItemId: l.orderItemId, qty: 0, condition: l.condition }));
    }
    if (!body.status && !body.note && Object.keys(body).length <= 2) return setError("Nothing to change.");
    run(`/api/admin/returns/${encodeURIComponent(r.rmaNumber)}`, { body }, () => (setF((x) => ({ ...x, status: "", note: "", internal: false })), onDone()));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
      <h3 className="text-sm font-bold text-ink-900">Update return</h3>
      {r.returnInstructions !== undefined && !r.returnInstructions && <Notice tone="amber" icon="Info">No return instructions are configured — set them under Finance → Business settings so customers know where to send items.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move to status">
          <select className={inputCls} value={f.status} onChange={up("status")} disabled={!transitions.length}>
            <option value="">{transitions.length ? "Keep current status" : "No further status changes"}</option>
            {transitions.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        <Field label="Warranty verification">
          <select className={inputCls} value={f.warranty} onChange={up("warranty")}>
            <option value="">Not verified</option>
            <option value="yes">Within warranty</option>
            <option value="no">Out of warranty</option>
          </select>
        </Field>
        <Field label="Return tracking number">
          <input className={inputCls} maxLength={200} value={f.returnTracking} onChange={up("returnTracking")} />
        </Field>
        <Field label={`Resolution${f.status === "completed" ? " (required)" : ""}`} hint="e.g. Refunded in full, replaced with new unit, repaired">
          <input className={inputCls} maxLength={1000} value={f.resolution} onChange={up("resolution")} />
        </Field>
      </div>
      {receiving && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-ink-700">Restock received units</h4>
          <ErrorBanner onRetry={whs.reload}>{whs.error && `Warehouses could not be loaded (${whs.error}). Units can only be recorded with restock quantity 0.`}</ErrorBanner>
          <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Item</th>
                  <th scope="col" className="px-3 py-2 text-right">Returned</th>
                  <th scope="col" className="px-3 py-2">Restock qty</th>
                  <th scope="col" className="px-3 py-2">Warehouse</th>
                  <th scope="col" className="px-3 py-2">Condition</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.orderItemId} className="border-t border-ink-100">
                    <td className="px-3 py-1.5 font-mono text-xs font-semibold">{i.sku}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(i.qty)}</td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={0} max={i.qty} step={1} className={`${inputCls} w-20 py-1`} aria-label={`Restock quantity for ${i.sku}`} value={restock[i.orderItemId].qty} onChange={upR(i.orderItemId, "qty")} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className={`${inputCls} py-1`} aria-label={`Warehouse for ${i.sku}`} value={restock[i.orderItemId].warehouseId} onChange={upR(i.orderItemId, "warehouseId")}>
                        <option value="">Choose…</option>
                        {whs.data?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select className={`${inputCls} py-1`} aria-label={`Condition of ${i.sku}`} value={restock[i.orderItemId].condition} onChange={upR(i.orderItemId, "condition")}>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c ? label(c) : "Not recorded"}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-500">Units with a restock quantity are received into the chosen warehouse. Set 0 for damaged or scrapped units.</p>
        </div>
      )}
      <Field label={`Note${f.status === "rejected" ? " (required — explain the rejection)" : ""}`} hint={f.internal ? "Internal — only staff can see this." : "Visible to the customer in their return history."}>
        <textarea className={inputCls} rows={3} maxLength={2000} value={f.note} onChange={up("note")} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={f.internal} onChange={up("internal")} />
        Internal note (not shown to the customer, no customer email)
      </label>
      <ErrorBanner>{error}</ErrorBanner>
      <div>
        <Btn type="submit" variant={f.status === "rejected" || f.status === "cancelled" ? "danger" : "primary"} icon="Check" disabled={busy}>
          {f.status ? `Save & mark ${label(f.status)}` : "Save"}
        </Btn>
      </div>
    </form>
  );
}
