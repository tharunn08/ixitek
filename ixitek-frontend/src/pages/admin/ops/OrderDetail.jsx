// Admin → Order detail: status, payments/refunds, invoices and shipments for one order.
// All amounts are server strings, formatted with money() — never computed here.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE } from "../../../lib/api.js";
import { useAdminAuth } from "../../../context/AdminAuthContext.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { PageHeader, Btn, Pill, ErrorBanner, Notice, Card, Field, inputCls, Table, Modal, useApi, dt, num } from "../../../components/admin/kit/index.jsx";
import { money, Money, StatusPill, label, useAction, ReasonModal, newKey, dateOnly } from "./common.jsx";

const SHIPMENT_DRIVEN = ["shipped", "in_transit", "out_for_delivery", "delivered"];
const SHIPPABLE = ["confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery"];
const pdfHref = (invoiceNumber) => `${API_BASE}/api/admin/finance/invoices/${encodeURIComponent(invoiceNumber)}.pdf`;
const isZero = (v) => v === null || v === undefined || v === "" || Number(v) === 0;

export default function OrderDetail() {
  const { number } = useParams();
  const { can } = useAdminAuth();
  const enc = encodeURIComponent(number);
  const od = useApi(`/api/admin/commerce/orders/${enc}`);
  const fin = useApi(`/api/admin/finance/orders/${enc}/payments`);
  const shp = useApi(`/api/admin/shipping/orders/${enc}`);
  const reloadAll = () => (od.reload(), fin.reload(), shp.reload());
  const order = od.data?.order;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/orders" className="focus-ring inline-flex w-fit items-center gap-1 rounded text-xs font-semibold text-brand-700 hover:underline">
        <Icon name="ArrowLeft" className="h-3.5 w-3.5" /> All orders
      </Link>
      <PageHeader
        icon="ShoppingCart"
        title={`Order ${number}`}
        subtitle={order ? `Placed ${dt(order.placedAt)} · ${label(order.source)} · ${order.country || "—"} · ${order.incoterm || "—"}${order.shippingMethod ? ` · ${label(order.shippingMethod)}` : ""}` : undefined}
        actions={
          order && (
            <>
              <StatusPill status={order.status} />
              <StatusPill status={order.paymentStatus} />
              <Pill tone="gray">{label(order.paymentMethod)}</Pill>
              <Btn size="sm" icon="RefreshCw" onClick={reloadAll}>Refresh</Btn>
            </>
          )
        }
      />
      <ErrorBanner onRetry={od.reload}>{od.error}</ErrorBanner>
      {od.loading && !order && <div className="h-40 animate-pulse rounded-xl bg-ink-100" />}
      {order && (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
              <ItemsCard order={order} reservations={od.data.reservations} />
              <TotalsCard order={order} />
            </div>
            <div className="flex flex-col gap-5">
              <CustomerCard order={order} />
              <AddressesCard addresses={order.addresses} />
            </div>
          </div>
          <StatusCard order={order} transitions={od.data.transitions} can={can} onDone={reloadAll} />
          <PaymentsCard order={order} fin={fin} can={can} onDone={reloadAll} />
          <InvoicesCard order={order} fin={fin} can={can} onDone={reloadAll} />
          <ShipmentsCard order={order} shp={shp} can={can} onDone={reloadAll} />
        </>
      )}
    </div>
  );
}

function Row({ k, children, strong }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-sm ${strong ? "border-t border-ink-100 pt-2 font-bold text-ink-900" : "text-ink-600"}`}>
      <dt>{k}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function ItemsCard({ order, reservations }) {
  return (
    <Card title={`Line items (${order.items.length})`} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2">Item</th>
              <th scope="col" className="px-3 py-2">HS code</th>
              <th scope="col" className="px-3 py-2 text-right">Qty</th>
              <th scope="col" className="px-3 py-2 text-right">Shipped</th>
              <th scope="col" className="px-3 py-2 text-right">Returned</th>
              <th scope="col" className="px-3 py-2 text-right">Unit</th>
              <th scope="col" className="px-3 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-t border-ink-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-mono text-xs font-semibold text-ink-800">{i.sku}</div>
                  <div className="line-clamp-2 text-xs text-ink-500">{i.name}</div>
                  {i.attributes?.length > 0 && <div className="mt-0.5 text-[11px] text-ink-400">{i.attributes.map((a) => (typeof a === "object" ? `${a.name || a.label}: ${a.value}` : String(a))).join(" · ")}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-500">{i.hsCode || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(i.qty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(i.qtyShipped)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(i.qtyReturned)}</td>
                <td className="px-3 py-2 text-right">
                  <Money amount={i.unitPrice} currency={order.currency} />
                  {!isZero(i.discount) && <div className="text-[11px] text-ink-400">−{money(i.discount, order.currency)}</div>}
                </td>
                <td className="px-3 py-2 text-right font-semibold"><Money amount={i.lineTotal} currency={order.currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reservations?.length > 0 && (
        <div className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
          <span className="font-semibold text-ink-700">Stock reservations: </span>
          {reservations.map((r, idx) => (
            <span key={idx} className="mr-3 whitespace-nowrap">
              <span className="font-mono">{r.sku}</span> × {num(r.qty)} @ {r.warehouse} <span className="text-ink-400">({label(r.status)})</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function TotalsCard({ order }) {
  const t = order.totals;
  const c = order.currency;
  const optional = [
    ["Discount", t.discount, true],
    ["Freight", t.freight],
    ["Insurance", t.insurance],
    ["Customs duty (estimate)", t.customsEstimate],
    ["Import tax (estimate)", t.importTaxEstimate],
    ["Tax", t.tax],
    ["Handling", t.handling],
    ["Other charges", t.otherCharges],
  ].filter(([, v]) => !isZero(v));
  return (
    <Card title={`Totals (${c})`}>
      <div className="grid gap-5 md:grid-cols-2">
        <dl>
          <Row k="Subtotal"><Money amount={t.subtotal} currency={c} /></Row>
          {optional.map(([k, v, neg]) => (
            <Row key={k} k={k}>{neg ? "−" : ""}{money(v, c)}</Row>
          ))}
          {order.gst && (
            <div className="my-1 rounded-md bg-ink-50 px-2 py-1.5 text-xs text-ink-600">
              <div className="mb-0.5">GST · place of supply {order.gst.placeOfSupply.name} ({order.gst.placeOfSupply.code}) · {order.gst.supplyType === "intra_state" ? "intra-state" : "inter-state"}{order.gst.rateBasis === "effective" ? " · quoted tax (effective rate)" : ""}</div>
              <div className="flex justify-between"><span>Taxable value</span><span className="tabular-nums">{money(order.gst.taxable, c)}</span></div>
              {order.gst.supplyType === "intra_state" ? (
                <>
                  <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{money(order.gst.cgst, c)}</span></div>
                  <div className="flex justify-between"><span>{order.gst.stateTaxLabel}</span><span className="tabular-nums">{money(order.gst.sgst, c)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{money(order.gst.igst, c)}</span></div>
              )}
            </div>
          )}
          <Row k="Order total" strong>{money(t.total, c)}</Row>
          {!isZero(t.tds) && <Row k="TDS withheld by buyer">{money(t.tds, c)}</Row>}
          <Row k="Paid">{money(t.amountPaid, c)}</Row>
          {!isZero(t.amountRefunded) && <Row k="Refunded">{money(t.amountRefunded, c)}</Row>}
          <Row k="Balance due" strong>{money(t.balanceDue, c)}</Row>
          {order.totalUsd && <Row k="Total in USD (internal)"><span className="text-xs text-ink-400">{money(order.totalUsd, "USD")}{order.exchangeRate ? ` @ ${order.exchangeRate}` : ""}</span></Row>}
        </dl>
        <div className="flex flex-col gap-3">
          {(t.importChargesEstimate || t.landedEstimate) && (
            <dl className="rounded-lg bg-ink-50 px-3 py-2">
              {t.importChargesEstimate && <Row k="Estimated import charges (payable at destination, not included)">{money(t.importChargesEstimate, c)}</Row>}
              {t.landedEstimate && <Row k="Estimated landed cost">{money(t.landedEstimate, c)}</Row>}
            </dl>
          )}
          {order.components?.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Estimate components</h3>
              <ul className="divide-y divide-ink-100 text-xs">
                {order.components.map((comp) => (
                  <li key={comp.key} className="flex items-start justify-between gap-2 py-1.5">
                    <div>
                      <div className="font-medium text-ink-700">{comp.label}</div>
                      <div className="text-[11px] text-ink-400">
                        {comp.paidAt === "invoice" ? "On invoice" : comp.paidAt === "destination_import" ? "Paid at import" : "Buyer arranged"} · {label(comp.status)}
                        {comp.note ? ` · ${comp.note}` : ""}
                      </div>
                    </div>
                    <span className="tabular-nums text-ink-700">{comp.amount === null ? "—" : money(comp.amount, c)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {order.disclaimer && <Notice tone="amber" icon="AlertTriangle">{order.disclaimer}</Notice>}
        </div>
      </div>
    </Card>
  );
}

function CustomerCard({ order }) {
  const cu = order.customer;
  return (
    <Card title="Customer">
      <dl className="flex flex-col gap-1 text-sm">
        <div className="font-semibold text-ink-900">{cu.company || cu.name}</div>
        {cu.company && <div className="text-ink-600">{cu.name}</div>}
        <a className="text-brand-700 hover:underline" href={`mailto:${cu.email}`}>{cu.email}</a>
        {cu.phone && <div className="text-ink-600">{cu.phone}</div>}
        {cu.taxId && <div className="text-xs text-ink-500">Tax ID: <span className="font-mono">{cu.taxId}</span></div>}
        {cu.poNumber && <div className="text-xs text-ink-500">PO number: <span className="font-mono">{cu.poNumber}</span></div>}
        {order.paymentTerms && <div className="text-xs text-ink-500">Payment terms: {label(order.paymentTerms)}</div>}
        {order.notes && <div className="mt-2 rounded-lg bg-ink-50 px-2.5 py-2 text-xs text-ink-600"><span className="font-semibold">Customer note: </span>{order.notes}</div>}
      </dl>
    </Card>
  );
}

function AddressesCard({ addresses }) {
  const types = Object.keys(addresses || {});
  return (
    <Card title="Addresses">
      {!types.length && <p className="text-sm text-ink-400">No addresses recorded.</p>}
      <div className="flex flex-col gap-4">
        {types.map((t) => {
          const a = addresses[t];
          return (
            <address key={t} className="text-sm not-italic text-ink-700">
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label(t)}</div>
              <div className="font-medium">{a.contactName}</div>
              {a.companyName && <div>{a.companyName}</div>}
              <div>{a.line1}</div>
              {a.line2 && <div>{a.line2}</div>}
              <div>{[a.city, a.stateCode ? `${a.state} (${a.stateCode})` : a.state, a.postalCode].filter(Boolean).join(", ")}</div>
              <div className="font-mono text-xs">{a.countryCode}</div>
              {a.phone && <div className="text-xs text-ink-500">{a.phone}</div>}
              {a.taxId && <div className="text-xs text-ink-500">{a.countryCode === "IN" ? "GSTIN" : "Tax ID"}: {a.taxId}</div>}
            </address>
          );
        })}
      </div>
    </Card>
  );
}

function StatusCard({ order, transitions, can, onDone }) {
  const [run, busy, error] = useAction();
  const [note, setNote] = useState("");
  const [memo, setMemo] = useState("");
  const [visible, setVisible] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const manual = (transitions || []).filter((t) => !SHIPMENT_DRIVEN.includes(t));
  const shipOnly = (transitions || []).some((t) => SHIPMENT_DRIVEN.includes(t));
  const enc = encodeURIComponent(order.orderNumber);
  const change = (status, n) => run(`/api/admin/commerce/orders/${enc}/status`, { body: { status, note: n } }, () => (setNote(""), setCancelOpen(false), onDone()));
  const addNote = () => run(`/api/admin/commerce/orders/${enc}/notes`, { body: { note: memo.trim(), customerVisible: visible } }, () => (setMemo(""), setVisible(false), onDone()));
  const canManage = can("orders.manage");

  return (
    <Card title="Status & history">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ErrorBanner>{error}</ErrorBanner>
          {canManage && manual.length > 0 && (
            <>
              <Field label="Note for this status change (optional)">
                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {manual.map((t) =>
                  t === "cancelled" ? (
                    can("orders.cancel") && <Btn key={t} variant="danger" size="sm" icon="Ban" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel order</Btn>
                  ) : (
                    <Btn key={t} variant="primary" size="sm" icon="ArrowRight" disabled={busy} onClick={() => change(t, note.trim())}>Mark {label(t)}</Btn>
                  )
                )}
              </div>
            </>
          )}
          {!manual.length && <p className="text-sm text-ink-500">No manual status changes are available from “{label(order.status)}”.</p>}
          {shipOnly && <Notice icon="Truck">Shipped, in transit and delivered are set automatically from the shipments below, so stock and tracking stay in sync.</Notice>}
          {canManage && (
            <div className="flex flex-col gap-2 border-t border-ink-100 pt-3">
              <Field label="Add a note to the order history" hint="Internal by default — only staff see it unless you tick “Show to customer”.">
                <textarea className={inputCls} rows={2} value={memo} maxLength={1000} onChange={(e) => setMemo(e.target.value)} />
              </Field>
              <div className="flex items-center gap-3">
                <Btn size="sm" icon="MessageSquare" disabled={busy || !memo.trim()} onClick={addNote}>Add note</Btn>
                <label className="flex items-center gap-1.5 text-xs text-ink-600"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show to customer</label>
              </div>
            </div>
          )}
        </div>
        <ol className="flex flex-col gap-0 border-l border-ink-100 pl-4">
          {[...(order.history || [])].reverse().map((h, idx) => (
            <li key={idx} className="relative pb-3">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {h.from && h.from !== h.to && (<><StatusPill status={h.from} /><Icon name="ArrowRight" className="h-3 w-3 text-ink-300" /></>)}
                {h.from === h.to ? <Pill tone={h.internal ? "amber" : "gray"}>{h.internal ? "internal note" : "note"}</Pill> : <StatusPill status={h.to} />}
                <span className="text-ink-400">{dt(h.at)}</span>
              </div>
              {h.note && <p className="mt-0.5 whitespace-pre-line text-sm text-ink-700">{h.note}</p>}
            </li>
          ))}
          {!order.history?.length && <li className="text-sm text-ink-400">No history yet.</li>}
        </ol>
      </div>
      {cancelOpen && (
        <ReasonModal open title={`Cancel order ${order.orderNumber}`} confirmLabel="Cancel order" danger busy={busy} onClose={() => setCancelOpen(false)} onConfirm={(reason) => change("cancelled", reason)}>
          <p>Cancelling releases any reserved stock. Refund captured payments separately from the Payments section.</p>
          <ErrorBanner>{error}</ErrorBanner>
        </ReasonModal>
      )}
    </Card>
  );
}

function PaymentsCard({ order, fin, can, onDone }) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [refundFor, setRefundFor] = useState(null);
  const payments = fin.data?.payments || [];
  const refunds = fin.data?.refunds || [];
  const showFees = payments.some((p) => "merchantPaymentCost" in p);
  const canRefund = can("payments.refund");
  const cols = [
    { key: "at", label: "Date", render: (p) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(p.paidAt || p.createdAt)}</span> },
    { key: "provider", label: "Provider", render: (p) => <div><div className="font-medium">{label(p.provider)}</div>{p.method && p.method !== p.provider && <div className="text-[11px] text-ink-400">{label(p.method)}{p.international ? " · intl" : ""}</div>}</div> },
    { key: "ref", label: "Reference", render: (p) => <div className="font-mono text-xs">{p.providerPaymentId || p.reference || "—"}{p.verifiedVia && <div className="font-sans text-[11px] text-ink-400">via {label(p.verifiedVia)}</div>}</div> },
    { key: "status", label: "Status", render: (p) => <div><StatusPill status={p.status} />{p.errorDescription && <div className="mt-0.5 max-w-[200px] text-[11px] text-red-600">{p.errorDescription}</div>}</div> },
    { key: "amount", label: "Amount", align: "right", render: (p) => <b>{money(p.amount, p.currency)}</b> },
    { key: "refunded", label: "Refunded", align: "right", render: (p) => (isZero(p.amountRefunded) ? "—" : money(p.amountRefunded, p.currency)) },
    ...(showFees
      ? [
          { key: "fee", label: "Gateway fee", align: "right", render: (p) => money(p.paymentGatewayFee, p.currency) },
          { key: "feeTax", label: "Tax on fee", align: "right", render: (p) => money(p.paymentGatewayTax, p.currency) },
          { key: "cost", label: "Merchant cost", align: "right", render: (p) => <span title={p.feeSource ? `Source: ${p.feeSource}` : undefined}>{money(p.merchantPaymentCost, p.currency)}{p.feeSource === "estimated" && <span className="ml-1 text-[10px] text-amber-700">est.</span>}</span> },
        ]
      : []),
    ...(canRefund ? [{ key: "act", label: "", render: (p) => ["captured", "partially_refunded"].includes(p.status) && <Btn size="sm" icon="Undo2" onClick={() => setRefundFor(p)}>Refund</Btn> }] : []),
  ];
  return (
    <Card
      title="Payments & refunds"
      actions={can("payments.record") && !recordOpen && order.status !== "cancelled" && <Btn size="sm" variant="primary" icon="Landmark" onClick={() => setRecordOpen(true)}>Record bank transfer</Btn>}
    >
      <div className="flex flex-col gap-4">
        <ErrorBanner onRetry={fin.reload}>{fin.error}</ErrorBanner>
        {showFees && <Notice icon="Lock">Gateway fee, tax on fee and merchant cost are internal finance figures — never shown to customers.</Notice>}
        {recordOpen && <RecordPaymentForm order={order} onCancel={() => setRecordOpen(false)} onDone={() => (setRecordOpen(false), onDone())} />}
        <Table rows={payments} loading={fin.loading} columns={cols} empty="No payments recorded yet." />
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Refunds</h3>
          <Table
            rows={refunds}
            loading={fin.loading}
            empty="No refunds."
            columns={[
              { key: "createdAt", label: "Created", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.createdAt)}</span> },
              { key: "paymentId", label: "Payment", render: (r) => <span className="font-mono text-xs">#{r.paymentId}</span> },
              { key: "amount", label: "Amount", align: "right", render: (r) => <b>{money(r.amount, r.currency)}</b> },
              { key: "status", label: "Status", render: (r) => <div><StatusPill status={r.status} />{r.error && <div className="mt-0.5 max-w-[220px] text-[11px] text-red-600">{r.error}</div>}</div> },
              { key: "reason", label: "Reason", render: (r) => <span className="line-clamp-2 max-w-xs text-xs">{r.reason}</span> },
              { key: "ref", label: "Reference", render: (r) => <span className="font-mono text-xs">{r.providerRefundId || "—"}</span> },
              { key: "by", label: "By", render: (r) => <span className="text-xs text-ink-500">{r.createdBy || "—"}</span> },
            ]}
          />
        </div>
      </div>
      {refundFor && <RefundModal payment={refundFor} onClose={() => setRefundFor(null)} onDone={() => (setRefundFor(null), onDone())} />}
    </Card>
  );
}

function RecordPaymentForm({ order, onCancel, onDone }) {
  const [run, busy, error] = useAction();
  const [f, setF] = useState({ amount: "", reference: "", provider: "bank_transfer", method: "", paidOn: "", note: "" });
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const body = { amount: f.amount.trim(), reference: f.reference.trim(), provider: f.provider };
    if (f.method.trim()) body.method = f.method.trim();
    if (f.paidOn) body.paidOn = f.paidOn;
    if (f.note.trim()) body.note = f.note.trim();
    run(`/api/admin/finance/orders/${encodeURIComponent(order.orderNumber)}/payments`, { body }, onDone);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
      <div className="text-sm font-semibold text-ink-800">Record a received payment <span className="font-normal text-ink-500">— balance due {money(order.totals.balanceDue, order.currency)}</span></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Amount received (${order.currency})`}>
          <input className={inputCls} inputMode="decimal" required value={f.amount} onChange={up("amount")} placeholder="0.00" />
        </Field>
        <Field label="Bank / UTR reference">
          <input className={inputCls} required minLength={3} maxLength={120} value={f.reference} onChange={up("reference")} />
        </Field>
        <Field label="Received on">
          <input type="date" className={inputCls} value={f.paidOn} onChange={up("paidOn")} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={f.provider} onChange={up("provider")}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="manual">Other manual payment</option>
          </select>
        </Field>
        <Field label="Method (optional)" hint="e.g. SWIFT, NEFT, RTGS, cheque">
          <input className={inputCls} maxLength={30} value={f.method} onChange={up("method")} />
        </Field>
        <Field label="Internal note (optional)">
          <input className={inputCls} maxLength={1000} value={f.note} onChange={up("note")} />
        </Field>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex gap-2">
        <Btn type="submit" variant="primary" icon="Check" disabled={busy}>Record payment</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

function RefundModal({ payment, onClose, onDone }) {
  const [run, busy, error] = useAction();
  const [key] = useState(() => newKey("refund"));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const manual = payment.provider !== "razorpay";
  const ok = reason.trim().length >= 3 && (!manual || reference.trim().length >= 3);
  const submit = () => {
    const body = { reason: reason.trim(), idempotencyKey: key };
    if (amount.trim()) body.amount = amount.trim();
    if (manual) body.reference = reference.trim();
    run(`/api/admin/finance/payments/${encodeURIComponent(payment.id)}/refund`, { body }, onDone);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund payment #${payment.id}`}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" icon="Undo2" disabled={busy || !ok} onClick={submit}>Issue refund</Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-500">
          Paid {money(payment.amount, payment.currency)}{isZero(payment.amountRefunded) ? "" : `, already refunded ${money(payment.amountRefunded, payment.currency)}`}.{" "}
          {manual ? "Send the refund from the bank first, then record it here with the bank reference." : "The refund is sent through Razorpay."}
        </p>
        <Field label={`Amount (${payment.currency})`} hint="Leave blank to refund the full refundable amount.">
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Full refundable amount" />
        </Field>
        <Field label="Reason (saved in the audit log)">
          <textarea className={inputCls} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {manual && (
          <Field label="Bank reference of the refund sent">
            <input className={inputCls} maxLength={50} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    </Modal>
  );
}

function InvoicesCard({ order, fin, can, onDone }) {
  const [run, busy, error] = useAction();
  const [voiding, setVoiding] = useState(null);
  const invoices = fin.data?.invoices || [];
  const manage = can("finance.manage");
  const enc = encodeURIComponent(order.orderNumber);
  const issue = (type) => run(`/api/admin/finance/orders/${enc}/invoices`, { body: { type } }, onDone);
  const doVoid = (reason) => run(`/api/admin/finance/invoices/${encodeURIComponent(voiding.number)}/void`, { body: { reason } }, () => (setVoiding(null), onDone()));
  return (
    <Card
      title="Invoices"
      actions={
        manage && order.status !== "cancelled" && (
          <div className="flex gap-2">
            <Btn size="sm" icon="FileText" disabled={busy} onClick={() => issue("proforma")}>Issue proforma</Btn>
            <Btn size="sm" variant="primary" icon="Receipt" disabled={busy} onClick={() => issue("tax_invoice")}>Issue tax invoice</Btn>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {!voiding && <ErrorBanner>{error}</ErrorBanner>}
        <Table
          rows={invoices}
          rowKey="number"
          loading={fin.loading}
          empty="No invoices issued for this order."
          columns={[
            { key: "number", label: "Invoice", render: (i) => <a className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand-700 hover:underline" href={pdfHref(i.number)} target="_blank" rel="noopener noreferrer">{i.number}<Icon name="ExternalLink" className="h-3 w-3" /></a> },
            { key: "type", label: "Type", render: (i) => label(i.type) },
            { key: "status", label: "Status", render: (i) => <div><StatusPill status={i.status} />{i.voidReason && <div className="mt-0.5 max-w-[220px] text-[11px] text-ink-500">{i.voidReason}</div>}</div> },
            { key: "total", label: "Total", align: "right", render: (i) => money(i.total, i.currency) },
            { key: "issuedAt", label: "Issued", render: (i) => <span className="text-xs text-ink-500">{dt(i.issuedAt)}</span> },
            { key: "dueDate", label: "Due", render: (i) => <span className="text-xs text-ink-500">{i.dueDate ? dateOnly(i.dueDate) : "—"}</span> },
            ...(manage ? [{ key: "act", label: "", render: (i) => i.status !== "void" && <Btn size="sm" variant="ghost" icon="Ban" onClick={() => setVoiding(i)}>Void</Btn> }] : []),
          ]}
        />
      </div>
      {voiding && (
        <ReasonModal open title={`Void invoice ${voiding.number}`} confirmLabel="Void invoice" danger busy={busy} onClose={() => setVoiding(null)} onConfirm={doVoid}>
          <p>The invoice number stays in the register, marked void. Issue a new invoice afterwards if needed.</p>
          <ErrorBanner>{error}</ErrorBanner>
        </ReasonModal>
      )}
    </Card>
  );
}

function ShipmentsCard({ order, shp, can, onDone }) {
  const manage = can("shipping.manage");
  const shipments = shp.data?.shipments || [];
  const remaining = shp.data?.remaining || [];
  const left = remaining.some((r) => r.remaining > 0);
  const [creating, setCreating] = useState(false);
  return (
    <Card
      title="Shipments"
      actions={manage && left && SHIPPABLE.includes(order.status) && !creating && <Btn size="sm" variant="primary" icon="PackagePlus" onClick={() => setCreating(true)}>Create shipment</Btn>}
    >
      <div className="flex flex-col gap-4">
        <ErrorBanner onRetry={shp.reload}>{shp.error}</ErrorBanner>
        {manage && left && !SHIPPABLE.includes(order.status) && <Notice tone="amber" icon="AlertTriangle">Shipments can be created once the order is confirmed (current status: {label(order.status)}).</Notice>}
        {creating && <CreateShipmentForm order={order} remaining={remaining} onCancel={() => setCreating(false)} onDone={() => (setCreating(false), onDone())} />}
        {shp.loading && !shp.data && <div className="h-20 animate-pulse rounded-lg bg-ink-100" />}
        {shp.data && !shipments.length && !creating && <p className="text-sm text-ink-400">No shipments yet.</p>}
        {shipments.map((s) => <ShipmentBlock key={s.number} s={s} manage={manage} onDone={onDone} />)}
      </div>
    </Card>
  );
}

function ShipmentBlock({ s, manage, onDone }) {
  const [run, busy, error, setError] = useAction();
  const [f, setF] = useState({ status: "", trackingNumber: s.trackingNumber || "", trackingUrl: s.trackingUrl || "", location: "", description: "" });
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const needsTracking = f.status === "shipped" && !["own", "other"].includes(s.carrier);
  const submit = (e) => {
    e.preventDefault();
    if (needsTracking && !f.trackingNumber.trim()) return setError("Enter the tracking number before marking as shipped.");
    const body = { status: f.status };
    if (f.trackingNumber.trim() !== (s.trackingNumber || "")) body.trackingNumber = f.trackingNumber.trim();
    if (f.trackingUrl.trim() !== (s.trackingUrl || "")) body.trackingUrl = f.trackingUrl.trim();
    if (f.location.trim()) body.location = f.location.trim();
    if (f.description.trim()) body.description = f.description.trim();
    run(`/api/admin/shipping/shipments/${encodeURIComponent(s.number)}/status`, { body }, () => (setF((x) => ({ ...x, status: "", location: "", description: "" })), onDone()));
  };
  return (
    <article className="rounded-lg border border-ink-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2 text-sm">
        <span className="font-mono text-xs font-bold text-ink-900">{s.number}</span>
        <StatusPill status={s.status} />
        <span className="text-ink-600">{s.carrierName}{s.service ? ` · ${s.service}` : ""}</span>
        {s.trackingNumber && (s.trackingUrl ? (
          <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-brand-700 hover:underline">{s.trackingNumber}<Icon name="ExternalLink" className="h-3 w-3" /></a>
        ) : <span className="font-mono text-xs">{s.trackingNumber}</span>)}
        <span className="ml-auto text-xs text-ink-500">
          {num(s.packages)} pkg{s.weightKg ? ` · ${s.weightKg} kg` : ""}{s.estimatedDelivery ? ` · ETA ${dateOnly(s.estimatedDelivery)}` : ""}{s.shippedAt ? ` · shipped ${dt(s.shippedAt)}` : ""}{s.deliveredAt ? ` · delivered ${dt(s.deliveredAt)}` : ""}
        </span>
      </header>
      <div className="grid gap-4 p-3 lg:grid-cols-3">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Items</h4>
          <ul className="text-xs text-ink-700">
            {s.items.map((i) => <li key={i.orderItemId}><span className="font-mono">{i.sku}</span> × {num(i.qty)}</li>)}
          </ul>
          {s.notes && <p className="mt-2 text-xs text-ink-500"><span className="font-semibold">Notes: </span>{s.notes}</p>}
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Tracking events</h4>
          <ol className="flex flex-col gap-1.5 border-l border-ink-100 pl-3">
            {[...s.events].reverse().map((ev, idx) => (
              <li key={idx} className="text-xs">
                <div className="flex items-center gap-1.5"><StatusPill status={ev.status} /><span className="text-ink-400">{dt(ev.at)}</span></div>
                {(ev.location || ev.description) && <div className="text-ink-600">{[ev.location, ev.description].filter(Boolean).join(" — ")}</div>}
              </li>
            ))}
          </ol>
        </div>
        {manage && s.transitions?.length > 0 && (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Update status</h4>
            <Field label="New status">
              <select className={inputCls} required value={f.status} onChange={up("status")}>
                <option value="">Choose…</option>
                {s.transitions.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </Field>
            <Field label={`Tracking number${needsTracking ? " (required)" : ""}`}>
              <input className={inputCls} maxLength={100} value={f.trackingNumber} onChange={up("trackingNumber")} />
            </Field>
            <Field label="Tracking URL" hint="https:// — leave as is to keep the current link">
              <input className={inputCls} type="url" maxLength={500} value={f.trackingUrl} onChange={up("trackingUrl")} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Location"><input className={inputCls} maxLength={200} value={f.location} onChange={up("location")} /></Field>
              <Field label="Description"><input className={inputCls} maxLength={500} value={f.description} onChange={up("description")} /></Field>
            </div>
            {f.status === "shipped" && <Notice icon="Info">Marking as shipped deducts the items from stock and notifies the customer.</Notice>}
            <ErrorBanner>{error}</ErrorBanner>
            <div><Btn type="submit" variant={f.status === "cancelled" ? "danger" : "primary"} size="sm" icon="Check" disabled={busy || !f.status}>Update shipment</Btn></div>
          </form>
        )}
      </div>
    </article>
  );
}

function CreateShipmentForm({ order, remaining, onCancel, onDone }) {
  const carriers = useApi("/api/admin/shipping/carriers");
  const [run, busy, error, setError] = useAction();
  const open = remaining.filter((r) => r.remaining > 0);
  const [qty, setQty] = useState(() => Object.fromEntries(open.map((r) => [r.orderItemId, String(r.remaining)])));
  const [f, setF] = useState({ carrier: "", trackingNumber: "", trackingUrl: "", packages: "1", weightKg: "", estimatedDelivery: "", notes: "" });
  const up = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const nameOf = (id) => order.items.find((i) => i.id === id)?.name || "";
  const submit = (e) => {
    e.preventDefault();
    const items = open.map((r) => ({ orderItemId: r.orderItemId, qty: Math.floor(Number(qty[r.orderItemId]) || 0) })).filter((l) => l.qty > 0);
    if (!items.length) return setError("Enter a quantity for at least one item.");
    const bad = open.find((r) => Number(qty[r.orderItemId]) > r.remaining);
    if (bad) return setError(`${bad.sku}: only ${bad.remaining} left to ship.`);
    const body = { carrier: f.carrier, items, packages: Number.parseInt(f.packages, 10) || 1 };
    for (const k of ["trackingNumber", "trackingUrl", "weightKg", "estimatedDelivery", "notes"]) if (f[k].trim()) body[k] = f[k].trim();
    run(`/api/admin/shipping/orders/${encodeURIComponent(order.orderNumber)}/shipments`, { body }, onDone);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
      <div className="text-sm font-semibold text-ink-800">New shipment</div>
      <ErrorBanner onRetry={carriers.reload}>{carriers.error}</ErrorBanner>
      <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2">Item</th>
              <th scope="col" className="px-3 py-2 text-right">Ordered</th>
              <th scope="col" className="px-3 py-2 text-right">Left to ship</th>
              <th scope="col" className="px-3 py-2 text-right">This shipment</th>
            </tr>
          </thead>
          <tbody>
            {open.map((r) => (
              <tr key={r.orderItemId} className="border-t border-ink-100">
                <td className="px-3 py-1.5"><div className="font-mono text-xs font-semibold">{r.sku}</div><div className="line-clamp-1 text-[11px] text-ink-400">{nameOf(r.orderItemId)}</div></td>
                <td className="px-3 py-1.5 text-right tabular-nums">{num(r.qty)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{num(r.remaining)}</td>
                <td className="px-3 py-1.5 text-right">
                  <input type="number" min={0} max={r.remaining} step={1} className={`${inputCls} ml-auto w-24 py-1 text-right`} aria-label={`Quantity of ${r.sku} in this shipment`} value={qty[r.orderItemId] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [r.orderItemId]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Carrier">
          <select className={inputCls} required value={f.carrier} onChange={up("carrier")}>
            <option value="">Choose…</option>
            {carriers.data?.carriers.filter((c) => c.isActive).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Tracking number" hint="Can be added later, before marking shipped.">
          <input className={inputCls} maxLength={100} value={f.trackingNumber} onChange={up("trackingNumber")} />
        </Field>
        <Field label="Tracking URL" hint="Optional — built from the carrier template if empty.">
          <input className={inputCls} type="url" maxLength={500} value={f.trackingUrl} onChange={up("trackingUrl")} placeholder="https://" />
        </Field>
        <Field label="Packages"><input type="number" min={1} step={1} className={inputCls} value={f.packages} onChange={up("packages")} /></Field>
        <Field label="Weight (kg)"><input type="number" min={0} step="0.001" className={inputCls} value={f.weightKg} onChange={up("weightKg")} /></Field>
        <Field label="Estimated delivery"><input type="date" className={inputCls} value={f.estimatedDelivery} onChange={up("estimatedDelivery")} /></Field>
        <Field label="Internal notes" className="sm:col-span-3"><textarea className={inputCls} rows={2} maxLength={1000} value={f.notes} onChange={up("notes")} /></Field>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex gap-2">
        <Btn type="submit" variant="primary" icon="PackagePlus" disabled={busy || !f.carrier}>Create shipment</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
