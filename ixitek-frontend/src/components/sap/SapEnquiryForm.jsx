import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { Field, TextInput, TextArea, Select } from "../ui/FormField.jsx";
import { sapEnquiryInterests } from "../../data/sap.js";
import { addEnquiry } from "../../lib/enquiryStore.js";
import { sendEmailNotification, buildWhatsAppLink, buildMailtoLink } from "../../lib/notifications.js";

// A dedicated enquiry form for the SAP / ERP micro-site. It mirrors the
// behaviour of the main EnquiryForm (same admin storage + notification
// pipeline, so submissions still land in the existing admin dashboard) but
// swaps the "product category" field for an SAP-specific interest field, and
// tags every record with category "sap-<interest>" so it's easy to tell
// apart from a product enquiry without changing the shared component.
const initialForm = { name: "", company: "", email: "", phone: "", interest: "", message: "" };

export default function SapEnquiryForm({ presetInterest = "", presetMessage = "", compact = false }) {
  const [form, setForm] = useState({
    ...initialForm,
    interest: presetInterest,
    message: presetMessage,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [savedRecord, setSavedRecord] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Please enter your name.";
    if (!form.email.trim()) next.email = "Please enter your email.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (!form.message.trim()) next.message = "Tell us a little about what you need.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");

    const record = addEnquiry({
      type: "enquiry",
      name: form.name.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      category: form.interest ? `sap-${form.interest}` : "sap-general",
      message: form.message.trim(),
      page: typeof window !== "undefined" ? window.location.pathname : "",
    });
    setSavedRecord(record);
    sendEmailNotification(record);

    setTimeout(() => setStatus("success"), 1100);
  }

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-8 py-14 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Icon name="CheckCircle2" className="h-7 w-7" />
        </span>
        <h3 className="font-display text-xl font-bold text-ink-900">Request received</h3>
        <p className="max-w-sm text-sm leading-relaxed text-ink-500">
          Thank you, {form.name.split(" ")[0] || "there"}. Our SAP team will follow up at{" "}
          <span className="font-medium text-ink-700">{form.email}</span> within one business day.
        </p>
        {savedRecord && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <a
              href={buildWhatsAppLink(savedRecord)}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Icon name="MessageCircle" className="h-3.5 w-3.5" />
              Also notify us on WhatsApp
            </a>
            <a
              href={buildMailtoLink(savedRecord)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-teal-300 hover:text-teal-700"
            >
              <Icon name="Mail" className="h-3.5 w-3.5" />
              Or send by email
            </a>
          </div>
        )}
        <button
          onClick={() => {
            setForm(initialForm);
            setSavedRecord(null);
            setStatus("idle");
          }}
          className="focus-ring mt-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
        >
          Submit another request
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className={`grid grid-cols-1 gap-5 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field label="Full name" htmlFor="sap-name" required>
          <TextInput
            id="sap-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Jordan Patel"
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
        </Field>
        <Field label="Company" htmlFor="sap-company">
          <TextInput
            id="sap-company"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Your organization (optional for individuals)"
          />
        </Field>
        <Field label="Email" htmlFor="sap-email" required>
          <TextInput
            id="sap-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
          />
          {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
        </Field>
        <Field label="Phone" htmlFor="sap-phone">
          <TextInput
            id="sap-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+91 00000 00000"
          />
        </Field>
      </div>

      <Field label="What do you need?" htmlFor="sap-interest">
        <Select id="sap-interest" value={form.interest} onChange={(e) => update("interest", e.target.value)}>
          <option value="">Select an area</option>
          {sapEnquiryInterests.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Tell us more" htmlFor="sap-message" required>
        <TextArea
          id="sap-message"
          rows={5}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Share your background/current landscape, timeline and what you're trying to achieve..."
          aria-invalid={!!errors.message}
        />
        {errors.message && <span className="text-xs text-red-600">{errors.message}</span>}
      </Field>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-teal-600 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] hover:bg-teal-700 hover:shadow-[0_10px_24px_-6px_rgba(13,148,136,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "submitting" ? (
            <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <Icon name="Loader2" className="h-4 w-4 animate-spin" />
              Sending request...
            </motion.span>
          ) : (
            <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              Submit Request
              <Icon name="Send" className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <p className="text-center text-xs text-ink-400">
        Your request is saved securely for our team and notified by email — no backend server involved.
      </p>
    </form>
  );
}
