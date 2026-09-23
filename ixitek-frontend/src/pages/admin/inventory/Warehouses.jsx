import { useState } from "react";
import { apiFetch } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { PageHeader, Table, Pill, Btn, Modal, Field, inputCls, ErrorBanner, useApi, num } from "../../../components/admin/kit/index.jsx";

const EMPTY = { code: "", name: "", countryCode: "", city: "", address: "", isActive: true, isDefault: false };

export default function Warehouses() {
  const { can } = useAdminAuth();
  const list = useApi("/api/admin/inventory/warehouses");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try {
      await apiFetch(edit.id ? `/api/admin/inventory/warehouses/${edit.id}` : "/api/admin/inventory/warehouses", { method: edit.id ? "PUT" : "POST", body: edit });
      setEdit(null);
      list.reload();
    } catch (e) {
      setErr(e.message);
    }
  }
  const f = (k) => ({ value: edit?.[k] ?? "", onChange: (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }) });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="Warehouse" title="Warehouses" subtitle="Stock locations. Add only real locations — none are assumed." actions={can("inventory.warehouses") && <Btn variant="primary" icon="Plus" onClick={() => setEdit({ ...EMPTY })}>Add warehouse</Btn>} />
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rows={list.data?.warehouses}
        empty="No warehouses yet."
        onRowClick={can("inventory.warehouses") ? (w) => setEdit(w) : undefined}
        columns={[
          { key: "code", label: "Code", render: (w) => <b className="font-mono">{w.code}</b> },
          { key: "name", label: "Name" },
          { key: "loc", label: "Location", render: (w) => [w.city, w.countryCode].filter(Boolean).join(", ") || "—" },
          { key: "skus", label: "SKUs stocked", align: "right", render: (w) => num(w.totals.skus) },
          { key: "onHand", label: "Units on hand", align: "right", render: (w) => num(w.totals.onHand) },
          { key: "st", label: "", render: (w) => <span className="flex gap-1">{w.isDefault && <Pill tone="blue">default</Pill>}<Pill tone={w.isActive ? "green" : "gray"}>{w.isActive ? "active" : "inactive"}</Pill></span> },
        ]}
      />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.code}` : "Add warehouse"} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" icon="Save" onClick={save}>Save</Btn></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" hint="e.g. IN-BLR"><input className={`${inputCls} uppercase`} {...f("code")} /></Field>
          <Field label="Name"><input className={inputCls} {...f("name")} /></Field>
          <Field label="Country (ISO-2)"><input maxLength={2} className={`${inputCls} uppercase`} {...f("countryCode")} /></Field>
          <Field label="City"><input className={inputCls} {...f("city")} /></Field>
          <Field label="Address" className="col-span-2"><input className={inputCls} {...f("address")} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(edit?.isActive)} onChange={f("isActive").onChange} /> Active</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(edit?.isDefault)} onChange={f("isDefault").onChange} /> Default warehouse</label>
          <div className="col-span-2"><ErrorBanner>{err}</ErrorBanner></div>
        </div>
      </Modal>
    </div>
  );
}
