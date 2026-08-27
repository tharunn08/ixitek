import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ProductVisual from "../ui/ProductVisual.jsx";
import { Icon } from "../../lib/icons.jsx";

export default function ProductGallery({ icon, name, image }) {
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const frames = [0, 1, 2];

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative overflow-hidden rounded-2xl border border-ink-100">
        <ProductVisual
          icon={icon}
          image={image}
          alt={name}
          toneIndex={active}
          className="aspect-[4/3] w-full"
          iconClassName="h-20 w-20"
        />
        <button
          onClick={() => setZoomed(true)}
          className="focus-ring absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-brand-700 opacity-0 shadow-md backdrop-blur transition-all duration-300 group-hover:opacity-100"
          aria-label="Zoom image"
        >
          <Icon name="ZoomIn" className="h-4.5 w-4.5" />
        </button>
      </div>

      {!image && (
        <div className="grid grid-cols-3 gap-3">
          {frames.map((f) => (
            <button
              key={f}
              onClick={() => setActive(f)}
              className={`focus-ring overflow-hidden rounded-lg border-2 transition-colors ${
                active === f ? "border-brand-500" : "border-transparent hover:border-ink-200"
              }`}
            >
              <ProductVisual icon={icon} toneIndex={f} className="aspect-square w-full" iconClassName="h-8 w-8" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/85 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl"
            >
              <ProductVisual icon={icon} image={image} alt={name} toneIndex={active} className="aspect-[4/3] w-full" iconClassName="h-28 w-28" interactive={false} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-6">
                <p className="font-display text-lg font-bold text-white">{name}</p>
              </div>
              <button
                onClick={() => setZoomed(false)}
                className="focus-ring absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink-700"
                aria-label="Close"
              >
                <Icon name="X" className="h-4.5 w-4.5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
