// Admin → International Commerce: countries, currencies, exchange rates,
// freight, customs, taxes, TDS, Incoterms, payment fees + price preview.
// Tables are generated from the server's rule registry; every change needs a
// reason and is written to the audit log (see History on each row).
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { PageHeader, Tabs, Table, Pill, Btn, Modal, Drawer, Field, inputCls, ErrorBanner, Notice, Card, useApi, dt, usd } from "../../components/admin/kit/index.jsx";
import { EstimateTable } from "../../components/intl/EstimateBox.jsx";

const TABS = [
  { id: "countries", label: "Countries" },
  { id: "currencies", label: "Currencies" },
  { id: "fx", label: "Exchange rates" },
  { id: "shipping_rate_rules", label: "Freight" },
  { id: "shipping_methods", label: "Shipping methods" },
  { id: "customs_rules", label: "Customs" },
  { id: "tax_rules", label: "Taxes" },
  { id: "withholding_rules", label: "TDS" },
  { id: "insurance_rules", label: "Insurance" },
  { id: "handling_rules", label: "Handling" },
  { id: "country_charge_rules", label: "Other charges" },
  { id: "incoterms", label: "Incoterms" },
  { id: "payment_fee_rules", label: "Payment fees" },
  { id: "shipping_zones", label: "Zones" },
  { id: "languages", label: "Languages" },
  { id: "preview", label: "Price preview" },
];
const LIST_COLS = {
  countries: ["code", "name", "default_currency", "default_language", "default_incoterm", "unconfigured_charges"],
  shipping_rate_rules: ["origin_country", "dest_country", "method_code", "rate_basis", "rate_usd", "volumetric_divisor", "missing_data_policy"],
  customs_rules: ["name", "origin_country", "dest_country", "hs_prefix", "duty_type", "rate_pct", "rate_status"],
  tax_rules: ["name", "dest_country", "hs_prefix", "rate_pct", "basis", "collected_at", "rate_status"],
};

export default function International() {
  const [tab, setTab] = useState("countries");
  const schema = useApi("/api/admin/intl/schema");
  const lookups = useApi("/api/admin/intl/lookups");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Globe2" title="International commerce" subtitle="Countries, currencies, exchange rates and every freight, customs, tax and charge rule used for customer estimates. Seeded values are IXITEK's initial planning estimates — verify and adjust them." />
      <Notice tone="amber" icon="AlertTriangle">Customs and tax values are estimates for customer guidance, not official customs assessments. Keep rule status as “planning” until verified; use “requires verification” where a rate depends on classification, exporter or trade-remedy status.</Notice>
      <div className="overflow-x-auto"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      {tab === "fx" && <FxTab />}
      {tab === "preview" && <PreviewTab lookups={lookups.data} />}
      {tab !== "fx" && tab !== "preview" && schema.data && lookups.data && <EntityTab key={tab} name={tab} def={schema.data.entities[tab]} lookups={lookups.data} />}
    </div>
  );
}

function fmtCell(v) {
  if (v === null || v === undefined || v === "") return <span className="text-ink-300">—</span>;
  if (v === 1 || v === 0) return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d+\.\d{4}$/.test(v)) return String(Number(v));
  if (typeof v === "string" && /T\d\d:/.test(v)) return v.slice(0, 10);
  return String(v);
}

function EntityTab({ name, def, lookups }) {
  const { can } = useAdminAuth();
  const list = useApi(`/api/admin/intl/${name}`);
  const [edit, setEdit] = useState(null);
  const [history, setHistory] = useState(null);
  const [err, setErr] = useState("");
  const cols = LIST_COLS[name] || Object.keys(def.fields).filter((f) => f !== "is_active").slice(0, 6);

  async function toggle(row) {
    const reason = window.prompt(`${row.is_active ? "Disable" : "Enable"} this rule — reason:`);
    if (!reason) return;
    try {
      await apiFetch(`/api/admin/intl/${name}/${encodeURIComponent(row.id)}`, { method: "PUT", body: { is_active: !row.is_active, reason } });
      list.reload();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function openHistory(row) {
    const r = await apiFetch(`/api/admin/intl/${name}/${encodeURIComponent(row.id)}/history`);
    setHistory({ row, items: r.history });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-500">{list.data?.rows.length ?? "…"} {def.label.toLowerCase()}</span>
        {can("intl.manage") && <Btn variant="primary" icon="Plus" onClick={() => setEdit({ __new: true, is_active: true })}>Add</Btn>}
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error || err}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.rows}
        columns={[
          ...cols.map((c) => ({ key: c, label: def.fields[c]?.label || c, render: (r) => fmtCell(r[c]) })),
          { key: "is_active", label: "Status", render: (r) => <Pill tone={r.is_active ? "green" : "gray"}>{r.is_active ? "enabled" : "disabled"}</Pill> },
          {
            key: "act",
            label: "",
            render: (r) => (
              <span className="flex gap-1">
                {can("intl.manage") && <Btn size="sm" onClick={() => setEdit({ ...r })}>Edit</Btn>}
                {can("intl.manage") && <Btn size="sm" variant="ghost" onClick={() => toggle(r)}>{r.is_active ? "Disable" : "Enable"}</Btn>}
                <Btn size="sm" variant="ghost" icon="History" onClick={() => openHistory(r)} aria-label="History" />
              </span>
            ),
          },
        ]}
      />
      {edit && <EditModal name={name} def={def} lookups={lookups} row={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), list.reload())} />}
      <Drawer open={Boolean(history)} onClose={() => setHistory(null)} title="Change history">
        {history?.items.length === 0 && <p className="text-sm text-ink-500">No changes recorded since this record was seeded.</p>}
        <ul className="flex flex-col gap-2 text-xs">
          {history?.items.map((h) => (
            <li key={h.id} className="rounded-lg border border-ink-100 p-2">
              <b>{h.action}</b> · {h.actor || "system"} · {dt(h.at)}
              {h.reason && <div className="text-ink-500">“{h.reason}”</div>}
              <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-ink-50 p-1.5">{JSON.stringify({ before: h.before, after: h.after }, null, 1)}</pre>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
}

function EditModal({ name, def, lookups, row, onClose, onSaved }) {
  const creating = Boolean(row.__new);
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of Object.keys(def.fields)) f[k] = row[k] === null || row[k] === undefined ? "" : typeof row[k] === "string" && /T\d\d:/.test(row[k]) ? row[k].slice(0, 10) : row[k];
    return f;
  });
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    setErrors({});
    const body = { ...form, reason };
    for (const [k, f] of Object.entries(def.fields)) if (f.type === "bool") body[k] = Boolean(form[k]);
    try {
      await apiFetch(creating ? `/api/admin/intl/${name}` : `/api/admin/intl/${name}/${encodeURIComponent(row.id)}`, { method: creating ? "POST" : "PUT", body });
      onSaved();
    } catch (e) {
      setErr(e.message);
      if (e.details) setErrors(e.details);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${creating ? "Add" : "Edit"} — ${def.label}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="Save" disabled={!reason.trim()} onClick={save}>Save</Btn></>}>
      <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
        {Object.entries(def.fields).map(([k, f]) => (
          <Field key={k} label={f.label} hint={f.help} error={errors[k]} className={f.type === "text" && (f.max || 0) > 100 ? "col-span-2" : ""}>
            <FieldInput f={f} value={form[k]} disabled={f.createOnly && !creating} lookups={lookups} onChange={(v) => setForm({ ...form, [k]: v })} />
          </Field>
        ))}
        <Field label="Reason for change (required, audited)" className="col-span-2"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="col-span-2"><ErrorBanner>{err}</ErrorBanner></div>
      </div>
    </Modal>
  );
}

function FieldInput({ f, value, onChange, disabled, lookups }) {
  if (f.type === "bool") return <input type="checkbox" className="h-5 w-5" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
  if (f.type === "enum")
    return (
      <select className={inputCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {f.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    );
  if (lookups[f.type])
    return (
      <select className={inputCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {lookups[f.type].map((o) => <option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}
      </select>
    );
  return <input className={inputCls} type={f.type === "date" ? "date" : "text"} inputMode={["int", "decimal"].includes(f.type) ? "decimal" : undefined} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

function FxTab() {
  const { can } = useAdminAuth();
  const cur = useApi("/api/admin/intl/fx/current");
  const [form, setForm] = useState({ currency: "INR", rate: "", kind: "manual", reason: "" });
  const [msg, setMsg] = useState({ ok: "", err: "" });
  const [confirm, setConfirm] = useState(false);
  const hist = useApi(`/api/admin/intl/fx/history/${form.currency}`, [msg.ok]);
  async function save(confirmLargeChange = false) {
    setMsg({ ok: "", err: "" });
    try {
      await apiFetch("/api/admin/intl/fx/rate", { method: "POST", body: { ...form, confirmLargeChange } });
      setMsg({ ok: `Saved ${form.currency} rate.`, err: "" });
      setConfirm(false);
      cur.reload();
    } catch (e) {
      if (e.details?.requiresConfirmation) setConfirm(e.message);
      else setMsg({ ok: "", err: e.message });
    }
  }
  async function refresh() {
    try {
      const r = await apiFetch("/api/admin/intl/fx/refresh", { method: "POST", body: {} });
      setMsg(r.ok ? { ok: `Provider rates updated: ${r.updated.join(", ")}`, err: "" } : { ok: "", err: `Provider unavailable (${r.error}). Last valid rates remain in force.` });
      cur.reload();
    } catch (e) {
      setMsg({ ok: "", err: e.message });
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Card title="Current rates (1 USD =)" actions={can("intl.manage") && <Btn size="sm" icon="RefreshCw" onClick={refresh}>Fetch from provider</Btn>} pad={false}>
        <Table
          loading={cur.loading}
          rowKey="code"
          rows={cur.data?.currencies}
          columns={[
            { key: "code", label: "Currency", render: (c) => <b>{c.symbol} {c.code}</b> },
            { key: "rate", label: "Rate", align: "right", render: (c) => (c.rate ? Number(c.rate).toLocaleString(undefined, { maximumFractionDigits: 6 }) : <Pill tone="amber">no rate</Pill>) },
            { key: "src", label: "Source", render: (c) => (c.source ? <Pill tone={c.source === "override" ? "red" : c.source === "manual" ? "blue" : "gray"}>{c.source}</Pill> : "—") },
            { key: "at", label: "As of", render: (c) => (c.code === "USD" ? "base" : dt(c.observedAt)) },
            { key: "st", label: "", render: (c) => (c.stale ? <Pill tone="amber">stale</Pill> : c.available ? <Pill tone="green">in use</Pill> : <Pill tone="gray">USD shown</Pill>) },
          ]}
        />
      </Card>
      <div className="flex flex-col gap-4">
        {can("intl.manage") && (
          <Card title="Set a rate">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Currency">
                <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {cur.data?.currencies.filter((c) => c.code !== "USD").map((c) => <option key={c.code}>{c.code}</option>)}
                </select>
              </Field>
              <Field label="1 USD =" ><input className={inputCls} inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
              <Field label="Type" className="col-span-2">
                <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="manual">Manual rate (replaced by next provider update)</option>
                  <option value="override">Override (pinned until cleared)</option>
                </select>
              </Field>
              <Field label="Reason / source" className="col-span-2"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Bank TT selling rate 21 Sep" /></Field>
              <Btn variant="primary" className="col-span-2" icon="Save" onClick={() => save(false)}>Save rate</Btn>
              {msg.ok && <div className="col-span-2 text-xs font-semibold text-emerald-700">{msg.ok}</div>}
              <div className="col-span-2"><ErrorBanner>{msg.err}</ErrorBanner></div>
            </div>
          </Card>
        )}
        <Card title={`${form.currency} history`}>
          <ul className="max-h-64 overflow-y-auto text-xs">
            {hist.data?.history.map((h) => (
              <li key={h.id} className="flex justify-between border-b border-ink-100 py-1">
                <span>{Number(h.rate)} <span className="text-ink-400">{h.source}{h.is_active ? "" : " (cleared)"}{h.created_by ? ` · ${h.created_by}` : ""}</span></span>
                <span className="text-ink-400">{dt(h.observed_at)}</span>
              </li>
            ))}
            {hist.data && !hist.data.history.length && <li className="text-ink-400">No rates recorded yet.</li>}
          </ul>
          {can("intl.manage") && cur.data?.currencies.find((c) => c.code === form.currency)?.source === "override" && (
            <Btn size="sm" className="mt-2" onClick={async () => (await apiFetch(`/api/admin/intl/fx/override/${form.currency}/clear`, { method: "POST", body: {} }), cur.reload())}>Clear override</Btn>
          )}
        </Card>
      </div>
      <Modal open={Boolean(confirm)} onClose={() => setConfirm(false)} title="Large rate change" footer={<><Btn onClick={() => setConfirm(false)}>Cancel</Btn><Btn variant="danger" onClick={() => save(true)}>Yes, save this rate</Btn></>}>
        {confirm}
      </Modal>
    </div>
  );
}

function PreviewTab({ lookups }) {
  const groups = useApi("/api/admin/intl/customer-groups");
  const [f, setF] = useState({ sku: "", qty: 10, country: "IN", currency: "", method: "", incoterm: "", customerEmail: "", customerGroup: "" });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const set = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  async function run() {
    setErr("");
    try {
      setRes(await apiFetch("/api/admin/intl/preview", { method: "POST", body: { ...f, currency: f.currency || undefined, method: f.method || undefined, incoterm: f.incoterm || undefined } }));
    } catch (e) {
      setErr(e.message);
      setRes(null);
    }
  }
  const internal = res?.internal;
  const opts = useMemo(() => lookups || {}, [lookups]);
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card title="Scenario">
        <div className="grid grid-cols-2 gap-2">
          <Field label="SKU" className="col-span-2"><input className={`${inputCls} font-mono`} {...set("sku")} placeholder="99IL31-3021m-1M" /></Field>
          <Field label="Quantity"><input type="number" min="1" className={inputCls} {...set("qty")} /></Field>
          <Field label="Country"><select className={inputCls} {...set("country")}>{opts.country?.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></Field>
          <Field label="Currency"><select className={inputCls} {...set("currency")}><option value="">Country default</option>{opts.currency?.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
          <Field label="Shipping"><select className={inputCls} {...set("method")}><option value="">Default</option>{opts.method?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
          <Field label="Incoterm"><select className={inputCls} {...set("incoterm")}><option value="">Country default</option>{opts.incoterm?.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
          <Field label="Customer group"><select className={inputCls} {...set("customerGroup")}><option value="">Public</option>{groups.data?.groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></Field>
          <Field label="…or customer email" className="col-span-2"><input className={inputCls} {...set("customerEmail")} /></Field>
          <Btn variant="primary" icon="Calculator" className="col-span-2" onClick={run}>Calculate preview</Btn>
          <div className="col-span-2"><ErrorBanner>{err}</ErrorBanner></div>
        </div>
      </Card>
      {res && (
        <div className="flex flex-col gap-4">
          <Card title={`Customer view — ${res.country.name}, ${res.currency.code}`}><EstimateTable est={res} /></Card>
          {internal ? (
            <Card title="Internal (confidential)" actions={<Pill tone="red">never shown to customers</Pill>}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {internal.lines.map((l) => (
                  <div key={l.sku} className="col-span-2 rounded bg-ink-50 p-2 text-xs">
                    <b className="font-mono">{l.sku}</b> × {l.qty} · price source <b>{l.priceSource}</b> · cost basis <b>{l.costBasis || "—"}</b> · supplier cost {usd(l.costUsd, 4)} · margin {l.marginPct ? `${Number(l.marginPct)}% + ${usd(l.fixedMarkupUsd)}` : "—"} · selling {usd(l.sellingPriceUsd)}
                  </div>
                ))}
                <span className="text-ink-500">Goods (USD)</span><span className="text-right">{usd(internal.goodsUsd)}</span>
                <span className="text-ink-500">Supplier cost (USD)</span><span className="text-right">{usd(internal.supplierCostUsd)}</span>
                <span className="text-ink-500">Gross margin (USD)</span><span className="text-right font-bold">{usd(internal.grossMarginUsd)}</span>
                <span className="text-ink-500">Payment gateway cost</span><span className="text-right">{internal.paymentGateway ? `${usd(internal.paymentGateway.totalUsd)} (${internal.paymentGateway.rule})` : "—"}</span>
                <span className="text-ink-500">Origin / goods origin</span><span className="text-right">{internal.origin} / {internal.goodsOrigin}</span>
              </div>
            </Card>
          ) : (
            <Notice>Supplier costs are hidden for your role.</Notice>
          )}
        </div>
      )}
    </div>
  );
}
