// ProductPage — technical B2B product detail: gallery, part number, variant
// selector, server-calculated selling price (or Request a Quote), stock,
// specifications, all variants in the family, documents, related items.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { getProduct } from "../../lib/catalogApi.js";
import { toggleCompare, getCompare } from "../../lib/compareStore.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import ProductImage from "../../components/catalog/ProductImage.jsx";
import ProductCard, { Availability, Price } from "../../components/catalog/ProductCard.jsx";
import EstimateBox from "../../components/intl/EstimateBox.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useAdminAuth } from "../../context/AdminAuthContext.jsx";
import { apiFetch } from "../../lib/api.js";
import { useLocale } from "../../context/LocaleContext.jsx";

const AXIS_LABEL = { length_label: "Length", color: "Colour", polish: "Polish", fiber_count: "Fiber count", configuration: "Type", connector: "Connector" };
const RECENT_KEY = "ixitek_recent_v1";

function rememberRecent(p) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x.slug !== p.slug);
    list.unshift({ slug: p.slug, sku: p.sku, name: p.name, image: p.image, price: p.price, availability: p.availability, highlights: [] });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* ignore */
  }
}
function recentList(exclude) {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x.slug !== exclude).slice(0, 6);
  } catch {
    return [];
  }
}

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [error, setError] = useState("");
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [cartBusy, setCartBusy] = useState(false);
  const [cartErr, setCartErr] = useState("");
  const [wished, setWished] = useState(false);
  const { add } = useCart();
  const { isAuthenticated } = useAdminAuth();
  const [copied, setCopied] = useState(false);
  const [compared, setCompared] = useState(false);
  const [recent, setRecent] = useState([]);

  const { currency } = useLocale();
  const loadedSlug = useRef(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setError("");
    const sameProduct = loadedSlug.current === slug; // only the currency changed
    getProduct(slug, { signal: ctrl.signal })
      .then(({ product }) => {
        setP(product);
        rememberRecent(product);
        if (sameProduct) return; // keep the visitor's image / quantity selection
        loadedSlug.current = slug;
        setImgIdx(0);
        setQty(product.moq || 1);
        setCompared(getCompare().some((c) => c.slug === product.slug));
        // Anonymous view counter for the "Most popular" sort (rate-limited server-side).
        apiFetch(`/api/catalog/products/${encodeURIComponent(product.slug)}/view`, { method: "POST" }).catch(() => {});
      })
      .catch((err) => err?.name !== "AbortError" && setError(err.status === 404 ? "notfound" : err.message));
    return () => ctrl.abort();
  }, [slug, currency]);

  // Recently viewed: stored prices may be in an old currency, so re-price them from the server.
  useEffect(() => {
    const ctrl = new AbortController();
    const list = recentList(slug);
    setRecent(list.filter((r) => r.price?.currency === currency));
    Promise.all(list.map((r) => getProduct(r.slug, { signal: ctrl.signal }).then(({ product: x }) => ({ ...r, price: x.price, availability: x.availability, image: x.image })).catch(() => null)))
      .then((fresh) => !ctrl.signal.aborted && setRecent(fresh.filter(Boolean)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [slug, currency]);

  useEffect(() => {
    if (!isAuthenticated || !p) return;
    apiFetch("/api/shop/wishlist").then((r) => setWished(r.items.some((i) => i.slug === p.slug))).catch(() => {});
  }, [isAuthenticated, p]);

  useDocumentTitle(p ? `${p.name} (${p.sku})` : "Product", p?.seo?.description);

  // Structured data built only from real catalog fields.
  useEffect(() => {
    if (!p) return undefined;
    // The server already rendered this product's JSON-LD on a direct visit — don't duplicate it.
    if ([...document.querySelectorAll('script[type="application/ld+json"]')].some((x) => x.textContent.includes(`"sku":${JSON.stringify(p.sku)}`))) return undefined;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      sku: p.sku,
      mpn: p.sku,
      brand: { "@type": "Brand", name: p.brand || "IXITEK" },
      description: p.description,
      image: p.images.map((i) => i.url),
      ...(p.price ? { offers: { "@type": "Offer", priceCurrency: p.price.currency, price: p.price.amount, availability: p.availability.status === "in_stock" ? "https://schema.org/InStock" : "https://schema.org/PreOrder" } } : {}),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [p]);

  const axes = useMemo(() => p?.variantAxes || [], [p]);
  const current = p?.variants?.find((v) => v.sku === p.sku);
  const axisOptions = useMemo(() => {
    const out = {};
    for (const a of axes) out[a] = [...new Set((p?.variants || []).map((v) => v.axes[a]).filter(Boolean))];
    return out;
  }, [p, axes]);

  function pick(axis, value) {
    // Best match: same values on the other axes, requested value on this one.
    const want = { ...(current?.axes || {}), [axis]: value };
    const scored = p.variants
      .filter((v) => v.axes[axis] === value)
      .map((v) => ({ v, s: axes.filter((a) => v.axes[a] === want[a]).length }))
      .sort((a, b) => b.s - a.s);
    if (scored[0]) navigate(`/product/${scored[0].v.slug}`, { replace: false });
  }

  if (error === "notfound")
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Product not found</h1>
        <p className="mt-2 text-ink-500">It may have been renamed or discontinued.</p>
        <Link to="/catalog" className="mt-4 inline-block font-semibold text-brand-700">Browse the catalog →</Link>
      </div>
    );
  if (error) return <div className="container-page py-20 text-center text-red-700">{error}</div>;
  if (!p) return <ProductSkeleton />;

  const images = p.images.length ? p.images : [null];
  const purchasable = Boolean(p.price) && p.availability?.status !== "out_of_stock";
  const toCart = async (buyNow) => {
    setCartBusy(true);
    setCartErr("");
    try {
      await add({ slug: p.slug, qty }, { silent: buyNow });
      if (buyNow) navigate("/checkout");
    } catch (err) {
      setCartErr(err.message);
    } finally {
      setCartBusy(false);
    }
  };
  const toggleWish = async () => {
    if (!isAuthenticated) return navigate("/login", { state: { from: `/product/${p.slug}` } });
    try {
      if (wished) await apiFetch(`/api/shop/wishlist/${encodeURIComponent(p.slug)}`, { method: "DELETE" });
      else await apiFetch("/api/shop/wishlist", { method: "POST", body: { slug: p.slug } });
      setWished(!wished);
    } catch (err) {
      setCartErr(err.message);
    }
  };
  const rfqLink = `/rfq?product=${encodeURIComponent(p.slug)}&qty=${qty}`;

  return (
    <div className="bg-white">
      <div className="container-page py-5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <Icon name="ChevronRight" className="h-3 w-3" />
          <Link to="/catalog" className="hover:text-brand-700">Products</Link>
          {p.breadcrumbs.map((b) => (
            <span key={b.slug} className="flex items-center gap-1"><Icon name="ChevronRight" className="h-3 w-3" /><Link to={`/catalog/${b.slug}`} className="hover:text-brand-700">{b.name}</Link></span>
          ))}
          <Icon name="ChevronRight" className="h-3 w-3" />
          <span className="font-mono font-semibold text-ink-700">{p.sku}</span>
        </nav>

        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="rounded-2xl border border-ink-100">
              <ProductImage image={images[imgIdx]} alt={p.name} priority ratio="aspect-[4/3]" />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.map((im, i) => (
                  <button key={im.url} onClick={() => setImgIdx(i)} aria-label={`Image ${i + 1}`} className={`w-20 shrink-0 rounded-lg border-2 ${i === imgIdx ? "border-brand-600" : "border-ink-100"}`}>
                    <ProductImage image={im} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-ink-100 px-2 py-0.5 font-semibold text-ink-600">{p.brand}</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(p.sku).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
                  className="inline-flex items-center gap-1 font-mono text-ink-600 hover:text-brand-700"
                  title="Copy part number"
                >
                  #{p.sku} <Icon name={copied ? "Check" : "ClipboardList"} className="h-3.5 w-3.5" />
                </button>
                {p.status !== "active" && <span className="rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">{p.status.replace(/_/g, " ")}</span>}
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-ink-900 sm:text-[28px]">{p.name}</h1>
              {p.family && <Link to={`/catalog/${p.category.slug}?family=${p.family.slug}`} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">{p.family.name} family →</Link>}
            </div>

            {p.replacement && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This product is {p.status.replace(/_/g, " ")}. Recommended replacement: <Link className="font-semibold underline" to={`/product/${p.replacement.slug}`}>{p.replacement.sku}</Link>
              </div>
            )}

            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[13px]">
              {p.attributes.slice(0, 8).map((a) => (
                <li key={a.code} className="flex justify-between gap-2 border-b border-dashed border-ink-200/70 pb-1">
                  <span className="text-ink-500">{a.name}</span>
                  <span className="text-right font-semibold text-ink-800">{a.value}</span>
                </li>
              ))}
            </ul>

            {axes.map((axis) => (
              <div key={axis}>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
                  {AXIS_LABEL[axis] || axis}: <span className="normal-case text-ink-900">{current?.axes[axis]}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {axisOptions[axis].map((val) => (
                    <button
                      key={val}
                      onClick={() => pick(axis, val)}
                      aria-pressed={current?.axes[axis] === val}
                      className={`focus-ring min-w-12 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${current?.axes[axis] === val ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600" : "border-ink-200 text-ink-700 hover:border-brand-300"}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-ink-200 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Price price={p.price} size="lg" />
                  {p.price ? <span className="text-[11px] text-ink-400">Excl. freight, duties and taxes. Final landed cost is confirmed on your quote.</span> : <span className="text-xs text-ink-500">Pricing for this part is provided on request.</span>}
                </div>
                <Availability a={p.availability} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-ink-200" role="group" aria-label="Quantity">
                  <button className="px-3 py-2 text-ink-600 disabled:opacity-40" disabled={qty <= (p.moq || 1)} onClick={() => setQty((q) => Math.max(p.moq || 1, q - 1))} aria-label="Decrease quantity"><Icon name="Minus" className="h-4 w-4" /></button>
                  <input aria-label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(p.moq || 1, Math.min(p.maxOrderQty || 1e6, Number(e.target.value.replace(/\D/g, "")) || 1)))} className="w-16 border-x border-ink-200 py-2 text-center text-sm font-semibold outline-none" />
                  <button className="px-3 py-2 text-ink-600" onClick={() => setQty((q) => Math.min(p.maxOrderQty || 1e6, q + 1))} aria-label="Increase quantity"><Icon name="Plus" className="h-4 w-4" /></button>
                </div>
                {purchasable && (
                  <>
                    <button disabled={cartBusy} onClick={() => toCart(false)} className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300">
                      <Icon name="ShoppingCart" className="h-4 w-4" /> Add to cart
                    </button>
                    <button disabled={cartBusy} onClick={() => toCart(true)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60">
                      Buy now
                    </button>
                  </>
                )}
                <Link to={rfqLink} className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${purchasable ? "border border-ink-200 text-ink-700 hover:border-brand-300 hover:text-brand-700" : "flex-1 bg-brand-600 text-white hover:bg-brand-700"}`}>
                  <Icon name="FileText" className="h-4 w-4" /> Request a Quote
                </Link>
                <button onClick={toggleWish} aria-pressed={wished} title={isAuthenticated ? "Save to wishlist" : "Sign in to save to your wishlist"} className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold ${wished ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-700"}`}>
                  <Icon name="Heart" className="h-4 w-4" /> {wished ? "Saved" : "Wishlist"}
                </button>
                <button
                  onClick={() => (toggleCompare(p), setCompared(getCompare().some((c) => c.slug === p.slug)))}
                  aria-pressed={compared}
                  className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold ${compared ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-700"}`}
                >
                  <Icon name="Scale" className="h-4 w-4" /> {compared ? "Added" : "Compare"}
                </button>
              </div>
              {cartErr && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{cartErr}</p>}
              {p.moq > 1 && <div className="mt-2 text-xs text-ink-500">Minimum order quantity: {p.moq}</div>}
              {p.availability?.leadTimeDays != null && <div className="mt-1 text-xs text-ink-500">Lead time: {p.availability.leadTimeDays} days</div>}
              <ul className="mt-4 grid gap-2 border-t border-ink-100 pt-3 text-xs text-ink-600 sm:grid-cols-3">
                <li className="flex items-center gap-1.5"><Icon name="Truck" className="h-4 w-4 text-brand-600" /> Delivered-cost estimate below</li>
                <li className="flex items-center gap-1.5"><Icon name="FileCheck2" className="h-4 w-4 text-brand-600" /> PDF quotation on request</li>
                <li className="flex items-center gap-1.5"><Icon name="PackageCheck" className="h-4 w-4 text-brand-600" /> Track orders online</li>
              </ul>
            </div>
            {p.price && <EstimateBox lines={[{ slug: p.slug, qty }]} />}
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-8">
            <Section title="Description">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{p.description}</p>
            </Section>
            <Section title="Specifications">
              <table className="w-full overflow-hidden rounded-xl border border-ink-100 text-sm">
                <tbody>
                  <SpecRow label="Part number" value={<span className="font-mono">{p.sku}</span>} />
                  <SpecRow label="Brand" value={p.brand} />
                  {p.attributes.map((a) => <SpecRow key={a.code} label={a.name} value={a.value} />)}
                  {p.countryOfOrigin && <SpecRow label="Country of origin" value={p.countryOfOrigin} />}
                  {p.hsCode && <SpecRow label="HS code" value={p.hsCode} />}
                  {p.weightKg && <SpecRow label="Weight" value={`${Number(p.weightKg)} kg`} />}
                  {p.warrantyMonths && <SpecRow label="Warranty" value={`${p.warrantyMonths} months`} />}
                  {p.specifications.map((s, i) => <SpecRow key={`s${i}`} label={s.label} value={s.value} />)}
                </tbody>
              </table>
            </Section>

            {p.variants.length > 1 && (
              <Section title={`All ${p.family?.name || ""} options (${p.variants.length})`}>
                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-3 py-2">Part number</th>
                        {axes.map((a) => <th key={a} className="px-3 py-2">{AXIS_LABEL[a] || a}</th>)}
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2">Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.variants.map((v) => (
                        <tr key={v.sku} className={`border-t border-ink-100 ${v.sku === p.sku ? "bg-brand-50/60" : "hover:bg-ink-50"}`}>
                          <td className="px-3 py-2"><Link to={`/product/${v.slug}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{v.sku}</Link></td>
                          {axes.map((a) => <td key={a} className="px-3 py-2 text-ink-700">{v.axes[a] || "—"}</td>)}
                          <td className="px-3 py-2 text-right tabular-nums">{v.price ? <Price price={v.price} /> : <span className="text-xs font-semibold text-brand-700">RFQ</span>}</td>
                          <td className="px-3 py-2"><Availability a={v.availability} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {p.related.length > 0 && (
              <Section title="Compatible & related products">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{p.related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
              </Section>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-ink-100 p-4">
              <h2 className="font-display text-sm font-bold text-ink-900">Documents &amp; downloads</h2>
              {p.documents.length ? (
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {p.documents.map((d) => (
                    <li key={d.title}><a href={d.url} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline" target="_blank" rel="noreferrer"><Icon name="Download" className="h-4 w-4" />{d.title} <span className="text-xs text-ink-400">v{d.version}</span></a></li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-ink-500">No documents are published for this part yet. <Link to={`/support?subject=${encodeURIComponent(`Documents for ${p.sku}`)}&category=technical`} className="font-semibold text-brand-700 underline">Ask our team</Link>.</p>
              )}
            </div>
            <div className="rounded-xl border border-ink-100 p-4 text-xs leading-relaxed text-ink-600">
              <h2 className="mb-1 font-display text-sm font-bold text-ink-900">Shipping &amp; trade terms</h2>
              Freight, insurance, duties and taxes depend on destination and Incoterm and are itemised on your quotation. Estimates are not official customs assessments.
            </div>
          </aside>
        </div>

        {recent.length > 0 && (
          <Section title="Recently viewed" className="mt-10">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recent.map((r) => (
                <Link key={r.slug} to={`/product/${r.slug}`} className="w-40 shrink-0 rounded-xl border border-ink-100 p-2 hover:border-brand-300">
                  <ProductImage image={r.image} alt={r.name} />
                  <div className="mt-1 line-clamp-2 text-xs font-semibold text-ink-800">{r.name}</div>
                  <div className="font-mono text-[10px] text-ink-500">{r.sku}</div>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>

    </div>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={className}>
      <h2 className="mb-3 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}
function SpecRow({ label, value }) {
  return (
    <tr className="border-b border-ink-100 last:border-0">
      <th scope="row" className="w-2/5 bg-ink-50/70 px-3 py-2 text-left text-xs font-semibold text-ink-500">{label}</th>
      <td className="px-3 py-2 text-ink-800">{value}</td>
    </tr>
  );
}
function ProductSkeleton() {
  return (
    <div className="container-page grid gap-8 py-10 lg:grid-cols-2" aria-busy="true">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-ink-100" />
      <div className="flex flex-col gap-3">
        <div className="h-4 w-32 animate-pulse rounded bg-ink-100" />
        <div className="h-8 w-4/5 animate-pulse rounded bg-ink-100" />
        <div className="h-32 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-28 animate-pulse rounded-xl bg-ink-100" />
      </div>
    </div>
  );
}
