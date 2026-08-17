import { useState } from "react";
import { Icon } from "../../lib/icons.jsx";

export default function VariantGrid({ variants, onEnquire }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {variants.map((v) => {
        const active = selected === v;
        return (
          <button
            key={v}
            onClick={() => setSelected(active ? null : v)}
            className={`focus-ring group flex items-center justify-between gap-3 rounded-lg border px-4 py-3.5 text-left text-sm transition-all ${
              active
                ? "border-brand-400 bg-brand-50 shadow-sm"
                : "border-ink-100 bg-white hover:border-brand-200 hover:bg-brand-50/40"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  active ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 text-transparent"
                }`}
              >
                <Icon name="Check" className="h-3.5 w-3.5" />
              </span>
              <span className={`font-medium ${active ? "text-brand-800" : "text-ink-700"}`}>{v}</span>
            </span>
          </button>
        );
      })}
      {onEnquire && (
        <div className="col-span-full mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-4 py-3.5">
          <span className="text-sm text-ink-500">
            {selected ? (
              <>Selected: <span className="font-semibold text-ink-800">{selected}</span></>
            ) : (
              "Select a variant to include it in your enquiry"
            )}
          </span>
          <button
            onClick={() => onEnquire(selected)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Enquire
            <Icon name="ArrowRight" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
