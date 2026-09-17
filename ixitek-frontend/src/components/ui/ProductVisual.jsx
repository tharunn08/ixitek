import { useState } from "react";
import { Icon } from "../../lib/icons.jsx";

// Renders real product photography when an `image` path is supplied.
// Falls back to a designed, icon-driven gradient panel when no image is
// given, or if the image fails to load (e.g. file not added yet).
const TONES = [
  "from-brand-600 via-brand-700 to-ink-900",
  "from-ink-900 via-brand-800 to-brand-600",
  "from-brand-700 via-brand-900 to-ink-950",
  "from-brand-500 via-brand-700 to-ink-900",
];

export default function ProductVisual({
  icon = "Boxes",
  image,
  alt,
  toneIndex = 0,
  className = "",
  iconClassName = "h-14 w-14",
  interactive = true,
  fit = "contain",
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const tone = TONES[toneIndex % TONES.length];

  if (image && !imageFailed) {
    if (fit === "cover") {
      return (
        <div className={`relative overflow-hidden ${className}`}>
          <img
            src={image}
            alt={alt || ""}
            onError={() => setImageFailed(true)}
            className={`h-full w-full object-cover transition-transform duration-500 ${
              interactive ? "group-hover:scale-105" : ""
            }`}
          />
        </div>
      );
    }
    return (
      <div className={`relative overflow-hidden bg-ink-50 ${className}`}>
        <img
          src={image}
          alt={alt || ""}
          onError={() => setImageFailed(true)}
          className={`h-full w-full object-contain p-5 transition-transform duration-500 sm:p-6 ${
            interactive ? "group-hover:scale-105" : ""
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${tone} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-grid opacity-[0.12] mix-blend-overlay" />
      <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -left-6 -bottom-10 h-40 w-40 rounded-full bg-brand-400/20 blur-3xl" />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.16]"
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
      >
        <path
          d="M-10 150 C 40 120, 60 180, 110 140 S 180 60, 220 90"
          stroke="white"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M-10 60 C 40 90, 70 20, 120 50 S 190 110, 220 70"
          stroke="white"
          strokeWidth="1"
          fill="none"
        />
      </svg>
      <div className="relative flex h-full w-full items-center justify-center">
        <div
          className={`flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm transition-transform duration-500 ${
            interactive ? "group-hover:scale-105 group-hover:-rotate-1" : ""
          }`}
        >
          <Icon name={icon} className={`${iconClassName} text-white`} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
