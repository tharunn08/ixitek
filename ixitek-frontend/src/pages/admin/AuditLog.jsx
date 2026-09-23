import { useState } from "react";
import { PageHeader, Table, Pagination, ErrorBanner, useApi, dt, inputCls } from "../../components/admin/kit/index.jsx";

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const qs = new URLSearchParams({ limit: 50, offset: (page - 1) * 50, ...(action && { action }) });
  const list = useApi(`/api/admin/audit?${qs}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="ScrollText" title="Audit log" subtitle="Who changed what, when, from where, and why. Entries cannot be edited or deleted from the application." />
      <select className={`${inputCls} md:w-72`} value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} aria-label="Area">
        <option value="">All actions</option>
        {["pricing", "inventory", "catalog", "product", "staff", "enquiry", "auth", "warehouse", "backup", "user"].map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.entries}
        columns={[
          { key: "createdAt", label: "When", render: (e) => <span className="whitespace-nowrap text-xs">{dt(e.createdAt)}</span> },
          { key: "actor", label: "Who", render: (e) => <span className="text-xs">{e.actorEmail || "system"}</span> },
          { key: "action", label: "Action", render: (e) => <span className="font-mono text-xs font-semibold">{e.action}</span> },
          { key: "entity", label: "Record", render: (e) => <span className="text-xs">{e.entityType} {e.entityId}</span> },
          {
            key: "change",
            label: "Change",
            render: (e) => (
              <details className="max-w-md text-[11px]">
                <summary className="cursor-pointer text-brand-700">{e.reason ? `“${e.reason}”` : "details"}</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-ink-50 p-2">{JSON.stringify({ before: e.before, after: e.after }, null, 1)}</pre>
              </details>
            ),
          },
          { key: "ip", label: "IP", render: (e) => <span className="text-xs text-ink-400">{e.ip}</span> },
        ]}
      />
      <Pagination page={page} limit={50} total={list.data?.total} onPage={setPage} />
    </div>
  );
}
