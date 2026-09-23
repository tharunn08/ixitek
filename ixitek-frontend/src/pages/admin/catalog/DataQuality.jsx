// Admin → Catalog → Data quality: surfaces gaps without inventing data.
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../../lib/api.js";
import { PageHeader, Card, Table, Pill, Btn, ErrorBanner, Notice, useApi, num } from "../../../components/admin/kit/index.jsx";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";

const SEVERITY = { broken_image: "red", missing_image: "amber", missing_description: "red", no_cost: "amber", no_selling_price: "amber", suspicious_sku: "amber", duplicate_sku_case: "red" };

export default function DataQuality() {
  const { can } = useAdminAuth();
  const q = useApi("/api/admin/catalog/quality");
  const [open, setOpen] = useState(null);
  const detail = useApi(open ? `/api/admin/catalog/quality/${open}` : null, [open]);
  const [msg, setMsg] = useState("");

  async function recheck() {
    try {
      await apiFetch("/api/admin/catalog/imports/images/check", { method: "POST", body: {} });
      setMsg("Image validation started in the background. Refresh in a minute.");
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon="ClipboardCheck"
        title="Product data quality"
        subtitle="Gaps in the catalog. Fix them with real information from datasheets or the supplier — the system never fills missing data with guesses."
        actions={can("catalog.import") && <Btn icon="RefreshCw" onClick={recheck}>Re-validate images</Btn>}
      />
      {msg && <Notice>{msg}</Notice>}
      <ErrorBanner onRetry={q.reload}>{q.error}</ErrorBanner>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {q.data?.checks.map((c) => (
          <button
            key={c.code}
            onClick={() => c.count && c.code !== "duplicate_sku_case" && setOpen(c.code)}
            className={`focus-ring rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-colors ${open === c.code ? "border-brand-400 ring-2 ring-brand-100" : "border-ink-100 hover:border-brand-200"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-600">{c.label}</span>
              {c.count > 0 ? <Pill tone={SEVERITY[c.code] || "gray"}>{num(c.count)}</Pill> : <Pill tone="green">OK</Pill>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${q.data.totalProducts ? 100 - (c.count / q.data.totalProducts) * 100 : 100}%` }} />
            </div>
          </button>
        ))}
      </div>
      {open && (
        <Card title={detail.data?.label || "Products"} pad={false} actions={<Btn size="sm" icon="X" onClick={() => setOpen(null)}>Close</Btn>}>
          <Table
            loading={detail.loading}
            rows={detail.data?.items}
            columns={[
              { key: "sku", label: "SKU", render: (r) => <Link to={`/admin/catalog/products/${r.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{r.sku}</Link> },
              { key: "name", label: "Name" },
              { key: "sourceRef", label: "Source (sheet!row)", render: (r) => <span className="text-xs text-ink-500">{r.sourceRef || "—"}</span> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
