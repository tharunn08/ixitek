// Admin → Quotation editor.
//   /admin/quotes/new[?rfq=<id>&rfqNumber=<RFQ-…>]  create (optionally from an RFQ)
//   /admin/quotes/:number                           view versions, edit the draft,
//                                                    send, revise, download PDFs.
// All prices and totals come from the server (price-preview / saved version);
// the browser never does money arithmetic.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE } from "../../../lib/api.js";
import { PageHeader, Card, Btn, Field, ErrorBanner, Notice, Modal, Table, useApi, dt, num, inputCls } from "../../../components/admin/kit/index.jsx";
import { Icon } from "../../../lib/icons.jsx";
import { StatusPill, Money, money, label, useAction, newKey, dateOnly } from "./common.jsx";

const INCOTERMS = ["DAP", "DDP", "CIP", "CPT", "FCA", "EXW", "FOB", "CIF"];
const METHODS = [
  { code: "", name: "Not specified" },
  { code: "express", name: "Express courier" },
  { code: "air", name: "Air freight" },
  { code: "lcl", name: "Sea LCL" },
  { code: "fcl", name: "Sea FCL" },
];
const PAYMENT_TERMS = ["prepaid", "net15", "net30", "net45", "net60"];
const CHARGES = [
  { key: "freight", label: "Freight" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs duty (estimate)" },
  { key: "importTax", label: "Import tax (estimate)" },
  { key: "tax", label: "Invoice tax" },
  { key: "other", label: "Other charges" },
];
const REVISABLE = ["sent", "rejected", "expired"];

const pdfHref = (number, version) => `${API_BASE}/api/pay/quotes/${encodeURIComponent(number)}.pdf?version=${version}`;
const blankLine = () => ({ key: newKey("ln"), productId: "", sku: "", description: "", qty: "1", unitPrice: "", discountPct: "", leadTime: "", target: null });
const str = (v) => (v === null || v === undefined ? "" : String(v));

function emptyForm() {
  return {
    customerEmail: "", customerName: "", companyName: "", country: "", currency: "", incoterm: "DAP", shippingMethod: "", paymentTerms: "prepaid", leadTime: "", validUntil: "", terms: "", notes: "",
    lines: [blankLine()],
    charges: { freight: "", insurance: "", customs: "", importTax: "", tax: "", other: "" },
  };
}

function formFromRfq(rfq) {
  return {
    ...emptyForm(),
    customerEmail: str(rfq.contact.email), customerName: str(rfq.contact.name), companyName: str(rfq.contact.company),
    country: str(rfq.country), currency: str(rfq.currency), incoterm: INCOTERMS.includes(rfq.incoterm) ? rfq.incoterm : "DAP",
    lines: rfq.items.length
      ? rfq.items.map((i) => ({ ...blankLine(), productId: str(i.productId), sku: str(i.sku), description: str(i.description), qty: str(i.qty), target: i.targetPrice ?? null }))
      : [blankLine()],
  };
}

// Charges that the salesperson may have set explicitly are carried over;
// invoice tax is left on automatic because the stored figure can include
// DDP import charges (re-entering it would count them twice).
function formFromVersion(v) {
  return {
    ...emptyForm(),
    country: str(v.country), currency: str(v.currency), incoterm: str(v.incoterm) || "DAP", shippingMethod: str(v.shippingMethod), paymentTerms: str(v.paymentTerms) || "prepaid",
    leadTime: str(v.leadTime), validUntil: v.validUntil ? String(v.validUntil).slice(0, 10) : "", terms: str(v.terms), notes: str(v.notes),
    lines: v.items.length
      ? v.items.map((i) => ({ ...blankLine(), productId: str(i.productId), sku: str(i.sku), description: str(i.description), qty: str(i.qty), unitPrice: str(i.unitPrice), discountPct: Number(i.discountPct) ? str(i.discountPct) : "", leadTime: str(i.leadTime) }))
      : [blankLine()],
    charges: { freight: str(v.totals.freight), insurance: str(v.totals.insurance), customs: str(v.totals.customsEstimate), importTax: str(v.totals.importTaxEstimate), tax: "", other: Number(v.totals.otherCharges) ? str(v.totals.otherCharges) : "" },
  };
}

export default function QuoteEditor() {
  const { number } = useParams();
  return number ? <ExistingQuote number={number} /> : <NewQuote />;
}

// ── New quotation ──
function NewQuote() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rfqNumber = params.get("rfqNumber") || "";
  const rfqParam = params.get("rfq") || "";
  const rfq = useApi(rfqNumber ? `/api/admin/commerce/rfqs/${encodeURIComponent(rfqNumber)}` : null);
  const locales = useApi("/api/intl/locales");
  const r = rfq.data?.rfq;
  const rfqId = r?.id || rfqParam;
  const ready = !rfqNumber || r || rfq.error;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/quotes" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
        <Icon name="ArrowLeft" className="h-3.5 w-3.5" /> All quotations
      </Link>
      <PageHeader icon="FileText" title="New quotation" subtitle="Saved as draft V1. Blank unit prices use the customer's catalog selling price; blank charges use the automatic landed-cost estimate." />
      {r && (
        <Notice icon="ClipboardList">
          Prefilled from{" "}
          <Link className="font-semibold underline" to={`/admin/rfqs/${encodeURIComponent(r.rfqNumber)}`}>
            {r.rfqNumber}
          </Link>
          . Saving links the quotation to this RFQ and marks the RFQ as quoted.
        </Notice>
      )}
      {!rfqNumber && rfqParam && <Notice icon="ClipboardList">This quotation will be linked to RFQ #{rfqParam}; the customer, country and currency default to the RFQ's values when left blank.</Notice>}
      <ErrorBanner onRetry={rfq.reload}>{rfq.error && `Could not load the RFQ: ${rfq.error}`}</ErrorBanner>
      <ErrorBanner onRetry={locales.reload}>{locales.error}</ErrorBanner>
      {ready ? (
        <QuoteForm
          key={r?.id || "blank"}
          mode="new"
          initial={r ? formFromRfq(r) : emptyForm()}
          locales={locales.data}
          rfqId={rfqId}
          onSaved={(res) => navigate(`/admin/quotes/${encodeURIComponent(res.quoteNumber)}`, { replace: true })}
          onCancel={() => navigate(r ? `/admin/rfqs/${encodeURIComponent(r.rfqNumber)}` : "/admin/quotes")}
        />
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
      )}
    </div>
  );
}

// ── Existing quotation ──
function ExistingQuote({ number }) {
  const path = `/api/admin/commerce/quotes/${encodeURIComponent(number)}`;
  const res = useApi(path);
  const locales = useApi("/api/intl/locales");
  const [revising, setRevising] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [run, busy, error, setError] = useAction();
  const q = res.data?.quote;
  const current = q?.versions.find((v) => v.version === q.currentVersion);
  const isDraft = current?.status === "draft";
  const canRevise = q && current && REVISABLE.includes(current.status) && !["accepted", "converted"].includes(q.status);
  const setQuote = (quote) => res.setData({ quote });

  const send = async () => {
    const r = await run(`${path}/send`, {});
    if (r) {
      setQuote(r.quote);
      setSendOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/quotes" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
        <Icon name="ArrowLeft" className="h-3.5 w-3.5" /> All quotations
      </Link>
      <PageHeader
        icon="FileText"
        title={q ? `${q.quoteNumber}-V${q.currentVersion}` : number}
        subtitle={q ? `${q.customer.company || q.customer.name} · ${q.customer.email} · created ${dt(q.createdAt)}` : undefined}
        actions={
          q && (
            <>
              <StatusPill status={q.status} />
              {current && (
                <a className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700" href={pdfHref(q.quoteNumber, current.version)} target="_blank" rel="noreferrer">
                  <Icon name="FileDown" className="h-4 w-4" /> PDF V{current.version}
                </a>
              )}
              {isDraft && (
                <Btn variant="primary" icon="Send" onClick={() => (setError(""), setSendOpen(true))}>
                  Send to customer
                </Btn>
              )}
              {canRevise && !revising && (
                <Btn variant="primary" icon="Pencil" onClick={() => setRevising(true)}>
                  Revise
                </Btn>
              )}
            </>
          )
        }
      />
      <ErrorBanner onRetry={res.reload}>{res.error}</ErrorBanner>
      <ErrorBanner onRetry={locales.reload}>{locales.error}</ErrorBanner>
      {res.loading && !q && <div className="h-40 animate-pulse rounded-xl bg-ink-100" />}
      {q && (
        <>
          <Card title="Customer">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4">
              <Info k="Name">{q.customer.name}</Info>
              <Info k="Email">{q.customer.email}</Info>
              <Info k="Company">{q.customer.company}</Info>
              <Info k="Order">
                {q.orderNumber ? (
                  <Link className="font-mono text-xs font-semibold text-brand-700 hover:underline" to={`/admin/orders/${encodeURIComponent(q.orderNumber)}`}>
                    {q.orderNumber}
                  </Link>
                ) : (
                  "Not converted"
                )}
              </Info>
            </dl>
            {q.rfqId && <p className="mt-3 text-xs text-ink-500">Created from RFQ #{q.rfqId}.</p>}
          </Card>
          {q.orderNumber && <Notice tone="green" icon="CheckCircle2">Accepted by the customer and converted to order {q.orderNumber}.</Notice>}
          {isDraft && (
            <Card title={`Edit draft V${current.version}`}>
              <QuoteForm key={`draft-${current.version}`} mode="edit" initial={formFromVersion(current)} locales={locales.data} quoteNumber={q.quoteNumber} onSaved={(r) => setQuote(r.quote)} />
            </Card>
          )}
          {revising && current && (
            <Card title={`Revise → V${q.currentVersion + 1}`}>
              <QuoteForm
                key={`rev-${current.id}`}
                mode="revise"
                initial={formFromVersion(current)}
                locales={locales.data}
                quoteNumber={q.quoteNumber}
                onSaved={(r) => (setQuote(r.quote), setRevising(false))}
                onCancel={() => setRevising(false)}
              />
            </Card>
          )}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-ink-900">Versions</h2>
            {q.versions.map((v) => (
              <VersionCard key={v.id} quoteNumber={q.quoteNumber} v={v} current={v.version === q.currentVersion} />
            ))}
          </div>
        </>
      )}
      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title={`Send ${q?.quoteNumber}-V${current?.version} to the customer?`}
        footer={
          <>
            <Btn onClick={() => setSendOpen(false)}>Cancel</Btn>
            <Btn variant="primary" icon="Send" disabled={busy} onClick={send}>
              Send quotation
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            The quotation PDF and an acceptance link are emailed to <b>{q?.customer.email}</b>. Once sent, this version is locked — later changes need a revision.
          </p>
          {current && (
            <p>
              Total: <b>{money(current.totals.total, current.currency)}</b> · valid until {dateOnly(current.validUntil)}
            </p>
          )}
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      </Modal>
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

function TotalsList({ currency, rows }) {
  return (
    <dl className="flex flex-col gap-1 text-sm">
      {rows
        .filter((r) => r.always || (r.value !== null && r.value !== undefined && Number(r.value) !== 0))
        .map((r) => (
          <div key={r.label} className={`flex items-baseline justify-between gap-4 ${r.strong ? "border-t border-ink-100 pt-1.5 font-bold text-ink-900" : "text-ink-600"}`}>
            <dt>
              {r.label}
              {r.hint && <span className="ml-1 text-[11px] font-normal text-ink-400">{r.hint}</span>}
            </dt>
            <dd className="tabular-nums">{r.value === null || r.value === undefined ? "Not estimated" : `${r.negative ? "− " : ""}${money(r.value, currency)}`}</dd>
          </div>
        ))}
    </dl>
  );
}

function VersionCard({ quoteNumber, v, current }) {
  const t = v.totals;
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{v.label}</span>
          <StatusPill status={v.status} />
          {current && <span className="text-[11px] font-semibold text-brand-700">current</span>}
        </span>
      }
      actions={
        <a href={pdfHref(quoteNumber, v.version)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          <Icon name="FileDown" className="h-3.5 w-3.5" /> PDF
        </a>
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-8">
        <Info k="Country">{v.country}</Info>
        <Info k="Currency">{v.currency}</Info>
        <Info k="Incoterm">{v.incoterm}</Info>
        <Info k="Shipping">{v.shippingMethod ? label(v.shippingMethod) : ""}</Info>
        <Info k="Payment terms">{v.paymentTerms}</Info>
        <Info k="Lead time">{v.leadTime}</Info>
        <Info k="Valid until">{dateOnly(v.validUntil)}</Info>
        <Info k="Sent">{v.sentAt ? dt(v.sentAt) : ""}</Info>
      </dl>
      {v.exchangeRate && <p className="mt-2 text-[11px] text-ink-400">Exchange rate at pricing: 1 USD = {v.exchangeRate} {v.currency}</p>}
      <div className="mt-4">
        <Table
          rowKey="_k"
          rows={v.items.map((i, idx) => ({ ...i, _k: idx }))}
          columns={[
            { key: "sku", label: "SKU", render: (i) => <span className="font-mono text-xs font-semibold">{i.sku || "—"}</span> },
            { key: "description", label: "Description", render: (i) => <span className="text-ink-700">{i.description}</span> },
            { key: "qty", label: "Qty", align: "right", render: (i) => num(i.qty) },
            { key: "unitPrice", label: "Unit price", align: "right", render: (i) => <Money amount={i.unitPrice} currency={v.currency} /> },
            { key: "discountPct", label: "Disc. %", align: "right", render: (i) => (Number(i.discountPct) ? String(Number(i.discountPct)) : "—") },
            { key: "leadTime", label: "Lead time", render: (i) => i.leadTime || "—" },
            { key: "lineTotal", label: "Line total", align: "right", render: (i) => <Money amount={i.lineTotal} currency={v.currency} /> },
          ]}
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-2 text-sm text-ink-700">
          {v.terms && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Terms</div>
              <p className="whitespace-pre-wrap">{v.terms}</p>
            </div>
          )}
          {v.notes && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Notes</div>
              <p className="whitespace-pre-wrap">{v.notes}</p>
            </div>
          )}
          {(v.respondedAt || v.responseNote) && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Customer response {v.respondedAt ? `· ${dt(v.respondedAt)}` : ""}</div>
              <p className="whitespace-pre-wrap">{v.responseNote || "—"}</p>
            </div>
          )}
        </div>
        <TotalsList
          currency={v.currency}
          rows={[
            { label: "Subtotal", value: t.subtotal, always: true },
            { label: "Discount", value: t.discount, negative: true },
            { label: "Freight", value: t.freight },
            { label: "Insurance", value: t.insurance },
            { label: "Tax", value: t.tax },
            { label: "Other charges", value: t.otherCharges },
            { label: "Total", value: t.total, strong: true, always: true },
            { label: "Customs duty", hint: "(estimate)", value: t.customsEstimate },
            { label: "Import tax", hint: "(estimate)", value: t.importTaxEstimate },
          ]}
        />
      </div>
    </Card>
  );
}

// ── Editor form (new / edit draft / revise) ──
function QuoteForm({ mode, initial, locales, rfqId, quoteNumber, onSaved, onCancel }) {
  const [f, setF] = useState(initial);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [run, busy, error] = useAction();
  const [runPreview, previewBusy, previewError] = useAction();
  const [saved, setSaved] = useState(false);

  const countries = locales?.countries || [];
  const currencies = useMemo(() => (locales?.currencies || []).filter((c) => c.available), [locales]);

  const touch = (next) => {
    setF(next);
    setPreview(null);
    setSaved(false);
  };
  const set = (k, v) => touch({ ...f, [k]: v });
  const setCharge = (k, v) => touch({ ...f, charges: { ...f.charges, [k]: v } });
  const setLine = (key, patch) => touch({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const removeLine = (key) => touch({ ...f, lines: f.lines.filter((l) => l.key !== key) });
  const addLine = () => touch({ ...f, lines: [...f.lines, blankLine()] });

  const onCountry = (code) => {
    const c = countries.find((x) => x.code === code);
    const next = { ...f, country: code };
    if (!f.currency && c?.currency && currencies.some((x) => x.code === c.currency)) next.currency = c.currency;
    touch(next);
  };

  useEffect(() => {
    if (f.country || !locales?.defaultCountry || mode !== "new" || rfqId) return;
    setF((cur) => (cur.country ? cur : { ...cur, country: locales.defaultCountry }));
  }, [locales, mode, rfqId, f.country]);

  const linesPayload = () =>
    f.lines.map((l) => ({
      ...(l.productId ? { productId: l.productId } : {}),
      sku: l.sku.trim(),
      description: l.description.trim(),
      qty: l.qty,
      unitPrice: l.unitPrice.trim(),
      discountPct: l.discountPct.trim() || "0",
      leadTime: l.leadTime.trim(),
    }));
  const body = () => ({
    country: f.country, currency: f.currency, incoterm: f.incoterm, shippingMethod: f.shippingMethod, paymentTerms: f.paymentTerms, leadTime: f.leadTime.trim(),
    validUntil: f.validUntil, terms: f.terms, notes: f.notes, lines: linesPayload(), charges: f.charges,
  });

  const doPreview = async () => {
    const r = await runPreview("/api/admin/commerce/quotes/price-preview", { body: { lines: linesPayload(), country: f.country, currency: f.currency, incoterm: f.incoterm, shippingMethod: f.shippingMethod, charges: f.charges } });
    if (r) setPreview(r);
  };

  const save = async (e) => {
    e.preventDefault();
    if (mode === "new") {
      const r = await run("/api/admin/commerce/quotes", { body: { ...body(), customerEmail: f.customerEmail.trim(), customerName: f.customerName.trim(), companyName: f.companyName.trim(), ...(rfqId ? { rfqId } : {}) } });
      if (r) onSaved(r);
    } else if (mode === "edit") {
      const r = await run(`/api/admin/commerce/quotes/${encodeURIComponent(quoteNumber)}`, { method: "PUT", body: body() });
      if (r) {
        setSaved(true);
        onSaved(r);
      }
    } else {
      const r = await run(`/api/admin/commerce/quotes/${encodeURIComponent(quoteNumber)}/revise`, { body: { ...body(), reason: reason.trim() } });
      if (r) onSaved(r);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const valid = f.lines.length > 0 && f.lines.every((l) => Number(l.qty) >= 1 && (l.sku.trim() || l.description.trim() || l.productId)) && (mode !== "new" || f.customerEmail.trim() || rfqId) && (mode !== "revise" || reason.trim().length >= 3);
  const showTarget = f.lines.some((l) => l.target !== null && l.target !== undefined);

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {mode === "new" && (
        <fieldset className="grid gap-3 md:grid-cols-3">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Customer</legend>
          <Field label="Customer email" hint={rfqId ? "Blank = RFQ contact email" : "Links the quote to the customer's account when one exists"}>
            <input type="email" className={inputCls} value={f.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} required={!rfqId} maxLength={254} />
          </Field>
          <Field label="Customer name">
            <input className={inputCls} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} maxLength={150} />
          </Field>
          <Field label="Company">
            <input className={inputCls} value={f.companyName} onChange={(e) => set("companyName", e.target.value)} maxLength={200} />
          </Field>
        </fieldset>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Commercial terms</legend>
        <Field label="Destination country">
          <select className={inputCls} value={f.country} onChange={(e) => onCountry(e.target.value)} required={!rfqId || mode !== "new"}>
            <option value="">Choose…</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency" hint="Only currencies with a current exchange rate">
          <select className={inputCls} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="">{mode === "new" && rfqId ? "RFQ currency / USD" : "USD (default)"}</option>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
            {f.currency && !currencies.some((c) => c.code === f.currency) && <option value={f.currency}>{f.currency} (no current rate)</option>}
          </select>
        </Field>
        <Field label="Incoterm">
          <select className={inputCls} value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
            {INCOTERMS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!INCOTERMS.includes(f.incoterm) && <option value={f.incoterm}>{f.incoterm}</option>}
          </select>
        </Field>
        <Field label="Shipping method">
          <select className={inputCls} value={f.shippingMethod} onChange={(e) => set("shippingMethod", e.target.value)}>
            {METHODS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment terms">
          <select className={inputCls} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {f.paymentTerms && !PAYMENT_TERMS.includes(f.paymentTerms) && <option value={f.paymentTerms}>{f.paymentTerms}</option>}
          </select>
        </Field>
        <Field label="Lead time">
          <input className={inputCls} value={f.leadTime} onChange={(e) => set("leadTime", e.target.value)} placeholder="e.g. 2–3 weeks ARO" maxLength={200} />
        </Field>
        <Field label="Valid until" hint="Blank = default validity period">
          <input type="date" className={inputCls} value={f.validUntil} min={today} onChange={(e) => set("validUntil", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Lines</legend>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-ink-50 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-2 py-2">SKU</th>
                <th scope="col" className="px-2 py-2">Description</th>
                <th scope="col" className="w-20 px-2 py-2 text-right">Qty</th>
                {showTarget && <th scope="col" className="px-2 py-2 text-right">Target</th>}
                <th scope="col" className="w-32 px-2 py-2 text-right">Unit price</th>
                <th scope="col" className="w-20 px-2 py-2 text-right">Disc. %</th>
                <th scope="col" className="w-36 px-2 py-2">Lead time</th>
                <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, idx) => (
                <tr key={l.key} className="border-t border-ink-100 align-top">
                  <td className="px-2 py-1.5">
                    <input className={`${inputCls} font-mono text-xs`} value={l.sku} onChange={(e) => setLine(l.key, { sku: e.target.value, productId: "" })} aria-label={`Line ${idx + 1} SKU`} placeholder="SKU or part no." maxLength={100} />
                    {l.productId && <span className="mt-0.5 block text-[10px] text-emerald-700">Catalog product #{l.productId}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inputCls} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} aria-label={`Line ${idx + 1} description`} placeholder="Blank = catalog name" maxLength={500} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min={1} step={1} className={`${inputCls} text-right`} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} aria-label={`Line ${idx + 1} quantity`} required />
                  </td>
                  {showTarget && <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs text-ink-500">{l.target !== null && l.target !== undefined ? money(l.target, f.currency || "USD") : "—"}</td>}
                  <td className="px-2 py-1.5">
                    <input inputMode="decimal" className={`${inputCls} text-right`} value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} aria-label={`Line ${idx + 1} unit price`} placeholder="Catalog" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input inputMode="decimal" className={`${inputCls} text-right`} value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} aria-label={`Line ${idx + 1} discount percent`} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inputCls} value={l.leadTime} onChange={(e) => setLine(l.key, { leadTime: e.target.value })} aria-label={`Line ${idx + 1} lead time`} maxLength={100} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => removeLine(l.key)} disabled={f.lines.length <= 1} className="focus-ring rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Remove line ${idx + 1}`}>
                      <Icon name="Trash2" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Btn size="sm" icon="Plus" onClick={addLine} disabled={f.lines.length >= 500}>
            Add line
          </Btn>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Charges ({f.currency || "USD"}) — blank = automatic estimate</legend>
        {CHARGES.map((c) => (
          <Field key={c.key} label={c.label}>
            <input inputMode="decimal" className={`${inputCls} text-right`} value={f.charges[c.key]} onChange={(e) => setCharge(c.key, e.target.value)} placeholder="Auto" />
          </Field>
        ))}
      </fieldset>
      <p className="-mt-3 text-[11px] text-ink-400">Customs duty and import tax are included in the total only under DDP; otherwise they are shown to the customer as estimates. Invoice tax starts on automatic when revising or editing.</p>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Terms (shown on the quotation)">
          <textarea className={inputCls} rows={3} value={f.terms} onChange={(e) => set("terms", e.target.value)} maxLength={10000} />
        </Field>
        <Field label="Notes (shown on the quotation)">
          <textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={10000} />
        </Field>
      </div>

      {mode === "revise" && (
        <Field label="Reason for revision (saved in the audit log)">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required minLength={3} />
        </Field>
      )}

      <ErrorBanner>{previewError}</ErrorBanner>
      {preview && <PreviewPanel preview={preview} />}
      <ErrorBanner>{error}</ErrorBanner>
      {saved && <Notice tone="green" icon="CheckCircle2">Draft saved.</Notice>}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-4">
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn icon="Calculator" onClick={doPreview} disabled={previewBusy || !f.country || !f.lines.length}>
          {previewBusy ? "Calculating…" : "Preview totals"}
        </Btn>
        <Btn type="submit" variant="primary" icon="Save" disabled={busy || !valid}>
          {mode === "new" ? "Save draft quotation" : mode === "edit" ? "Save draft" : `Create revision`}
        </Btn>
      </div>
    </form>
  );
}

function PreviewPanel({ preview }) {
  const cur = preview.currency;
  const t = preview.totals;
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
        <Icon name="Calculator" className="h-4 w-4 text-brand-600" /> Price preview ({cur})
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Table
          rowKey="_k"
          rows={preview.lines.map((l, i) => ({ ...l, _k: i }))}
          columns={[
            { key: "sku", label: "SKU", render: (l) => <span className="font-mono text-xs font-semibold">{l.sku || "—"}</span> },
            { key: "description", label: "Description", render: (l) => <span className="line-clamp-2 text-ink-700">{l.description}</span> },
            { key: "qty", label: "Qty", align: "right", render: (l) => num(l.qty) },
            { key: "unitPrice", label: "Unit", align: "right", render: (l) => <Money amount={l.unitPrice} currency={cur} /> },
            { key: "discountPct", label: "Disc. %", align: "right", render: (l) => (Number(l.discountPct) ? String(Number(l.discountPct)) : "—") },
            { key: "lineTotal", label: "Line total", align: "right", render: (l) => <Money amount={l.lineTotal} currency={cur} /> },
          ]}
        />
        <div className="rounded-xl border border-ink-100 bg-white p-3">
          <TotalsList
            currency={cur}
            rows={[
              { label: "Subtotal", value: t.subtotal, always: true },
              { label: "Discount", value: t.discount, negative: true },
              { label: "Freight", value: t.freight },
              { label: "Insurance", value: t.insurance },
              { label: "Tax", value: t.tax },
              { label: "Other charges", value: t.other },
              { label: "Total", value: t.total, strong: true, always: true },
              { label: "Customs duty", hint: "(estimate)", value: t.customs, always: true },
              { label: "Import tax", hint: "(estimate)", value: t.importTax, always: true },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
