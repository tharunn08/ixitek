import { Link } from "react-router-dom";

// This is the client's actual supplied logo file (script "ixitek" wordmark +
// eagle mark), traced out of its black background and used directly — not a
// font recreation. On dark backgrounds (footer) it sits on a small white
// pill so the charcoal text stays legible; the artwork itself is untouched
// either way.
export default function Logo({ light = false, className = "" }) {
  return (
    <Link
      to="/"
      className={`focus-ring inline-flex items-center rounded-md ${className}`}
      aria-label="Ixitek Solutions — home"
    >
      <span
        className={`flex items-center ${light ? "rounded-xl bg-white px-3 py-1.5 shadow-sm" : ""}`}
      >
        <img
          src="/logo-original.png"
          alt="Ixitek Solutions"
          className="h-8 w-auto sm:h-9"
        />
      </span>
    </Link>
  );
}
