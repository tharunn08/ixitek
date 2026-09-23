// Admin → Quotations: versioned quotes with status, customer and current total.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, Table, Pagination, SearchInput, ErrorBanner, Btn, useApi, useDebounced, dt, inputCls } from "../../../components/admin/kit/index.jsx";
import { StatusPill, Money, label, dateOnly } from "./common.jsx";

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted"];
const LIMIT = 50;

export default function Quotes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const page = Number(params.get("page") || 1);
  const status = params.get("status") || "";
  const qs = new URLSearchParams({ page, limit: LIMIT, ...(status && { status }), ...(dq && { q: dq }) });
  const list = useApi(`/api/admin/commerce/quotes?${qs}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon="FileText"
        title="Quotations"
        subtitle="Every sent version is locked; revising creates the next version (QT-…-V2) and supersedes the previous one. Customers accept the latest sent version online."
        actions={<Btn variant="primary" icon="Plus" onClick={() => navigate("/admin/quotes/new")}>New quotation</Btn>}
      />
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search quote number, email or company" className="md:w-80" />
        <select className={`${inputCls} md:w-48`} value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.quotes}
        onRowClick={(r) => navigate(`/admin/quotes/${encodeURIComponent(r.quoteNumber)}`)}
        empty="No quotations match these filters."
        columns={[
          { key: "label", label: "Quotation", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.label}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          {
            key: "customer",
            label: "Customer",
            render: (r) => (
              <div className="max-w-xs">
                <div className="truncate font-medium text-ink-800">{r.company || r.customer}</div>
                <div className="truncate text-xs text-ink-500">{r.email}</div>
              </div>
            ),
          },
          { key: "total", label: "Total", align: "right", render: (r) => <Money amount={r.total} currency={r.currency} /> },
          {
            key: "validUntil",
            label: "Valid until",
            render: (r) => {
              const d = r.validUntil ? dateOnly(r.validUntil) : "—";
              return <span className={r.status === "sent" && d !== "—" && d < today ? "text-red-700" : ""}>{d}</span>;
            },
          },
          { key: "salesperson", label: "Salesperson", render: (r) => <span className="text-xs">{r.salesperson || "—"}</span> },
          { key: "createdAt", label: "Created", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={(p) => set("page", String(p))} />
    </div>
  );
}
