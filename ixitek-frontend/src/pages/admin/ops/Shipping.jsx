// Admin → Shipping: fulfilment queue, shipments in transit and carrier setup.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Tabs, Table, Pagination, Btn, Pill, Modal, Field, inputCls, ErrorBanner, Notice, useApi, dt, num } from "../../../components/admin/kit/index.jsx";
import { StatusPill, label } from "./common.jsx";

const PAGE = 50;

export default function Shipping() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("toShip");
  const [page, setPage] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const queue = useApi(`/api/admin/shipping/queue?page=${page}&activePage=${activePage}&limit=${PAGE}`);
  const open = (n) => navigate(`/admin/orders/${encodeURIComponent(n)}`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon="Truck"
        title="Shipping"
        subtitle="Orders waiting to be dispatched and shipments on the way. Open an order to create a shipment or update tracking — shipments drive the order status and stock."
        actions={tab !== "carriers" && <Btn size="sm" icon="RefreshCw" onClick={queue.reload}>Refresh</Btn>}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "toShip", label: "To ship", count: queue.data?.toShipPaging?.total },
          { id: "active", label: "In transit", count: queue.data?.activePaging?.total },
          { id: "carriers", label: "Carriers" },
        ]}
      />
      {tab !== "carriers" && <ErrorBanner onRetry={queue.reload}>{queue.error}</ErrorBanner>}
      {tab === "toShip" && (
        <>
        <Table
          loading={queue.loading}
          rowKey="orderNumber"
          rows={queue.data?.toShip}
          onRowClick={(r) => open(r.orderNumber)}
          empty="Nothing waiting to ship."
          columns={[
            { key: "orderNumber", label: "Order", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.orderNumber}</span> },
            { key: "placedAt", label: "Placed", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.placedAt)}</span> },
            { key: "customer", label: "Customer", render: (r) => <span className="line-clamp-1">{r.customer}</span> },
            { key: "country", label: "Country", render: (r) => <span className="font-mono text-xs">{r.country}</span> },
            { key: "method", label: "Method", render: (r) => <span className="text-xs">{label(r.method)}</span> },
            { key: "status", label: "Order status", render: (r) => <StatusPill status={r.status} /> },
            { key: "unitsToShip", label: "Units to ship", align: "right", render: (r) => <b>{num(r.unitsToShip)}</b> },
            { key: "openShipments", label: "Open shipments", align: "right", render: (r) => (r.openShipments ? <Pill tone="blue">{num(r.openShipments)} preparing</Pill> : "—") },
          ]}
        />
        <Pagination page={page} limit={PAGE} total={queue.data?.toShipPaging?.total} onPage={setPage} />
        </>
      )}
      {tab === "active" && (
        <>
        <Table
          loading={queue.loading}
          rowKey="shipmentNumber"
          rows={queue.data?.active}
          onRowClick={(r) => open(r.orderNumber)}
          empty="No active shipments."
          columns={[
            { key: "shipmentNumber", label: "Shipment", render: (r) => <span className="font-mono text-xs font-semibold">{r.shipmentNumber}</span> },
            { key: "orderNumber", label: "Order", render: (r) => <span className="font-mono text-xs text-brand-700">{r.orderNumber}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "carrier", label: "Carrier", render: (r) => <span className="text-xs">{r.carrier}</span> },
            { key: "trackingNumber", label: "Tracking", render: (r) => <span className="font-mono text-xs">{r.trackingNumber || "—"}</span> },
            { key: "updatedAt", label: "Last update", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.updatedAt)}</span> },
          ]}
        />
        <Pagination page={activePage} limit={PAGE} total={queue.data?.activePaging?.total} onPage={setActivePage} />
        </>
      )}
      {tab === "carriers" && <Carriers />}
    </div>
  );
}

function Carriers() {
  const { can } = useAdminAuth();
  const list = useApi("/api/admin/shipping/carriers");
  const [edit, setEdit] = useState(null);
  const manage = can("shipping.manage");
  return (
    <div className="flex flex-col gap-3">
      <Notice icon="Info">
        Tracking links are built from the carrier template: it must start with <code>https://</code> and contain <code>{"{tracking}"}</code>, e.g. <code>https://www.dhl.com/track?id={"{tracking}"}</code>. Inactive carriers can’t be chosen for new shipments.
      </Notice>
      {manage && (
        <div>
          <Btn size="sm" variant="primary" icon="Plus" onClick={() => setEdit({ isNew: true, code: "", name: "", trackingUrlTemplate: "", isActive: true })}>Add carrier</Btn>
        </div>
      )}
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="code"
        rows={list.data?.carriers}
        empty="No carriers configured."
        columns={[
          { key: "code", label: "Code", render: (c) => <span className="font-mono text-xs font-semibold">{c.code}</span> },
          { key: "name", label: "Name" },
          { key: "adapter", label: "Integration", render: (c) => <span className="text-xs text-ink-500">{c.adapter}</span> },
          { key: "tpl", label: "Tracking link template", render: (c) => <span className="line-clamp-1 max-w-sm break-all font-mono text-[11px] text-ink-500">{c.trackingUrlTemplate || "—"}</span> },
          { key: "active", label: "Status", render: (c) => (c.isActive ? <Pill tone="green">active</Pill> : <Pill tone="gray">inactive</Pill>) },
          ...(manage ? [{ key: "act", label: "", render: (c) => <Btn size="sm" variant="ghost" icon="Pencil" onClick={() => setEdit({ ...c, trackingUrlTemplate: c.trackingUrlTemplate || "" })}>Edit</Btn> }] : []),
        ]}
      />
      {edit && <CarrierModal carrier={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), list.reload())} />}
    </div>
  );
}

function CarrierModal({ carrier, onClose, onSaved }) {
  const [f, setF] = useState(carrier);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const tpl = f.trackingUrlTemplate.trim();
  const tplErr = tpl && (!/^https:\/\//.test(tpl) || !tpl.includes("{tracking}")) ? "Must start with https:// and contain {tracking}." : "";
  const codeErr = carrier.isNew && f.code && !/^[a-z0-9_]{2,30}$/.test(f.code) ? "2–30 lowercase letters, digits or _." : "";
  async function save() {
    setBusy(true);
    setErr("");
    try {
      await apiFetch(`/api/admin/shipping/carriers/${encodeURIComponent(f.code)}`, { method: "PUT", body: { name: f.name.trim(), trackingUrlTemplate: tpl, isActive: f.isActive } });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={carrier.isNew ? "Add carrier" : `Edit carrier ${carrier.code}`}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon="Save" disabled={busy || !f.code || !f.name.trim() || Boolean(tplErr) || Boolean(codeErr)} onClick={save}>Save</Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {carrier.isNew && (
          <Field label="Code" error={codeErr} hint="Permanent identifier, e.g. bluedart">
            <input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} maxLength={30} />
          </Field>
        )}
        <Field label="Name">
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} />
        </Field>
        <Field label="Tracking link template" error={tplErr} hint="Leave empty if the carrier has no public tracking page.">
          <input className={`${inputCls} font-mono text-xs`} value={f.trackingUrlTemplate} onChange={(e) => setF({ ...f, trackingUrlTemplate: e.target.value })} maxLength={500} placeholder="https://carrier.example/track?n={tracking}" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Active (available for new shipments)
        </label>
        <ErrorBanner>{err}</ErrorBanner>
      </div>
    </Modal>
  );
}
