// CheckoutPage — contact, addresses, tax ID, shipping & Incoterm, payment
// method, review. The server recalculates everything on submit; if prices,
// FX or charges moved since the customer reviewed them, it refuses and the
// customer confirms the new total. One idempotency key per checkout attempt.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { apiFetch } from "../../lib/api.js";
import { useCart } from "../../context/CartContext.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { EstimateTable } from "../../components/intl/EstimateBox.jsx";
import LocaleSelector from "../../components/intl/LocaleSelector.jsx";
import { ShopPage, ErrorNote, InfoNote, FormField, StateField, Skeleton, btnPrimary, btnSecondary, inputCls, money, newKey } from "../../components/shop/ui.jsx";

const EMPTY_ADDR = { contactName: "", companyName: "", line1: "", line2: "", city: "", state: "", postalCode: "", phone: "" };
const PM_LABEL = {
  razorpay: ["Pay online (card, UPI, net banking)", "Secure payment via Razorpay. Your order is confirmed as soon as the payment is verified."],
  bank_transfer: ["Bank transfer", "Download the proforma invoice after placing the order and quote the order number as the payment reference."],
  purchase_order: ["Purchase order (company credit terms)", "Invoiced on dispatch according to your company's agreed terms."],
};

export default function CheckoutPage() {
  const { cart, refresh, method, setMethod, incoterm, setIncoterm } = useCart();
  const { locale, country, currency } = useLocale();
  const { session, isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();
  const idem = useRef(newKey());
  const [opts, setOpts] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: session?.email || "", name: session?.name || "", phone: session?.phone || "", taxId: "", poNumber: "", notes: "", acceptTerms: false, paymentMethod: "", billingSameAsShipping: true });
  const [ship, setShip] = useState({ ...EMPTY_ADDR, contactName: session?.name || "", companyName: session?.company || "" });
  const [bill, setBill] = useState({ ...EMPTY_ADDR });
  const [changed, setChanged] = useState(null);

  const loadOptions = () =>
    apiFetch("/api/shop/checkout/options", { method: "POST", body: { country: locale?.country, currency, method, incoterm, state: ship.state || undefined } })
      .then((o) => {
        setOpts(o);
        setF((prev) => ({ ...prev, paymentMethod: o.paymentMethods.includes(prev.paymentMethod) ? prev.paymentMethod : o.paymentMethods[0] || "" }));
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    if (locale?.country) loadOptions();
  }, [locale?.country, currency, method, incoterm, cart?.count, ship.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch("/api/pay/config").then(setCfg).catch(() => setCfg(null));
  }, []);

  const est = opts?.cart?.estimate;
  const shipCountry = locale?.country;
  const taxLabel = country?.taxIdLabel || "Tax ID";
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const addrs = useMemo(() => opts?.addresses || [], [opts]);

  const applySaved = (id, target) => {
    const a = addrs.find((x) => String(x.id) === String(id));
    if (!a) return;
    const v = { contactName: a.contact_name, companyName: a.company_name, line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postal_code, phone: a.phone };
    if (target === "ship") {
      if (a.country_code !== shipCountry) return setErr(`That address is in ${a.country_code}. Change "Delivering to" first so prices and duties are calculated for that country.`);
      setShip(v);
      if (a.tax_id && !f.taxId) setF({ ...f, taxId: a.tax_id });
    } else setBill({ ...v, countryCode: a.country_code });
  };

  const place = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const body = {
        ...f,
        currency,
        shippingMethod: method || est?.shipping?.method || undefined,
        incoterm: incoterm || est?.incoterm.code,
        shipping: { ...ship, countryCode: shipCountry, taxId: f.taxId },
        billing: f.billingSameAsShipping ? undefined : { ...bill, countryCode: bill.countryCode || shipCountry },
        idempotencyKey: idem.current,
        expectedTotal: est?.totals.payable,
      };
      const out = await apiFetch("/api/shop/checkout/place", { method: "POST", body });
      await refresh();
      navigate(`/order/${out.orderNumber}?token=${encodeURIComponent(out.accessToken)}`, { replace: true, state: { justPlaced: true, pay: f.paymentMethod === "razorpay" } });
    } catch (e2) {
      if (e2.status === 409 && e2.details?.newTotal) {
        setChanged(e2.details);
        idem.current = newKey();
        loadOptions();
      } else setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (!opts && !err) return <ShopPage title="Checkout"><Skeleton className="h-96" /></ShopPage>;
  if (opts && !opts.cart.items.length)
    return (
      <ShopPage title="Checkout">
        <InfoNote>Your cart is empty. <Link to="/catalog" className="font-semibold underline">Browse products</Link></InfoNote>
      </ShopPage>
    );

  const blocked = est && !est.canCheckout;

  return (
    <ShopPage title="Checkout" crumbs={[{ label: "Cart", to: "/cart" }, { label: "Checkout" }]}>
      {!isAuthenticated && (
        <InfoNote className="mb-4" icon="User">
          Checking out as a guest. <Link to="/login" state={{ from: "/checkout" }} className="font-semibold underline">Sign in</Link> to use saved addresses, company terms and order history. Your cart is kept.
        </InfoNote>
      )}
      <form onSubmit={place} className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          <Section n="1" title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Email" required><input type="email" required value={f.email} onChange={set("email")} className={inputCls} autoComplete="email" /></FormField>
              <FormField label="Full name" required><input required value={f.name} onChange={set("name")} className={inputCls} autoComplete="name" /></FormField>
              <FormField label="Phone"><input value={f.phone} onChange={set("phone")} className={inputCls} autoComplete="tel" /></FormField>
              <FormField label={taxLabel} required={Boolean(country?.requiresTaxId)} hint={country?.requiresTaxId ? `Required for deliveries to ${country.name}.` : shipCountry === "IN" ? "Optional — for a B2B GST invoice (15 characters, e.g. 27ABCDE1234F1Z0)." : "Optional — printed on your invoice."}>
                <input required={Boolean(country?.requiresTaxId)} value={f.taxId} onChange={set("taxId")} className={inputCls} />
              </FormField>
            </div>
          </Section>

          <Section n="2" title="Shipping address" extra={<span className="flex items-center gap-2 text-xs text-ink-500">Country <LocaleSelector compact /></span>}>
            {addrs.length > 0 && (
              <select onChange={(e) => applySaved(e.target.value, "ship")} defaultValue="" className={`${inputCls} mb-3`} aria-label="Use a saved address">
                <option value="" disabled>Use a saved address…</option>
                {addrs.map((a) => <option key={a.id} value={a.id}>{a.label || a.contact_name} — {a.line1}, {a.city} ({a.country_code})</option>)}
              </select>
            )}
            <AddressFields value={ship} onChange={setShip} countryName={country?.name} country={shipCountry} />
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={f.billingSameAsShipping} onChange={set("billingSameAsShipping")} /> Billing address is the same
            </label>
            {!f.billingSameAsShipping && (
              <div className="mt-3 rounded-lg border border-ink-100 p-3">
                <h3 className="mb-2 text-sm font-bold text-ink-800">Billing address</h3>
                {addrs.length > 0 && (
                  <select onChange={(e) => applySaved(e.target.value, "bill")} defaultValue="" className={`${inputCls} mb-3`} aria-label="Use a saved billing address">
                    <option value="" disabled>Use a saved address…</option>
                    {addrs.map((a) => <option key={a.id} value={a.id}>{a.label || a.contact_name} — {a.line1}, {a.city} ({a.country_code})</option>)}
                  </select>
                )}
                <AddressFields value={bill} onChange={setBill} withCountry />
              </div>
            )}
          </Section>

          <Section n="3" title="Delivery terms">
            {est ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Shipping method">
                  <select value={method || est.shipping?.method || ""} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                    {est.availableMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                    {!est.availableMethods.length && <option value="">Quoted separately</option>}
                  </select>
                </FormField>
                <FormField label="Incoterm" hint="DAP: we deliver, you clear customs. DDP: we include estimated duties/taxes.">
                  <select value={incoterm || est.incoterm.code} onChange={(e) => setIncoterm(e.target.value)} className={inputCls}>
                    {["DAP", "DDP", "CIP", "CPT", "FCA", "EXW"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Your PO / reference"><input value={f.poNumber} onChange={set("poNumber")} className={inputCls} maxLength={80} /></FormField>
                <FormField label="Delivery notes"><input value={f.notes} onChange={set("notes")} className={inputCls} maxLength={500} /></FormField>
              </div>
            ) : (
              <Skeleton className="h-20" />
            )}
          </Section>

          <Section n="4" title="Payment">
            {opts?.paymentMethods.length ? (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
                {opts.paymentMethods.map((m) => (
                  <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${f.paymentMethod === m ? "border-brand-500 bg-brand-50/50" : "border-ink-200"}`}>
                    <input type="radio" name="pm" value={m} checked={f.paymentMethod === m} onChange={set("paymentMethod")} className="mt-1" />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{PM_LABEL[m]?.[0] || m}</span>
                      <span className="block text-xs text-ink-500">{PM_LABEL[m]?.[1]}</span>
                    </span>
                  </label>
                ))}
                {!opts.paymentMethods.includes("razorpay") && cfg?.razorpay && (
                  <p className="text-xs text-ink-500">{cfg.razorpay.enabled ? `Online payment isn't available in ${currency}. Switch currency to INR to pay online, or use bank transfer.` : "Online payment is not enabled yet — please use bank transfer or request a quote."}</p>
                )}
              </div>
            ) : (
              <Skeleton className="h-16" />
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-ink-200 p-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink-900">Order summary</h2>
            <ul className="mb-3 max-h-56 divide-y divide-ink-100 overflow-y-auto text-sm">
              {opts?.cart.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0"><span className="block truncate text-ink-800">{i.name}</span><span className="font-mono text-[11px] text-ink-500">{i.sku} × {i.qty}</span></span>
                  <span className="shrink-0 tabular-nums text-ink-800">{i.lineTotal ? money(i.lineTotal, est?.currency.code) : "—"}</span>
                </li>
              ))}
            </ul>
            {est && <EstimateTable est={est} compact />}
            {changed && <ErrorNote className="mt-3">Prices or charges changed since you reviewed your order. New total: {money(changed.newTotal, changed.currency)}. Please review and place the order again.</ErrorNote>}
            <ErrorNote className="mt-3">{err}</ErrorNote>
            {blocked && <InfoNote className="mt-3">{est.blockers.map((b) => b.message).join(" ")} <Link to="/rfq?fromCart=1" className="font-semibold underline">Request a quote instead</Link>.</InfoNote>}
            <label className="mt-3 flex items-start gap-2 text-xs text-ink-600">
              <input type="checkbox" required checked={f.acceptTerms} onChange={set("acceptTerms")} className="mt-0.5" />
              <span>
                I agree to the {cfg?.termsUrl ? <a href={cfg.termsUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">terms of sale</a> : "terms of sale"} and understand that import duties and taxes shown are estimates.
              </span>
            </label>
            <button type="submit" disabled={busy || blocked || !est || !f.paymentMethod || !f.acceptTerms} className={`${btnPrimary} mt-3 w-full`}>
              <Icon name={busy ? "Loader2" : "Lock"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              {f.paymentMethod === "razorpay" ? "Place order & pay" : "Place order"}
              {est?.totals.payable && <span className="tabular-nums">· {money(est.totals.payable, est.currency.code)}</span>}
            </button>
            <Link to="/cart" className={`${btnSecondary} mt-2 w-full`}>Back to cart</Link>
          </div>
        </aside>
      </form>
    </ShopPage>
  );
}

function Section({ n, title, children, extra }) {
  return (
    <section className="rounded-xl border border-ink-100 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{n}</span>
          {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function AddressFields({ value, onChange, countryName, withCountry, country }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Contact name" required><input required value={value.contactName} onChange={set("contactName")} className={inputCls} autoComplete="name" /></FormField>
      <FormField label="Company"><input value={value.companyName} onChange={set("companyName")} className={inputCls} autoComplete="organization" /></FormField>
      <FormField label="Address line 1" required className="sm:col-span-2"><input required value={value.line1} onChange={set("line1")} className={inputCls} autoComplete="address-line1" /></FormField>
      <FormField label="Address line 2" className="sm:col-span-2"><input value={value.line2} onChange={set("line2")} className={inputCls} autoComplete="address-line2" /></FormField>
      <FormField label="City" required><input required value={value.city} onChange={set("city")} className={inputCls} autoComplete="address-level2" /></FormField>
      <StateField country={withCountry ? value.countryCode : country} value={value.state} onChange={(v) => onChange({ ...value, state: v })} />
      <FormField label="Postal code"><input value={value.postalCode} onChange={set("postalCode")} className={inputCls} autoComplete="postal-code" /></FormField>
      {withCountry ? (
        <FormField label="Country code" required hint="2 letters, e.g. IN, US, GB"><input required maxLength={2} value={value.countryCode || ""} onChange={(e) => onChange({ ...value, countryCode: e.target.value.toUpperCase() })} className={inputCls} /></FormField>
      ) : (
        <FormField label="Country"><input value={countryName || ""} disabled className={`${inputCls} bg-ink-50`} /></FormField>
      )}
      <FormField label="Phone"><input value={value.phone} onChange={set("phone")} className={inputCls} autoComplete="tel" /></FormField>
    </div>
  );
}
