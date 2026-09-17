// api.js — small fetch wrapper for talking to the Ixitek backend
// (ixitek-backend/, Node.js + Express + SQLite). Every other lib/*Store.js
// file goes through this instead of touching `fetch` directly.
//
// API_BASE resolution:
//   1. VITE_API_URL, if set at build time — use it as-is. This covers any
//      deployment where the API genuinely lives on a different origin.
//   2. Otherwise, in a production build: "" (empty string), so every call
//      below (e.g. apiFetch("/api/auth/login")) becomes a plain relative
//      request like "/api/auth/login" — resolved by the browser against
//      whatever origin served the page. That's exactly right for this
//      project's deployment target: ixitek-backend serves the built
//      frontend AND the API from one Node process on one origin (e.g.
//      https://ixitek.com), so the frontend never needs to know its own
//      domain name and there's no separate API subdomain to hardcode.
//   3. Otherwise, in local dev: "http://localhost:5000" — `npm run dev`
//      serves the frontend from Vite on :5173 and the backend separately
//      on :5000, so dev needs an absolute cross-origin URL.
const envApiUrl =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL;
const isProdBuild = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD;

const API_BASE = (envApiUrl || (isProdBuild ? "" : "http://localhost:5000")).replace(/\/$/, "");

const TOKEN_KEY = "ixitek_auth_token_v1";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore (e.g. private browsing quota)
  }
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  let finalBody = body;

  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body: finalBody });
  } catch {
    throw new ApiError(
      "Could not reach the server. Please check your connection and that the backend is running.",
      0
    );
  }

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status);
  }
  return data;
}

export { ApiError, API_BASE };
