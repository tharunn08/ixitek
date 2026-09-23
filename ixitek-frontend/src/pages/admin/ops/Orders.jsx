// Admin → Orders: server-side filtered, paginated order list.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, Table, Pagination, SearchInput, ErrorBanner, useApi, useDebounced, dt, inputCls } from "../../../components/admin/kit/index.jsx";
import { money, StatusPill, label } from "./common.jsx";

const STATUSES = ["pending_approval", "pending_payment", "payment_failed", "confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", "returned", "refunded", "partially_refunded"];
const PAYMENT_STATUSES = ["unpaid", "authorized", "paid", "partially_refunded", "refunded", "failed"];
const LIMIT = 50;

export default function Orders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [country, setCountry] = useState(params.get("country") || "");
  const dq = useDebounced(q);
  const dCountry = useDebounced(country);
  const page = Number(params.get("page") || 1);
  const status = params.get("status") || "";
  const paymentStatus = params.get("paymentStatus") || "";
  const set = (k, v) => {
    if ((params.get(k) || "") === (v || "")) return;
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => set("q", dq), [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => set("country", /^[A-Za-z]{2}$/.test(dCountry) ? dCountry.toUpperCase() : ""), [dCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = new URLSearchParams({ page, limit: LIMIT });
  if (params.get("q")) qs.set("q", params.get("q"));
  if (status) qs.set("status", status);
  if (paymentStatus) qs.set("paymentStatus", paymentStatus);
  if (params.get("country")) qs.set("country", params.get("country"));
  const list = useApi(`/api/admin/commerce/orders?${qs}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon="ShoppingCart" title="Orders" subtitle="Every web, quote and admin order. Open an order to confirm it, record payments, issue invoices and dispatch shipments." />
      <div className="flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Order #, customer, email, company or PO" className="md:w-96" />
        <select className={`${inputCls} md:w-52`} value={status} onChange={(e) => set("status", e.target.value)} aria-label="Order status">
          <option value="">Any order status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className={`${inputCls} md:w-48`} value={paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)} aria-label="Payment status">
          <option value="">Any payment status</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <input className={`${inputCls} md:w-28 uppercase`} value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.replace(/[^A-Za-z]/g, ""))} placeholder="Country" aria-label="Country code (2 letters)" />
      </div>
      <ErrorBanner onRetry={list.reload}>{list.error}</ErrorBanner>
      <Table
        loading={list.loading}
        rowKey="orderNumber"
        rows={list.data?.orders}
        onRowClick={(r) => navigate(`/admin/orders/${encodeURIComponent(r.orderNumber)}`)}
        empty="No orders match these filters."
        columns={[
          { key: "orderNumber", label: "Order", render: (r) => <span className="font-mono text-xs font-semibold text-brand-700">{r.orderNumber}</span> },
          { key: "placedAt", label: "Placed", render: (r) => <span className="whitespace-nowrap text-xs text-ink-500">{dt(r.placedAt)}</span> },
          {
            key: "customer",
            label: "Customer",
            render: (r) => (
              <div className="min-w-0">
                <div className="line-clamp-1 font-medium text-ink-800">{r.company || r.customer}</div>
                <div className="line-clamp-1 text-xs text-ink-400">{r.company ? `${r.customer} · ` : ""}{r.email}</div>
              </div>
            ),
          },
          { key: "country", label: "Country", render: (r) => <span className="font-mono text-xs">{r.country}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          {
            key: "payment",
            label: "Payment",
            render: (r) => (
              <div className="flex flex-col items-start gap-0.5">
                <StatusPill status={r.paymentStatus} />
                <span className="text-[11px] text-ink-400">{label(r.paymentMethod)}</span>
              </div>
            ),
          },
          { key: "total", label: "Total", align: "right", render: (r) => <b className="text-ink-900">{money(r.total, r.currency)}</b> },
        ]}
      />
      <Pagination page={page} limit={LIMIT} total={list.data?.total} onPage={(p) => set("page", String(p))} />
    </div>
  );
}
