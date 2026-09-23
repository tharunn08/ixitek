// Admin → Companies: B2B account applications and approved accounts.
// Approve / reject / suspend, and set payment terms, credit limit, order
// approval threshold, customer group and salesperson. Status, terms and
// credit changes require a reason (audit log).
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Card, Btn, Field, ErrorBanner, Notice, Drawer, Table, Pagination, SearchInput, useApi, useDebounced, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { StatusPill, Money, money, label, useAction, ReasonModal } from "./common.jsx";

const STATUSES = ["pending", "approved", "rejected", "suspended"];
const TERMS = ["prepaid", "net15", "net30", "net45", "net60"];
// Seeded in migrations/0006_intl.sql — used when the live list (needs intl.read) is unavailable.
const SEEDED_GROUPS = [
  { code: "retail", name: "Retail" }, { code: "business", name: "Business" }, { code: "enterprise", name: "Enterprise" }, { code: "distributor", name: "Distributor" },
  { code: "reseller", name: "Reseller" }, { code: "system_integrator", name: "System Integrator" }, { code: "partner", name: "Partner" },
  { code: "government", name: "Government" }, { code: "education", name: "Education" }, { code: "healthcare", name: "Healthcare" },
];
const LIMIT = 50;
const s = (v) => (v === null || v === undefined ? "" : String(v));

export default function Companies() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const dq = useDebounced(q);
  const status = params.get("status") || "";
  const [openId, setOpenId] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, dq]);
  const qs = new URLSearchParams({ ...(status && { status }), ...(dq && { q: dq }), page, limit: LIMIT });
  const list = useApi(`/api/admin/companies?${qs}`);
  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = list.data?.companies.filter((c) => c.status === "pending").length || 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Building2" title="Company accounts" subtitle="Business customers apply for a company account; approve them to unlock business pricing, purchase-order payment terms, credit limits and multi-user buying." />
      {!status && pending > 0 && <Notice tone="amber" icon="BellRing">{num(pending)} company application{pending === 1 ? "" : "s"} waiting for review — shown first.</Notice>}
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search name or tax ID" className="md:w-80" />
        <select className={`${inputCls} md:w-44`} value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.companies}
        onRowClick={(r) => setOpenId(r.id)}
        empty="No companies match these filters."
        columns={[
          {
            key: "legalName",
            label: "Company",
            render: (r) => (
              <div className="max-w-xs">
                <div className="truncate font-medium text-ink-800">{r.legalName}</div>
                {(r.displayName || r.taxId) && <div className="truncate text-xs text-ink-500">{[r.displayName, r.taxId && `Tax ID ${r.taxId}`].filter(Boolean).join(" · ")}</div>}
              </div>
            ),
          },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          { key: "country", label: "Country", render: (r) => r.country || "—" },
          { key: "customerGroup", label: "Group", render: (r) => <span className="text-xs">{label(r.customerGroup)}</span> },
          { key: "paymentTerms", label: "Terms", render: (r) => <span className="text-xs">{r.paymentTerms}</span> },
          { key: "creditLimitUsd", label: "Credit limit", align: "right", render: (r) => (Number(r.creditLimitUsd) ? <Money amount={r.creditLimitUsd} currency="USD" /> : "—") },
          { key: "orderApprovalThresholdUsd", label: "Approval above", align: "right", render: (r) => (r.orderApprovalThresholdUsd !== null && r.orderApprovalThresholdUsd !== undefined ? <Money amount={r.orderApprovalThresholdUsd} currency="USD" /> : "—") },
          { key: "members", label: "Users", align: "right", render: (r) => num(r.members) },
          { key: "createdAt", label: "Applied", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={setPage} />
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Company account" width="max-w-3xl">
        {openId && <CompanyPanel key={openId} id={openId} onChanged={list.reload} />}
      </Drawer>
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

const formOf = (c) => ({
  legalName: s(c.legalName), displayName: s(c.displayName), taxId: s(c.taxId), registrationNo: s(c.registrationNo), paymentTerms: s(c.paymentTerms), creditLimitUsd: s(c.creditLimitUsd),
  orderApprovalThresholdUsd: s(c.orderApprovalThresholdUsd), customerGroup: s(c.customerGroup), salespersonId: s(c.salespersonId),
});
const SENSITIVE = ["paymentTerms", "creditLimitUsd"];

function CompanyPanel({ id, onChanged }) {
  const { can } = useAdminAuth();
  const canManage = can("companies.manage");
  const path = `/api/admin/companies/${encodeURIComponent(id)}`;
  const res = useApi(path);
  const team = useApi(canManage ? "/api/admin/commerce/team" : null);
  const groups = useApi(canManage ? "/api/admin/intl/customer-groups" : null);
  const [f, setF] = useState(null);
  const [reason, setReason] = useState("");
  const [statusTo, setStatusTo] = useState(null);
  const [saved, setSaved] = useState("");
  const [run, busy, error, setError] = useAction();
  const c = res.data?.company;
  useEffect(() => {
    if (c) setF(formOf(c));
  }, [c]);

  const groupList = groups.data?.groups || SEEDED_GROUPS;
  const orig = c ? formOf(c) : null;
  const changed = f && orig ? Object.keys(f).filter((k) => f[k] !== orig[k]) : [];
  const needsReason = changed.some((k) => SENSITIVE.includes(k));

  const afterSave = (msg) => {
    setSaved(msg);
    setReason("");
    res.reload();
    onChanged();
  };
  const saveTerms = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(changed.map((k) => [k, k === "salespersonId" ? f[k] || null : f[k]]));
    if (needsReason) body.reason = reason.trim();
    if (await run(path, { method: "PATCH", body })) afterSave("Account settings saved.");
  };
  const changeStatus = async (why) => {
    if (await run(path, { method: "PATCH", body: { status: statusTo, reason: why } })) {
      setStatusTo(null);
      afterSave(`Company ${statusTo === "approved" ? "approved" : statusTo === "rejected" ? "rejected" : statusTo === "suspended" ? "suspended" : `set to ${label(statusTo)}`}.`);
    }
  };

  if (res.error) return <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>;
  if (!c || !f) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  const d = res.data;
  const salesperson = team.data?.team.find((u) => u.id === c.salespersonId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-bold text-ink-900">{c.legalName}</h3>
        <StatusPill status={c.status} />
        <span className="text-xs text-ink-500">Applied {dt(c.createdAt)}</span>
      </div>
      {saved && <Notice tone="green" icon="CheckCircle2">{saved}</Notice>}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {c.status !== "approved" && <Btn variant="primary" icon="BadgeCheck" onClick={() => (setError(""), setStatusTo("approved"))}>{c.status === "suspended" ? "Reinstate" : "Approve"}</Btn>}
          {c.status === "pending" && <Btn variant="danger" icon="Ban" onClick={() => (setError(""), setStatusTo("rejected"))}>Reject</Btn>}
          {c.status === "approved" && <Btn variant="danger" icon="Ban" onClick={() => (setError(""), setStatusTo("suspended"))}>Suspend</Btn>}
        </div>
      )}

      <Card title="Account">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Info k="Country">{c.country}</Info>
          <Info k="Tax ID">{c.taxId}</Info>
          <Info k="Registration no.">{c.registrationNo}</Info>
          <Info k="Lifetime value"><Money amount={d.lifetimeValueUsd} currency="USD" /></Info>
          <Info k="Orders">{num(d.orderCount)}</Info>
          <Info k="Salesperson">{salesperson ? salesperson.name || salesperson.email : c.salespersonId ? `User #${c.salespersonId}` : ""}</Info>
        </dl>
      </Card>

      {canManage ? (
        <Card title="Commercial settings">
          <form onSubmit={saveTerms} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Legal name">
                <input className={inputCls} value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} maxLength={200} required />
              </Field>
              <Field label="Display name">
                <input className={inputCls} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} maxLength={200} />
              </Field>
              <Field label="Tax ID">
                <input className={inputCls} value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Registration no.">
                <input className={inputCls} value={f.registrationNo} onChange={(e) => setF({ ...f, registrationNo: e.target.value })} maxLength={80} />
              </Field>
              <Field label="Payment terms">
                <select className={inputCls} value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })}>
                  {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Credit limit (USD)" hint="Purchase-order payment needs non-prepaid terms and a limit above 0; orders beyond available credit are blocked.">
                <input inputMode="decimal" className={inputCls} value={f.creditLimitUsd} onChange={(e) => setF({ ...f, creditLimitUsd: e.target.value })} />
              </Field>
              <Field label="Order approval threshold (USD)" hint="Orders above this from buyers wait for a company admin or approver. Blank = no approval step.">
                <input inputMode="decimal" className={inputCls} value={f.orderApprovalThresholdUsd} onChange={(e) => setF({ ...f, orderApprovalThresholdUsd: e.target.value })} />
              </Field>
              <Field label="Customer group" hint="Drives group pricing">
                <select className={inputCls} value={f.customerGroup} onChange={(e) => setF({ ...f, customerGroup: e.target.value })}>
                  {groupList.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                  {f.customerGroup && !groupList.some((g) => g.code === f.customerGroup) && <option value={f.customerGroup}>{label(f.customerGroup)}</option>}
                </select>
              </Field>
              <Field label="Salesperson">
                <select className={inputCls} value={f.salespersonId} onChange={(e) => setF({ ...f, salespersonId: e.target.value })}>
                  <option value="">None</option>
                  {team.data?.team.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  {f.salespersonId && team.data && !team.data.team.some((u) => u.id === f.salespersonId) && <option value={f.salespersonId}>User #{f.salespersonId}</option>}
                </select>
              </Field>
            </div>
            {needsReason && (
              <Field label="Reason for changing terms or credit (required, saved in the audit log)">
                <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required minLength={3} />
              </Field>
            )}
            <ErrorBanner>{!statusTo && error}</ErrorBanner>
            <div className="flex justify-end gap-2">
              {changed.length > 0 && <Btn onClick={() => (setF(orig), setReason(""))}>Discard</Btn>}
              <Btn type="submit" variant="primary" icon="Save" disabled={busy || !changed.length || (needsReason && reason.trim().length < 3)}>Save settings</Btn>
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Commercial settings">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <Info k="Payment terms">{c.paymentTerms}</Info>
            <Info k="Credit limit">{money(c.creditLimitUsd, "USD")}</Info>
            <Info k="Approval threshold">{c.orderApprovalThresholdUsd !== null && c.orderApprovalThresholdUsd !== undefined ? money(c.orderApprovalThresholdUsd, "USD") : ""}</Info>
            <Info k="Customer group">{label(c.customerGroup)}</Info>
          </dl>
          <p className="mt-3 text-xs text-ink-500">You need the “companies.manage” permission to change company accounts.</p>
        </Card>
      )}

      <Card title={`Users (${d.members.length})`} pad={false}>
        <Table
          rows={d.members}
          empty="No users."
          columns={[
            { key: "name", label: "Name", render: (m) => <span className="font-medium text-ink-800">{m.name}</span> },
            { key: "email", label: "Email", render: (m) => <span className="text-xs">{m.email}</span> },
            { key: "role", label: "Company role", render: (m) => <span className="text-xs">{label(m.role)}</span> },
            { key: "lastLoginAt", label: "Last sign-in", render: (m) => <span className="text-xs text-ink-500">{dt(m.lastLoginAt)}</span> },
          ]}
        />
      </Card>

      <Card title="History">
        <div className="grid gap-4 md:grid-cols-3">
          <MiniList title="Orders" items={d.orders} empty="No orders" render={(o) => (
            <>
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/orders/${encodeURIComponent(o.orderNumber)}`}>{o.orderNumber}</Link>
              <span className="tabular-nums text-ink-600">{money(o.total, o.currency)}</span>
              <StatusPill status={o.status} />
            </>
          )} k={(o) => o.orderNumber} />
          <MiniList title="RFQs" items={d.rfqs} empty="No RFQs" render={(r) => (
            <>
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/rfqs/${encodeURIComponent(r.rfqNumber)}`}>{r.rfqNumber}</Link>
              <StatusPill status={r.status} />
            </>
          )} k={(r) => r.rfqNumber} />
          <MiniList title="Quotations" items={d.quotes} empty="No quotations" render={(q) => (
            <>
              <Link className="font-mono font-semibold text-brand-700 hover:underline" to={`/admin/quotes/${encodeURIComponent(q.quoteNumber)}`}>{q.quoteNumber}-V{q.version}</Link>
              <StatusPill status={q.status} />
            </>
          )} k={(q) => q.quoteNumber} />
        </div>
      </Card>

      {d.activities.length > 0 && (
        <Card title="CRM activities">
          <ol className="flex flex-col divide-y divide-ink-100">
            {d.activities.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-800">{a.subject || label(a.kind)}</span>
                  <span className="text-[11px] text-ink-400">{label(a.kind)} · {a.createdBy || "system"} · {dt(a.createdAt)}</span>
                  {a.completedAt && <span className="text-[11px] text-emerald-700">Done</span>}
                </div>
                {a.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-600">{a.body}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <ReasonModal
        key={statusTo || "none"}
        open={Boolean(statusTo)}
        title={statusTo === "approved" ? `Approve ${c.legalName}?` : statusTo === "rejected" ? `Reject ${c.legalName}?` : `Suspend ${c.legalName}?`}
        confirmLabel={statusTo === "approved" ? (c.status === "suspended" ? "Reinstate" : "Approve") : statusTo === "rejected" ? "Reject" : "Suspend"}
        danger={statusTo !== "approved"}
        busy={busy}
        onClose={() => setStatusTo(null)}
        onConfirm={changeStatus}
      >
        <p className="text-sm text-ink-600">
          {statusTo === "approved"
            ? "The company administrator is emailed and business pricing, company features and the configured payment terms become active."
            : statusTo === "rejected"
              ? "The company administrator is emailed; the reason below is included in that email."
              : "Purchase-order payment on terms is disabled while the account is suspended."}
        </p>
        <ErrorBanner>{error}</ErrorBanner>
      </ReasonModal>
    </div>
  );
}

function MiniList({ title, items, empty, render, k }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-ink-700">{title}</div>
      {!items.length && <p className="text-xs text-ink-400">{empty}</p>}
      <ul className="flex flex-col gap-1 text-xs">
        {items.map((it) => (
          <li key={k(it)} className="flex items-center justify-between gap-2">{render(it)}</li>
        ))}
      </ul>
    </div>
  );
}
