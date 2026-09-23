// Navigation hubs for the header IA — Solutions, Services, Resources.
// Content comes from IXITEK's existing site data (src/data/products.js and
// the SAP micro-site); no new claims are introduced here.
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { categories, getFamiliesForCategory } from "../../data/products.js";
import { ShopPage } from "../../components/shop/ui.jsx";

function Tile({ to, icon, title, text, cta = "Explore" }) {
  return (
    <Link to={to} className="group flex h-full flex-col rounded-xl border border-ink-100 p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
      <Icon name={icon || "Boxes"} className="h-6 w-6 text-brand-600" />
      <h3 className="mt-3 font-display text-base font-bold text-ink-900 group-hover:text-brand-700">{title}</h3>
      {text && <p className="mt-1 line-clamp-3 flex-1 text-sm text-ink-600">{text}</p>}
      <span className="mt-3 text-sm font-semibold text-brand-700">{cta} →</span>
    </Link>
  );
}

const SOLUTION_CATEGORIES = ["data-centre-infrastructure", "network-tm", "fiber-optics"];

export function SolutionsPage() {
  const cats = categories.filter((c) => SOLUTION_CATEGORIES.includes(c.slug));
  return (
    <ShopPage title="Solutions" crumbs={[{ label: "Solutions" }]}>
      <p className="mb-6 max-w-3xl text-ink-600">Infrastructure solutions across data centre build-outs, network test &amp; measurement and fiber connectivity. Browse part numbers in the <Link to="/catalog" className="font-semibold text-brand-700 hover:underline">online catalog</Link> or send a bill of materials for a project quotation.</p>
      {cats.map((c) => (
        <section key={c.slug} className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-ink-100 pb-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900"><Icon name={c.icon} className="h-5 w-5 text-brand-600" /> {c.name}</h2>
            <Link to={`/products/${c.slug}`} className="text-sm font-semibold text-brand-700 hover:underline">Overview →</Link>
          </div>
          {c.shortDescription && <p className="mb-3 max-w-3xl text-sm text-ink-600">{c.shortDescription}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {getFamiliesForCategory(c.slug).map((f) => <Tile key={f.slug} to={`/products/${c.slug}/${f.slug}`} icon={f.icon} title={f.name} text={f.shortDescription} />)}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap gap-3 rounded-xl bg-ink-50 p-5">
        <span className="flex-1 text-sm text-ink-700">Planning a project? Upload your BOM and we'll match part numbers and quote the rest.</span>
        <Link to="/quick-order" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Icon name="UploadCloud" className="h-4 w-4" /> Upload BOM</Link>
        <Link to="/rfq" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300">Request a quote</Link>
      </div>
    </ShopPage>
  );
}

export function ServicesPage() {
  const ent = categories.find((c) => c.slug === "enterprise-solutions");
  const fams = ent ? getFamiliesForCategory(ent.slug) : [];
  return (
    <ShopPage title="Services" crumbs={[{ label: "Services" }]}>
      <section className="mb-8">
        <h2 className="mb-3 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-900">SAP / ERP services</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile to="/sap/implementation" icon="Workflow" title="SAP implementation" cta="Learn more" />
          <Tile to="/sap/training" icon="GraduationCap" title="SAP training" cta="Learn more" />
          <Tile to="/sap/support" icon="LifeBuoy" title="SAP support" cta="Learn more" />
          <Tile to="/sap/industries" icon="Factory" title="Industries" cta="Learn more" />
        </div>
        <Link to="/sap" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">SAP / ERP overview →</Link>
      </section>
      {fams.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-900">{ent.name}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fams.map((f) => <Tile key={f.slug} to={`/products/${ent.slug}/${f.slug}`} icon={f.icon} title={f.name} text={f.shortDescription} cta="Learn more" />)}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-3 border-b border-ink-100 pb-2 font-display text-lg font-bold text-ink-900">Ordering services</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile to="/rfq" icon="FileText" title="Project quotations" text="Formal PDF quotations with versioning, validity dates and online acceptance." cta="Request a quote" />
          <Tile to="/quick-order" icon="ListChecks" title="Quick order & BOM upload" text="Order by part number or upload an Excel/CSV bill of materials." cta="Start" />
          <Tile to="/account/company" icon="Building2" title="Company accounts" text="Multiple buyers, approvals and — once approved — credit terms." cta="Set up" />
          <Tile to="/support" icon="Undo2" title="Returns & warranty" text="Request returns, replacements and warranty repairs from your order." cta="Get help" />
        </div>
      </section>
    </ShopPage>
  );
}

export function ResourcesPage() {
  return (
    <ShopPage title="Resources" crumbs={[{ label: "Resources" }]}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile to="/catalog" icon="Boxes" title="Online product catalog" text="Specifications, variants, stock status and pricing by part number. Datasheets are listed on each product page where available." cta="Browse" />
        <Tile to="/compare" icon="Scale" title="Compare products" text="Side-by-side specifications for up to four products." cta="Open" />
        <Tile to="/quick-order" icon="FileSpreadsheet" title="BOM upload" text="Match an Excel or CSV bill of materials against the catalog." cta="Upload" />
        <Tile to="/resources/shipping-and-duties" icon="Globe2" title="Shipping, duties & taxes" text="How delivered-cost estimates, Incoterms and import charges work on this site." cta="Read" />
        <Tile to="/sap/faq" icon="CircleHelp" title="SAP / ERP FAQ" text="Answers about SAP training, implementation and support." cta="Read" />
        <Tile to="/company" icon="Building2" title="About IXITEK" text="Company profile and partners." cta="Read" />
      </div>
    </ShopPage>
  );
}

/** Explains the estimate mechanics implemented in the landed-cost engine — process only, no rates or legal claims. */
export function ShippingDutiesPage() {
  return (
    <ShopPage title="Shipping, duties & taxes" crumbs={[{ label: "Resources", to: "/resources" }, { label: "Shipping, duties & taxes" }]} narrow>
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-ink-700">
        <section>
          <h2 className="mb-1 font-display text-base font-bold text-ink-900">Choose your destination</h2>
          <p>Use “Ship to” in the header to pick your country and currency. Prices are held in US dollars and converted at IXITEK's current exchange rate; the cart and checkout recalculate automatically when you change country — your items are kept.</p>
        </section>
        <section>
          <h2 className="mb-1 font-display text-base font-bold text-ink-900">Freight</h2>
          <p>Air and express freight are charged on the chargeable weight — the greater of the actual weight and the volumetric weight of your items. Sea (LCL) shipments are charged by volume. Where a product's weight or dimensions are not yet on record, or a shipping method isn't available for your country, freight is quoted separately.</p>
        </section>
        <section>
          <h2 className="mb-1 font-display text-base font-bold text-ink-900">Incoterms</h2>
          <p><b>DAP</b> — we deliver to your address; import duties and taxes are paid by you at customs. <b>DDP</b> — the estimated duties and taxes are included in the amount you pay us. <b>EXW / FCA</b> — you arrange the main carriage. The checkout shows which charges are payable to IXITEK and which are payable at import.</p>
        </section>
        <section>
          <h2 className="mb-1 font-display text-base font-bold text-ink-900">Import duties and taxes</h2>
          <p>Where IXITEK has configured the customs and tax rules for your country, the site shows an estimate based on the product's HS classification and the customs value. Some products may be subject to trade-remedy measures that depend on the exporter and origin — those are marked for customs verification and quoted individually. If rules are not configured for your country, import charges are confirmed on your quotation.</p>
          <p className="mt-2 rounded-lg bg-ink-50 p-3 text-xs text-ink-600">Import duties, taxes and customs charges are estimates based on configured rules and may vary according to the destination country's customs assessment, product classification, origin, value, shipping method and applicable regulations. Final charges may differ.</p>
        </section>
        <section>
          <h2 className="mb-1 font-display text-base font-bold text-ink-900">Need a firm figure?</h2>
          <p><Link to="/rfq" className="font-semibold text-brand-700 hover:underline">Request a quotation</Link> — our team itemises freight, insurance and import charges for your destination.</p>
        </section>
      </div>
    </ShopPage>
  );
}
