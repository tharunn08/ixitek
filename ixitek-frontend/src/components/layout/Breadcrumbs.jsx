import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";

export default function Breadcrumbs({ items = [], light = false }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        to="/"
        className={`focus-ring rounded flex items-center gap-1 ${light ? "text-ink-300 hover:text-white" : "text-ink-400 hover:text-brand-600"}`}
      >
        Home
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <Icon name="ChevronRight" className={`h-3.5 w-3.5 ${light ? "text-ink-500" : "text-ink-300"}`} />
          {item.to ? (
            <Link
              to={item.to}
              className={`focus-ring rounded ${light ? "text-ink-300 hover:text-white" : "text-ink-400 hover:text-brand-600"}`}
            >
              {item.label}
            </Link>
          ) : (
            <span className={`font-medium ${light ? "text-white" : "text-ink-700"}`}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
