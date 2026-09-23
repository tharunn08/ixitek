// ProductImage — fixed aspect ratio (no layout shift), skeleton while
// loading, lazy by default, and an IXITEK fallback instead of the browser's
// broken-image icon if the file is missing or unreachable.
import { useState } from "react";

// Optimised variants come from /api/img/:id (WebP, resized, cached). If that
// fails (image service unavailable or source unreachable) we fall back to the
// original URL once, then to the IXITEK placeholder.
const env = import.meta.env || {};
const API = (env.VITE_API_URL || (env.PROD ? "" : "http://localhost:5000")).replace(/\/$/, "");
const WIDTHS = [160, 320, 480, 640, 960];
const optimised = (id, w) => `${API}/api/img/${id}?w=${w}&fmt=webp`;

export default function ProductImage({ image, alt, className = "", priority = false, ratio = "aspect-square", fit = "object-contain", sizes = "(min-width: 1024px) 25vw, 50vw" }) {
  const [state, setState] = useState(image?.url ? "loading" : "error");
  const [original, setOriginal] = useState(!image?.id);
  return (
    <div className={`relative overflow-hidden bg-white ${ratio} ${className}`}>
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-ink-100/70" aria-hidden="true" />}
      {state !== "error" && image?.url && (
        <img
          src={original ? image.url : optimised(image.id, 640)}
          srcSet={original ? undefined : WIDTHS.map((w) => `${optimised(image.id, w)} ${w}w`).join(", ")}
          sizes={original ? undefined : sizes}
          alt={alt || image.alt || ""}
          width={image.width || 600}
          height={image.height || 600}
          loading={priority ? "eager" : "lazy"}
          fetchpriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => (original ? setState("error") : setOriginal(true))}
          className={`absolute inset-0 h-full w-full p-2 ${fit} transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink-50 to-brand-50/60" role="img" aria-label={alt || "Image coming soon"}>
          <img src="/logo-mark.png" alt="" className="h-10 w-10 opacity-40" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Image coming soon</span>
        </div>
      )}
    </div>
  );
}
