// Admin → Support tickets: queue, conversation thread, replies and internal notes.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, Table, Pagination, SearchInput, useDebounced, Btn, Pill, Drawer, Field, inputCls, ErrorBanner, useApi, dt } from "../../../components/admin/kit/index.jsx";
import { StatusPill, label, useAction } from "./common.jsx";

const STATUSES = ["open", "pending_customer", "pending_internal", "resolved", "closed"];
const PRIORITIES = ["urgent", "high", "normal", "low"];
const PRIORITY_TONE = { urgent: "red", high: "amber", normal: "blue", low: "gray" };
const PriorityPill = ({ p }) => <Pill tone={PRIORITY_TONE[p] || "gray"}>{p}</Pill>;

const PAGE = 50;

export default function Tickets() {
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, mine, dq]);
  const qs = new URLSearchParams({ page, limit: PAGE });
  if (status) qs.set("status", status);
  if (mine) qs.set("mine", "1");
  if (dq) qs.set("q", dq);
  const list = useApi(`/api/admin/tickets?${qs}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Headset" title="Support tickets" subtitle="Customer questions and issues, most urgent first. Replies are emailed to the customer; internal notes are visible to staff only." actions={<Btn size="sm" icon="RefreshCw" onClick={list.reload}>Refresh</Btn>} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search ticket, subject or email" className="md:w-80" />
        <select className={`${inputCls} md:w-56`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Ticket status">
          <option value="">All except closed</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assigned to me
        </label>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="ticketNumber"
        rows={list.data?.tickets}
        onRowClick={(t) => setOpen(t.ticketNumber)}
        empty="No tickets."
        columns={[
          { key: "ticketNumber", label: "Ticket", render: (t) => <span className="font-mono text-xs font-semibold text-brand-700">{t.ticketNumber}</span> },
          { key: "subject", label: "Subject", render: (t) => <div><div className="line-clamp-1 max-w-md font-medium text-ink-800">{t.subject}</div><div className="text-[11px] text-ink-400">{t.name} · {t.email}</div></div> },
          { key: "category", label: "Category", render: (t) => <span className="text-xs">{label(t.category)}</span> },
          { key: "priority", label: "Priority", render: (t) => <PriorityPill p={t.priority} /> },
          { key: "status", label: "Status", render: (t) => <StatusPill status={t.status} /> },
          { key: "assignee", label: "Assignee", render: (t) => <span className="text-xs text-ink-500">{t.assignee || "Unassigned"}</span> },
          { key: "updatedAt", label: "Updated", render: (t) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(t.updatedAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={PAGE} total={list.data?.total} onPage={setPage} />
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `Ticket ${open}` : ""} width="max-w-3xl">
        {open && <TicketDetail key={open} number={open} onChanged={list.reload} />}
      </Drawer>
    </div>
  );
}

function TicketDetail({ number, onChanged }) {
  const det = useApi(`/api/admin/tickets/${encodeURIComponent(number)}`);
  const team = useApi("/api/admin/commerce/team");
  const t = det.data?.ticket;
  if (det.error) return <ErrorBanner onRetry={det.reload}>{det.error}</ErrorBanner>;
  if (!t) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  const refresh = (data) => (data?.ticket ? det.setData({ ticket: data.ticket }) : det.reload(), onChanged());
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-display text-base font-bold text-ink-900">{t.subject}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <StatusPill status={t.status} />
          <PriorityPill p={t.priority} />
          <Pill tone="gray">{label(t.category)}</Pill>
          <span>{t.name} · <a className="text-brand-700 hover:underline" href={`mailto:${t.email}`}>{t.email}</a></span>
          {t.orderNumber && <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/orders/${encodeURIComponent(t.orderNumber)}`}>Order {t.orderNumber} →</Link>}
          <span className="ml-auto">Opened {dt(t.createdAt)}</span>
        </div>
      </div>
      <TicketMeta key={`${t.status}-${t.priority}-${t.assignee}`} t={t} team={team} onDone={refresh} />
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {t.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg border px-3 py-2.5 text-sm ${m.internal ? "border-amber-200 bg-amber-50" : m.staff ? "ml-6 border-brand-100 bg-brand-50/50" : "mr-6 border-ink-100 bg-white"}`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-ink-800">{m.author}</span>
              {m.internal ? <Pill tone="amber">internal note</Pill> : m.staff ? <Pill tone="blue">staff</Pill> : <Pill tone="gray">customer</Pill>}
              <span className="ml-auto text-ink-400">{dt(m.at)}</span>
            </div>
            <p className="whitespace-pre-line text-ink-700">{m.body}</p>
          </li>
        ))}
      </ol>
      <ReplyBox number={t.ticketNumber} onDone={refresh} />
    </div>
  );
}

function TicketMeta({ t, team, onDone }) {
  const [run, busy, error] = useAction();
  const members = team.data?.team || [];
  const currentId = members.find((m) => m.email === t.assignee)?.id || "";
  const [f, setF] = useState({ status: t.status, priority: t.priority, assignedTo: null });
  const assigned = f.assignedTo === null ? currentId : f.assignedTo;
  const body = {};
  if (f.status !== t.status) body.status = f.status;
  if (f.priority !== t.priority) body.priority = f.priority;
  if (assigned !== currentId) body.assignedTo = assigned || null;
  const dirty = Object.keys(body).length > 0;
  const save = (e) => {
    e.preventDefault();
    run(`/api/admin/tickets/${encodeURIComponent(t.ticketNumber)}`, { method: "PATCH", body }, onDone);
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-2 rounded-lg border border-ink-100 bg-ink-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Status">
          <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Assignee">
          <select className={inputCls} value={assigned} onChange={(e) => setF({ ...f, assignedTo: e.target.value })}>
            <option value="">Unassigned</option>
            {t.assignee && !currentId && <option value="" disabled>{t.assignee} (not in active team)</option>}
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.email}</option>)}
          </select>
        </Field>
      </div>
      <ErrorBanner onRetry={team.reload}>{team.error}</ErrorBanner>
      <ErrorBanner>{error}</ErrorBanner>
      <div>
        <Btn type="submit" size="sm" variant="primary" icon="Save" disabled={busy || !dirty}>Save changes</Btn>
      </div>
    </form>
  );
}

function ReplyBox({ number, onDone }) {
  const [run, busy, error] = useAction();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState("pending_customer");
  const submit = (e) => {
    e.preventDefault();
    const payload = { body: body.trim(), internal };
    if (!internal) payload.status = status;
    run(`/api/admin/tickets/${encodeURIComponent(number)}/messages`, { body: payload }, (res) => (setBody(""), setInternal(false), setStatus("pending_customer"), onDone(res)));
  };
  return (
    <form onSubmit={submit} className={`flex flex-col gap-2 rounded-lg border p-3 ${internal ? "border-amber-200 bg-amber-50" : "border-brand-100 bg-brand-50/40"}`}>
      <Field label={internal ? "Internal note (staff only)" : "Reply to customer (emailed)"}>
        <textarea className={inputCls} rows={4} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal note
        </label>
        <Field label="Then set status to" className="sm:w-56">
          <select className={inputCls} value={status} disabled={internal} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Btn type="submit" variant="primary" icon={internal ? "MessageSquare" : "Send"} disabled={busy || !body.trim()} className="sm:ml-auto">
          {internal ? "Add note" : "Send reply"}
        </Btn>
      </div>
      {internal && <p className="text-[11px] text-amber-800">Internal notes don’t change the ticket status and are never emailed.</p>}
      <ErrorBanner>{error}</ErrorBanner>
    </form>
  );
}
