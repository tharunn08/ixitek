// Registered website users (customers who created an account from the
// login page's "Create account" tab) — admin/staff only. Backed by the
// Node.js/Express/SQLite backend.

import { apiFetch } from "./api.js";

const UPDATE_EVENT = "ixitek:users-updated";

let cache = [];

function setCache(list) {
  cache = Array.isArray(list) ? list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: cache }));
  return cache;
}

export function getUsers() {
  return cache;
}

export async function loadUsers() {
  const { users } = await apiFetch("/api/admin/users");
  return setCache(users);
}

export function subscribeToUsers(callback) {
  const handler = (e) => callback(e.detail || cache);
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}
