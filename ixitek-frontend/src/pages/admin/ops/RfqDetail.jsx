// Admin → RFQ detail: request, line items, conversation (customer-visible and
// internal notes), assignment, status workflow and linked quotations.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Card, Btn, Field, ErrorBanner, Notice, Table, useApi, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { StatusPill, Money, label, useAction, dateOnly } from "./common.jsx";

const STATUS_CHOICES = ["submitted", "under_review", "info_requested", "quoted", "rejected", "closed"];
const NEEDS_MESSAGE = ["info_requested", "rejected"];

export default function RfqDetail() {
  const { number } = useParams();
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const path = `/api/admin/commerce/rfqs/${encodeURIComponent(number)}`;
  const res = useApi(path);
  const team = useApi("/api/admin/commerce/team");
  const rfq = res.data?.rfq;
  const setRfq = (r) => res.setData({ rfq: r });

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/rfqs" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
        <Icon name="ArrowLeft" className="h-3.5 w-3.5" /> All RFQs
      </Link>
      <PageHeader
        icon="ClipboardList"
        title={rfq ? rfq.rfqNumber : number}
        subtitle={rfq ? `${rfq.contact.company || rfq.contact.name} · received ${dt(rfq.createdAt)} · source: ${label(rfq.source)}` : undefined}
        actions={
          rfq && (
            <>
              <StatusPill status={rfq.status} />
              {can("quotes.manage") && !["rejected", "closed", "converted"].includes(rfq.status) && (
                <Btn variant="primary" icon="FileText" onClick={() => navigate(`/admin/quotes/new?rfq=${encodeURIComponent(rfq.id)}&rfqNumber=${encodeURIComponent(rfq.rfqNumber)}`)}>
                  Create quotation
                </Btn>
              )}
            </>
          )
        }
      />
      <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>
      {res.loading && !rfq && <div className="h-40 animate-pulse rounded-xl bg-ink-100" />}
      {rfq && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <RequestCard rfq={rfq} />
            <Card title={`Items (${rfq.items.length})`} pad={false}>
              <Table
                rows={rfq.items}
                empty="No items."
                columns={[
                  { key: "sku", label: "SKU / part no.", render: (i) => <span className="font-mono text-xs font-semibold">{i.sku || "—"}</span> },
                  { key: "description", label: "Description", render: (i) => <span className="text-ink-700">{i.description || "—"}</span> },
                  { key: "catalog", label: "Catalog", render: (i) => (i.productId ? <span className="text-xs text-emerald-700">Linked</span> : <span className="text-xs text-ink-400">Custom</span>) },
                  { key: "qty", label: "Qty", align: "right", render: (i) => num(i.qty) },
                  { key: "targetPrice", label: "Target price", align: "right", render: (i) => (i.targetPrice !== null && i.targetPrice !== undefined ? <Money amount={i.targetPrice} currency={rfq.currency} /> : "—") },
                ]}
              />
            </Card>
            <Thread rfq={rfq} path={path} onChange={setRfq} />
          </div>
          <div className="flex flex-col gap-5">
            <AssignCard rfq={rfq} path={path} team={team} onChange={setRfq} />
            <StatusCard rfq={rfq} path={path} onChange={setRfq} />
            <Card title="Quotations">
              {rfq.quotes.length ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {rfq.quotes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-2">
                      <Link to={`/admin/quotes/${encodeURIComponent(q.number)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {q.number}-V{q.version}
                      </Link>
                      <StatusPill status={q.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-500">No quotation yet.</p>
              )}
            </Card>
            <Card title="Attachments">
              {rfq.attachments.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {rfq.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-ink-700">
                      <Icon name="Paperclip" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">{a.name}</span>
                      {a.bytes ? <span className="ml-auto shrink-0 text-[11px] text-ink-400">{num(Math.ceil(a.bytes / 1024))} KB</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-500">No files attached.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ k, children }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{k}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-800">{children || "—"}</dd>
    </div>
  );
}

function RequestCard({ rfq }) {
  const c = rfq.contact;
  return (
    <Card title="Request">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <Info k="Contact">{c.name}</Info>
        <Info k="Email">{c.email && <a className="text-brand-700 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>}</Info>
        <Info k="Phone">{c.phone}</Info>
        <Info k="Company">{c.company}</Info>
        <Info k="Country">{rfq.country}</Info>
        <Info k="Destination">{rfq.destination}</Info>
        <Info k="Currency">{rfq.currency}</Info>
        <Info k="Incoterm">{rfq.incoterm}</Info>
        <Info k="Required by">{rfq.requiredDate ? dateOnly(rfq.requiredDate) : ""}</Info>
      </dl>
      {rfq.message && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Customer message</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{rfq.message}</p>
        </div>
      )}
    </Card>
  );
}

function Thread({ rfq, path, onChange }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const [run, busy, error] = useAction();
  const submit = async (e) => {
    e.preventDefault();
    const r = await run(`${path}/messages`, { body: { body: body.trim(), internal } });
    if (r) {
      onChange(r.rfq);
      setBody("");
    }
  };
  return (
    <Card title="Conversation">
      <ol className="flex flex-col gap-3">
        {!rfq.messages.length && <li className="text-xs text-ink-500">No messages yet.</li>}
        {rfq.messages.map((m) => (
          <li key={m.id} className={`rounded-lg border px-3 py-2.5 ${m.internal ? "border-amber-200 bg-amber-50/60" : "border-ink-100 bg-white"}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-ink-800">{m.author || "Customer"}</span>
              {m.internal ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                  <Icon name="Lock" className="h-3 w-3" /> Internal note
                </span>
              ) : (
                <span className="text-ink-400">Visible to customer</span>
              )}
              <span className="ml-auto text-ink-400">{dt(m.at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{m.body}</p>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 border-t border-ink-100 pt-4">
        <Field label={internal ? "Internal note (team only)" : "Message to customer"}>
          <textarea className={inputCls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Internal note — not shown to the customer
          </label>
          <Btn type="submit" variant="primary" icon={internal ? "Save" : "Send"} disabled={busy || !body.trim()}>
            {internal ? "Add note" : "Send message"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

function AssignCard({ rfq, path, team, onChange }) {
  const current = rfq.assignedTo?.id || "";
  const [value, setValue] = useState(current);
  const [run, busy, error] = useAction();
  useEffect(() => setValue(current), [current]);
  const save = async () => {
    const r = await run(path, { method: "PATCH", body: { assignedTo: value || null } });
    if (r) onChange(r.rfq);
  };
  return (
    <Card title="Assignment">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-500">Currently: {rfq.assignedTo ? <b className="text-ink-800">{rfq.assignedTo.name || rfq.assignedTo.email}</b> : <b className="text-amber-700">unassigned</b>}</p>
        <Field label="Assign to">
          <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} disabled={!team.data}>
            <option value="">Unassigned</option>
            {team.data?.team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email} ({label(u.role)})
              </option>
            ))}
          </select>
        </Field>
        <ErrorBanner>{error || team.error}</ErrorBanner>
        <Btn icon="UserCog" disabled={busy || value === current} onClick={save}>
          Save assignment
        </Btn>
      </div>
    </Card>
  );
}

function StatusCard({ rfq, path, onChange }) {
  const [status, setStatus] = useState(rfq.status);
  const [message, setMessage] = useState("");
  const [run, busy, error] = useAction();
  useEffect(() => setStatus(rfq.status), [rfq.status]);
  const needsMsg = NEEDS_MESSAGE.includes(status);
  const locked = rfq.status === "converted";
  const save = async () => {
    const r = await run(path, { method: "PATCH", body: { status, ...(message.trim() && { message: message.trim() }) } });
    if (r) {
      onChange(r.rfq);
      setMessage("");
    }
  };
  return (
    <Card title="Status">
      {locked ? (
        <Notice tone="green" icon="CheckCircle2">This RFQ was converted to an order through its quotation.</Notice>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Change status to">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={needsMsg ? "Message to the customer (required)" : "Note (optional, saved in the audit log)"}
            hint={status === "info_requested" ? "Emailed to the customer and added to the conversation." : status === "rejected" ? "Included in the rejection email to the customer." : undefined}
          >
            <textarea className={inputCls} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} />
          </Field>
          <ErrorBanner>{error}</ErrorBanner>
          <Btn variant={status === "rejected" ? "danger" : "primary"} disabled={busy || status === rfq.status || (needsMsg && message.trim().length < 3)} onClick={save}>
            Update status
          </Btn>
        </div>
      )}
    </Card>
  );
}
