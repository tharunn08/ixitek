// Admin → CRM: pipeline summary, due activities & follow-ups, leads with a
// 360° drawer (activities, related orders / RFQs / quotations, lifetime value).
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader, Card, Btn, Field, ErrorBanner, Notice, Modal, Drawer, Table, Pagination, SearchInput, useApi, useDebounced, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { StatusPill, Money, money, label, useAction, dateOnly } from "./common.jsx";

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
const SOURCES = ["enquiry", "rfq", "order", "manual", "website", "referral", "event"];
const MANUAL_SOURCES = ["manual", "website", "referral", "event"];
const KINDS = ["note", "call", "email", "meeting", "task"];
const KIND_ICON = { note: "FileText", call: "Phone", email: "Mail", meeting: "Users", task: "ListChecks" };
const LIMIT = 50;

export default function Crm() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const page = Number(params.get("page") || 1);
  const stage = params.get("stage") || "";
  const source = params.get("source") || "";
  const mine = params.get("owner") === "me";
  const [pipeMine, setPipeMine] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const team = useApi("/api/admin/commerce/team");
  const locales = useApi("/api/intl/locales");
  const pipeline = useApi(`/api/admin/crm/pipeline${pipeMine ? "?mine=1" : ""}`);
  const qs = new URLSearchParams({ page, limit: LIMIT, ...(stage && { stage }), ...(source && { source }), ...(mine && { owner: "me" }), ...(dq && { q: dq }) });
  const leads = useApi(`/api/admin/crm/leads?${qs}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => (leads.reload(), pipeline.reload());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon="Handshake"
        title="CRM"
        subtitle="Leads are created automatically from website enquiries and RFQs, and manually by the sales team. Track stage, value, follow-ups and every touchpoint."
        actions={<Btn variant="primary" icon="UserPlus" onClick={() => setNewOpen(true)}>New lead</Btn>}
      />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-900">Pipeline</h2>
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input type="checkbox" checked={pipeMine} onChange={(e) => setPipeMine(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Only my activities and follow-ups
        </label>
      </div>
      <ErrorBanner onRetry={pipeline.reload}>{pipeline.error}</ErrorBanner>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(pipeline.data?.stages || STAGES.map((s) => ({ stage: s, count: null, valueUsd: null }))).map((s) => (
          <button
            key={s.stage}
            type="button"
            onClick={() => set("stage", stage === s.stage ? "" : s.stage)}
            aria-pressed={stage === s.stage}
            className={`focus-ring rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors ${stage === s.stage ? "border-brand-400 ring-2 ring-brand-100" : "border-ink-100 hover:border-brand-200"}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label(s.stage)}</div>
            <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${s.stage === "lost" ? "text-ink-500" : s.stage === "won" ? "text-emerald-700" : "text-ink-900"}`}>{s.count === null ? "—" : num(s.count)}</div>
            <div className="text-[11px] tabular-nums text-ink-500">{s.valueUsd === null ? "" : money(s.valueUsd, "USD")}</div>
          </button>
        ))}
      </div>
      <p className="-mt-3 text-[11px] text-ink-400">Stage counts and values cover all leads. Click a stage to filter the list.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <DueActivities data={pipeline.data} onOpenLead={setOpenId} onChange={pipeline.reload} />
        <Card title="Follow-ups due within 7 days">
          {!pipeline.data?.followUps.length ? (
            <p className="text-xs text-ink-500">{pipeline.loading ? "Loading…" : "No follow-ups due."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-100">
              {pipeline.data.followUps.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setOpenId(l.id)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-brand-700">
                    <span className="min-w-0 flex-1 truncate">
                      <b className="font-semibold">{l.name}</b>
                      {l.company && <span className="text-ink-500"> · {l.company}</span>}
                    </span>
                    <StatusPill status={l.stage} />
                    <DueDate value={l.nextFollowUp} dateOnlyValue />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="text-sm font-bold text-ink-900">Leads</h2>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email or company" className="md:w-80" />
        <select className={`${inputCls} md:w-44`} value={stage} onChange={(e) => set("stage", e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select className={`${inputCls} md:w-44`} value={source} onChange={(e) => set("source", e.target.value)} aria-label="Source">
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={mine} onChange={(e) => set("owner", e.target.checked ? "me" : "")} className="h-4 w-4 accent-brand-600" />
          Owned by me
        </label>
      </div>
      <ErrorBanner onRetry={leads.reload}>{leads.error}</ErrorBanner>
      <Table
        loading={leads.loading}
        rows={leads.data?.leads}
        onRowClick={(r) => setOpenId(r.id)}
        empty="No leads match these filters."
        columns={[
          {
            key: "name",
            label: "Lead",
            render: (r) => (
              <div className="max-w-xs">
                <div className="truncate font-medium text-ink-800">{r.name}</div>
                <div className="truncate text-xs text-ink-500">{[r.company, r.email].filter(Boolean).join(" · ")}</div>
              </div>
            ),
          },
          { key: "stage", label: "Stage", render: (r) => <StatusPill status={r.stage} /> },
          { key: "source", label: "Source", render: (r) => <span className="text-xs">{label(r.source)}{r.rfqNumber ? ` · ${r.rfqNumber}` : ""}</span> },
          { key: "country", label: "Country", render: (r) => r.country || "—" },
          { key: "valueUsd", label: "Value", align: "right", render: (r) => (r.valueUsd !== null && r.valueUsd !== undefined ? <Money amount={r.valueUsd} currency="USD" /> : "—") },
          { key: "owner", label: "Owner", render: (r) => (r.owner ? <span className="text-xs">{r.owner.email}</span> : <span className="text-xs text-amber-700">Unassigned</span>) },
          { key: "nextFollowUp", label: "Follow-up", render: (r) => (r.nextFollowUp ? <DueDate value={r.nextFollowUp} dateOnlyValue /> : "—") },
          { key: "updatedAt", label: "Updated", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.updatedAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={leads.data?.total} onPage={(p) => set("page", String(p))} />

      <NewLeadModal open={newOpen} onClose={() => setNewOpen(false)} team={team.data?.team || []} countries={locales.data?.countries || []} onCreated={(l) => (setNewOpen(false), refresh(), setOpenId(l.id))} />
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Lead" width="max-w-3xl">
        {openId && <LeadPanel key={openId} id={openId} team={team.data?.team || []} countries={locales.data?.countries || []} onChanged={refresh} onDeleted={() => (setOpenId(null), refresh())} />}
      </Drawer>
    </div>
  );
}

function DueDate({ value, dateOnlyValue }) {
  const today = new Date().toISOString().slice(0, 10);
  const d = dateOnlyValue ? dateOnly(value) : null;
  const overdue = dateOnlyValue ? d < today : new Date(value) < new Date();
  return <span className={`whitespace-nowrap text-xs ${overdue ? "font-semibold text-red-700" : "text-ink-500"}`}>{dateOnlyValue ? d : dt(value)}{overdue ? " · overdue" : ""}</span>;
}

function DueActivities({ data, onOpenLead, onChange }) {
  const [run, busy, error] = useAction();
  const complete = async (id) => {
    if (await run(`/api/admin/crm/activities/${id}/complete`, {})) onChange();
  };
  return (
    <Card title="Open activities due within 7 days">
      <ErrorBanner>{error}</ErrorBanner>
      {!data?.dueActivities.length ? (
        <p className="text-xs text-ink-500">{data ? "Nothing due." : "Loading…"}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-100">
          {data.dueActivities.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <Icon name={KIND_ICON[a.kind] || "FileText"} className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                {a.entityType === "lead" ? (
                  <button type="button" onClick={() => onOpenLead(a.entityId)} className="block max-w-full truncate text-left font-medium text-ink-800 hover:text-brand-700">
                    {a.subject || label(a.kind)}
                  </button>
                ) : (
                  <span className="block truncate font-medium text-ink-800">{a.subject || label(a.kind)}</span>
                )}
                <span className="text-[11px] text-ink-400">
                  {label(a.entityType)} #{a.entityId}
                  {a.owner ? ` · ${a.owner}` : ""}
                </span>
              </div>
              <DueDate value={a.dueAt} />
              <Btn size="sm" icon="Check" disabled={busy} onClick={() => complete(a.id)} aria-label={`Mark "${a.subject || a.kind}" done`}>
                Done
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const leadForm = (l = {}) => ({
  name: l.name || "", email: l.email || "", phone: l.phone || "", company: l.company || "", country: l.country || "", stage: l.stage || "new", lostReason: l.lostReason || "",
  valueUsd: l.valueUsd ?? "", ownerId: l.owner?.id || "", nextFollowUp: l.nextFollowUp ? dateOnly(l.nextFollowUp) : "", notes: l.notes || "", source: l.source || "manual",
});

function LeadFields({ f, set, team, countries, showSource }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={150} />
      </Field>
      <Field label="Company">
        <input className={inputCls} value={f.company} onChange={(e) => set("company", e.target.value)} maxLength={200} />
      </Field>
      <Field label="Email">
        <input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={254} />
      </Field>
      <Field label="Phone">
        <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} />
      </Field>
      <Field label="Country">
        <select className={inputCls} value={f.country} onChange={(e) => set("country", e.target.value)}>
          <option value="">—</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
          {f.country && !countries.some((c) => c.code === f.country) && <option value={f.country}>{f.country}</option>}
        </select>
      </Field>
      {showSource && (
        <Field label="Source">
          <select className={inputCls} value={f.source} onChange={(e) => set("source", e.target.value)}>
            {MANUAL_SOURCES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Stage">
        <select className={inputCls} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
      </Field>
      {f.stage === "lost" && (
        <Field label="Reason lost (required)">
          <input className={inputCls} value={f.lostReason} onChange={(e) => set("lostReason", e.target.value)} required maxLength={300} />
        </Field>
      )}
      <Field label="Estimated value (USD)">
        <input inputMode="decimal" className={inputCls} value={f.valueUsd} onChange={(e) => set("valueUsd", e.target.value)} />
      </Field>
      <Field label="Owner">
        <select className={inputCls} value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
          <option value="">Unassigned</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
      </Field>
      <Field label="Next follow-up">
        <input type="date" className={inputCls} value={f.nextFollowUp} onChange={(e) => set("nextFollowUp", e.target.value)} />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={10000} />
      </Field>
    </div>
  );
}

const leadBody = (f) => ({
  name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), company: f.company.trim(), country: f.country, stage: f.stage, lostReason: f.stage === "lost" ? f.lostReason.trim() : "",
  valueUsd: String(f.valueUsd).trim(), ownerId: f.ownerId || null, nextFollowUp: f.nextFollowUp || "", notes: f.notes,
});

function NewLeadModal({ open, onClose, team, countries, onCreated }) {
  const [f, setF] = useState(leadForm());
  const [run, busy, error, setError] = useAction();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const close = () => (setF(leadForm()), setError(""), onClose());
  const submit = async (e) => {
    e.preventDefault();
    const r = await run("/api/admin/crm/leads", { body: { ...leadBody(f), source: f.source } });
    if (r) {
      setF(leadForm());
      onCreated(r.lead);
    }
  };
  return (
    <Modal open={open} onClose={close} title="New lead">
      <form onSubmit={submit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <LeadFields f={f} set={set} team={team} countries={countries} showSource />
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Btn onClick={close}>Cancel</Btn>
          <Btn type="submit" variant="primary" icon="UserPlus" disabled={busy || !f.name.trim() || (f.stage === "lost" && !f.lostReason.trim())}>
            Create lead
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function LeadPanel({ id, team, countries, onChanged, onDeleted }) {
  const path = `/api/admin/crm/leads/${encodeURIComponent(id)}`;
  const res = useApi(path);
  const [f, setF] = useState(null);
  const [run, busy, error] = useAction();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lead = res.data?.lead;
  useEffect(() => {
    if (lead) setF(leadForm(lead));
  }, [lead]);
  const set = (k, v) => (setF((x) => ({ ...x, [k]: v })), setSaved(false));

  const save = async (e) => {
    e.preventDefault();
    const r = await run(path, { method: "PATCH", body: leadBody(f) });
    if (r) {
      setSaved(true);
      res.reload();
      onChanged();
    }
  };
  const del = async () => {
    const r = await run(path, { method: "DELETE" });
    if (r) onDeleted();
  };

  if (res.error) return <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>;
  if (!lead || !f) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  const rel = res.data.related;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-bold text-ink-900">{lead.name}</h3>
        <StatusPill status={lead.stage} />
        <span className="text-xs text-ink-500">
          Source: {label(lead.source)}
          {lead.rfqNumber && (
            <>
              {" · "}
              <Link className="font-semibold text-brand-700 hover:underline" to={`/admin/rfqs/${encodeURIComponent(lead.rfqNumber)}`}>{lead.rfqNumber}</Link>
            </>
          )}
          {" · created "}
          {dt(lead.createdAt)}
        </span>
      </div>

      <form onSubmit={save} className="flex flex-col gap-3">
        <LeadFields f={f} set={set} team={team} countries={countries} />
        <ErrorBanner>{error}</ErrorBanner>
        {saved && <Notice tone="green" icon="CheckCircle2">Lead updated.</Notice>}
        <div className="flex flex-wrap justify-between gap-2">
          <Btn variant="ghost" icon="Trash2" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            Delete lead
          </Btn>
          <Btn type="submit" variant="primary" icon="Save" disabled={busy || !f.name.trim() || (f.stage === "lost" && !f.lostReason.trim())}>
            Save changes
          </Btn>
        </div>
      </form>

      <Activities entityId={lead.id} items={res.data.activities} onChange={res.reload} />

      {rel && (
        <Card title="Customer 360 (matched by email)">
          <div className="mb-3 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Lifetime value</div>
              <div className="font-display text-lg font-bold text-ink-900"><Money amount={rel.lifetimeValueUsd} currency="USD" /></div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Orders</div>
              <div className="font-display text-lg font-bold text-ink-900">{num(rel.orderCount)}</div>
            </div>
          </div>
          <RelatedLists rel={rel} />
        </Card>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this lead?"
        footer={
          <>
            <Btn onClick={() => setConfirmDelete(false)}>Cancel</Btn>
            <Btn variant="danger" icon="Trash2" disabled={busy} onClick={del}>Delete lead</Btn>
          </>
        }
      >
        <p>{lead.name} will be removed from the pipeline and lead lists. The deletion is recorded in the audit log.</p>
        <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div>
      </Modal>
    </div>
  );
}

function RelatedLists({ rel }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <div className="mb-1 text-xs font-bold text-ink-700">Orders</div>
        {!rel.orders.length && <p className="text-xs text-ink-400">None</p>}
        <ul className="flex flex-col gap-1 text-xs">
          {rel.orders.map((o) => (
            <li key={o.orderNumber} className="flex items-center justify-between gap-2">
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}>{o.orderNumber}</Link>
              <span className="tabular-nums text-ink-600">{money(o.total, o.currency)}</span>
              <StatusPill status={o.status} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-xs font-bold text-ink-700">RFQs</div>
        {!rel.rfqs.length && <p className="text-xs text-ink-400">None</p>}
        <ul className="flex flex-col gap-1 text-xs">
          {rel.rfqs.map((r) => (
            <li key={r.rfqNumber} className="flex items-center justify-between gap-2">
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/rfqs/${encodeURIComponent(r.rfqNumber)}`}>{r.rfqNumber}</Link>
              <StatusPill status={r.status} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-xs font-bold text-ink-700">Quotations</div>
        {!rel.quotes.length && <p className="text-xs text-ink-400">None</p>}
        <ul className="flex flex-col gap-1 text-xs">
          {rel.quotes.map((q) => (
            <li key={q.quoteNumber} className="flex items-center justify-between gap-2">
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/quotes/${encodeURIComponent(q.quoteNumber)}`}>{q.quoteNumber}-V{q.version}</Link>
              <StatusPill status={q.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Activities({ entityId, items, onChange }) {
  const blank = { kind: "note", subject: "", body: "", dueAt: "" };
  const [a, setA] = useState(blank);
  const [run, busy, error] = useAction();
  const add = async (e) => {
    e.preventDefault();
    const due = a.dueAt ? new Date(a.dueAt) : null;
    const r = await run("/api/admin/crm/activities", { body: { entityType: "lead", entityId, kind: a.kind, subject: a.subject.trim(), body: a.body.trim(), ...(due && !Number.isNaN(due.getTime()) ? { dueAt: due.toISOString() } : {}) } });
    if (r) {
      setA(blank);
      onChange();
    }
  };
  const complete = async (id) => {
    if (await run(`/api/admin/crm/activities/${id}/complete`, {})) onChange();
  };
  return (
    <Card title="Activities">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[140px_1fr_200px]">
        <Field label="Type">
          <select className={inputCls} value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{label(k)}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <input className={inputCls} value={a.subject} onChange={(e) => setA({ ...a, subject: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Due (optional)">
          <input type="datetime-local" className={inputCls} value={a.dueAt} onChange={(e) => setA({ ...a, dueAt: e.target.value })} />
        </Field>
        <Field label="Details" className="sm:col-span-3">
          <textarea className={inputCls} rows={2} value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} maxLength={10000} />
        </Field>
        <div className="flex justify-end sm:col-span-3">
          <Btn type="submit" size="sm" variant="primary" icon="Plus" disabled={busy || (!a.subject.trim() && !a.body.trim())}>Add activity</Btn>
        </div>
      </form>
      <ErrorBanner>{error}</ErrorBanner>
      <ol className="mt-4 flex flex-col divide-y divide-ink-100 border-t border-ink-100">
        {!items.length && <li className="py-3 text-xs text-ink-500">No activities yet.</li>}
        {items.map((x) => (
          <li key={x.id} className="flex gap-3 py-2.5">
            <Icon name={KIND_ICON[x.kind] || "FileText"} className={`mt-0.5 h-4 w-4 shrink-0 ${x.completedAt ? "text-ink-300" : "text-brand-600"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`font-medium ${x.completedAt ? "text-ink-500 line-through" : "text-ink-800"}`}>{x.subject || label(x.kind)}</span>
                {x.dueAt && !x.completedAt && <DueDate value={x.dueAt} />}
                {x.completedAt && <span className="text-[11px] text-emerald-700">Done {dt(x.completedAt)}</span>}
              </div>
              {x.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-600">{x.body}</p>}
              <div className="mt-0.5 text-[11px] text-ink-400">
                {label(x.kind)} · {x.createdBy || "system"} · {dt(x.createdAt)}
                {x.owner && x.owner !== x.createdBy ? ` · owner ${x.owner}` : ""}
              </div>
            </div>
            {!x.completedAt && (x.dueAt || x.kind !== "note") && (
              <Btn size="sm" icon="Check" disabled={busy} onClick={() => complete(x.id)}>Done</Btn>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

