// OrderPage — order confirmation, payment, documents, tracking, returns.
// Guests reach it with the private link from their email (?token=…);
// signed-in customers and company colleagues with their session.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { GstBreakdown, ShopPage, StatusBadge, ErrorNote, InfoNote, Skeleton, money, dateStr, btnPrimary, btnSecondary, inputCls, FormField, openPdf, loadRazorpay } from "../../components/shop/ui.jsx";

export default function OrderPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAdminAuth();
  const { refresh: refreshCart } = useCart();
  const [order, setOrder] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const autoPay = useRef(Boolean(location.state?.pay));
  const q = token ? `?token=${encodeURIComponent(token)}` : "";

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/shop/orders/${encodeURIComponent(number)}${q}`);
      setOrder(r.order);
      setErr("");
      return r.order;
    } catch (e) {
      setErr(e.status === 404 ? "notfound" : e.message);
      return null;
    }
  }, [number, q]);
  useEffect(() => {
    load();
    apiFetch("/api/pay/config").then(setCfg).catch(() => {});
  }, [load]);

  const payable = order && order.paymentMethod === "razorpay" && ["pending_payment", "payment_failed"].includes(order.status) && Number(order.totals.balanceDue) > 0;

  const pay = useCallback(async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const [Razorpay, start] = await Promise.all([loadRazorpay(), apiFetch(`/api/pay/orders/${encodeURIComponent(number)}/razorpay${q}`, { method: "POST", body: {} })]);
      await new Promise((resolve) => {
        const rzp = new Razorpay({
          key: start.keyId,
          amount: start.amount,
          currency: start.currency,
          order_id: start.razorpayOrderId,
          name: start.name,
          description: start.description,
          prefill: start.prefill,
          notes: { ixitek_order: start.orderNumber },
          theme: { color: "#0b4f9c" },
          handler: async (resp) => {
            try {
              const v = await apiFetch(`/api/pay/orders/${encodeURIComponent(number)}/razorpay/verify${q}`, { method: "POST", body: resp });
              setOrder(v.order);
              setMsg(v.status === "paid" ? "Payment received — thank you. Your order is confirmed." : v.message || "Payment is being confirmed. We'll email you shortly.");
            } catch (e) {
              setErr(e.message);
            }
            resolve();
          },
          modal: { ondismiss: () => (setMsg("Payment window closed. You can pay any time from this page."), resolve()) },
        });
        rzp.on("payment.failed", (r) => setErr(r?.error?.description ? `Payment failed: ${r.error.description}. No money was taken for this attempt — you can try again.` : "Payment failed. You can try again."));
        rzp.open();
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      load();
    }
  }, [number, q, load]);

  useEffect(() => {
    if (order && autoPay.current && payable && cfg?.razorpay?.enabled) {
      autoPay.current = false;
      pay();
    }
  }, [order, payable, cfg, pay]);

  const doc = async (path) => {
    setErr("");
    try {
      await openPdf(path);
    } catch (e) {
      setErr(e.message);
    }
  };
  const approve = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/shop/orders/${encodeURIComponent(number)}/approve`, { method: "POST", body: {} });
      setOrder(r.order);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reorder = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/shop/orders/${encodeURIComponent(number)}/reorder${q}`, { method: "POST", body: {} });
      await refreshCart();
      navigate("/cart", { state: { reorderSkipped: r.skipped } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (err === "notfound")
    return (
      <ShopPage title="Order not found" narrow>
        <InfoNote>We couldn't find this order for your account. Open the link from your order email, or <Link to="/login" state={{ from: `/order/${number}` }} className="font-semibold underline">sign in</Link> with the account that placed it.</InfoNote>
      </ShopPage>
    );
  if (!order) return <ShopPage title={`Order ${number}`}>{err ? <ErrorNote>{err}</ErrorNote> : <Skeleton className="h-96" />}</ShopPage>;

  const cur = order.currency;
  const t = order.totals;
  const canReturn = session && ["shipped", "in_transit", "out_for_delivery", "delivered"].includes(order.status);

  return (
    <ShopPage title={`Order ${order.orderNumber}`} crumbs={session ? [{ label: "My account", to: "/account" }, { label: "Orders", to: "/account/orders" }, { label: order.orderNumber }] : [{ label: "Order" }]} actions={<div className="flex flex-wrap gap-2"><StatusBadge status={order.status} /><StatusBadge status={order.paymentStatus} /></div>}>
      {location.state?.justPlaced && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <Icon name="CheckCircle2" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Thank you — order {order.orderNumber} has been placed.</p>
            <p>A confirmation has been sent to {order.customer.email}. {!session && "Keep the link in that email to view this order later."}</p>
          </div>
        </div>
      )}
      {msg && <InfoNote className="mb-4" icon="CheckCircle2">{msg}</InfoNote>}
      <ErrorNote className="mb-4">{err}</ErrorNote>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {order.status === "pending_approval" && (
            <InfoNote icon="ShieldCheck">
              This order exceeds your company's approval limit and is waiting for a company approver.
              {["admin", "approver"].includes(session?.companyRole) && <button disabled={busy} onClick={approve} className="ml-2 font-semibold underline">Approve order</button>}
            </InfoNote>
          )}
          {payable && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
              <p className="text-sm text-ink-800">Amount due: <b className="tabular-nums">{money(t.balanceDue, cur)}</b></p>
              {cfg?.razorpay?.enabled ? (
                <button disabled={busy} onClick={pay} className={`${btnPrimary} mt-2`}><Icon name={busy ? "Loader2" : "CreditCard"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Pay {money(t.balanceDue, cur)} securely</button>
              ) : (
                <p className="mt-1 text-sm text-ink-600">Online payment is temporarily unavailable. Please contact us to pay by bank transfer.</p>
              )}
              {cfg?.razorpay?.mode === "test" && <p className="mt-2 text-xs font-semibold text-amber-700">Test mode — no real money is charged.</p>}
            </div>
          )}
          {order.paymentMethod === "bank_transfer" && Number(t.balanceDue) > 0 && order.status !== "cancelled" && (
            <div className="rounded-xl border border-ink-200 p-4 text-sm">
              <h2 className="mb-1 font-display text-base font-bold text-ink-900">Pay by bank transfer</h2>
              <p className="text-ink-700">Amount due: <b className="tabular-nums">{money(t.balanceDue, cur)}</b> · Reference: <b className="font-mono">{order.orderNumber}</b></p>
              <p className="mt-1 whitespace-pre-line text-ink-600">{cfg?.bankTransferInstructions || "Our team will email you the bank details for this order."}</p>
              <button onClick={() => doc(`/api/pay/orders/${encodeURIComponent(order.orderNumber)}/proforma.pdf${q}`)} className={`${btnSecondary} mt-3`}><Icon name="FileDown" className="h-4 w-4" /> Proforma invoice (PDF)</button>
            </div>
          )}

          <section>
            <h2 className="mb-2 font-display text-lg font-bold text-ink-900">Items</h2>
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Shipped</th><th className="px-3 py-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-t border-ink-100">
                      <td className="px-3 py-2"><div className="font-semibold text-ink-900">{i.name}</div><div className="font-mono text-xs text-ink-500">{i.sku}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(i.unitPrice, cur)}</td>
                      <td className="px-3 py-2 text-right">{i.qty}</td>
                      <td className="px-3 py-2 text-right text-ink-500">{i.qtyShipped}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(i.lineTotal, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {order.shipments.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-bold text-ink-900">Shipments &amp; tracking</h2>
              <div className="flex flex-col gap-3">
                {order.shipments.map((s) => (
                  <div key={s.number} className="rounded-xl border border-ink-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm"><b>{s.carrierName}</b>{s.trackingNumber && <> · <span className="font-mono">{s.trackingNumber}</span></>} {s.trackingUrl && <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="ml-1 font-semibold text-brand-700 hover:underline">Track on carrier site →</a>}</div>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{s.items.map((i) => `${i.sku} × ${i.qty}`).join(", ")}{s.estimatedDelivery && ` · Estimated delivery ${dateStr(s.estimatedDelivery)}`}</p>
                    <ol className="mt-3 border-l border-ink-200 pl-4">
                      {[...s.events].reverse().map((e, i) => (
                        <li key={i} className="relative pb-2 text-xs">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
                          <b className="capitalize text-ink-800">{e.status.replace(/_/g, " ")}</b> <span className="text-ink-400">{new Date(e.at).toLocaleString()}</span>
                          {(e.location || e.description) && <div className="text-ink-600">{[e.location, e.description].filter(Boolean).join(" — ")}</div>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            {["shipping", "billing"].map((k) => {
              const a = order.addresses[k];
              return (
                <div key={k} className="rounded-xl border border-ink-100 p-4 text-sm">
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{k} address</h3>
                  {a ? <p className="whitespace-pre-line text-ink-700">{[a.companyName, a.contactName, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.countryCode, a.phone, a.taxId && `${a.countryCode === "IN" ? "GSTIN" : "Tax ID"}: ${a.taxId}`].filter(Boolean).join("\n")}</p> : "—"}
                </div>
              );
            })}
          </section>

          {canReturn && <ReturnForm order={order} onDone={(n) => setMsg(`Return request ${n} submitted. We'll email you the next steps.`)} />}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-ink-200 p-4 text-sm">
            <h2 className="mb-2 font-display text-base font-bold text-ink-900">Summary</h2>
            <dl className="flex flex-col gap-1">
              <Row k="Placed" v={new Date(order.placedAt).toLocaleString()} />
              <Row k="Ship to" v={order.country} />
              <Row k="Incoterm" v={order.incoterm} />
              {order.shippingMethod && <Row k="Shipping" v={order.shippingMethod.toUpperCase()} />}
              {order.customer.poNumber && <Row k="Your PO" v={order.customer.poNumber} />}
            </dl>
            <dl className="mt-3 flex flex-col gap-1 border-t border-ink-100 pt-3">
              <Row k="Products" v={money(t.subtotal, cur)} />
              {Number(t.discount) > 0 && <Row k="Discount" v={`− ${money(t.discount, cur)}`} />}
              {Number(t.freight) > 0 && <Row k="Freight" v={money(t.freight, cur)} />}
              {Number(t.insurance) > 0 && <Row k="Insurance" v={money(t.insurance, cur)} />}
              {Number(t.tax) > 0 && <Row k={order.gst ? "Taxes (GST included)" : "Taxes & duties (included)"} v={money(t.tax, cur)} />}
              {order.gst && <GstBreakdown gst={order.gst} currency={cur} className="my-1" />}
              {Number(t.handling) > 0 && <Row k="Handling" v={money(t.handling, cur)} />}
              {Number(t.otherCharges) > 0 && <Row k="Other charges" v={money(t.otherCharges, cur)} />}
              <Row k="Total" v={money(t.total, cur)} strong />
              {Number(t.amountPaid) > 0 && <Row k="Paid" v={money(t.amountPaid, cur)} />}
              {Number(t.amountRefunded) > 0 && <Row k="Refunded" v={money(t.amountRefunded, cur)} />}
              {t.importChargesEstimate && <Row k="Est. import charges (payable at destination)" v={money(t.importChargesEstimate, cur)} />}
              {t.tds && <Row k="TDS (withheld by you)" v={money(t.tds, cur)} />}
            </dl>
            {order.disclaimer && <p className="mt-2 text-[11px] leading-snug text-ink-400">{order.disclaimer}</p>}
          </div>

          {(order.invoices.length > 0 || order.payments.length > 0) && (
            <div className="rounded-xl border border-ink-100 p-4 text-sm">
              <h2 className="mb-2 font-display text-base font-bold text-ink-900">Documents &amp; payments</h2>
              <ul className="flex flex-col gap-1.5">
                {order.invoices.map((i) => (
                  <li key={i.number} className="flex items-center justify-between gap-2">
                    <button onClick={() => doc(`/api/pay/orders/${encodeURIComponent(order.orderNumber)}/invoices/${encodeURIComponent(i.number)}.pdf${q}`)} className="flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"><Icon name="FileDown" className="h-4 w-4" /> {i.number}</button>
                    <span className="text-xs text-ink-500">{i.type.replace(/_/g, " ")} · {money(i.total, i.currency)}</span>
                  </li>
                ))}
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-ink-600">
                    <span>{p.provider === "razorpay" ? "Online payment" : p.provider.replace(/_/g, " ")} {p.method ? `(${p.method})` : ""}</span>
                    <span className="flex items-center gap-2"><StatusBadge status={p.status} /> {money(p.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-ink-100 p-4 text-sm">
            <h2 className="mb-2 font-display text-base font-bold text-ink-900">History</h2>
            <ol className="flex flex-col gap-1.5 text-xs">
              {[...order.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span>{h.from === h.to ? <b className="text-ink-700">Note</b> : <StatusBadge status={h.to} />} {h.note && <span className="text-ink-500">{h.note}</span>}</span>
                  <span className="shrink-0 text-ink-400">{dateStr(h.at)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            <button disabled={busy} onClick={reorder} className={btnSecondary}><Icon name="RotateCcw" className="h-4 w-4" /> Order these items again</button>
            <Link to={`/support?order=${encodeURIComponent(order.orderNumber)}&category=order`} className={btnSecondary}><Icon name="LifeBuoy" className="h-4 w-4" /> Get help with this order</Link>
          </div>
        </aside>
      </div>
    </ShopPage>
  );
}

function Row({ k, v, strong }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold text-ink-900" : "text-ink-600"}`}>
      <dt>{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  );
}

const KINDS = [["return", "Return for refund"], ["replacement", "Replacement"], ["repair", "Repair"], ["warranty", "Warranty claim"], ["refund", "Refund only"]];
const REASONS = [["damaged_in_transit", "Damaged in transit"], ["defective", "Defective"], ["wrong_item", "Wrong item received"], ["not_as_described", "Not as described"], ["no_longer_needed", "No longer needed"], ["warranty_fault", "Fault within warranty"], ["other", "Other"]];

function ReturnForm({ order, onDone }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("return");
  const [reason, setReason] = useState("defective");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className={`${btnSecondary} self-start`}><Icon name="Undo2" className="h-4 w-4" /> Request a return, replacement or warranty repair</button>;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const items = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([orderItemId, v]) => ({ orderItemId, qty: Number(v) }));
      const r = await apiFetch(`/api/account/orders/${encodeURIComponent(order.orderNumber)}/returns`, { method: "POST", body: { kind, reason, notes, items } });
      setOpen(false);
      onDone(r.rmaNumber);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-xl border border-ink-200 p-4">
      <h2 className="mb-3 font-display text-base font-bold text-ink-900">Return / warranty request</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="What do you need?"><select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
        <FormField label="Reason"><select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {order.items.filter((i) => i.qtyShipped > 0).map((i) => (
            <tr key={i.id} className="border-t border-ink-100">
              <td className="py-1.5"><span className="font-mono text-xs">{i.sku}</span> <span className="text-ink-600">{i.name}</span></td>
              <td className="w-28 py-1.5"><input type="number" min={0} max={i.qtyShipped} value={qty[i.id] || ""} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label={`Quantity to return for ${i.sku}`} className={inputCls} placeholder={`max ${i.qtyShipped}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <FormField label="Describe the problem" required className="mt-3"><textarea required minLength={5} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></FormField>
      <ErrorNote className="mt-3">{err}</ErrorNote>
      <div className="mt-3 flex gap-2">
        <button disabled={busy} className={btnPrimary}>Submit request</button>
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>Cancel</button>
      </div>
    </form>
  );
}
