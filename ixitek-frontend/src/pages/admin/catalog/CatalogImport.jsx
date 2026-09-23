// Admin → Catalog → Import: upload → validate → preview → confirm → report.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiDownload } from "../../../lib/api.js";
import { Icon } from "../../../lib/icons.jsx";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Btn, Card, Stat, Pill, Table, Tabs, Pagination, ErrorBanner, Notice, Modal, useApi, usd, num, dt, SearchInput, useDebounced } from "../../../components/admin/kit/index.jsx";

const ACTION_TONE = { create: "green", update: "blue", unchanged: "gray", duplicate: "amber", invalid: "red", skip: "gray" };
const STATUS_TONE = { preview: "amber", queued: "blue", importing: "blue", completed: "green", failed: "red", cancelled: "gray" };

export default function CatalogImport() {
  const history = useApi("/api/admin/catalog/imports");
  const [batch, setBatch] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  async function upload(file) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) return setError("Please choose an .xlsx or .csv file.");
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { batch: b } = await apiFetch("/api/admin/catalog/imports", { method: "POST", form });
      setBatch(b);
      history.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon="FileSpreadsheet"
        title="Import catalog"
        subtitle="Upload the supplier workbook (.xlsx) or a CSV. Nothing changes in the catalog until you review the preview and confirm. Supplier costs are stored as confidential internal costs and are never shown to customers."
        actions={<Btn icon="Download" onClick={() => apiDownload("/api/admin/catalog/imports/template.csv", "ixitek-catalog-template.csv")}>CSV template</Btn>}
      />

      {!batch && (
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), upload(e.dataTransfer.files[0]))}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-brand-400 bg-brand-50" : "border-ink-200 bg-white"}`}
        >
          <Icon name={uploading ? "Loader2" : "UploadCloud"} className={`h-10 w-10 text-brand-600 ${uploading ? "animate-spin" : ""}`} />
          <div className="text-sm font-semibold text-ink-800">{uploading ? "Reading and validating the file…" : "Drop the catalog workbook here"}</div>
          <div className="text-xs text-ink-500">.xlsx or .csv · up to 15 MB · every sheet with a “Part#” or “SKU” header is read</div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => upload(e.target.files[0])} />
          <Btn variant="primary" icon="Paperclip" disabled={uploading} onClick={() => fileRef.current?.click()}>
            Choose file
          </Btn>
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>

      {batch && <BatchView batchId={batch.id} initial={batch} onClose={() => (setBatch(null), history.reload())} />}

      {!batch && (
        <Card title="Recent imports" pad={false}>
          <Table
            loading={history.loading}
            rows={history.data?.imports}
            onRowClick={(r) => setBatch(r)}
            empty="No imports yet."
            columns={[
              { key: "fileName", label: "File", render: (r) => <span className="font-medium text-ink-800">{r.fileName}</span> },
              { key: "status", label: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
              { key: "rows", label: "Rows", align: "right", render: (r) => num(r.summary?.totalRows) },
              { key: "res", label: "Result", render: (r) => (r.summary?.result ? `${num(r.summary.result.created)} created · ${num(r.summary.result.updated)} updated · ${num(r.summary.result.failed)} failed` : "—") },
              { key: "by", label: "Uploaded by", render: (r) => r.uploadedBy || "—" },
              { key: "createdAt", label: "Uploaded", render: (r) => dt(r.createdAt) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function BatchView({ batchId, initial, onClose }) {
  const { can } = useAdminAuth();
  const [batch, setBatch] = useState(initial);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = tab === "all" ? "" : tab;
  const rows = useApi(`/api/admin/catalog/imports/${batchId}/rows?page=${page}&limit=50${action ? `&action=${action}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`, [batch.status]);
  const s = batch.summary || {};
  const running = batch.status === "queued" || batch.status === "importing";
  const showCosts = can("pricing.read_cost");

  useEffect(() => setPage(1), [tab, dq]);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(async () => {
      try {
        const { batch: b } = await apiFetch(`/api/admin/catalog/imports/${batchId}`);
        setBatch(b);
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running, batchId]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const { batch: b } = await apiFetch(`/api/admin/catalog/imports/${batchId}/confirm`, { method: "POST", body: { confirm: true } });
      setBatch(b);
      setConfirmOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    try {
      await apiFetch(`/api/admin/catalog/imports/${batchId}/cancel`, { method: "POST", body: {} });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  const tabs = [
    { id: "all", label: "All rows", count: s.totalRows },
    { id: "create", label: "New", count: s.create },
    { id: "update", label: "Changed", count: s.update },
    { id: "unchanged", label: "Unchanged", count: s.unchanged },
    { id: "duplicate", label: "Duplicates", count: s.duplicate },
    { id: "invalid", label: "Invalid", count: s.invalid },
    { id: "warnings", label: "With warnings", count: s.rowsWithWarnings },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Icon name="FileSpreadsheet" className="h-6 w-6 text-brand-600" />
          <div>
            <div className="text-sm font-bold text-ink-900">{batch.fileName}</div>
            <div className="text-xs text-ink-500">
              {num(batch.fileBytes && batch.fileBytes / 1024)} KB · uploaded {dt(batch.createdAt)} {batch.uploadedBy ? `by ${batch.uploadedBy}` : ""}
            </div>
          </div>
          <Pill tone={STATUS_TONE[batch.status]}>{running && <Icon name="Loader2" className="h-3 w-3 animate-spin" />} {batch.status}</Pill>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn icon="Download" onClick={() => apiDownload(`/api/admin/catalog/imports/${batchId}/report.csv`, "import-report.csv")}>
            {batch.status === "completed" ? "Download report" : "Download error/warning report"}
          </Btn>
          {batch.status === "preview" && (
            <>
              <Btn icon="X" onClick={cancel}>Discard</Btn>
              <Btn variant="primary" icon="Check" disabled={!((s.create || 0) + (s.update || 0) + (s.duplicate || 0))} onClick={() => setConfirmOpen(true)}>
                Review &amp; import
              </Btn>
            </>
          )}
          {!running && batch.status !== "preview" && <Btn icon="ArrowLeft" onClick={onClose}>Back to imports</Btn>}
        </div>
      </div>
      <ErrorBanner>{error || batch.error}</ErrorBanner>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Rows read" value={num(s.totalRows)} />
        <Stat label="Unique SKUs" value={num(s.uniqueSkus)} />
        <Stat label="New" value={num(s.create)} tone="green" />
        <Stat label="Changed" value={num(s.update)} tone="blue" />
        <Stat label="Unchanged" value={num(s.unchanged)} />
        <Stat label="Duplicates" value={num(s.duplicate)} tone="amber" hint="same SKU listed twice → linked" />
        <Stat label="Invalid" value={num(s.invalid)} tone={s.invalid ? "red" : "ink"} hint="skipped" />
        <Stat label="No image" value={num(s.missingImage)} tone={s.missingImage ? "amber" : "ink"} hint={`${num(s.uniqueImageUrls)} unique image URLs`} />
      </div>

      {batch.status === "completed" && s.result && (
        <Notice tone="green" icon="CheckCircle2">
          Import finished: <b>{num(s.result.created)}</b> created, <b>{num(s.result.updated)}</b> updated, <b>{num(s.result.unchanged)}</b> unchanged, <b>{num(s.result.linked)}</b> duplicate listings linked, <b>{num(s.result.failed)}</b> failed.
          {" "}Image URLs are being validated in the background — see <Link className="font-semibold underline" to="/admin/catalog/quality">Data quality</Link>. Products show “Request a Quote” until a selling price is configured in <Link className="font-semibold underline" to="/admin/pricing">Pricing</Link>.
        </Notice>
      )}
      {s.sheets && (
        <div className="flex flex-wrap gap-1.5 text-xs text-ink-500">
          {s.sheets.map((sh) => (
            <span key={sh.name} className="rounded-md border border-ink-100 bg-white px-2 py-1">
              <b className="text-ink-700">{sh.name}</b> · {sh.layout} · {num(sh.rows)} rows
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <SearchInput value={q} onChange={setQ} placeholder="Filter by SKU" className="lg:w-64" />
        </div>
        <ErrorBanner onRetry={rows.reload}>{rows.error}</ErrorBanner>
        <Table
          loading={rows.loading}
          rowKey="_k"
          rows={rows.data?.rows?.map((r) => ({ ...r, _k: `${r.sheet}-${r.row}` }))}
          columns={[
            { key: "src", label: "Source", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{r.sheet} · row {r.row}</span> },
            { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold text-ink-800">{r.sku || "—"}</span> },
            { key: "action", label: "Action", render: (r) => <Pill tone={ACTION_TONE[r.action]}>{r.action}</Pill> },
            { key: "desc", label: "Description", render: (r) => <span className="line-clamp-2 max-w-md text-xs text-ink-700">{r.data?.description}</span> },
            { key: "fam", label: "Category › Family", render: (r) => <span className="text-xs text-ink-500">{r.data?.category} › {r.data?.family || "—"}</span> },
            ...(showCosts
              ? [
                  { key: "fob", label: "US FOB cost", align: "right", render: (r) => <span className="text-xs">{usd(r.data?.supplierFobCostUsd, 4)}</span> },
                  { key: "exw", label: "EXW CN cost", align: "right", render: (r) => <span className="text-xs">{usd(r.data?.supplierExwCostUsd, 4)}</span> },
                ]
              : []),
            {
              key: "msgs",
              label: "Issues",
              render: (r) => (
                <ul className="flex max-w-sm flex-col gap-0.5 text-[11px]">
                  {r.errors?.map((e) => (
                    <li key={e} className="font-medium text-red-700">• {e}</li>
                  ))}
                  {r.warnings?.map((w) => (
                    <li key={w} className="text-amber-800">• {w}</li>
                  ))}
                  {r.changes &&
                    Object.entries(r.changes).map(([k, v]) => (
                      <li key={k} className="text-brand-800">
                        • {k}: {String(v.from ?? "—")} → {String(v.to ?? "—")}
                      </li>
                    ))}
                </ul>
              ),
            },
          ]}
        />
        <Pagination page={page} limit={50} total={rows.data?.total} onPage={setPage} />
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm catalog import"
        footer={
          <>
            <Btn onClick={() => setConfirmOpen(false)}>Cancel</Btn>
            <Btn variant="primary" icon={busy ? "Loader2" : "Check"} disabled={busy} onClick={confirm}>
              Import {num((s.create || 0) + (s.update || 0))} products
            </Btn>
          </>
        }
      >
        <ul className="flex flex-col gap-1.5">
          <li><b>{num(s.create)}</b> new products will be created and <b>{num(s.update)}</b> existing products updated.</li>
          <li><b>{num(s.duplicate)}</b> duplicate listings will be linked to their extra product families.</li>
          <li><b>{num(s.invalid)}</b> invalid rows will be skipped (listed in the report).</li>
          <li>Supplier US FOB / EXW CN values are saved as <b>confidential costs</b>; every change is recorded in price history.</li>
          <li>Admin-edited names, SEO and manual attributes are preserved on update.</li>
        </ul>
      </Modal>
    </div>
  );
}
