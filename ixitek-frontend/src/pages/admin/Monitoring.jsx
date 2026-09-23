// Monitoring — health of the database, background jobs, email outbox,
// payments/webhooks and backups, plus the operational event log.
import { useState } from "react";
import { PageHeader, Card, Stat, Btn, Table, Pagination, Tabs, ErrorBanner, Notice, Pill, useApi, dt, num, inputCls } from "../../components/admin/kit/index.jsx";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";

const EVENT_TYPES = ["http_500", "db_error", "slow_query", "payment_failure", "webhook_failure", "email_failure", "invoice_failure", "backup_failure", "import_failure", "image_failure", "fx_provider_failure"];
const bytes = (n) => (n === null || n === undefined ? "—" : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`);

export default function Monitoring() {
  const { can } = useAdminAuth();
  const [tab, setTab] = useState("events");
  const [type, setType] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const h = useApi("/api/admin/monitoring");
  const events = useApi(tab === "events" ? `/api/admin/monitoring/events?limit=200${type ? `&type=${type}` : ""}` : null);
  const [jobsPage, setJobsPage] = useState(1);
  const dead = useApi(tab === "jobs" ? `/api/admin/monitoring/jobs?status=dead&page=${jobsPage}&limit=50` : null);
  const d = h.data;

  const act = async (path, ok) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await apiFetch(path, { method: "POST", body: {} });
      setMsg(ok);
      h.reload();
      dead.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const b = d?.backups;
  const backupStale = b && (!b.latestVerified || b.latestVerified.ageHours > 30);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Activity" title="Monitoring" subtitle="Live health of the platform. Failures here are also written to the server log." actions={<Btn icon="RefreshCw" onClick={h.reload}>Refresh</Btn>} />
      <ErrorBanner onRetry={h.reload}>{h.error || err}</ErrorBanner>
      {msg && <Notice tone="green" icon="CheckCircle2">{msg}</Notice>}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Database" value={d.database.ok ? `${d.database.latencyMs} ms` : "DOWN"} tone={d.database.ok ? "green" : "red"} hint="ping latency" />
            <Stat label="Jobs queued" value={num(d.jobs.byStatus.queued || 0)} tone={(d.jobs.oldestQueuedSec || 0) > 600 ? "amber" : "ink"} hint={d.jobs.oldestQueuedSec ? `oldest ${Math.round(d.jobs.oldestQueuedSec / 60)} min` : d.jobs.workerEnabled ? "worker running" : "worker disabled"} />
            <Stat label="Failed jobs" value={num(d.jobs.byStatus.dead || 0)} tone={d.jobs.byStatus.dead ? "red" : "ink"} hint="need attention" />
            <Stat label="Emails not sent (7d)" value={num((d.email.last7Days.failed || 0) + (d.email.last7Days.queued || 0))} tone={d.email.last7Days.failed ? "amber" : "ink"} hint={`provider: ${d.email.provider.provider}`} />
            <Stat label="Payment failures (24h)" value={num(d.payments.failedLast24h)} tone={d.payments.failedLast24h ? "amber" : "ink"} hint={`${d.payments.webhookFailures} webhook errors`} />
            <Stat label="HTTP 500s (24h)" value={num(d.events.last24h.http_500 || 0)} tone={d.events.last24h.http_500 ? "red" : "ink"} hint={`${d.events.last24h.db_error || 0} DB errors`} />
          </div>
          {!d.email.provider.delivers && <Notice tone="amber" icon="Mail">Emails are not being delivered: provider “{d.email.provider.provider}”{d.email.provider.missing.length ? `, missing ${d.email.provider.missing.join(", ")}` : ""}. Configure EMAIL_PROVIDER (see the deployment guide).</Notice>}
          <Card title="Backups" actions={can("backups.manage") && <div className="flex gap-2"><Btn size="sm" icon="HardDrive" disabled={busy} onClick={() => act("/api/admin/monitoring/backups/run", "Backup created and verified.")}>Back up now</Btn><Btn size="sm" icon="RotateCcw" disabled={busy || !b.restoreTestConfigured} onClick={() => act("/api/admin/monitoring/backups/restore-test", "Restore test queued — refresh in a minute.")}>Run restore test</Btn></div>}>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase text-ink-400">Latest verified backup</div>
                {b.latestVerified ? <div><b>{b.latestVerified.fileName}</b><div className="text-xs text-ink-500">{b.latestVerified.label} · {dt(b.latestVerified.createdAt)} · {bytes(b.latestVerified.sizeBytes)} · {b.latestVerified.ageHours} h ago</div></div> : <div className="text-red-700">None</div>}
                {backupStale && <Pill tone="red">No verified backup in the last 30 hours</Pill>}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-ink-400">Restore test</div>
                {!b.restoreTestConfigured ? <div className="text-amber-700">Not configured — set BACKUP_RESTORE_TEST_DB.</div> : b.lastRestoreTest ? (
                  <div>{b.lastRestoreTest.ok ? <Pill tone="green">passed</Pill> : <Pill tone="red">failed</Pill>} <span className="text-xs text-ink-500">{dt(b.lastRestoreTest.testedAt)} · {b.lastRestoreTest.tables} tables</span>{b.lastRestoreTest.problems?.length > 0 && <div className="text-xs text-red-700">{b.lastRestoreTest.problems.slice(0, 3).join("; ")}</div>}</div>
                ) : <div className="text-ink-500">Not run yet.</div>}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-ink-400">Storage</div>
                <div>{b.count} backup file(s) · free space {bytes(b.freeBytes)}</div>
                {b.dir && <div className="truncate font-mono text-[11px] text-ink-500" title={b.dir}>{b.dir}</div>}
              </div>
            </div>
          </Card>
          <div className="text-xs text-ink-400">Node {d.app.node} · {d.app.env} · up {Math.round(d.app.uptimeSec / 3600)} h · memory {d.app.rssMb} MB · slow-query threshold {d.database.slowQueryThresholdMs} ms</div>
        </>
      )}
      <Tabs tabs={[{ id: "events", label: "Event log" }, { id: "jobs", label: "Failed jobs", count: d?.jobs.byStatus.dead || 0 }]} value={tab} onChange={setTab} />
      {tab === "events" && (
        <>
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} md:w-64`} aria-label="Event type">
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")} {d?.events.last7d[t] ? `(${d.events.last7d[t]} in 7d)` : ""}</option>)}
          </select>
          <ErrorBanner onRetry={events.reload}>{events.error}</ErrorBanner>
          <Table loading={events.loading} rows={events.data?.events} empty="No events — all quiet." columns={[
            { key: "at", label: "When", render: (e) => <span className="whitespace-nowrap text-xs">{dt(e.at)}</span> },
            { key: "type", label: "Type", render: (e) => <Pill tone={["http_500", "db_error", "backup_failure"].includes(e.type) ? "red" : "amber"}>{e.type.replace(/_/g, " ")}</Pill> },
            { key: "message", label: "Message", render: (e) => <span className="break-all text-xs">{e.message}</span> },
          ]} />
        </>
      )}
      {tab === "jobs" && (
        <>
          <ErrorBanner onRetry={dead.reload}>{dead.error}</ErrorBanner>
          <Table loading={dead.loading} rows={dead.data?.jobs} empty="No failed jobs." columns={[
            { key: "type", label: "Job", render: (j) => <span className="font-mono text-xs">{j.type}</span> },
            { key: "attempts", label: "Attempts", render: (j) => `${j.attempts}/${j.maxAttempts}` },
            { key: "lastError", label: "Last error", render: (j) => <span className="break-all text-xs text-red-700">{j.lastError}</span> },
            { key: "updatedAt", label: "Failed", render: (j) => <span className="text-xs">{dt(j.updatedAt)}</span> },
            { key: "retry", label: "", render: (j) => <Btn size="sm" icon="RefreshCw" disabled={busy} onClick={() => act(`/api/admin/monitoring/jobs/${j.id}/retry`, "Job re-queued.")}>Retry</Btn> },
          ]} />
          <Pagination page={jobsPage} limit={50} total={dead.data?.total} onPage={setJobsPage} />
        </>
      )}
    </div>
  );
}
