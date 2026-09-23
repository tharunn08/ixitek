import { useState } from "react";
import { PageHeader, Table, Pagination, SearchInput, ErrorBanner, useApi, useDebounced, num, dt, inputCls } from "../../../components/admin/kit/index.jsx";

const TYPES = ["receipt", "adjustment_in", "adjustment_out", "count", "damage", "damage_writeoff", "transfer_in", "transfer_out", "reserve", "release", "ship", "return", "incoming", "incoming_cancel"];

export default function Movements() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ page, limit: 50, ...(dq && { q: dq }), ...(type && { type }) });
  const list = useApi(`/api/admin/inventory/movements?${qs}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="History" title="Stock movements" subtitle="Append-only ledger of every stock change: who, what, why, and the balance afterwards." />
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Filter by SKU" className="md:w-72" />
        <select className={`${inputCls} md:w-56`} value={type} onChange={(e) => (setType(e.target.value), setPage(1))} aria-label="Movement type">
          <option value="">All movement types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.movements}
        columns={[
          { key: "createdAt", label: "When", render: (m) => <span className="whitespace-nowrap text-xs">{dt(m.createdAt)}</span> },
          { key: "sku", label: "SKU", render: (m) => <span className="font-mono text-xs font-semibold">{m.sku}</span> },
          { key: "wh", label: "Warehouse", render: (m) => m.warehouseCode },
          { key: "type", label: "Type", render: (m) => m.type.replace(/_/g, " ") },
          { key: "bucket", label: "Bucket", render: (m) => m.bucket.replace("_", " ") },
          { key: "qty", label: "Qty", align: "right", render: (m) => <b className={m.quantity < 0 ? "text-red-700" : "text-emerald-700"}>{m.quantity > 0 ? "+" : ""}{num(m.quantity)}</b> },
          { key: "bal", label: "Balance", align: "right", render: (m) => num(m.balanceAfter) },
          { key: "reason", label: "Reason / ref", render: (m) => <span className="text-xs text-ink-600">{m.reason}{m.referenceId ? ` · ${m.referenceId}` : ""}</span> },
          { key: "user", label: "By", render: (m) => <span className="text-xs">{m.user || "system"}</span> },
        ]}
      />
      <Pagination page={page} limit={50} total={list.data?.total} onPage={setPage} />
    </div>
  );
}
