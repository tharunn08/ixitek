// Admin → RFQs: incoming requests for quotation, filterable by status,
// assignee ("mine") and number / email / company.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, Table, Pagination, SearchInput, ErrorBanner, useApi, useDebounced, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { StatusPill, label, dateOnly } from "./common.jsx";

const RFQ_STATUSES = ["submitted", "under_review", "info_requested", "quoted", "rejected", "closed", "converted"];
const LIMIT = 50;

export default function Rfqs() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const page = Number(params.get("page") || 1);
  const status = params.get("status") || "";
  const mine = params.get("mine") === "1";
  const qs = new URLSearchParams({ page, limit: LIMIT, ...(status && { status }), ...(mine && { mine: "1" }), ...(dq && { q: dq }) });
  const list = useApi(`/api/admin/commerce/rfqs?${qs}`);
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
      <PageHeader icon="ClipboardList" title="Requests for quotation" subtitle="Customer RFQs from the website, cart, BOM upload and quick order. Assign an owner, ask for missing information and turn each request into a versioned quotation." />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search RFQ number, email or company" className="md:w-80" />
        <select className={`${inputCls} md:w-52`} value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {RFQ_STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={mine} onChange={(e) => set("mine", e.target.checked ? "1" : "")} className="h-4 w-4 accent-brand-600" />
          Assigned to me
        </label>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.rfqs}
        onRowClick={(r) => navigate(`/admin/rfqs/${encodeURIComponent(r.rfqNumber)}`)}
        empty="No RFQs match these filters."
        columns={[
          { key: "rfqNumber", label: "RFQ", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.rfqNumber}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          {
            key: "contact",
            label: "Contact",
            render: (r) => (
              <div className="max-w-xs">
                <div className="truncate font-medium text-ink-800">{r.company || r.contact}</div>
                <div className="truncate text-xs text-ink-500">{r.company ? `${r.contact} · ` : ""}{r.email}</div>
              </div>
            ),
          },
          { key: "country", label: "Country", render: (r) => r.country || "—" },
          { key: "lines", label: "Lines", align: "right", render: (r) => num(r.lines) },
          { key: "requiredDate", label: "Required by", render: (r) => (r.requiredDate ? dateOnly(r.requiredDate) : "—") },
          { key: "assignee", label: "Assignee", render: (r) => (r.assignee ? <span className="text-xs">{r.assignee}</span> : <span className="text-xs text-amber-700">Unassigned</span>) },
          { key: "createdAt", label: "Received", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={(p) => set("page", String(p))} />
    </div>
  );
}
