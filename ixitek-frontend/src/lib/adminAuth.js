// Authentication for the site's single login page — used by everyone who
// signs in: website visitors with a customer account, teammates ("staff"),
// and the owner/admin. Backed by the Node.js/Express/SQLite backend in
// ixitek-backend/ (see src/lib/api.js) rather than browser storage, so
// accounts and sessions work the same from any device.
//
// The session itself (the decoded JWT payload we care about) is still
// cached in localStorage so the UI doesn't flash a logged-out state on
// every reload — but the token is verified against the real database on
// every API call, not trusted blindly.

import { apiFetch, getToken, setToken } from "./api.js";

const SESSION_KEY = "ixitek_admin_session_v1";
export const ADMIN_AUTH_EVENT = "ixitek:admin-auth-changed";

function persistSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota errors
  }
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EVENT));
}

/** Sign in. `identifier` is an email (customer/staff) or the owner's email/username. */
export async function login(identifier, password, { remember = false } = {}) {
  try {
    const { token, user } = await apiFetch("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { identifier, password, remember },
    });
    setToken(token);
    const session = { ...user, token };
    persistSession(session);
    return session;
  } catch (err) {
    const error = new Error(err?.message || "The email/username or password you entered is incorrect.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }
}

/** Create a new customer account, then sign them in immediately. */
export async function register({ name, email, phone, company, password }) {
  try {
    const { token, user } = await apiFetch("/api/auth/register", {
      method: "POST",
      auth: false,
      body: { name, email, phone, company, password },
    });
    setToken(token);
    const session = { ...user, token };
    persistSession(session);
    return session;
  } catch (err) {
    const error = new Error(err?.message || "Could not create your account. Please try again.");
    throw error;
  }
}

export function logout() {
  setToken(null);
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EVENT));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || session.token !== getToken()) return null;
    return session;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession());
}

/** True for roles allowed into /admin. */
export function isAdminRole(role) {
  return role === "owner" || role === "staff";
}

/** Re-validate the cached session against the backend (e.g. on app load). */
export async function refreshSession() {
  const token = getToken();
  if (!token) return null;
  try {
    const { user } = await apiFetch("/api/auth/me");
    const session = { ...user, token };
    persistSession(session);
    return session;
  } catch {
    logout();
    return null;
  }
}
