// CategoryTabs — the two primary product lines as large horizontal tabs.
// Active tab: IXITEK text colour with a thin red underline (functional accent).
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";

export const PRIMARY = [
  { slug: "optical-transceivers", name: "Optical Transceivers", icon: "Zap", blurb: "Pluggable optics" },
  { slug: "fiber-optic-cables", name: "Fiber Optic Cables", icon: "Cable", blurb: "Patch cords, MPO/MTP, breakouts, panels" },
];

export default function CategoryTabs({ active, counts = {} }) {
  return (
    <div role="tablist" aria-label="Product lines" className="flex w-full gap-1 overflow-x-auto border-b border-ink-200">
      {PRIMARY.map((t) => {
        const on = active === t.slug;
        return (
          <Link
            key={t.slug}
            to={`/catalog/${t.slug}`}
            role="tab"
            aria-selected={on}
            className={`focus-ring group relative flex min-w-[170px] shrink-0 items-center gap-3 px-3 py-3.5 sm:min-w-[210px] sm:px-4 transition-colors ${on ? "text-ink-900" : "text-ink-500 hover:text-ink-900"}`}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${on ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500 group-hover:bg-brand-50 group-hover:text-brand-600"}`}>
              <Icon name={t.icon} className="h-5 w-5" />
            </span>
            <span className="flex flex-col text-left">
              <span className="font-display text-[15px] font-bold leading-tight">{t.name}</span>
              <span className="text-[11px] text-ink-400">{counts[t.slug] !== undefined ? `${counts[t.slug]} products` : t.blurb}</span>
            </span>
            <span className={`absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-red-600 transition-transform duration-200 ${on ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"}`} />
          </Link>
        );
      })}
    </div>
  );
}
