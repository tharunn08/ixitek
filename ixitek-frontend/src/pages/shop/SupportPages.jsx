// Support hub (/support), ticket view (/support/tickets/:number) and order
// tracking (/track-order).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { ShopPage, ErrorNote, InfoNote, FormField, StatusBadge, Skeleton, btnPrimary, btnSecondary, inputCls } from "../../components/shop/ui.jsx";

const CATS = [["order", "Order / delivery"], ["technical", "Technical question"], ["billing", "Billing & invoices"], ["shipping", "Shipping & customs"], ["returns", "Returns & warranty"], ["account", "Account & company"], ["other", "Other"]];

export default function SupportPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, isAuthenticated } = useAdminAuth();
  const [f, setF] = useState({ name: session?.name || "", email: session?.email || "", subject: params.get("subject") || "", category: params.get("category") || "other", orderNumber: params.get("order") || "", message: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    if (isAuthenticated) apiFetch("/api/account/tickets").then((r) => setMine(r.tickets)).catch(() => {});
  }, [isAuthenticated]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiFetch("/api/support/tickets", { method: "POST", body: f });
      navigate(`/support/tickets/${r.ticketNumber}?token=${encodeURIComponent(r.accessToken)}`, { state: { created: true } });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const tiles = [
    { to: "/track-order", icon: "Truck", title: "Track an order", text: "Status, shipments and carrier tracking." },
    { to: isAuthenticated ? "/account/orders" : "/login", icon: "Undo2", title: "Returns & warranty", text: "Open the delivered order and choose “Request a return”." },
    { to: "/quick-order", icon: "ListChecks", title: "Quick order / BOM", text: "Order by part number or upload a bill of materials." },
    { to: "/rfq", icon: "FileText", title: "Request a quotation", text: "Volume pricing, custom items and project quotes." },
    { to: isAuthenticated ? "/account/invoices" : "/login", icon: "Receipt", title: "Invoices & payments", text: "Download invoices and see payment status." },
    { to: "/contact", icon: "Phone", title: "Contact us", text: "Phone, email and office details." },
  ];

  return (
    <ShopPage title="Help & support" crumbs={[{ label: "Support" }]}>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} to={t.to} className="group flex gap-3 rounded-xl border border-ink-100 p-4 hover:border-brand-300 hover:bg-brand-50/40">
            <Icon name={t.icon} className="h-6 w-6 shrink-0 text-brand-600" />
            <span><span className="block font-semibold text-ink-900 group-hover:text-brand-700">{t.title}</span><span className="text-sm text-ink-500">{t.text}</span></span>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} className="rounded-xl border border-ink-200 p-5">
          <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Open a support ticket</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Name" required><input required value={f.name} onChange={set("name")} className={inputCls} autoComplete="name" /></FormField>
            <FormField label="Email" required><input required type="email" value={f.email} onChange={set("email")} className={inputCls} autoComplete="email" /></FormField>
            <FormField label="Topic"><select value={f.category} onChange={set("category")} className={inputCls}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
            <FormField label="Order number (if any)"><input value={f.orderNumber} onChange={set("orderNumber")} className={`${inputCls} font-mono`} placeholder="IXT-2026-000123" /></FormField>
            <FormField label="Subject" required className="sm:col-span-2"><input required minLength={3} value={f.subject} onChange={set("subject")} className={inputCls} maxLength={200} /></FormField>
            <FormField label="How can we help?" required className="sm:col-span-2"><textarea required minLength={5} rows={5} value={f.message} onChange={set("message")} className={inputCls} /></FormField>
          </div>
          <ErrorNote className="mt-3">{err}</ErrorNote>
          <button disabled={busy} className={`${btnPrimary} mt-4`}><Icon name="Send" className="h-4 w-4" /> Send</button>
          <p className="mt-2 text-xs text-ink-400">You'll receive an email with a private link to follow the conversation.</p>
        </form>
        <aside className="flex flex-col gap-3">
          {mine && (
            <div className="rounded-xl border border-ink-100 p-4">
              <h2 className="mb-2 font-display text-base font-bold text-ink-900">Your tickets</h2>
              {mine.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {mine.map((t) => (
                    <li key={t.ticketNumber} className="flex items-center justify-between gap-2">
                      <Link to={`/support/tickets/${t.ticketNumber}`} className="min-w-0 truncate font-semibold text-brand-700 hover:underline">{t.subject}</Link>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">No tickets yet.</p>
              )}
            </div>
          )}
          <InfoNote icon="FileText">For pricing or availability of multiple items, a <Link to="/rfq" className="font-semibold underline">quotation request</Link> gets you a formal PDF quote.</InfoNote>
        </aside>
      </div>
    </ShopPage>
  );
}

export function TicketPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch(`/api/support/tickets/${encodeURIComponent(number)}${q}`).then((r) => setT(r.ticket)).catch((e) => setErr(e.status === 404 ? "Ticket not found. Use the link from your email or sign in." : e.message));
  }, [number, q]);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiFetch(`/api/support/tickets/${encodeURIComponent(number)}/messages${q}`, { method: "POST", body: { body: reply } });
      setT(r.ticket);
      setReply("");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  if (!t) return <ShopPage title={`Ticket ${number}`}>{err ? <ErrorNote>{err}</ErrorNote> : <Skeleton className="h-64" />}</ShopPage>;
  return (
    <ShopPage title={t.subject} crumbs={[{ label: "Support", to: "/support" }, { label: t.ticketNumber }]} actions={<StatusBadge status={t.status} />} narrow>
      <p className="mb-4 text-sm text-ink-500">{t.ticketNumber} · {t.category}{t.orderNumber && <> · order <span className="font-mono">{t.orderNumber}</span></>}</p>
      <ol className="flex flex-col gap-3">
        {t.messages.map((m) => (
          <li key={m.id} className={`rounded-xl border p-4 text-sm ${m.staff ? "border-brand-100 bg-brand-50/50" : "border-ink-100"}`}>
            <div className="mb-1 text-xs text-ink-500"><b className="text-ink-800">{m.staff ? `${m.author} (IXITEK)` : m.author}</b> · {new Date(m.at).toLocaleString()}</div>
            <p className="whitespace-pre-line text-ink-800">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status !== "closed" ? (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2">
          <textarea required rows={4} value={reply} onChange={(e) => setReply(e.target.value)} className={inputCls} aria-label="Your reply" placeholder="Write a reply" />
          <button disabled={busy || !reply.trim()} className={`${btnPrimary} self-start`}>Send reply</button>
        </form>
      ) : (
        <InfoNote className="mt-4">This ticket is closed. <Link to="/support" className="font-semibold underline">Open a new ticket</Link> if you still need help.</InfoNote>
      )}
      <ErrorNote className="mt-3">{err}</ErrorNote>
    </ShopPage>
  );
}

export function TrackOrderPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAdminAuth();
  const [n, setN] = useState("");
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    if (isAuthenticated) apiFetch("/api/shop/orders").then((r) => setRecent(r.orders.slice(0, 10))).catch(() => {});
  }, [isAuthenticated]);
  return (
    <ShopPage title="Track your order" crumbs={[{ label: "Track order" }]} narrow>
      <form onSubmit={(e) => (e.preventDefault(), navigate(`/order/${encodeURIComponent(n.trim().toUpperCase())}`))} className="flex flex-col gap-3 rounded-xl border border-ink-200 p-5 sm:flex-row sm:items-end">
        <FormField label="Order number" className="flex-1"><input required value={n} onChange={(e) => setN(e.target.value)} className={`${inputCls} font-mono`} placeholder="IXT-2026-000123" /></FormField>
        <button className={btnPrimary}>Find order</button>
      </form>
      {!isAuthenticated && <InfoNote className="mt-4">Guest orders are protected: open the private link in your order confirmation email, or <Link to="/login" state={{ from: "/track-order" }} className="font-semibold underline">sign in</Link> with the account used to order.</InfoNote>}
      {recent && recent.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 font-display text-base font-bold text-ink-900">Your recent orders</h2>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {recent.map((o) => (
              <li key={o.orderNumber} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link to={`/order/${o.orderNumber}`} className="font-mono font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
          <Link to="/account/orders" className={`${btnSecondary} mt-3`}>All orders</Link>
        </div>
      )}
    </ShopPage>
  );
}
