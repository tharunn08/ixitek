import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { getStaff, loadStaff, addStaff, deleteStaff, subscribeToStaff } from "../../lib/staffStore.js";

export default function StaffManager({ open, onClose }) {
  const [staff, setStaff] = useState(() => getStaff());
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting
  const [showPassword, setShowPassword] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToStaff(setStaff);
    if (open) {
      loadStaff().catch((err) => setLoadError(err?.message || "Could not load teammates."));
    }
    return unsubscribe;
  }, [open]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Enter a name.";
    if (!form.email.trim()) next.email = "Enter an email.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (!form.password || form.password.length < 6) next.password = "At least 6 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    try {
      await addStaff(form);
      setForm({ name: "", email: "", password: "" });
      setStatus("idle");
    } catch (err) {
      setErrors({ email: err?.message || "Could not add this teammate." });
      setStatus("idle");
    }
  }

  return (
    <AnimatePresence>
      {open && (
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
                <Icon name="Users" className="h-4 w-4 text-brand-600" />
                <h2 className="font-display text-lg font-bold text-ink-900">Team access</h2>
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
              <p className="text-sm leading-relaxed text-ink-500">
                Add teammates who should also be able to sign in and manage enquiries. They'll sign
                in on the login page using the email and password you set here — from any device.
              </p>

              {loadError && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                  <Icon name="AlertCircle" className="h-4 w-4 shrink-0" />
                  {loadError}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="mt-5 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ink-50/50 p-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-ink-600">Name</label>
                    <input
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="Jordan Patel"
                      className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors focus:border-brand-400"
                    />
                    {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-ink-600">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="teammate@ixitek.in"
                      className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors focus:border-brand-400"
                    />
                    {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-ink-600">Temporary password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 pr-9 text-sm text-ink-800 outline-none transition-colors focus:border-brand-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <Icon name={showPassword ? "EyeOff" : "Eye"} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {errors.password && <span className="text-xs text-red-600">{errors.password}</span>}
                </div>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="focus-ring mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Icon name="User" className="h-3.5 w-3.5" />
                  Add teammate
                </button>
              </form>

              <div className="mt-6">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {staff.length} teammate{staff.length === 1 ? "" : "s"} with access
                </span>
                <ul className="mt-2 flex flex-col gap-2">
                  {staff.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                          {s.name?.[0]?.toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-800">{s.name}</p>
                          <p className="truncate text-xs text-ink-500">{s.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${s.name}'s access?`)) {
                            deleteStaff(s.id).catch((err) =>
                              setLoadError(err?.message || "Could not remove this teammate.")
                            );
                          }
                        }}
                        className="focus-ring shrink-0 rounded-full p-2 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${s.name}`}
                      >
                        <Icon name="Trash2" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {staff.length === 0 && (
                    <li className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-xs text-ink-400">
                      No teammates added yet.
                    </li>
                  )}
                </ul>
              </div>

              <div className="mt-6 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3.5 py-3 text-[11px] leading-relaxed text-brand-800">
                <Icon name="Info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Teammate accounts are stored securely in the database, so they can sign in on
                  the login page from any device using the email and password you set here.
                </span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
