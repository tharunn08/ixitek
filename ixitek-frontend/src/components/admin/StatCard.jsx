import { motion } from "framer-motion";
import Counter from "../ui/Counter.jsx";
import { Icon } from "../../lib/icons.jsx";

const tones = {
  brand: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  ink: "bg-ink-100 text-ink-600",
};

export default function StatCard({ icon, label, value, tone = "brand", delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="flex flex-col">
        <span className="font-display text-2xl font-extrabold leading-none text-ink-900">
          <Counter value={value} duration={1} />
        </span>
        <span className="mt-1 text-xs font-medium text-ink-500">{label}</span>
      </div>
    </motion.div>
  );
}
