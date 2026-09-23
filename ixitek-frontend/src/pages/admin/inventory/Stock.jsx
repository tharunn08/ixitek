// Admin → Inventory → Stock levels (server-side paging/filter) + bulk CSV.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, apiDownload } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Table, Pagination, Pill, SearchInput, ErrorBanner, Drawer, Btn, Notice, Modal, useApi, useDebounced, num, inputCls } from "../../../components/admin/kit/index.jsx";
import StockPanel from "./StockPanel.jsx";

export default function Stock() {
  const { can } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const page = Number(params.get("page") || 1);
  const status = params.get("status") || "";
  const warehouseId = params.get("warehouseId") || "";
  const [selected, setSelected] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const whs = useApi("/api/admin/inventory/warehouses");
  const qs = new URLSearchParams({ page, limit: 50, ...(dq && { q: dq }), ...(status && { status }), ...(warehouseId && { warehouseId }) });
  const list = useApi(`/api/admin/inventory/levels?${qs}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon="Boxes"
        title="Stock levels"
        subtitle="Available = on hand − reserved. Every increase or decrease is locked, validated (never below zero or below reserved) and written to the movement ledger."
        actions={can("inventory.adjust") && <Btn icon="FileSpreadsheet" onClick={() => setBulkOpen(true)}>Bulk update (CSV)</Btn>}
      />
      {whs.data && !whs.data.warehouses.length && (
        <Notice tone="amber" icon="Warehouse">No warehouses configured yet. <Link className="font-semibold underline" to="/admin/inventory/warehouses">Create your first warehouse</Link> to start receiving stock.</Notice>
      )}
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search SKU or name" className="md:w-80" />
        <select className={`${inputCls} md:w-56`} value={warehouseId} onChange={(e) => set("warehouseId", e.target.value)} aria-label="Warehouse">
          <option value="">All warehouses</option>
          {whs.data?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
        </select>
        <select className={`${inputCls} md:w-48`} value={status} onChange={(e) => set("status", e.target.value)} aria-label="Stock status">
          <option value="">Any stock status</option>
          <option value="in">In stock</option>
          <option value="low">Low stock (≤ reorder point)</option>
          <option value="out">Out of stock</option>
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="productId"
        rows={list.data?.items}
        onRowClick={(r) => setSelected(r)}
        columns={[
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
          { key: "name", label: "Product", render: (r) => <span className="line-clamp-1 max-w-sm text-ink-700">{r.name}</span> },
          { key: "onHand", label: "On hand", align: "right", render: (r) => num(r.onHand) },
          { key: "reserved", label: "Reserved", align: "right", render: (r) => num(r.reserved) },
          { key: "available", label: "Available", align: "right", render: (r) => <b className={r.available > 0 ? "text-emerald-700" : "text-ink-400"}>{num(r.available)}</b> },
          { key: "incoming", label: "Incoming", align: "right", render: (r) => num(r.incoming) },
          { key: "damaged", label: "Damaged", align: "right", render: (r) => num(r.damaged) },
          { key: "st", label: "Status", render: (r) => (r.available <= 0 ? <Pill tone="gray">out</Pill> : r.reorderPoint !== null && r.available <= r.reorderPoint ? <Pill tone="amber">low</Pill> : <Pill tone="green">in stock</Pill>) },
          { key: "act", label: "", render: () => <span className="text-xs font-semibold text-brand-700">{can("inventory.adjust") ? "Adjust →" : "View →"}</span> },
        ]}
      />
      <Pagination page={page} limit={50} total={list.data?.total} onPage={(p) => set("page", String(p))} />
      <Drawer open={Boolean(selected)} onClose={() => (setSelected(null), list.reload())} title={selected ? `${selected.sku}` : ""}>
        {selected && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-600">{selected.name}</p>
            <StockPanel productId={selected.productId} />
          </div>
        )}
      </Drawer>
      <BulkModal open={bulkOpen} onClose={() => (setBulkOpen(false), list.reload())} />
    </div>
  );
}

function BulkModal({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = () => (setFile(null), setPreview(null), setResult(null), setErr(""));
  async function call(url, extra = {}) {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return apiFetch(url, { method: "POST", form });
  }
  async function doPreview() {
    setBusy(true);
    setErr("");
    try {
      setPreview(await call("/api/admin/inventory/bulk/preview"));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setErr("");
    try {
      setResult(await call("/api/admin/inventory/bulk/apply", { confirm: "yes" }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const template = () => {
    const blob = new Blob(["SKU,Warehouse,Operation,Quantity,Reason\n99IL31-3021m-1M,IN-BLR,receive,100,PO-1042 received\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stock-update-template.csv";
    a.click();
  };
  void apiDownload;
  return (
    <Modal
      open={open}
      onClose={() => (reset(), onClose())}
      title="Bulk stock update"
      footer={
        <>
          <Btn onClick={() => (reset(), onClose())}>Close</Btn>
          {!preview && <Btn variant="primary" disabled={!file || busy} icon="Eye" onClick={doPreview}>Validate</Btn>}
          {preview && !result && <Btn variant="primary" disabled={busy || preview.invalid > 0 || !preview.valid} icon="Check" onClick={apply}>Apply {num(preview.valid)} changes</Btn>}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-500">
          CSV columns: <code>SKU, Warehouse, Operation, Quantity, Reason</code>. Operations: receive, increase, decrease, count, damage, writeoff_damaged, incoming, incoming_cancel. Re-uploading the same file is safe — already-applied lines are skipped.{" "}
          <button className="font-semibold text-brand-700 underline" onClick={template}>Download template</button>
        </p>
        <input type="file" accept=".csv" onChange={(e) => (reset(), setFile(e.target.files[0]))} className="text-sm" />
        <ErrorBanner>{err}</ErrorBanner>
        {preview && !result && (
          <div className="max-h-60 overflow-y-auto rounded border border-ink-100 text-xs">
            {preview.rows.map((r) => (
              <div key={r.line} className={`flex justify-between gap-2 border-b border-ink-100 px-2 py-1 ${r.errors.length ? "bg-red-50 text-red-700" : ""}`}>
                <span>Line {r.line}: {r.sku} · {r.warehouse} · {r.operation} {r.quantity}</span>
                <span>{r.errors.join("; ") || "OK"}</span>
              </div>
            ))}
          </div>
        )}
        {result && <Notice tone={result.failed ? "amber" : "green"} icon="CheckCircle2">Applied {num(result.applied)} · skipped (already applied) {num(result.skippedDuplicates)} · failed {num(result.failed)}{result.results.filter((r) => !r.ok).map((r) => <div key={r.line}>Line {r.line} ({r.sku}): {r.error}</div>)}</Notice>}
      </div>
    </Modal>
  );
}
