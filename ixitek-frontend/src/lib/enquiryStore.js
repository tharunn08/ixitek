// "Database" for enquiries and career applications — backed by the
// Node.js/Express/SQLite backend (see ixitek-backend/ and src/lib/api.js),
// so every submission is stored durably and shows up in the admin panel
// regardless of which device the visitor or the admin is using.

import { apiFetch } from "./api.js";

const UPDATE_EVENT = "ixitek:enquiries-updated";

let cache = [];

function setCache(list) {
  cache = Array.isArray(list) ? list.slice().sort((a, b) => b.createdAt - a.createdAt) : [];
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: cache }));
  return cache;
}

/** Last fetched list (synchronous; empty until loadEnquiries() resolves). */
export function getEnquiries() {
  return cache;
}

/** Admin-only: fetch every enquiry/application from the backend. */
export async function loadEnquiries() {
  const { records } = await apiFetch("/api/enquiries");
  return setCache(records);
}

/**
 * Save a new enquiry / application. Public — no sign-in required.
 * `data.type` should be "enquiry" or "career".
 */
export async function addEnquiry(data) {
  const { record } = await apiFetch("/api/enquiries", {
    method: "POST",
    // Send the auth token if the visitor happens to be signed in (so the
    // admin panel can later link the enquiry to their account), but don't
    // require it — anonymous visitors can still submit the form.
    auth: true,
    body: data,
  });
  return record;
}

export async function updateEnquiry(id, patch) {
  const { record } = await apiFetch(`/api/enquiries/${id}`, { method: "PATCH", body: patch });
  setCache(cache.map((item) => (item.id === id ? record : item)));
  return record;
}

export async function deleteEnquiry(id) {
  await apiFetch(`/api/enquiries/${id}`, { method: "DELETE" });
  setCache(cache.filter((item) => item.id !== id));
}

export function subscribeToEnquiries(callback) {
  const handler = (e) => callback(e.detail || cache);
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export const ENQUIRY_UPDATE_EVENT = UPDATE_EVENT;
export const ENQUIRY_STATUSES = ["new", "read", "responded", "archived"];
