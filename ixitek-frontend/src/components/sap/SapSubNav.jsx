import { NavLink } from "react-router-dom";
import { Icon } from "../../lib/icons.jsx";
import { sapNav } from "../../data/sap.js";

// Secondary, sticky sub-navigation scoped to /sap/* — this is what makes the
// SAP section read as a "micro-site inside the site": its own local nav bar,
// separate from (and rendered below) the main Ixitek header.
export default function SapSubNav() {
  return (
    <div className="sticky top-0 z-20 border-b border-teal-900/10 bg-ink-950/95 backdrop-blur-md">
      <div className="container-page">
        <div className="scrollbar-none flex items-center gap-1 overflow-x-auto py-2.5">
          {sapNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-teal-500/15 text-teal-300"
                    : "text-ink-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon name={item.icon} className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/sap/contact"
            className="focus-ring ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-xs font-semibold text-ink-950 transition-colors hover:bg-teal-400"
          >
            <Icon name="Send" className="h-3.5 w-3.5" />
            Talk to a Specialist
          </NavLink>
        </div>
      </div>
    </div>
  );
}
