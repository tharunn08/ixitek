import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { buildMailtoLink, buildWhatsAppLink } from "../../lib/notifications.js";

const STATUS_LABEL = { new: "New", read: "Read", responded: "Responded", archived: "Archived" };
const STATUS_TONE = {
  new: "bg-brand-50 text-brand-700 border-brand-200",
  read: "bg-ink-100 text-ink-600 border-ink-200",
  responded: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-amber-50 text-amber-700 border-amber-200",
};

function Row({ icon, label, value, href }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 border-b border-ink-100 py-3 last:border-0">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
        {href ? (
          <a href={href} className="focus-ring truncate text-sm font-medium text-brand-700 hover:underline">
            {value}
          </a>
        ) : (
          <span className="break-words text-sm font-medium text-ink-800">{value}</span>
        )}
      </div>
    </div>
  );
}

export default function EnquiryDetailDrawer({ record, onClose, onStatusChange, onDelete }) {
  return (
    <AnimatePresence>
      {record && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-[2px]"
          />
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-ink-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    STATUS_TONE[record.status] || STATUS_TONE.new
                  }`}
                >
                  <Icon name="CircleDot" className="h-3 w-3" />
                  {STATUS_LABEL[record.status] || "New"}
                </span>
                <span className="text-xs font-medium text-ink-400">
                  {record.type === "career" ? "Career application" : "Product enquiry"}
                </span>
              </div>
              <button
                onClick={onClose}
                className="focus-ring rounded-full p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close"
              >
                <Icon name="X" className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h2 className="font-display text-xl font-bold text-ink-900">{record.name}</h2>
              <p className="mt-1 text-xs text-ink-400">
                Submitted{" "}
                {new Date(record.createdAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>

              <div className="mt-5 rounded-2xl border border-ink-100 bg-ink-50/40 px-4">
                <Row icon="Mail" label="Email" value={record.email} href={`mailto:${record.email}`} />
                <Row icon="Phone" label="Phone" value={record.phone} href={record.phone ? `tel:${record.phone.replace(/\s/g, "")}` : undefined} />
                <Row icon="Building2" label="Company" value={record.company} />
                <Row icon="Filter" label="Area of interest" value={record.category} />
                {record.type === "career" && record.resumeDataUrl && (
                  <Row
                    icon="Download"
                    label="Resume / CV"
                    value={record.resumeFileName || "Download attachment"}
                    href={record.resumeDataUrl}
                  />
                )}
                {record.type === "career" && !record.resumeDataUrl && record.resumeFileName && (
                  <Row icon="FileText" label="Resume / CV" value={`${record.resumeFileName} (too large to store in-browser)`} />
                )}
              </div>

              <div className="mt-5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Message</span>
                <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-ink-100 bg-white p-4 text-sm leading-relaxed text-ink-700 shadow-sm">
                  {record.message}
                </p>
              </div>

              <div className="mt-6">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Mark as</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.keys(STATUS_LABEL).map((key) => (
                    <button
                      key={key}
                      onClick={() => onStatusChange(record.id, key)}
                      className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        record.status === key
                          ? STATUS_TONE[key]
                          : "border-ink-200 bg-white text-ink-500 hover:border-brand-200 hover:text-brand-700"
                      }`}
                    >
                      {STATUS_LABEL[key]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-ink-100 px-6 py-5">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={buildMailtoLink(record)}
                  className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Icon name="Mail" className="h-3.5 w-3.5" />
                  Reply by email
                </a>
                <a
                  href={buildWhatsAppLink(record)}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Icon name="MessageCircle" className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Delete this record permanently? This cannot be undone.")) {
                    onDelete(record.id);
                  }
                }}
                className="focus-ring mt-1 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <Icon name="Trash2" className="h-3.5 w-3.5" />
                Delete record
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
