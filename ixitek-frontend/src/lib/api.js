// api.js — the single fetch wrapper for the IXITEK backend.
//
// Sessions use an httpOnly cookie set by the server (page JavaScript can't
// read it, so an XSS bug can't steal it). Every write sends the CSRF token
// from the readable `ixitek_csrf` cookie as X-CSRF-Token.
//
// API_BASE: VITE_API_URL if set; "" (same origin) in production builds —
// the backend serves this app and /api/* from one origin; and
// http://localhost:5000 in `npm run dev` (Vite on :5173, API on :5000).
const envApiUrl = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL;
const isProdBuild = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD;

const API_BASE = (envApiUrl || (isProdBuild ? "" : "http://localhost:5000")).replace(/\/$/, "");

// Legacy key from the Bearer-token version; removed on load so no token lingers in storage.
try {
  localStorage.removeItem("ixitek_auth_token_v1");
} catch {
  /* ignore */
}

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

let csrfFallback = null; // cross-origin dev: cookie not readable → keep the token the server returned
export function setCsrfToken(token) {
  csrfFallback = token || null;
}
function csrfToken() {
  return readCookie("ixitek_csrf") || csrfFallback;
}

class ApiError extends Error {
  constructor(message, status, { code, details, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * @param {string} path  e.g. "/api/catalog/products?category=lc"
 * @param {{method?:string, body?:any, form?:FormData, headers?:object, signal?:AbortSignal}} opts
 */
export async function apiFetch(path, { method = "GET", body, form, headers = {}, signal } = {}) {
  const finalHeaders = { Accept: "application/json", ...headers };
  let finalBody;
  if (form) finalBody = form;
  else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }
  if (!["GET", "HEAD"].includes(method)) {
    const t = csrfToken();
    if (t) finalHeaders["X-CSRF-Token"] = t;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body: finalBody, credentials: "include", signal });
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new ApiError("Could not reach the server. Please check your connection and try again.", 0);
  }

  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status, { code: data?.code, details: data?.details, requestId: data?.requestId });
  }
  return data;
}

/** Download a protected file (CSV report, résumé) with the session cookie. */
export async function apiDownload(path, fallbackName = "download") {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) throw new ApiError(`Download failed (${response.status}).`, response.status);
  const blob = await response.blob();
  const cd = response.headers.get("content-disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m ? m[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { ApiError, API_BASE };
