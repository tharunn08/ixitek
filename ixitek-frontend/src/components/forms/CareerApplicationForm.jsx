import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "../../lib/icons.jsx";
import { Field, TextInput, TextArea } from "../ui/FormField.jsx";
import FileDropzone from "./FileDropzone.jsx";
import { addEnquiry } from "../../lib/enquiryStore.js";
import { sendEmailNotification, buildWhatsAppLink, buildMailtoLink } from "../../lib/notifications.js";

const initialForm = { name: "", email: "", message: "" };

// Resumes are stored inline (base64) in the browser so the admin panel can
// offer a "download CV" link — there's no server to upload them to. Cap the
// size so one large PDF can't blow through the localStorage quota.
const MAX_STORED_FILE_BYTES = 350 * 1024;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function CareerApplicationForm() {
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success
  const [savedRecord, setSavedRecord] = useState(null);
  const [submitError, setSubmitError] = useState("");

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    setSubmitError("");

    let resumeDataUrl = null;
    if (file && file.size <= MAX_STORED_FILE_BYTES) {
      try {
        resumeDataUrl = await fileToDataUrl(file);
      } catch {
        resumeDataUrl = null;
      }
    }

    try {
      // Persist to the database via the backend API so it shows up in the
      // admin panel from any device, then fire off an email notification.
      const record = await addEnquiry({
        type: "career",
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
        resumeFileName: file?.name || "",
        resumeFileSize: file?.size || 0,
        resumeDataUrl,
      });
      setSavedRecord(record);
      sendEmailNotification(record);
      setStatus("success");
    } catch (err) {
      setSubmitError(err?.message || "Could not submit your application. Please try again.");
      setStatus("idle");
    }
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
              className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <Icon name="Mail" className="h-3.5 w-3.5" />
              Or send by email
            </a>
          </div>
        )}
        <button
          onClick={() => {
            setForm(initialForm);
            setFile(null);
            setSavedRecord(null);
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
      {submitError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          <Icon name="AlertCircle" className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}
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
        Your application is saved securely to our database and your team is notified by email.
      </p>
    </form>
  );
}
