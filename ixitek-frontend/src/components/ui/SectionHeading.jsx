import { motion } from "framer-motion";

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  size = "md",
  light = false,
  className = "",
}) {
  const alignClass = align === "center" ? "items-center text-center mx-auto" : "items-start text-left";
  const titleSize =
    size === "lg"
      ? "text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]"
      : "text-2xl sm:text-3xl lg:text-[2.15rem] leading-[1.15]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-4 max-w-2xl ${alignClass} ${className}`}
    >
      {eyebrow && (
        <motion.span
          initial={{ opacity: 0, scale: 0.55, y: 8 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 340, damping: 16 }}
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
            light
              ? "border-white/20 bg-white/5 text-brand-200"
              : "border-brand-200 bg-brand-50 text-brand-700"
          }`}
        >
          <motion.span
            className={`h-1.5 w-1.5 rounded-full ${light ? "bg-brand-300" : "bg-brand-500"}`}
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          />
          {eyebrow}
        </motion.span>
      )}
      <h2 className={`font-display font-bold text-balance ${titleSize} ${light ? "text-white" : "text-ink-900"}`}>
        {title}
      </h2>
      {description && (
        <p className={`text-base sm:text-lg leading-relaxed ${light ? "text-ink-200" : "text-ink-500"}`}>
          {description}
        </p>
      )}
    </motion.div>
  );
}
