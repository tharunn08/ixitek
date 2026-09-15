import { useEffect } from "react";

// Lightweight per-page <title>/meta-description setter for the SAP
// micro-site (the rest of the site currently uses the single static title
// in index.html, so this is additive and scoped — it restores the site's
// default title/description on unmount rather than leaving a stale one
// behind when the visitor navigates back out to the main site).
const DEFAULT_TITLE = "Ixitek Solutions — Data Centre & Network Infrastructure";
const DEFAULT_DESCRIPTION =
  "Ixitek Solutions — fiber optic connectivity, network test & measurement, and data centre infrastructure for enterprise networks.";

export function useDocumentTitle(title, description) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fullTitle = title ? `${title} | Ixitek Solutions` : DEFAULT_TITLE;
    document.title = fullTitle;

    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? DEFAULT_DESCRIPTION;
    if (meta && description) {
      meta.setAttribute("content", description);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      if (meta) meta.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}
