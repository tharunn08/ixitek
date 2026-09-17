import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { sapDisclaimer, sapNav } from "../../data/sap.js";

// The micro-site's own closing band — quick links back into the SAP section
// plus the mandatory trademark / non-affiliation disclaimer. Rendered on
// every /sap/* page, just above the main Ixitek site footer.
export default function SapFooterBand() {
  return (
    <div className="border-t border-ink-100 bg-ink-50/60">
      <div className="container-page flex flex-col gap-6 py-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
            <Icon name="Layers3" className="h-3.5 w-3.5 text-teal-600" />
            SAP / ERP Services
          </span>
          {sapNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="focus-ring text-xs font-medium text-ink-500 hover:text-teal-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 p-4">
          <Icon name="Info" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-bold leading-relaxed text-ink-800">{sapDisclaimer}</p>
        </div>
      </div>
    </div>
  );
}
