import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { Field, TextInput, TextArea, Select } from "../ui/FormField.jsx";
import { categories } from "../../data/products.js";

const initialForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  category: "",
  message: "",
};

export default function EnquiryForm({ presetSubject = "", compact = false }) {
  const [form, setForm] = useState({ ...initialForm, message: presetSubject });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Please enter your name.";
    if (!form.email.trim()) next.email = "Please enter your email.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (!form.message.trim()) next.message = "Tell us a little about your requirement.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    // Frontend-only mock submission — no backend/API wired up.
    setTimeout(() => {
      setStatus("success");
    }, 1100);
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
        <h3 className="font-display text-xl font-bold text-ink-900">Enquiry received</h3>
        <p className="max-w-sm text-sm leading-relaxed text-ink-500">
          Thank you, {form.name.split(" ")[0] || "there"}. Our solutions team will get back to you at{" "}
          <span className="font-medium text-ink-700">{form.email}</span> within one business day.
        </p>
        <button
          onClick={() => {
            setForm(initialForm);
            setStatus("idle");
          }}
          className="focus-ring mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Submit another enquiry
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className={`grid grid-cols-1 gap-5 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field label="Full name" htmlFor="name" required>
          <TextInput
            id="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Jordan Patel"
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
        </Field>
        <Field label="Company" htmlFor="company">
          <TextInput
            id="company"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Your organization"
          />
        </Field>
        <Field label="Work email" htmlFor="email" required>
          <TextInput
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
          />
          {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
        </Field>
        <Field label="Phone" htmlFor="phone">
          <TextInput
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+91 00000 00000"
          />
        </Field>
      </div>

      <Field label="Area of interest" htmlFor="category">
        <Select id="category" value={form.category} onChange={(e) => update("category", e.target.value)}>
          <option value="">Select a product category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
          <option value="other">Something else</option>
        </Select>
      </Field>

      <Field label="Tell us about your requirement" htmlFor="message" required>
        <TextArea
          id="message"
          rows={5}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Share scope, quantities, timelines or specifications..."
          aria-invalid={!!errors.message}
        />
        {errors.message && <span className="text-xs text-red-600">{errors.message}</span>}
      </Field>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "submitting" ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Icon name="Loader2" className="h-4 w-4 animate-spin" />
              Sending enquiry...
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              Submit Enquiry
              <Icon name="Send" className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <p className="text-center text-xs text-ink-400">
        This is a frontend demo form — no data is sent to a server.
      </p>
    </form>
  );
}
