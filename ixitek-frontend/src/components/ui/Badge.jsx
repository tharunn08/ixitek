import { motion } from "framer-motion";

export default function Badge({ children, tone = "brand", className = "", animate = true, delay = 0 }) {
  const tones = {
    brand: "bg-brand-50 text-brand-700 border-brand-200",
    ink: "bg-ink-100 text-ink-700 border-ink-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    white: "bg-white/10 text-white border-white/20",
  };

  // w-fit + self-start guard against the badge stretching to fill its
  // parent's width when it's a direct child of a flex column (the default
  // align-items: stretch was making these pills render far wider than
  // their text — the "long outline" bug seen across product/hero badges).
  const classes = `inline-flex w-fit shrink-0 self-start items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${tones[tone]} ${className}`;

  if (!animate) {
    return <span className={classes}>{children}</span>;
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6, y: 6 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 380, damping: 18, delay }}
      className={classes}
    >
      {children}
    </motion.span>
  );
}
