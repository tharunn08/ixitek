import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { Field, TextInput, TextArea } from "../ui/FormField.jsx";
import FileDropzone from "./FileDropzone.jsx";

const initialForm = { name: "", email: "", message: "" };

export default function CareerApplicationForm() {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
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
    if (!file) next.file = "Please attach your CV / resume.";
    if (!form.message.trim()) next.message = "Add a short note about your interest.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    // Frontend-only mock submission — no backend/API wired up.
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
        <h3 className="font-display text-xl font-bold text-ink-900">Application received</h3>
        <p className="max-w-sm text-sm leading-relaxed text-ink-500">
          Thanks, {form.name.split(" ")[0] || "there"} — we've received your CV and details. Our
          team reviews every application and will reach out to{" "}
          <span className="font-medium text-ink-700">{form.email}</span> if there's a fit.
        </p>
        <button
          onClick={() => {
            setForm(initialForm);
            setFile(null);
            setStatus("idle");
          }}
          className="focus-ring mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Submit another application
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="career-name" required>
          <TextInput
            id="career-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your full name"
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
        </Field>
        <Field label="Email" htmlFor="career-email" required>
          <TextInput
            id="career-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
          />
          {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
        </Field>
      </div>

      <Field label="Upload your CV / Resume" required>
        <FileDropzone
          file={file}
          onChange={(f) => {
            setFile(f);
            if (errors.file) setErrors((e) => ({ ...e, file: undefined }));
          }}
          error={errors.file}
        />
      </Field>

      <Field label="Comment or Message" htmlFor="career-message" required>
        <TextArea
          id="career-message"
          rows={5}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Tell us which area you're interested in and a bit about your experience..."
          aria-invalid={!!errors.message}
        />
        {errors.message && <span className="text-xs text-red-600">{errors.message}</span>}
      </Field>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] hover:bg-brand-700 hover:shadow-[0_10px_24px_-6px_rgba(29,84,201,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
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
              Submitting...
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              Submit
              <Icon name="Send" className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <p className="text-center text-xs text-ink-400">
        This is a frontend demo form — no data is sent to a server or uploaded anywhere.
      </p>
    </form>
  );
}
