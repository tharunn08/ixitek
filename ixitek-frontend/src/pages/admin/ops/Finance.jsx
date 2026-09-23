// Admin → Finance: integration status, payment reconciliation, invoice register,
// outgoing email log and the business details printed on documents.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { PageHeader, Tabs, Table, Pagination, SearchInput, Btn, Pill, Drawer, Field, inputCls, ErrorBanner, Notice, Card, Stat, useApi, useDebounced, dt, num } from "../../../components/admin/kit/index.jsx";
import { money, StatusPill, label, useAction, dateOnly } from "./common.jsx";

const LIMIT = 50;
const pdfHref = (n) => `${API_BASE}/api/admin/finance/invoices/${encodeURIComponent(n)}.pdf`;
const orderLink = (n) => (
  <Link to={`/admin/orders/${encodeURIComponent(n)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
    {n}
  </Link>
);
const qsOf = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== "" && v !== null && v !== undefined)).toString();

export default function Finance() {
  const { can } = useAdminAuth();
  const tabs = [
    ...(can("finance.read") ? [{ id: "payments", label: "Payments" }, { id: "invoices", label: "Invoices" }, { id: "gst", label: "GST register" }] : []),
    ...(can("email.manage") ? [{ id: "emails", label: "Emails" }] : []),
    ...(can("finance.read") ? [{ id: "settings", label: "Business settings" }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id || "");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Wallet" title="Finance" subtitle="Payment gateway and email status, payment reconciliation, the invoice register, the outgoing email log and the business details printed on invoices." />
      {can("finance.read") && <StatusPanel />}
      {!tabs.length && <Notice tone="amber" icon="Lock">You don’t have access to finance data. Ask an owner for the finance.read or email.manage permission.</Notice>}
      {tabs.length > 0 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "invoices" && <InvoicesTab />}
      {tab === "gst" && <GstTab />}
      {tab === "emails" && <EmailsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function StatusPanel() {
  const st = useApi("/api/admin/finance/status");
  const d = st.data;
  if (st.error) return <ErrorBanner onRetry={st.reload}>{st.error}</ErrorBanner>;
  if (!d) return <div className="h-24 animate-pulse rounded-xl bg-ink-100" />;
  const rz = d.razorpay;
  const em = d.email;
  const rzTone = !rz.configured ? "red" : rz.mode === "live" ? "green" : "amber";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Razorpay">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={rzTone}>{rz.configured ? `${rz.mode} mode` : "not configured"}</Pill>
            <Pill tone={rz.webhookSecretSet ? "green" : "amber"}>{rz.webhookSecretSet ? "webhook secret set" : "no webhook secret"}</Pill>
          </div>
        </Card>
        <Card title="Email delivery">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={em.delivers ? "green" : "amber"}>{em.provider}</Pill>
            {em.from && <span className="text-xs text-ink-500">from {em.from}</span>}
            <Pill tone={em.notSent ? "amber" : "gray"}>{num(em.notSent)} not sent</Pill>
          </div>
        </Card>
        <Card title="Seller details">
          <Pill tone={d.seller.ready ? "green" : "red"}>{d.seller.ready ? "ready for invoicing" : "incomplete"}</Pill>
        </Card>
      </div>
      {!rz.configured && <Notice tone="amber" icon="CreditCard">Online card/UPI payments are off. Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> on the server (and enable Razorpay for the currency) to accept payments at checkout. Bank transfer remains available.</Notice>}
      {rz.configured && rz.mode === "test" && <Notice tone="amber" icon="AlertTriangle">Razorpay is in <b>test mode</b> — no real money is collected. Switch to <code>rzp_live_…</code> keys before going live.</Notice>}
      {rz.configured && !rz.webhookSecretSet && <Notice tone="amber" icon="ShieldAlert">Set <code>RAZORPAY_WEBHOOK_SECRET</code> and point the Razorpay webhook to <code>/api/webhooks/razorpay</code> so payments that complete after the browser closes are still captured.</Notice>}
      {!em.delivers && (
        <Notice tone="amber" icon="Mail">
          Emails are not being delivered (provider “{em.provider}”). {em.missing?.length ? <>Set these server variables: <code>{em.missing.join(", ")}</code>. </> : <>Configure <code>EMAIL_PROVIDER</code> (smtp, resend or sendgrid) and <code>EMAIL_FROM</code>. </>}
          Messages are kept in the email log and can be resent once delivery works.
        </Notice>
      )}
      {!d.seller.ready && <Notice tone="amber" icon="Receipt">Invoices can’t be issued until these are set under Business settings: <b>{d.seller.missing.join(", ")}</b>.</Notice>}
    </div>
  );
}

function PaymentsTab() {
  const { can } = useAdminAuth();
  const [f, setF] = useState({ status: "", provider: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const list = useApi(`/api/admin/finance/payments?${qsOf({ ...f, page, limit: LIMIT })}`);
  const [run, busy, error] = useAction();
  const [result, setResult] = useState(null);
  const up = (k) => (e) => (setF((s) => ({ ...s, [k]: e.target.value })), setPage(1));
  const reconcile = () => run("/api/admin/finance/reconcile", {}, (r) => (setResult(r), list.reload()));
  const d = list.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
        <Field label="Status" className="md:w-44">
          <select className={inputCls} value={f.status} onChange={up("status")}>
            <option value="">Any</option>
            {["created", "authorized", "captured", "failed", "partially_refunded", "refunded"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="Provider" className="md:w-44">
          <select className={inputCls} value={f.provider} onChange={up("provider")}>
            <option value="">Any</option>
            {["razorpay", "bank_transfer", "purchase_order", "manual"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="From" className="md:w-40"><input type="date" className={inputCls} value={f.from} onChange={up("from")} /></Field>
        <Field label="To" className="md:w-40"><input type="date" className={inputCls} value={f.to} onChange={up("to")} /></Field>
        {can("finance.manage") && (
          <Btn className="md:ml-auto" icon="RefreshCw" disabled={busy} onClick={reconcile}>Run reconciliation</Btn>
        )}
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      {result && (
        <Notice tone={result.skipped ? "amber" : "green"} icon="CheckCircle2">
          {result.skipped ? `Reconciliation skipped: ${result.skipped}.` : `Reconciliation checked ${num(result.checked)} open checkout(s): ${num(result.settled)} settled, ${num(result.failed)} failed.`}
        </Notice>
      )}
      {d?.totals?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.totals.map((t) => (
            <Stat key={t.currency} label={`${t.currency} · ${num(t.count)} payments`} value={money(t.amount, t.currency)} tone="blue" hint={`Refunded ${money(t.refunded, t.currency)} · merchant cost ${money(t.merchantPaymentCost, t.currency)}`} />
          ))}
        </div>
      )}
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={d?.payments}
        empty="No payments match these filters."
        columns={[
          { key: "createdAt", label: "Date", render: (p) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(p.createdAt)}</span> },
          { key: "order", label: "Order", render: (p) => orderLink(p.orderNumber) },
          { key: "provider", label: "Provider", render: (p) => <div><div>{label(p.provider)}</div>{p.method && <div className="text-[11px] text-ink-400">{label(p.method)}</div>}</div> },
          { key: "ref", label: "Reference", render: (p) => <span className="font-mono text-xs">{p.providerPaymentId || p.reference || "—"}</span> },
          { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
          { key: "amount", label: "Amount", align: "right", render: (p) => <b>{money(p.amount, p.currency)}</b> },
          { key: "refunded", label: "Refunded", align: "right", render: (p) => (Number(p.amountRefunded) ? money(p.amountRefunded, p.currency) : "—") },
          { key: "fee", label: "Gateway fee", align: "right", render: (p) => money(p.paymentGatewayFee, p.currency) },
          { key: "feeTax", label: "Tax on fee", align: "right", render: (p) => money(p.paymentGatewayTax, p.currency) },
          { key: "cost", label: "Merchant cost", align: "right", render: (p) => <span>{money(p.merchantPaymentCost, p.currency)}{p.feeSource === "estimated" && <span className="ml-1 text-[10px] text-amber-700">est.</span>}</span> },
          { key: "via", label: "Verified via", render: (p) => <span className="text-xs text-ink-500">{label(p.verifiedVia)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={d?.total} onPage={setPage} />
      <Card title="Recent gateway webhooks" pad={false}>
        <ul className="divide-y divide-ink-100 text-xs">
          {(d?.recentWebhooks || []).map((w) => (
            <li key={w.event_id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <StatusPill status={w.status} />
              <span className="font-medium text-ink-700">{w.event_type}</span>
              <span className="font-mono text-ink-400">{w.event_id}</span>
              {w.error && <span className="text-red-600">{w.error}</span>}
              <span className="ml-auto text-ink-400">{dt(w.received_at)}</span>
            </li>
          ))}
          {d && !d.recentWebhooks?.length && <li className="px-4 py-3 text-ink-400">No webhooks received yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

function InvoicesTab() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [dq, type]);
  const list = useApi(`/api/admin/finance/invoices?${qsOf({ type, q: dq, page, limit: LIMIT })}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Invoice #, order # or customer email" className="md:w-96" />
        <select className={`${inputCls} md:w-48`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Invoice type">
          <option value="">All types</option>
          <option value="tax_invoice">Tax invoice</option>
          <option value="proforma">Proforma</option>
          <option value="credit_note">Credit note</option>
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="number"
        rows={list.data?.invoices}
        empty="No invoices found."
        columns={[
          { key: "number", label: "Invoice", render: (i) => <a className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand-700 hover:underline" href={pdfHref(i.number)} target="_blank" rel="noopener noreferrer">{i.number}<Icon name="ExternalLink" className="h-3 w-3" /></a> },
          { key: "order", label: "Order", render: (i) => orderLink(i.orderNumber) },
          { key: "customer", label: "Customer", render: (i) => <span className="line-clamp-1">{i.customer}</span> },
          { key: "type", label: "Type", render: (i) => label(i.type) },
          { key: "status", label: "Status", render: (i) => <span title={i.voidReason || undefined}><StatusPill status={i.status} /></span> },
          { key: "total", label: "Total", align: "right", render: (i) => money(i.total, i.currency) },
          { key: "issuedAt", label: "Issued", render: (i) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(i.issuedAt)}</span> },
          { key: "dueDate", label: "Due", render: (i) => <span className="text-xs text-ink-500">{i.dueDate ? dateOnly(i.dueDate) : "—"}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={setPage} />
    </div>
  );
}

function EmailsTab() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  useEffect(() => setPage(1), [dq, status]);
  const list = useApi(`/api/admin/finance/emails?${qsOf({ status, q: dq, page, limit: LIMIT })}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Recipient, subject or related record" className="md:w-96" />
        <select className={`${inputCls} md:w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Email status">
          <option value="">Any status</option>
          {["queued", "sending", "sent", "failed", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.emails}
        onRowClick={(r) => setOpenId(r.id)}
        empty="No emails found."
        columns={[
          { key: "createdAt", label: "Created", render: (m) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(m.createdAt)}</span> },
          { key: "to", label: "To", render: (m) => <span className="text-xs">{m.to}</span> },
          { key: "subject", label: "Subject", render: (m) => <div><div className="line-clamp-1 max-w-md">{m.subject}</div><div className="text-[11px] text-ink-400">{m.template}{m.related ? ` · ${m.related.type} ${m.related.id}` : ""}{m.resendOf ? ` · resend of #${m.resendOf}` : ""}</div></div> },
          { key: "status", label: "Status", render: (m) => <div><StatusPill status={m.status} />{m.lastError && <div className="mt-0.5 line-clamp-1 max-w-[220px] text-[11px] text-red-600">{m.lastError}</div>}</div> },
          { key: "attempts", label: "Tries", align: "right", render: (m) => num(m.attempts) },
          { key: "sentAt", label: "Sent", render: (m) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(m.sentAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={setPage} />
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title={openId ? `Email #${openId}` : ""} width="max-w-3xl">
        {openId && <EmailDetail id={openId} onResent={list.reload} />}
      </Drawer>
    </div>
  );
}

function EmailDetail({ id, onResent }) {
  const det = useApi(`/api/admin/finance/emails/${encodeURIComponent(id)}`);
  const [run, busy, error] = useAction();
  const [to, setTo] = useState("");
  const [done, setDone] = useState(null);
  const m = det.data?.email;
  const resend = (e) => {
    e.preventDefault();
    run(`/api/admin/finance/emails/${encodeURIComponent(id)}/resend`, { body: to.trim() ? { to: to.trim() } : {} }, (r) => (setDone(r.id), setTo(""), onResent()));
  };
  if (det.error) return <ErrorBanner onRetry={det.reload}>{det.error}</ErrorBanner>;
  if (!m) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-500">Subject</dt><dd className="font-medium text-ink-900">{m.subject}</dd>
        <dt className="text-ink-500">To</dt><dd>{m.to}</dd>
        <dt className="text-ink-500">Template</dt><dd>{m.template}</dd>
        <dt className="text-ink-500">Status</dt><dd><StatusPill status={m.status} /></dd>
        <dt className="text-ink-500">Created</dt><dd>{dt(m.createdAt)}</dd>
        <dt className="text-ink-500">Sent</dt><dd>{dt(m.sentAt)}</dd>
      </dl>
      {m.lastError && <ErrorBanner>{`Last error: ${m.lastError}`}</ErrorBanner>}
      <form onSubmit={resend} className="flex flex-col gap-2 rounded-lg border border-ink-100 bg-ink-50 p-3 sm:flex-row sm:items-end">
        <Field label="Resend to a different address (optional)" className="flex-1">
          <input type="email" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder={m.to} />
        </Field>
        <Btn type="submit" variant="primary" icon="Send" disabled={busy}>Resend</Btn>
      </form>
      <ErrorBanner>{error}</ErrorBanner>
      {done && <Notice tone="green" icon="CheckCircle2">Queued as email #{done}.</Notice>}
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Message</h3>
        <iframe title={`Email body: ${m.subject}`} sandbox="" srcDoc={m.html || ""} className="h-[520px] w-full rounded-lg border border-ink-100 bg-white" />
      </div>
    </div>
  );
}

const SETTINGS = [
  { group: "Seller (printed on invoices)", fields: [
    ["seller.legal_name", "Registered legal name"],
    ["seller.address", "Registered address", "textarea"],
    ["seller.bank_details", "Bank details for transfers (printed on proforma invoices)", "textarea"],
    ["seller.tax_id", "Tax ID (e.g. GSTIN)", "text", "A GSTIN is checked for format and check character when the label is GSTIN."],
    ["seller.tax_id_label", "Tax ID label", "text", "e.g. GSTIN, VAT No."],
    ["seller.email", "Accounts email", "email"],
    ["seller.phone", "Phone"],
    ["seller.state_code", "GST registration state", "gst_state", "Decides CGST + SGST (same state) or IGST (other states) on Indian invoices. Must match the first two digits of the GSTIN."],
  ] },
  { group: "Invoices", fields: [
    ["invoice.payment_due_days", "Payment due (days)", "int"],
    ["invoice.footer_note", "Invoice footer note", "textarea"],
  ] },
  { group: "Email", fields: [
    ["email.from_name", "Sender name"],
    ["email.sales_inbox", "Sales inbox", "email", "Receives RFQ and order notifications."],
    ["email.support_inbox", "Support inbox", "email", "Receives ticket and return notifications."],
  ] },
  { group: "Commerce & support", fields: [
    ["commerce.bank_transfer_instructions", "Bank transfer instructions", "textarea", "Shown to customers who pay by bank transfer and on proformas."],
    ["commerce.terms_url", "Terms & conditions URL", "url"],
    ["commerce.quote_validity_days", "Quotation validity (days)", "int"],
    ["support.return_instructions", "Return instructions", "textarea", "Sent to customers when a return is approved."],
  ] },
];

function SettingsTab() {
  const { can } = useAdminAuth();
  const editable = can("settings.manage");
  const st = useApi("/api/admin/finance/settings");
  const states = useApi("/api/intl/states/IN");
  const [vals, setVals] = useState(null);
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const [run, busy, error] = useAction();
  useEffect(() => {
    if (st.data) setVals(Object.fromEntries(Object.entries(st.data.settings).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])));
  }, [st.data]);
  const orig = st.data?.settings || {};
  const changed = vals ? Object.keys(vals).filter((k) => vals[k] !== String(orig[k] ?? "")) : [];
  const types = Object.fromEntries(SETTINGS.flatMap((g) => g.fields.map(([k, , t]) => [k, t])));
  const save = (e) => {
    e.preventDefault();
    const body = { reason: reason.trim() };
    for (const k of changed) body[k] = types[k] === "int" ? Number(vals[k]) : vals[k];
    run("/api/admin/finance/settings", { method: "PUT", body }, () => (setReason(""), setSaved(true), st.reload()));
  };
  if (st.error) return <ErrorBanner onRetry={st.reload}>{st.error}</ErrorBanner>;
  if (!vals) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Notice tone="amber" icon="Receipt">Tax invoices and proformas are not issued until the registered legal name and registered address are set. Changes apply to documents issued from now on — issued invoices keep their original snapshot.</Notice>
      {!editable && <Notice icon="Lock">Read only — you need the settings.manage permission to change these.</Notice>}
      {SETTINGS.map((g) => (
        <Card key={g.group} title={g.group}>
          <div className="grid gap-3 md:grid-cols-2">
            {g.fields.map(([k, lbl, type = "text", hint]) => (
              <Field key={k} label={lbl} hint={hint} className={type === "textarea" ? "md:col-span-2" : ""}>
                {type === "gst_state" ? (
                  <select className={inputCls} disabled={!editable} value={vals[k] ?? ""} onChange={(e) => (setSaved(false), setVals({ ...vals, [k]: e.target.value }))}>
                    <option value="">Not set — no Indian GST split</option>
                    {(states.data?.states || []).map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
                  </select>
                ) : type === "textarea" ? (
                  <textarea className={inputCls} rows={3} disabled={!editable} value={vals[k] ?? ""} onChange={(e) => (setSaved(false), setVals({ ...vals, [k]: e.target.value }))} />
                ) : (
                  <input className={inputCls} disabled={!editable} type={type === "int" ? "number" : type} min={type === "int" ? 0 : undefined} max={type === "int" ? 365 : undefined} step={type === "int" ? 1 : undefined} value={vals[k] ?? ""} onChange={(e) => (setSaved(false), setVals({ ...vals, [k]: e.target.value }))} />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ))}
      {editable && (
        <div className="sticky bottom-0 flex flex-col gap-2 rounded-xl border border-ink-100 bg-white p-3 shadow-sm md:flex-row md:items-end">
          <Field label="Reason for change (saved in the audit log)" className="flex-1">
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Btn type="submit" variant="primary" icon="Save" disabled={busy || !changed.length || reason.trim().length < 3}>Save {changed.length ? `${changed.length} change${changed.length > 1 ? "s" : ""}` : ""}</Btn>
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>
      {saved && !changed.length && <Notice tone="green" icon="CheckCircle2">Settings saved.</Notice>}
    </form>
  );
}

// GST register: tax invoices and credit notes with Indian GST, for the accountant's GSTR-1.
function GstTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const r = useApi(`/api/admin/finance/gst-report?${qsOf({ from, to })}`);
  const d = r.data;
  const csvHref = `${API_BASE}/api/admin/finance/gst-report?${qsOf({ from, to, format: "csv" })}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <a href={csvHref} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700"><Icon name="FileDown" className="h-4 w-4" /> Download CSV</a>
      </div>
      <ErrorBanner onRetry={r.reload}>{r.error}</ErrorBanner>
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Taxable value" value={money(d.totals.taxable, "INR")} />
            <Stat label="CGST" value={money(d.totals.cgst, "INR")} />
            <Stat label="SGST / UTGST" value={money(d.totals.sgst, "INR")} />
            <Stat label="IGST" value={money(d.totals.igst, "INR")} />
            <Stat label="Total GST" value={money(d.totals.totalTax, "INR")} />
          </div>
          <p className="text-xs text-ink-500">{d.note} Amounts are in each document's currency; the totals assume INR documents.</p>
          <Card title={`Documents (${d.invoices.length})`}>
            <Table
              rows={d.invoices}
              rowKey="number"
              empty="No GST documents in this period."
              columns={[
                { key: "number", label: "Document", render: (i) => <a href={pdfHref(i.number)} target="_blank" rel="noreferrer" className="font-mono text-xs font-semibold text-brand-700 hover:underline">{i.number}</a> },
                { key: "type", label: "Type", render: (i) => (i.type === "credit_note" ? "Credit note" : "Tax invoice") + (i.status === "void" ? " (void)" : "") },
                { key: "date", label: "Date", render: (i) => dateOnly(i.issuedAt) },
                { key: "order", label: "Order", render: (i) => orderLink(i.orderNumber) },
                { key: "buyer", label: "Buyer", render: (i) => <span>{i.buyer}{i.buyerGstin && <span className="block font-mono text-[11px] text-ink-500">{i.buyerGstin}</span>}</span> },
                { key: "pos", label: "Place of supply", render: (i) => `${i.placeOfSupply} ${i.placeOfSupplyName}` },
                { key: "taxable", label: "Taxable", align: "right", render: (i) => money(i.taxable, i.currency) },
                { key: "cgst", label: "CGST", align: "right", render: (i) => money(i.cgst, i.currency) },
                { key: "sgst", label: "SGST/UTGST", align: "right", render: (i) => money(i.sgst, i.currency) },
                { key: "igst", label: "IGST", align: "right", render: (i) => money(i.igst, i.currency) },
                { key: "total", label: "Total", align: "right", render: (i) => money(i.total, i.currency) },
              ]}
            />
          </Card>
          <Card title="HSN summary">
            <Table
              rows={d.hsnSummary.map((h) => ({ ...h, id: `${h.hsCode}|${h.ratePct}` }))}
              empty="—"
              columns={[
                { key: "hsn", label: "HSN", render: (h) => <span className="font-mono">{h.hsCode || "—"}</span> },
                { key: "rate", label: "Rate", align: "right", render: (h) => `${h.ratePct}%` },
                { key: "taxable", label: "Taxable value", align: "right", render: (h) => money(h.taxable, "INR") },
                { key: "cgst", label: "CGST", align: "right", render: (h) => money(h.cgst, "INR") },
                { key: "sgst", label: "SGST/UTGST", align: "right", render: (h) => money(h.sgst, "INR") },
                { key: "igst", label: "IGST", align: "right", render: (h) => money(h.igst, "INR") },
                { key: "tt", label: "Total tax", align: "right", render: (h) => money(h.totalTax, "INR") },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
