// Teammate ("staff") accounts for the admin panel — backed by the
// Node.js/SQLite backend (see src/lib/api.js) so an account added by the
// owner works to sign in from any device, not just the browser it was
// created in.

import { apiFetch } from "./api.js";

const UPDATE_EVENT = "ixitek:staff-updated";

let cache = [];

function setCache(list) {
  cache = Array.isArray(list) ? list : [];
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: cache }));
  return cache;
}

/** Last fetched list (synchronous, may be empty until loadStaff() resolves). */
export function getStaff() {
  return cache;
}

/** Fetch the current list from the backend and update the cache. */
export async function loadStaff() {
  const { staff } = await apiFetch("/api/admin/staff");
  return setCache(staff);
}

export async function addStaff({ name, email, password }) {
  const { staff } = await apiFetch("/api/admin/staff", {
    method: "POST",
    body: { name, email, password },
  });
  setCache([staff, ...cache]);
  return staff;
}

export async function deleteStaff(id) {
  await apiFetch(`/api/admin/staff/${id}`, { method: "DELETE" });
  setCache(cache.filter((s) => s.id !== id));
}

export function subscribeToStaff(callback) {
  const handler = (e) => callback(e.detail || cache);
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export const STAFF_UPDATE_EVENT = UPDATE_EVENT;
