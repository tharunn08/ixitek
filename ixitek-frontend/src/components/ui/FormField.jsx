export function Field({ label, htmlFor, required, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink-800">
        {label} {required && <span className="text-brand-600">*</span>}
      </label>
      {children}
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </div>
  );
}

const baseInput =
  "w-full rounded-md border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 transition-colors focus-ring focus-visible:border-brand-400";

export function TextInput(props) {
  return <input {...props} className={`${baseInput} ${props.className || ""}`} />;
}

export function TextArea(props) {
  return <textarea {...props} className={`${baseInput} resize-none ${props.className || ""}`} />;
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${baseInput} ${props.className || ""}`}>
      {children}
    </select>
  );
}
