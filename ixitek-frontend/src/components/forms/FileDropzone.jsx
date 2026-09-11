import { useRef, useState } from "react";
import { Icon } from "../../lib/icons.jsx";

function formatBytes(bytes) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function FileDropzone({ file, onChange, error, accept = ".pdf,.doc,.docx" }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const picked = fileList?.[0];
    if (picked) onChange(picked);
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`focus-ring flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-brand-400 bg-brand-50"
            : error
            ? "border-red-300 bg-red-50/40"
            : "border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-brand-50/40"
        }`}
      >
        {file ? (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <Icon name="FileText" className="h-5 w-5" />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-ink-800">{file.name}</span>
              <span className="text-xs text-ink-400">{formatBytes(file.size)} &middot; click to replace</span>
            </div>
          </>
        ) : (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon name="UploadCloud" className="h-5 w-5" />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-ink-700">
                Click or drag a file to this area to upload
              </span>
              <span className="text-xs text-ink-400">PDF or Word documents, up to 10MB</span>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>
      {error && <span className="mt-1.5 block text-xs text-red-600">{error}</span>}
    </div>
  );
}
