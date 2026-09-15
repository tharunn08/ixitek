import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";

export default function ModuleCard({ module }) {
  return (
    <Link
      to={`/sap/modules/${module.slug}`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-teal-200 hover:shadow-card-hover"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
          <Icon name={module.icon} className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-500">
          {module.code}
        </span>
      </div>
      <div className="flex-1">
        <h3 className="font-display text-base font-bold text-ink-900">SAP {module.name}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-500">{module.overview}</p>
      </div>
      <div className="flex items-center justify-between border-t border-ink-100 pt-4">
        <span className="text-xs font-medium text-ink-400">{module.keyFunctions.length} key functions</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">
          View module
          <Icon name="ArrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
