// Customer portal — dashboard, orders, invoices & payments, quotes & RFQs,
// wishlist, addresses, company account (members, invitations, credit),
// returns, support tickets, profile & password.
import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { StatusBadge, ErrorNote, InfoNote, Empty, Skeleton, FormField, StateField, money, dateStr, btnPrimary, btnSecondary, inputCls, openPdf } from "../../components/shop/ui.jsx";

const PAGE = 25;
/** Previous/next pager for account lists (server-side paging: ?page=&limit=). */
function Pager({ data, page, onPage }) {
  if (!data || !data.total || data.total <= (data.limit || PAGE)) return null;
  const limit = data.limit || PAGE;
  const pages = Math.ceil(data.total / limit);
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-500">
      <span>{(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total}</span>
      <span className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-ink-200 px-2 py-1 font-semibold text-ink-700 disabled:opacity-40" aria-label="Previous page"><Icon name="ChevronLeft" className="h-3.5 w-3.5" /></button>
        <span className="px-1 font-semibold text-ink-700">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border border-ink-200 px-2 py-1 font-semibold text-ink-700 disabled:opacity-40" aria-label="Next page"><Icon name="ChevronRight" className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  );
}

function useLoad(path) {
  const [s, setS] = useState({ data: null, error: "", loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let on = true;
    setS((x) => ({ ...x, loading: true }));
    apiFetch(path)
      .then((data) => on && setS({ data, error: "", loading: false }))
      .catch((e) => on && setS({ data: null, error: e.message, loading: false }));
    return () => {
      on = false;
    };
  }, [path, n]);
  return { ...s, reload: () => setN((x) => x + 1) };
}

const NAV = [
  ["/account", "LayoutDashboard", "Overview", true],
  ["/account/orders", "Package", "Orders"],
  ["/account/quotes", "FileText", "Quotes & RFQs"],
  ["/account/invoices", "Receipt", "Invoices & payments"],
  ["/account/returns", "Undo2", "Returns"],
  ["/account/wishlist", "Heart", "Wishlist"],
  ["/account/addresses", "MapPin", "Addresses"],
  ["/account/company", "Building2", "Company"],
  ["/account/profile", "UserCog", "Profile & security"],
];

export function AccountLayout() {
  const { isAuthenticated, ready, session } = useAdminAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    if (!ready) return <div className="container-page py-10"><Skeleton className="h-64" /></div>;
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <div className="mb-3 rounded-xl bg-ink-50 p-3 text-sm">
          <div className="font-semibold text-ink-900">{session?.name}</div>
          <div className="truncate text-xs text-ink-500">{session?.email}</div>
        </div>
        <nav aria-label="Account" className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(([to, icon, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
              <Icon name={icon} className="h-4 w-4" /> {label}
            </NavLink>
          ))}
          <Link to="/support" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100"><Icon name="LifeBuoy" className="h-4 w-4" /> Support tickets</Link>
        </nav>
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function Panel({ title, children, actions }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function AccountDashboard() {
  const { data, error } = useLoad("/api/account/dashboard");
  const tiles = data && [
    ["Open orders", data.counts.openOrders, "/account/orders", "Package"],
    ["Awaiting payment", data.counts.awaitingPayment, "/account/orders", "CreditCard"],
    ["Quotes to review", data.counts.quotesToReview, "/account/quotes", "FileText"],
    ["Open RFQs", data.counts.openRfqs, "/account/quotes", "ClipboardList"],
    ["Open returns", data.counts.openReturns, "/account/returns", "Undo2"],
    ["Open tickets", data.counts.openTickets, "/support", "LifeBuoy"],
  ];
  return (
    <Panel title="My account" actions={<div className="flex gap-2"><Link to="/quick-order" className={btnSecondary}><Icon name="ListChecks" className="h-4 w-4" /> Quick order</Link><Link to="/rfq" className={btnPrimary}>Request a quote</Link></div>}>
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Skeleton className="h-40" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {tiles.map(([l, v, to, ic]) => (
              <Link key={l} to={to} className="rounded-xl border border-ink-100 p-4 hover:border-brand-300">
                <Icon name={ic} className="h-5 w-5 text-brand-600" />
                <div className="mt-2 font-display text-2xl font-bold tabular-nums text-ink-900">{v}</div>
                <div className="text-xs font-semibold text-ink-500">{l}</div>
              </Link>
            ))}
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900">Recent orders</h2>
          <OrdersTable rows={data.recentOrders} />
        </>
      )}
    </Panel>
  );
}

function OrdersTable({ rows }) {
  if (!rows?.length) return <Empty icon="Package" title="No orders yet" action={<Link to="/catalog" className={btnPrimary}>Browse products</Link>} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Placed</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.orderNumber} className="border-t border-ink-100">
              <td className="px-3 py-2"><Link to={`/order/${o.orderNumber}`} className="font-mono font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>{o.lines !== undefined && <span className="block text-xs text-ink-400">{o.lines} line(s)</span>}</td>
              <td className="px-3 py-2 text-ink-600">{dateStr(o.placedAt)}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2"><StatusBadge status={o.paymentStatus} /></td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(o.total, o.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountOrders() {
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(`/api/shop/orders?page=${page}&limit=${PAGE}`);
  return (
    <Panel title="Orders">
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Skeleton className="h-40" /> : <OrdersTable rows={data.orders} />}
      <Pager data={data} page={page} onPage={setPage} />
    </Panel>
  );
}

export function AccountQuotes() {
  const [qPage, setQPage] = useState(1);
  const [rPage, setRPage] = useState(1);
  const quotes = useLoad(`/api/shop/quotes?page=${qPage}&limit=${PAGE}`);
  const rfqs = useLoad(`/api/shop/rfqs?page=${rPage}&limit=${PAGE}`);
  return (
    <Panel title="Quotes & RFQs" actions={<Link to="/rfq" className={btnPrimary}>New request</Link>}>
      <ErrorNote>{quotes.error || rfqs.error}</ErrorNote>
      <h2 className="font-display text-lg font-bold text-ink-900">Quotations</h2>
      {!quotes.data ? <Skeleton className="h-24" /> : quotes.data.quotes.length ? (
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Quotation</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Valid until</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>
              {quotes.data.quotes.map((q) => (
                <tr key={q.quoteNumber} className="border-t border-ink-100">
                  <td className="px-3 py-2"><Link to={`/quote/${q.quoteNumber}`} className="font-mono font-semibold text-brand-700 hover:underline">{q.label}</Link></td>
                  <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
                  <td className="px-3 py-2 text-ink-600">{dateStr(q.validUntil)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(q.total, q.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-ink-500">No quotations yet.</p>}
      <Pager data={quotes.data} page={qPage} onPage={setQPage} />
      <h2 className="font-display text-lg font-bold text-ink-900">Requests for quotation</h2>
      {!rfqs.data ? <Skeleton className="h-24" /> : rfqs.data.rfqs.length ? (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
          {rfqs.data.rfqs.map((r) => (
            <li key={r.rfqNumber} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <Link to={`/rfq/${r.rfqNumber}`} className="font-mono font-semibold text-brand-700 hover:underline">{r.rfqNumber}</Link>
              <span className="text-xs text-ink-500">{r.lines} line(s) · {r.country} · {dateStr(r.createdAt)}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-500">No requests yet.</p>}
      <Pager data={rfqs.data} page={rPage} onPage={setRPage} />
    </Panel>
  );
}

export function AccountInvoices() {
  const [iPage, setIPage] = useState(1);
  const [pPage, setPPage] = useState(1);
  const inv = useLoad(`/api/account/invoices?page=${iPage}&limit=${PAGE}`);
  const pays = useLoad(`/api/account/payments?page=${pPage}&limit=${PAGE}`);
  const [err, setErr] = useState("");
  return (
    <Panel title="Invoices & payments">
      <ErrorNote>{inv.error || pays.error || err}</ErrorNote>
      <h2 className="font-display text-lg font-bold text-ink-900">Invoices &amp; credit notes</h2>
      {!inv.data ? <Skeleton className="h-24" /> : inv.data.invoices.length ? (
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {inv.data.invoices.map((i) => (
                <tr key={i.number} className="border-t border-ink-100">
                  <td className="px-3 py-2"><button onClick={() => openPdf(i.pdfUrl).catch((e) => setErr(e.message))} className="flex items-center gap-1.5 font-mono font-semibold text-brand-700 hover:underline"><Icon name="FileDown" className="h-4 w-4" />{i.number}</button><span className="text-xs text-ink-400">{i.type.replace(/_/g, " ")}</span></td>
                  <td className="px-3 py-2"><Link to={`/order/${i.orderNumber}`} className="font-mono text-xs text-ink-600 hover:underline">{i.orderNumber}</Link></td>
                  <td className="px-3 py-2 text-ink-600">{dateStr(i.issuedAt)}{i.dueDate && <span className="block text-xs text-ink-400">due {dateStr(i.dueDate)}</span>}</td>
                  <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(i.total, i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-ink-500">No invoices yet. Tax invoices are issued when an order is paid (or dispatched on credit terms).</p>}
      <Pager data={inv.data} page={iPage} onPage={setIPage} />
      <h2 className="font-display text-lg font-bold text-ink-900">Payments</h2>
      {!pays.data ? <Skeleton className="h-24" /> : pays.data.payments.length ? (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
          {pays.data.payments.map((p, k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span><Link to={`/order/${p.orderNumber}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{p.orderNumber}</Link> <span className="text-xs text-ink-500">{p.provider === "razorpay" ? "Online" : p.provider.replace(/_/g, " ")} {p.method ? `· ${p.method}` : ""} · {dateStr(p.at)}</span></span>
              <span className="flex items-center gap-2"><StatusBadge status={p.status} /><b className="tabular-nums">{money(p.amount, p.currency)}</b>{Number(p.refunded) > 0 && <span className="text-xs text-ink-500">refunded {money(p.refunded, p.currency)}</span>}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-500">No payments yet.</p>}
      <Pager data={pays.data} page={pPage} onPage={setPPage} />
    </Panel>
  );
}

export function AccountReturns() {
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(`/api/account/returns?page=${page}&limit=${PAGE}`);
  return (
    <Panel title="Returns & warranty">
      <InfoNote>To start a return, replacement or warranty claim, open a shipped order and choose “Request a return”.</InfoNote>
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Skeleton className="h-24" /> : data.returns.length ? (
        <div className="flex flex-col gap-3">
          {data.returns.map((r) => (
            <div key={r.rmaNumber} className="rounded-xl border border-ink-100 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className="font-mono">{r.rmaNumber}</b> · {r.kind} · order <Link to={`/order/${r.orderNumber}`} className="font-mono text-brand-700 hover:underline">{r.orderNumber}</Link></span>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-ink-500">{r.items.map((i) => `${i.sku} × ${i.qty}`).join(", ")}</p>
              {r.returnInstructions && <p className="mt-2 whitespace-pre-line rounded-lg bg-brand-50 p-2 text-xs text-brand-900">{r.returnInstructions}</p>}
              {r.resolution && <p className="mt-2 text-xs"><b>Resolution:</b> {r.resolution}</p>}
              <ol className="mt-2 text-xs text-ink-600">{r.history.map((h, k) => <li key={k}>{dateStr(h.at)} — {h.status.replace(/_/g, " ")}{h.note ? `: ${h.note}` : ""}</li>)}</ol>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-ink-500">No return requests.</p>}
      <Pager data={data} page={page} onPage={setPage} />
    </Panel>
  );
}

export function AccountWishlist() {
  const { data, error, reload } = useLoad("/api/shop/wishlist");
  const { add } = useCart();
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const buyNow = (slug) => add({ slug, qty: 1 }, { silent: true }).then(() => navigate("/checkout")).catch((e) => setErr(e.message));
  const removeItem = async (slug) => {
    try {
      await apiFetch(`/api/shop/wishlist/${encodeURIComponent(slug)}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Panel title="Wishlist">
      <ErrorNote>{error || err}</ErrorNote>
      {!data ? <Skeleton className="h-24" /> : data.items.length ? (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
          {data.items.map((i) => (
            <li key={i.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <Link to={`/product/${i.slug}`} className="min-w-0"><span className="block font-semibold text-ink-900 hover:text-brand-700">{i.name}</span><span className="font-mono text-xs text-ink-500">{i.sku}</span></Link>
              <span className="flex gap-2">
                <button onClick={() => add({ slug: i.slug, qty: 1 }).catch((e) => setErr(e.message))} className={btnSecondary}><Icon name="ShoppingCart" className="h-4 w-4" /> Add to cart</button>
                <button onClick={() => buyNow(i.slug)} className={btnPrimary}>Buy now</button>
                <button onClick={() => removeItem(i.slug)} className="text-xs font-semibold text-ink-500 hover:text-red-700">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <Empty icon="Heart" title="Your wishlist is empty">Use the heart on a product page to save it here.</Empty>}
    </Panel>
  );
}

const EMPTY_ADDR = { type: "shipping", label: "", contactName: "", companyName: "", line1: "", line2: "", city: "", state: "", postalCode: "", countryCode: "", phone: "", taxId: "", isDefault: false, shared: false };
export function AccountAddresses() {
  const { data, error, reload } = useLoad("/api/account/addresses");
  const { locales } = useLocale();
  const { session } = useAdminAuth();
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      if (edit.id) await apiFetch(`/api/account/addresses/${edit.id}`, { method: "PUT", body: edit });
      else await apiFetch("/api/account/addresses", { method: "POST", body: edit });
      setEdit(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const del = async (id) => {
    try {
      await apiFetch(`/api/account/addresses/${id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <Panel title="Addresses" actions={!edit && <button onClick={() => setEdit({ ...EMPTY_ADDR })} className={btnPrimary}>Add address</button>}>
      <ErrorNote>{error || err}</ErrorNote>
      {edit && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-ink-200 p-4 sm:grid-cols-2">
          <FormField label="Type"><select value={edit.type} onChange={set("type")} className={inputCls}>{[["shipping", "Shipping"], ["billing", "Billing"], ["warehouse", "Warehouse"], ["project_site", "Project site"], ["branch", "Branch"], ["customer_site", "Customer site"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="Label"><input value={edit.label} onChange={set("label")} className={inputCls} placeholder="e.g. Pune plant" /></FormField>
          <FormField label="Contact name" required><input required value={edit.contactName} onChange={set("contactName")} className={inputCls} /></FormField>
          <FormField label="Company"><input value={edit.companyName} onChange={set("companyName")} className={inputCls} /></FormField>
          <FormField label="Address line 1" required className="sm:col-span-2"><input required value={edit.line1} onChange={set("line1")} className={inputCls} /></FormField>
          <FormField label="Address line 2" className="sm:col-span-2"><input value={edit.line2} onChange={set("line2")} className={inputCls} /></FormField>
          <FormField label="City" required><input required value={edit.city} onChange={set("city")} className={inputCls} /></FormField>
          <StateField country={edit.countryCode} value={edit.state} onChange={(v) => setEdit({ ...edit, state: v })} />
          <FormField label="Postal code"><input value={edit.postalCode} onChange={set("postalCode")} className={inputCls} /></FormField>
          <FormField label="Country" required><select required value={edit.countryCode} onChange={set("countryCode")} className={inputCls}><option value="" disabled>Choose…</option>{(locales?.countries || []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></FormField>
          <FormField label="Phone"><input value={edit.phone} onChange={set("phone")} className={inputCls} /></FormField>
          <FormField label={edit.countryCode === "IN" ? "GSTIN" : "Tax ID"}><input value={edit.taxId} onChange={set("taxId")} className={inputCls} /></FormField>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isDefault} onChange={set("isDefault")} /> Default for this type</label>
          {!edit.id && session?.companyId && ["admin", "buyer"].includes(session?.companyRole) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.shared} onChange={set("shared")} /> Share with my company</label>}
          <div className="flex gap-2 sm:col-span-2"><button className={btnPrimary}>Save</button><button type="button" onClick={() => setEdit(null)} className={btnSecondary}>Cancel</button></div>
        </form>
      )}
      {!data ? <Skeleton className="h-24" /> : data.addresses.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.addresses.map((a) => (
            <div key={a.id} className="rounded-xl border border-ink-100 p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">{a.type.replace(/_/g, " ")}{a.isDefault && <span className="rounded bg-brand-50 px-1.5 text-brand-700">default</span>}{a.shared && <span className="rounded bg-ink-100 px-1.5">company</span>}</div>
              <p className="whitespace-pre-line text-ink-700">{[a.label && `${a.label}`, a.companyName, a.contactName, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.countryCode, a.phone].filter(Boolean).join("\n")}</p>
              <div className="mt-2 flex gap-3 text-xs font-semibold">
                <button onClick={() => setEdit({ ...EMPTY_ADDR, ...a })} className="text-brand-700 hover:underline">Edit</button>
                <button onClick={() => del(a.id)} className="text-ink-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : !edit && <Empty icon="MapPin" title="No saved addresses">Addresses you save here appear at checkout.</Empty>}
    </Panel>
  );
}

const ROLES = [["admin", "Company admin"], ["buyer", "Buyer"], ["finance", "Finance"], ["technical", "Technical"], ["approver", "Approver"], ["viewer", "Viewer"]];
export function AccountCompany() {
  const [params] = useSearchParams();
  const joinToken = params.get("token");
  const navigate = useNavigate();
  const { data, error, reload } = useLoad("/api/account/company");
  const { locales } = useLocale();
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [apply, setApply] = useState({ legalName: "", displayName: "", country: "", taxId: "", registrationNo: "" });
  const [invite, setInvite] = useState({ email: "", role: "buyer" });
  const call = async (path, opts, ok) => {
    setErr("");
    setMsg("");
    try {
      await apiFetch(path, opts);
      if (ok) setMsg(ok);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const refreshSessionAndReload = async () => {
    // Company membership is part of the session profile; re-read it after joining/applying.
    await import("../../lib/adminAuth.js").then((m) => m.refreshSession()).catch(() => {});
    reload();
  };

  if (joinToken)
    return (
      <Panel title="Join your company on IXITEK">
        <ErrorNote>{err}</ErrorNote>
        <InfoNote>Accepting links your account to the company that invited you. Orders, quotes and invoices will be shared with its members according to their roles.</InfoNote>
        <button onClick={async () => { try { await apiFetch("/api/account/company/join", { method: "POST", body: { token: joinToken } }); await refreshSessionAndReload(); navigate("/account/company", { replace: true }); } catch (e) { setErr(e.message); } }} className={`${btnPrimary} self-start`}>Accept invitation</button>
      </Panel>
    );

  const c = data?.company;
  return (
    <Panel title="Company account">
      <ErrorNote>{error || err}</ErrorNote>
      {msg && <InfoNote icon="CheckCircle2">{msg}</InfoNote>}
      {!data ? <Skeleton className="h-40" /> : !c ? (
        <form onSubmit={async (e) => { e.preventDefault(); await call("/api/account/company", { method: "POST", body: apply }, "Application received. We'll email you when it's reviewed."); await refreshSessionAndReload(); }} className="grid gap-3 rounded-xl border border-ink-200 p-4 sm:grid-cols-2">
          <p className="text-sm text-ink-600 sm:col-span-2">Buying for a business? Apply for a company account to add colleagues with roles and approvals. After review, IXITEK can set business pricing and credit terms.</p>
          <FormField label="Registered company name" required><input required value={apply.legalName} onChange={(e) => setApply({ ...apply, legalName: e.target.value })} className={inputCls} /></FormField>
          <FormField label="Trading name"><input value={apply.displayName} onChange={(e) => setApply({ ...apply, displayName: e.target.value })} className={inputCls} /></FormField>
          <FormField label="Country" required><select required value={apply.country} onChange={(e) => setApply({ ...apply, country: e.target.value })} className={inputCls}><option value="" disabled>Choose…</option>{(locales?.countries || []).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></FormField>
          <FormField label="Tax ID (GSTIN / VAT)"><input value={apply.taxId} onChange={(e) => setApply({ ...apply, taxId: e.target.value })} className={inputCls} /></FormField>
          <FormField label="Registration number"><input value={apply.registrationNo} onChange={(e) => setApply({ ...apply, registrationNo: e.target.value })} className={inputCls} /></FormField>
          <div className="sm:col-span-2"><button className={btnPrimary}>Apply</button></div>
        </form>
      ) : (
        <>
          <div className="rounded-xl border border-ink-100 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-display text-lg font-bold text-ink-900">{c.legalName}</div><div className="text-xs text-ink-500">{[c.country, c.taxId].filter(Boolean).join(" · ")}</div></div>
              <StatusBadge status={c.status === "pending" ? "pending" : c.status} />
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div><dt className="text-ink-500">Your role</dt><dd className="font-semibold capitalize">{data.myRole}</dd></div>
              <div><dt className="text-ink-500">Payment terms</dt><dd className="font-semibold">{c.paymentTerms === "prepaid" ? "Prepaid" : c.paymentTerms.toUpperCase()}</dd></div>
              {c.orderApprovalThresholdUsd && <div><dt className="text-ink-500">Approval required above</dt><dd className="font-semibold">{money(c.orderApprovalThresholdUsd, "USD")}</dd></div>}
            </dl>
            {data.credit && <p className="mt-3 rounded-lg bg-ink-50 p-2 text-xs">Credit limit {money(data.credit.limitUsd, "USD")} · used {money(data.credit.usedUsd, "USD")} · available <b>{money(data.credit.availableUsd, "USD")}</b></p>}
            {c.status === "pending" && <p className="mt-3 text-xs text-amber-700">Your application is being reviewed.</p>}
          </div>
          <h2 className="font-display text-lg font-bold text-ink-900">Members</h2>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span><b>{m.name}</b> <span className="text-xs text-ink-500">{m.email}</span></span>
                {data.myRole === "admin" ? (
                  <span className="flex items-center gap-2">
                    <select value={m.role} onChange={(e) => call(`/api/account/company/members/${m.id}`, { method: "PATCH", body: { role: e.target.value } }, "Role updated.")} className="rounded-lg border border-ink-200 px-2 py-1 text-xs" aria-label={`Role for ${m.name}`}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <button onClick={() => call(`/api/account/company/members/${m.id}`, { method: "DELETE" }, "Member removed.")} className="text-xs font-semibold text-ink-500 hover:text-red-700">Remove</button>
                  </span>
                ) : <span className="text-xs capitalize text-ink-500">{m.role}</span>}
              </li>
            ))}
          </ul>
          {data.myRole === "admin" && c.status === "approved" && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); call("/api/account/company/invitations", { method: "POST", body: invite }, `Invitation sent to ${invite.email}.`); setInvite({ email: "", role: "buyer" }); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 p-4">
                <FormField label="Invite a colleague" className="min-w-56 flex-1"><input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className={inputCls} placeholder="name@company.com" /></FormField>
                <FormField label="Role"><select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className={inputCls}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
                <button className={btnPrimary}>Send invitation</button>
              </form>
              {data.invitations.length > 0 && (
                <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
                  {data.invitations.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span>{i.email} <span className="text-xs text-ink-500">({i.role})</span></span>
                      <span className="flex items-center gap-2 text-xs"><span className="capitalize text-ink-500">{i.status}</span>{i.status === "pending" && <button onClick={() => call(`/api/account/company/invitations/${i.id}`, { method: "DELETE" }, "Invitation revoked.")} className="font-semibold text-ink-500 hover:text-red-700">Revoke</button>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </Panel>
  );
}

export function AccountProfile() {
  const { session } = useAdminAuth();
  const [p, setP] = useState({ name: session?.name || "", phone: session?.phone || "", company: session?.company || "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const run = async (path, body, ok) => {
    setErr("");
    setMsg("");
    try {
      await apiFetch(path, { method: "PUT", body });
      setMsg(ok);
      await import("../../lib/adminAuth.js").then((m) => m.refreshSession()).catch(() => {});
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Panel title="Profile & security">
      <ErrorNote>{err}</ErrorNote>
      {msg && <InfoNote icon="CheckCircle2">{msg}</InfoNote>}
      <form onSubmit={(e) => (e.preventDefault(), run("/api/account/profile", p, "Profile saved."))} className="grid gap-3 rounded-xl border border-ink-200 p-4 sm:grid-cols-2">
        <FormField label="Name" required><input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className={inputCls} /></FormField>
        <FormField label="Email"><input disabled value={session?.email || ""} className={`${inputCls} bg-ink-50`} /></FormField>
        <FormField label="Phone"><input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} className={inputCls} /></FormField>
        <FormField label="Company"><input value={p.company} onChange={(e) => setP({ ...p, company: e.target.value })} className={inputCls} /></FormField>
        <div className="sm:col-span-2"><button className={btnPrimary}>Save profile</button></div>
      </form>
      <form onSubmit={(e) => (e.preventDefault(), run("/api/account/password", pw, "Password changed."), setPw({ currentPassword: "", newPassword: "" }))} className="grid gap-3 rounded-xl border border-ink-200 p-4 sm:grid-cols-2">
        <FormField label="Current password" required><input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} className={inputCls} /></FormField>
        <FormField label="New password" required hint="At least 8 characters with letters and numbers."><input type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} className={inputCls} /></FormField>
        <div className="sm:col-span-2"><button className={btnPrimary}>Change password</button></div>
      </form>
    </Panel>
  );
}

