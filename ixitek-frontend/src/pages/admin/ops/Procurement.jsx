// Admin → Procurement: suppliers & supplier SKUs, purchase orders with goods
// receipts (→ inventory), supplier invoices and reorder suggestions.
// Supplier costs are confidential: the API omits every cost field unless the
// user holds pricing.read_cost (reported as `canSeeCost`), and this page hides
// cost columns and inputs accordingly.
import { useEffect, useState } from "react";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Tabs, Card, Btn, Field, ErrorBanner, Notice, Modal, Drawer, Table, Pagination, useApi, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { StatusPill, Money, money, label, useAction, ReasonModal, newKey, dateOnly } from "./common.jsx";

const TABS = [
  { id: "suppliers", label: "Suppliers" },
  { id: "pos", label: "Purchase orders" },
  { id: "invoices", label: "Supplier invoices" },
  { id: "reorder", label: "Reorder suggestions" },
];
const PO_STATUSES = ["draft", "sent", "partially_received", "received", "cancelled"];
const INV_STATUSES = ["unpaid", "paid", "disputed", "cancelled"];
const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const str = (v) => (v === null || v === undefined ? "" : String(v));
const hasCost = (v) => v !== undefined;

export default function Procurement() {
  const { can } = useAdminAuth();
  const [tab, setTab] = useState("suppliers");
  const [poPrefill, setPoPrefill] = useState(null);
  const suppliers = useApi("/api/admin/procurement/suppliers");
  const warehouses = useApi("/api/admin/inventory/warehouses");
  const locales = useApi("/api/intl/locales");
  const ctx = {
    suppliers: suppliers.data?.suppliers || [],
    warehouses: (warehouses.data?.warehouses || []).filter((w) => w.isActive),
    warehousesError: warehouses.error,
    countries: locales.data?.countries || [],
    currencies: locales.data?.currencies || [],
    permSeeCost: can("pricing.read_cost"),
    reloadSuppliers: suppliers.reload,
  };
  const createPo = (prefill) => {
    setPoPrefill(prefill);
    setTab("pos");
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Factory" title="Procurement" subtitle="Suppliers, supplier part numbers and costs, purchase orders, goods receipts into inventory, and supplier invoices." />
      <ErrorBanner onRetry={suppliers.reload}>{suppliers.error}</ErrorBanner>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "suppliers" && <SuppliersTab ctx={ctx} />}
      {tab === "pos" && <PurchaseOrdersTab ctx={ctx} prefill={poPrefill} clearPrefill={() => setPoPrefill(null)} />}
      {tab === "invoices" && <InvoicesTab ctx={ctx} />}
      {tab === "reorder" && <ReorderTab ctx={ctx} onCreatePo={createPo} />}
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

function CurrencySelect({ value, onChange, currencies, id, label: lbl = "Currency" }) {
  return (
    <Field label={lbl}>
      <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        {value && !currencies.some((c) => c.code === value) && <option value={value}>{value}</option>}
      </select>
    </Field>
  );
}

// ── Suppliers ──
function SuppliersTab({ ctx }) {
  const [editing, setEditing] = useState(null); // {} for new, supplier for edit
  const [openId, setOpenId] = useState(null);
  const open = ctx.suppliers.find((x) => x.id === openId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Btn variant="primary" icon="Plus" onClick={() => setEditing({})}>New supplier</Btn>
      </div>
      <Table
        rows={ctx.suppliers}
        onRowClick={(r) => setOpenId(r.id)}
        empty="No suppliers yet."
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
          { key: "name", label: "Name", render: (r) => <span className="font-medium text-ink-800">{r.name}</span> },
          { key: "country", label: "Country", render: (r) => r.country || "—" },
          { key: "contact", label: "Contact", render: (r) => <span className="text-xs">{[r.contactName, r.email].filter(Boolean).join(" · ") || "—"}</span> },
          { key: "currency", label: "Currency" },
          { key: "paymentTerms", label: "Terms", render: (r) => r.paymentTerms || "—" },
          { key: "leadTimeDays", label: "Lead time", align: "right", render: (r) => (r.leadTimeDays !== null && r.leadTimeDays !== undefined ? `${num(r.leadTimeDays)} d` : "—") },
          { key: "isActive", label: "Status", render: (r) => <StatusPill status={r.isActive ? "active" : "inactive"} /> },
        ]}
      />
      <SupplierModal supplier={editing} ctx={ctx} onClose={() => setEditing(null)} onSaved={(sup) => (setEditing(null), ctx.reloadSuppliers(), setOpenId(sup.id))} />
      <Drawer open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? `${open.code} — ${open.name}` : ""} width="max-w-4xl">
        {open && <SupplierPanel key={open.id} supplier={open} ctx={ctx} onEdit={() => setEditing(open)} />}
      </Drawer>
    </div>
  );
}

const supplierForm = (x = {}) => ({
  code: str(x.code), name: str(x.name), country: str(x.country), contactName: str(x.contactName), email: str(x.email), phone: str(x.phone), address: str(x.address),
  currency: str(x.currency) || "USD", paymentTerms: str(x.paymentTerms), leadTimeDays: str(x.leadTimeDays), notes: str(x.notes), isActive: x.isActive !== false,
});

function SupplierModal({ supplier, ctx, onClose, onSaved }) {
  const [f, setF] = useState(supplierForm());
  const [run, busy, error, setError] = useAction();
  useEffect(() => {
    if (!supplier) return;
    setF(supplierForm(supplier));
    setError("");
  }, [supplier, setError]);
  const isNew = supplier && !supplier.id;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    const r = isNew ? await run("/api/admin/procurement/suppliers", { body: f }) : await run(`/api/admin/procurement/suppliers/${supplier.id}`, { method: "PUT", body: f });
    if (r) onSaved(r.supplier);
  };
  return (
    <Modal open={Boolean(supplier)} onClose={onClose} title={isNew ? "New supplier" : `Edit ${supplier?.code || "supplier"}`}>
      <form onSubmit={submit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" hint="2–30 letters, digits, - or _">
            <input className={`${inputCls} font-mono uppercase`} value={f.code} onChange={(e) => set("code", e.target.value)} required maxLength={30} pattern="[A-Za-z0-9_\-]{2,30}" />
          </Field>
          <Field label="Name">
            <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={200} />
          </Field>
          <Field label="Country">
            <select className={inputCls} value={f.country} onChange={(e) => set("country", e.target.value)}>
              <option value="">—</option>
              {ctx.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              {f.country && !ctx.countries.some((c) => c.code === f.country) && <option value={f.country}>{f.country}</option>}
            </select>
          </Field>
          <CurrencySelect value={f.currency} onChange={(v) => set("currency", v)} currencies={ctx.currencies} label="Purchasing currency" />
          <Field label="Contact name">
            <input className={inputCls} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} maxLength={150} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={254} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} />
          </Field>
          <Field label="Payment terms">
            <input className={inputCls} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="e.g. 30% advance, 70% before dispatch" maxLength={60} />
          </Field>
          <Field label="Default lead time (days)">
            <input type="number" min={0} step={1} className={inputCls} value={f.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Active (available for new purchase orders)
          </label>
          <Field label="Address" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={1000} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={5000} />
          </Field>
        </div>
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" icon="Save" disabled={busy}>{isNew ? "Create supplier" : "Save supplier"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

const spForm = (x = {}, currency = "USD") => ({ sku: str(x.sku), supplierSku: str(x.supplierSku), unitCost: str(x.unitCost), currency: str(x.currency) || currency, moq: str(x.moq) || "1", leadTimeDays: str(x.leadTimeDays), preferred: Boolean(x.preferred) });

function SupplierPanel({ supplier, ctx, onEdit }) {
  const path = `/api/admin/procurement/suppliers/${supplier.id}/products`;
  const items = useApi(path);
  const [f, setF] = useState(spForm({}, supplier.currency));
  const [editingSku, setEditingSku] = useState("");
  const [run, busy, error] = useAction();
  const seeCost = items.data ? items.data.canSeeCost : false;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const reset = () => (setF(spForm({}, supplier.currency)), setEditingSku(""));
  const submit = async (e) => {
    e.preventDefault();
    const body = { sku: f.sku.trim(), supplierSku: f.supplierSku.trim(), currency: f.currency, moq: f.moq, leadTimeDays: f.leadTimeDays, preferred: f.preferred };
    if (seeCost && f.unitCost.trim()) body.unitCost = f.unitCost.trim();
    if (await run(path, { method: "PUT", body })) {
      reset();
      items.reload();
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <Card title="Supplier" actions={<Btn size="sm" icon="Pencil" onClick={onEdit}>Edit</Btn>}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Info k="Status"><StatusPill status={supplier.isActive ? "active" : "inactive"} /></Info>
          <Info k="Country">{supplier.country}</Info>
          <Info k="Currency">{supplier.currency}</Info>
          <Info k="Contact">{supplier.contactName}</Info>
          <Info k="Email">{supplier.email && <a className="text-brand-700 hover:underline" href={`mailto:${supplier.email}`}>{supplier.email}</a>}</Info>
          <Info k="Phone">{supplier.phone}</Info>
          <Info k="Payment terms">{supplier.paymentTerms}</Info>
          <Info k="Lead time">{supplier.leadTimeDays !== null && supplier.leadTimeDays !== undefined ? `${supplier.leadTimeDays} days` : ""}</Info>
          <Info k="Address">{supplier.address}</Info>
        </dl>
        {supplier.notes && <p className="mt-3 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm text-ink-600">{supplier.notes}</p>}
      </Card>

      <Card title="Supplied products" pad={false}>
        <div className="p-4">
          <ErrorBanner onRetry={items.reload}>{items.error}</ErrorBanner>
          <Table
            loading={items.loading}
            rows={items.data?.items}
            empty="No products linked to this supplier yet."
            columns={[
              { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
              { key: "name", label: "Product", render: (r) => <span className="line-clamp-1 max-w-[220px] text-ink-700">{r.name}</span> },
              { key: "supplierSku", label: "Supplier SKU", render: (r) => <span className="font-mono text-xs">{r.supplierSku || "—"}</span> },
              ...(seeCost ? [{ key: "unitCost", label: "Unit cost", align: "right", render: (r) => (r.unitCost !== null && r.unitCost !== undefined ? <Money amount={r.unitCost} currency={r.currency} /> : <span className="text-ink-400">Not set</span>) }] : []),
              { key: "moq", label: "MOQ", align: "right", render: (r) => num(r.moq) },
              { key: "leadTimeDays", label: "Lead", align: "right", render: (r) => (r.leadTimeDays !== null && r.leadTimeDays !== undefined ? `${r.leadTimeDays} d` : "—") },
              { key: "preferred", label: "Preferred", render: (r) => (r.preferred ? <StatusPill status="active" /> : "") },
              { key: "act", label: "", render: (r) => <Btn size="sm" variant="ghost" icon="Pencil" onClick={() => (setF(spForm(r, supplier.currency)), setEditingSku(r.sku))}>Edit</Btn> },
            ]}
          />
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3 border-t border-ink-100 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{editingSku ? `Update ${editingSku}` : "Add or update a product"}</div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="IXITEK SKU">
              <input className={`${inputCls} font-mono text-xs`} value={f.sku} onChange={(e) => set("sku", e.target.value)} required maxLength={100} readOnly={Boolean(editingSku)} />
            </Field>
            <Field label="Supplier SKU">
              <input className={`${inputCls} font-mono text-xs`} value={f.supplierSku} onChange={(e) => set("supplierSku", e.target.value)} maxLength={100} />
            </Field>
            {seeCost && (
              <Field label="Unit cost" hint={editingSku ? "Blank keeps the current cost" : undefined}>
                <input inputMode="decimal" className={`${inputCls} text-right`} value={f.unitCost} onChange={(e) => set("unitCost", e.target.value)} />
              </Field>
            )}
            <CurrencySelect value={f.currency} onChange={(v) => set("currency", v)} currencies={ctx.currencies} />
            <Field label="MOQ">
              <input type="number" min={1} step={1} className={inputCls} value={f.moq} onChange={(e) => set("moq", e.target.value)} />
            </Field>
            <Field label="Lead time (days)">
              <input type="number" min={0} step={1} className={inputCls} value={f.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
              <input type="checkbox" checked={f.preferred} onChange={(e) => set("preferred", e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Preferred supplier for this SKU
            </label>
          </div>
          {!seeCost && items.data && <p className="text-[11px] text-ink-400">Supplier costs are hidden — you need the “pricing.read_cost” permission to view or set them.</p>}
          <ErrorBanner>{error}</ErrorBanner>
          <div className="flex justify-end gap-2">
            {editingSku && <Btn onClick={reset}>Cancel edit</Btn>}
            <Btn type="submit" variant="primary" icon="Save" disabled={busy || !f.sku.trim()}>Save product</Btn>
          </div>
        </form>
      </Card>
    </div>
  );
}

const PAGE = 50;

// ── Purchase orders ──
function PurchaseOrdersTab({ ctx, prefill, clearPrefill }) {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const list = useApi(`/api/admin/procurement/purchase-orders?${new URLSearchParams({ ...(status && { status }), page, limit: PAGE })}`);
  const seeCost = list.data ? list.data.canSeeCost : ctx.permSeeCost;
  useEffect(() => {
    if (prefill) setCreateOpen(true);
  }, [prefill]);
  const closeCreate = () => (setCreateOpen(false), clearPrefill());
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-between gap-2 md:flex-row">
        <select className={`${inputCls} md:w-56`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Purchase order status">
          <option value="">All statuses</option>
          {PO_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <Btn variant="primary" icon="Plus" onClick={() => setCreateOpen(true)}>New purchase order</Btn>
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.purchaseOrders}
        onRowClick={(r) => setOpenId(r.id)}
        empty="No purchase orders."
        columns={[
          { key: "poNumber", label: "PO", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.poNumber}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          { key: "supplier", label: "Supplier", render: (r) => <span className="font-medium text-ink-800">{r.supplier}</span> },
          ...(seeCost ? [{ key: "subtotal", label: "Subtotal", align: "right", render: (r) => <Money amount={r.subtotal} currency={r.currency} /> }] : []),
          { key: "currency", label: "Currency" },
          { key: "expectedDate", label: "Expected", render: (r) => (r.expectedDate ? dateOnly(r.expectedDate) : "—") },
          { key: "createdAt", label: "Created", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
        ]}
      />
      <Pagination page={page} limit={PAGE} total={list.data?.total} onPage={setPage} />
      <PoCreateModal open={createOpen} prefill={prefill} ctx={ctx} seeCost={seeCost} onClose={closeCreate} onCreated={(po) => (closeCreate(), list.reload(), setOpenId(po.id))} />
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Purchase order" width="max-w-4xl">
        {openId && <PoPanel key={openId} id={openId} ctx={ctx} onChanged={list.reload} />}
      </Drawer>
    </div>
  );
}

const poLine = (x = {}) => ({ key: newKey("pl"), sku: str(x.sku), qty: str(x.qty) || "1", unitCost: str(x.unitCost) });

function LinesEditor({ lines, setLines, seeCost, currency }) {
  const upd = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-ink-100">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-2 py-2">SKU</th>
              <th scope="col" className="w-24 px-2 py-2 text-right">Qty</th>
              {seeCost && <th scope="col" className="w-36 px-2 py-2 text-right">Unit cost{currency ? ` (${currency})` : ""}</th>}
              <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-t border-ink-100">
                <td className="px-2 py-1.5">
                  <input className={`${inputCls} font-mono text-xs`} value={l.sku} onChange={(e) => upd(l.key, { sku: e.target.value })} aria-label={`Line ${i + 1} SKU`} required maxLength={100} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={1} step={1} className={`${inputCls} text-right`} value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} aria-label={`Line ${i + 1} quantity`} required />
                </td>
                {seeCost && (
                  <td className="px-2 py-1.5">
                    <input inputMode="decimal" className={`${inputCls} text-right`} value={l.unitCost} onChange={(e) => upd(l.key, { unitCost: e.target.value })} aria-label={`Line ${i + 1} unit cost`} placeholder="Cost on file" />
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <button type="button" disabled={lines.length <= 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="focus-ring rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Remove line ${i + 1}`}>
                    <Icon name="Trash2" className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Btn size="sm" icon="Plus" onClick={() => setLines([...lines, poLine()])}>Add line</Btn>
        <span className="text-[11px] text-ink-400">{seeCost ? "Blank unit cost = the supplier's cost on file for that SKU." : "Lines are priced from the supplier costs on file."}</span>
      </div>
    </div>
  );
}

const linesBody = (lines, seeCost) => lines.map((l) => ({ sku: l.sku.trim(), qty: l.qty, ...(seeCost && l.unitCost.trim() ? { unitCost: l.unitCost.trim() } : {}) }));

function PoCreateModal({ open, prefill, ctx, seeCost, onClose, onCreated }) {
  const blank = () => ({ supplierId: "", warehouseId: ctx.warehouses.find((w) => w.isDefault)?.id || "", currency: "", incoterm: "", expectedDate: "", notes: "", lines: [poLine()] });
  const [f, setF] = useState(blank);
  const [run, busy, error, setError] = useAction();
  useEffect(() => {
    if (!open) return;
    setError("");
    const base = blank();
    if (prefill) {
      const wh = ctx.warehouses.find((w) => w.code === prefill.warehouseCode);
      setF({ ...base, supplierId: prefill.supplierId || "", warehouseId: wh ? wh.id : base.warehouseId, lines: prefill.lines.map(poLine) });
    } else setF(base);
  }, [open, prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = ctx.suppliers.filter((x) => x.isActive);
  const sup = ctx.suppliers.find((x) => x.id === f.supplierId);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    const r = await run("/api/admin/procurement/purchase-orders", {
      body: { supplierId: f.supplierId, warehouseId: f.warehouseId, currency: f.currency || undefined, incoterm: f.incoterm || undefined, expectedDate: f.expectedDate, notes: f.notes, lines: linesBody(f.lines, seeCost) },
    });
    if (r) onCreated(r.purchaseOrder);
  };
  return (
    <Modal open={open} onClose={onClose} title="New purchase order">
      <form onSubmit={submit} className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <select className={inputCls} value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)} required>
              <option value="">Choose…</option>
              {active.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
            </select>
          </Field>
          <Field label="Receiving warehouse" error={ctx.warehousesError ? `Could not load warehouses: ${ctx.warehousesError}` : undefined}>
            <select className={inputCls} value={f.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} required>
              <option value="">Choose…</option>
              {ctx.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <Field label="Currency" hint={sup ? `Blank = supplier currency (${sup.currency})` : "Blank = supplier currency"}>
            <select className={inputCls} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="">Supplier default</option>
              {ctx.currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Incoterm">
            <select className={inputCls} value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
              <option value="">Not specified</option>
              {INCOTERMS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Expected delivery">
            <input type="date" className={inputCls} value={f.expectedDate} onChange={(e) => set("expectedDate", e.target.value)} />
          </Field>
          <Field label="Notes">
            <input className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
          </Field>
        </div>
        <LinesEditor lines={f.lines} setLines={(lines) => set("lines", lines)} seeCost={seeCost} currency={f.currency || sup?.currency} />
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" icon="Save" disabled={busy || !f.supplierId || !f.warehouseId}>Create draft PO</Btn>
        </div>
      </form>
    </Modal>
  );
}

function PoPanel({ id, ctx, onChanged }) {
  const path = `/api/admin/procurement/purchase-orders/${id}`;
  const res = useApi(path);
  const [mode, setMode] = useState(null); // edit | receive | send | cancel
  const [run, busy, error, setError] = useAction();
  const [notice, setNotice] = useState("");
  const po = res.data?.purchaseOrder;
  const seeCost = po ? po.items.some((i) => hasCost(i.unitCost)) || hasCost(po.subtotal) : ctx.permSeeCost;
  const done = (msg) => {
    setMode(null);
    setNotice(msg);
    res.reload();
    onChanged();
  };
  const open = (m) => (setError(""), setNotice(""), setMode(m));
  const send = async () => {
    if (await run(`${path}/send`, {})) done("Purchase order sent — quantities now show as incoming stock.");
  };
  const cancel = async (reason) => {
    if (await run(`${path}/cancel`, { body: { reason } })) done("Purchase order cancelled.");
  };

  if (res.error) return <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>;
  if (!po) return <div className="h-40 animate-pulse rounded-xl bg-ink-100" />;
  const receivable = ["sent", "partially_received"].includes(po.status);
  const cancellable = ["draft", "sent", "partially_received"].includes(po.status);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-lg font-bold text-ink-900">{po.poNumber}</h3>
        <StatusPill status={po.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          {po.status === "draft" && <Btn icon="Pencil" onClick={() => open("edit")}>Edit lines</Btn>}
          {po.status === "draft" && <Btn variant="primary" icon="Send" onClick={() => open("send")}>Send to supplier</Btn>}
          {receivable && <Btn variant="primary" icon="PackageCheck" onClick={() => open("receive")}>Receive goods</Btn>}
          {cancellable && <Btn variant="danger" icon="Ban" onClick={() => open("cancel")}>Cancel PO</Btn>}
        </div>
      </div>
      {notice && <Notice tone="green" icon="CheckCircle2">{notice}</Notice>}
      <Card title="Details">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4">
          <Info k="Supplier">{po.supplier.code} — {po.supplier.name}</Info>
          <Info k="Warehouse">{po.warehouse.code}</Info>
          <Info k="Currency">{po.currency}</Info>
          <Info k="Incoterm">{po.incoterm}</Info>
          <Info k="Expected">{po.expectedDate ? dateOnly(po.expectedDate) : ""}</Info>
          <Info k="Sent">{po.sentAt ? dt(po.sentAt) : ""}</Info>
          <Info k="Created">{dt(po.createdAt)}</Info>
          {hasCost(po.subtotal) && <Info k="Subtotal"><b>{money(po.subtotal, po.currency)}</b></Info>}
        </dl>
        {po.notes && <p className="mt-3 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm text-ink-600">{po.notes}</p>}
      </Card>

      {mode === "edit" ? (
        <Card title="Edit draft lines">
          <PoEditForm po={po} path={path} seeCost={seeCost} onCancel={() => setMode(null)} onSaved={() => done("Draft updated.")} />
        </Card>
      ) : mode === "receive" ? (
        <Card title="Goods receipt">
          <ReceiveForm po={po} path={path} onCancel={() => setMode(null)} onDone={(r) => done(r.duplicate ? `This receipt was already recorded as ${r.grnNumber}.` : `Received — goods receipt ${r.grnNumber} created and stock updated.`)} />
        </Card>
      ) : (
        <Card title="Lines" pad={false}>
          <Table
            rows={po.items}
            columns={[
              { key: "sku", label: "SKU", render: (i) => <span className="font-mono text-xs font-semibold">{i.sku}</span> },
              { key: "name", label: "Product", render: (i) => <span className="line-clamp-1 max-w-[240px] text-ink-700">{i.name}</span> },
              { key: "supplierSku", label: "Supplier SKU", render: (i) => <span className="font-mono text-xs">{i.supplierSku || "—"}</span> },
              { key: "qty", label: "Ordered", align: "right", render: (i) => num(i.qty) },
              { key: "qtyReceived", label: "Received", align: "right", render: (i) => <span className={i.qtyReceived >= i.qty ? "font-semibold text-emerald-700" : ""}>{num(i.qtyReceived)}</span> },
              ...(seeCost ? [{ key: "unitCost", label: "Unit cost", align: "right", render: (i) => <Money amount={i.unitCost} currency={po.currency} /> }] : []),
            ]}
          />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Goods receipts">
          {!po.receipts.length ? <p className="text-xs text-ink-500">Nothing received yet.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {po.receipts.map((g) => (
                <li key={g.number} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{g.number}</span>
                  <span className="text-xs text-ink-500">{dt(g.receivedAt)}</span>
                  {g.notes && <span className="w-full text-xs text-ink-600">{g.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Supplier invoices">
          {!po.supplierInvoices.length ? <p className="text-xs text-ink-500">No invoices recorded against this PO.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {po.supplierInvoices.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{v.number}</span>
                  <span className="text-xs text-ink-500">{dateOnly(v.date)}</span>
                  {hasCost(v.amount) && <span className="tabular-nums text-xs">{money(v.amount, v.currency)}</span>}
                  <StatusPill status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={mode === "send"}
        onClose={() => setMode(null)}
        title={`Send ${po.poNumber}?`}
        footer={
          <>
            <Btn onClick={() => setMode(null)}>Cancel</Btn>
            <Btn variant="primary" icon="Send" disabled={busy} onClick={send}>Mark as sent</Btn>
          </>
        }
      >
        <p>The PO is locked for editing and its quantities are added as incoming stock in {po.warehouse.code}.</p>
        <div className="mt-3"><ErrorBanner>{error}</ErrorBanner></div>
      </Modal>
      <ReasonModal key={mode === "cancel" ? "c-open" : "c-closed"} open={mode === "cancel"} title={`Cancel ${po.poNumber}?`} confirmLabel="Cancel purchase order" danger busy={busy} onClose={() => setMode(null)} onConfirm={cancel}>
        <p className="text-sm text-ink-600">{po.status === "draft" ? "The draft is cancelled." : "Outstanding (not yet received) quantities are removed from incoming stock. Received goods stay in inventory."}</p>
        <ErrorBanner>{error}</ErrorBanner>
      </ReasonModal>
    </div>
  );
}

function PoEditForm({ po, path, seeCost, onCancel, onSaved }) {
  const [lines, setLines] = useState(() => po.items.map((i) => poLine({ sku: i.sku, qty: i.qty, unitCost: hasCost(i.unitCost) ? i.unitCost : "" })));
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ? dateOnly(po.expectedDate) : "");
  const [notes, setNotes] = useState(po.notes || "");
  const [run, busy, error] = useAction();
  const submit = async (e) => {
    e.preventDefault();
    if (await run(path, { method: "PUT", body: { lines: linesBody(lines, seeCost), expectedDate, notes } })) onSaved();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <LinesEditor lines={lines} setLines={setLines} seeCost={seeCost} currency={po.currency} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Expected delivery">
          <input type="date" className={inputCls} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn type="submit" variant="primary" icon="Save" disabled={busy}>Save draft</Btn>
      </div>
    </form>
  );
}

function ReceiveForm({ po, path, onCancel, onDone }) {
  const open = po.items.filter((i) => i.qty > i.qtyReceived);
  const [rows, setRows] = useState(() => Object.fromEntries(open.map((i) => [i.id, { qty: String(i.qty - i.qtyReceived), damaged: "0" }])));
  const [notes, setNotes] = useState("");
  const [key] = useState(() => newKey("grn"));
  const [run, busy, error] = useAction();
  const upd = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const lines = open.map((i) => ({ itemId: i.id, qty: Number(rows[i.id]?.qty) || 0, damaged: Number(rows[i.id]?.damaged) || 0 })).filter((l) => l.qty > 0);
  const invalid = open.some((i) => {
    const q = Number(rows[i.id]?.qty) || 0;
    const d = Number(rows[i.id]?.damaged) || 0;
    return q < 0 || q > i.qty - i.qtyReceived || d < 0 || d > q;
  });
  const submit = async (e) => {
    e.preventDefault();
    const r = await run(`${path}/receive`, { body: { lines, notes, idempotencyKey: key } });
    if (r) onDone(r);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-ink-500">Received units move from incoming to on-hand stock in {po.warehouse.code}; damaged units are booked to the damaged bucket. Submitting twice records only one receipt.</p>
      <div className="overflow-x-auto rounded-lg border border-ink-100">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-2 py-2">SKU</th>
              <th scope="col" className="px-2 py-2 text-right">Outstanding</th>
              <th scope="col" className="w-28 px-2 py-2 text-right">Received now</th>
              <th scope="col" className="w-28 px-2 py-2 text-right">Of which damaged</th>
            </tr>
          </thead>
          <tbody>
            {open.map((i) => (
              <tr key={i.id} className="border-t border-ink-100">
                <td className="px-2 py-1.5">
                  <div className="font-mono text-xs font-semibold">{i.sku}</div>
                  <div className="line-clamp-1 text-[11px] text-ink-500">{i.name}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(i.qty - i.qtyReceived)}</td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} max={i.qty - i.qtyReceived} step={1} className={`${inputCls} text-right`} value={rows[i.id]?.qty ?? ""} onChange={(e) => upd(i.id, { qty: e.target.value })} aria-label={`${i.sku} received quantity`} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} step={1} className={`${inputCls} text-right`} value={rows[i.id]?.damaged ?? ""} onChange={(e) => upd(i.id, { damaged: e.target.value })} aria-label={`${i.sku} damaged quantity`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Receipt notes (delivery note, carrier, condition)">
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </Field>
      {invalid && <p className="text-[11px] font-medium text-red-600">Received quantity cannot exceed what is outstanding, and damaged cannot exceed received.</p>}
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn type="submit" variant="primary" icon="PackageCheck" disabled={busy || invalid || !lines.length}>Record receipt</Btn>
      </div>
    </form>
  );
}

// ── Supplier invoices ──
function InvoicesTab({ ctx }) {
  const [page, setPage] = useState(1);
  const list = useApi(`/api/admin/procurement/supplier-invoices?page=${page}&limit=${PAGE}`);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFor, setStatusFor] = useState(null);
  const seeCost = list.data ? list.data.canSeeCost : ctx.permSeeCost;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Unpaid invoices first, by due date.</p>
        {seeCost && <Btn variant="primary" icon="Plus" onClick={() => setCreateOpen(true)}>Record invoice</Btn>}
      </div>
      {!seeCost && list.data && <Notice icon="Lock">Invoice amounts are hidden and new invoices can't be recorded without the “pricing.read_cost” permission.</Notice>}
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.invoices}
        empty="No supplier invoices recorded."
        columns={[
          { key: "number", label: "Invoice", render: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
          { key: "supplier", label: "Supplier", render: (r) => <span className="font-medium text-ink-800">{r.supplier}</span> },
          { key: "poNumber", label: "PO", render: (r) => <span className="font-mono text-xs">{r.poNumber || "—"}</span> },
          { key: "date", label: "Date", render: (r) => dateOnly(r.date) },
          {
            key: "dueDate",
            label: "Due",
            render: (r) => {
              if (!r.dueDate) return "—";
              const d = dateOnly(r.dueDate);
              return <span className={r.status === "unpaid" && d < today ? "font-semibold text-red-700" : ""}>{d}</span>;
            },
          },
          ...(seeCost ? [{ key: "amount", label: "Amount", align: "right", render: (r) => <Money amount={r.amount} currency={r.currency} /> }] : []),
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          { key: "paymentReference", label: "Payment ref.", render: (r) => <span className="text-xs">{r.paymentReference || "—"}{r.paidAt ? ` · ${dateOnly(r.paidAt)}` : ""}</span> },
          { key: "act", label: "", render: (r) => <Btn size="sm" variant="ghost" onClick={() => setStatusFor(r)}>Change status</Btn> },
        ]}
      />
      <Pagination page={page} limit={PAGE} total={list.data?.total} onPage={setPage} />
      {seeCost && <InvoiceCreateModal open={createOpen} ctx={ctx} onClose={() => setCreateOpen(false)} onCreated={() => (setCreateOpen(false), list.reload())} />}
      <InvoiceStatusModal inv={statusFor} onClose={() => setStatusFor(null)} onDone={() => (setStatusFor(null), list.reload())} />
    </div>
  );
}

function InvoiceCreateModal({ open, ctx, onClose, onCreated }) {
  const blank = { supplierId: "", poId: "", number: "", date: new Date().toISOString().slice(0, 10), dueDate: "", currency: "", amount: "", notes: "" };
  const [f, setF] = useState(blank);
  const [run, busy, error, setError] = useAction();
  const pos = useApi(open && f.supplierId ? `/api/admin/procurement/purchase-orders?supplierId=${encodeURIComponent(f.supplierId)}` : null);
  useEffect(() => {
    if (!open) return;
    setF(blank);
    setError("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sup = ctx.suppliers.find((x) => x.id === f.supplierId);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    const r = await run("/api/admin/procurement/supplier-invoices", { body: { ...f, poId: f.poId || null, currency: f.currency || sup?.currency || "USD" } });
    if (r) onCreated();
  };
  return (
    <Modal open={open} onClose={onClose} title="Record supplier invoice">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          <select className={inputCls} value={f.supplierId} onChange={(e) => setF((x) => ({ ...x, supplierId: e.target.value, poId: "", currency: "" }))} required>
            <option value="">Choose…</option>
            {ctx.suppliers.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
          </select>
        </Field>
        <Field label="Purchase order (optional)">
          <select className={inputCls} value={f.poId} onChange={(e) => set("poId", e.target.value)} disabled={!f.supplierId}>
            <option value="">Not linked</option>
            {(pos.data?.purchaseOrders || []).filter((p) => p.status !== "cancelled").map((p) => <option key={p.id} value={p.id}>{p.poNumber} ({label(p.status)})</option>)}
          </select>
        </Field>
        <Field label="Supplier's invoice number">
          <input className={inputCls} value={f.number} onChange={(e) => set("number", e.target.value)} required maxLength={80} />
        </Field>
        <Field label="Invoice date">
          <input type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} required />
        </Field>
        <Field label="Due date">
          <input type="date" className={inputCls} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <Field label="Currency" hint={sup ? `Blank = ${sup.currency}` : undefined}>
          <select className={inputCls} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="">Supplier default</option>
            {ctx.currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </Field>
        <Field label="Amount">
          <input inputMode="decimal" className={`${inputCls} text-right`} value={f.amount} onChange={(e) => set("amount", e.target.value)} required />
        </Field>
        <Field label="Notes">
          <input className={inputCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
        </Field>
        <div className="sm:col-span-2"><ErrorBanner>{error || pos.error}</ErrorBanner></div>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3 sm:col-span-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" icon="Save" disabled={busy || !f.supplierId || !f.number.trim() || !f.amount.trim()}>Record invoice</Btn>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceStatusModal({ inv, onClose, onDone }) {
  const [status, setStatus] = useState("paid");
  const [ref, setRef] = useState("");
  const [run, busy, error, setError] = useAction();
  useEffect(() => {
    if (!inv) return;
    setStatus(inv.status === "paid" ? "unpaid" : "paid");
    setRef(inv.paymentReference || "");
    setError("");
  }, [inv, setError]);
  const submit = async (e) => {
    e.preventDefault();
    if (await run(`/api/admin/procurement/supplier-invoices/${inv.id}/status`, { body: { status, paymentReference: ref.trim() } })) onDone();
  };
  return (
    <Modal open={Boolean(inv)} onClose={onClose} title={inv ? `Invoice ${inv.number} — ${inv.supplier}` : ""}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Status">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            {INV_STATUSES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </select>
        </Field>
        {status === "paid" && (
          <Field label="Payment reference (required)">
            <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} required minLength={3} maxLength={120} placeholder="Bank transfer / UTR / cheque number" />
          </Field>
        )}
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant={status === "cancelled" ? "danger" : "primary"} disabled={busy || (status === "paid" && ref.trim().length < 3)}>Update status</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Reorder suggestions ──
function ReorderTab({ ctx, onCreatePo }) {
  const list = useApi("/api/admin/procurement/reorder-suggestions");
  const rows = (list.data?.suggestions || []).map((r) => ({ ...r, _k: `${r.productId}:${r.warehouse}` }));
  const seeCost = ctx.permSeeCost && rows.some((r) => hasCost(r.unitCost));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-500">Products whose available + incoming stock is at or below the reorder point, with the preferred supplier. Suggested quantity = the larger of the reorder quantity and the supplier MOQ.</p>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="_k"
        rows={rows}
        empty="Nothing to reorder — all stock is above its reorder point."
        columns={[
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs font-semibold">{r.sku}</span> },
          { key: "name", label: "Product", render: (r) => <span className="line-clamp-1 max-w-[240px] text-ink-700">{r.name}</span> },
          { key: "warehouse", label: "Warehouse", render: (r) => <span className="font-mono text-xs">{r.warehouse}</span> },
          { key: "available", label: "Available", align: "right", render: (r) => <span className={r.available <= 0 ? "font-semibold text-red-700" : ""}>{num(r.available)}</span> },
          { key: "incoming", label: "Incoming", align: "right", render: (r) => num(r.incoming) },
          { key: "reorderPoint", label: "Reorder pt.", align: "right", render: (r) => num(r.reorderPoint) },
          { key: "suggestedQty", label: "Suggested", align: "right", render: (r) => <b>{num(r.suggestedQty)}</b> },
          { key: "supplier", label: "Preferred supplier", render: (r) => (r.supplier ? r.supplier.name : <span className="text-xs text-amber-700">None set</span>) },
          ...(seeCost ? [{ key: "unitCost", label: "Supplier cost", align: "right", render: (r) => (r.unitCost !== null && r.unitCost !== undefined ? <span className="tabular-nums" title="In the supplier SKU's purchasing currency">{String(Number(r.unitCost))}</span> : "—") }] : []),
          {
            key: "act",
            label: "",
            render: (r) =>
              r.supplier ? (
                <Btn size="sm" icon="ShoppingCart" onClick={() => onCreatePo({ supplierId: r.supplier.id, warehouseCode: r.warehouse, lines: [{ sku: r.sku, qty: r.suggestedQty }] })}>
                  Create PO
                </Btn>
              ) : (
                <span className="text-[11px] text-ink-400">Link a supplier first</span>
              ),
          },
        ]}
      />
    </div>
  );
}
