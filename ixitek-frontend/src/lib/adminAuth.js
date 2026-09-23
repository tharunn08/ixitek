// adminAuth.js — sign in / sign up / sign out for everyone (customers,
// staff, owner). The session itself is an httpOnly cookie managed by the
// server; only non-secret profile info (name, role, permissions) is cached
// in localStorage so the UI doesn't flash a signed-out state on reload.
// The server re-checks the session and role on every request regardless.
import { apiFetch, setCsrfToken } from "./api.js";

const SESSION_KEY = "ixitek_admin_session_v2";
export const ADMIN_AUTH_EVENT = "ixitek:admin-auth-changed";

function persistSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("ixitek_admin_session_v1");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EVENT));
}

function toSession({ user, permissions, csrfToken }) {
  if (csrfToken) setCsrfToken(csrfToken);
  return { ...user, permissions: permissions || [] };
}

export async function login(identifier, password, { remember = false } = {}) {
  try {
    const data = await apiFetch("/api/auth/login", { method: "POST", body: { identifier, password, remember } });
    const session = toSession(data);
    persistSession(session);
    return session;
  } catch (err) {
    const error = new Error(err?.message || "The email/username or password you entered is incorrect.");
    error.code = err?.status === 423 ? "LOCKED" : "INVALID_CREDENTIALS";
    throw error;
  }
}

export async function register({ name, email, phone, company, password }) {
  const data = await apiFetch("/api/auth/register", { method: "POST", body: { name, email, phone, company, password } });
  const session = toSession(data);
  persistSession(session);
  return session;
}

export function logout() {
  apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  setCsrfToken(null);
  persistSession(null);
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession());
}

/** Any team role can open the admin panel (server enforces the real permissions). */
export function isAdminRole(role, permissions) {
  if (Array.isArray(permissions) && permissions.includes("admin.access")) return true;
  return role === "owner" || role === "staff";
}

export function hasPermission(session, permission) {
  return Boolean(session && (session.role === "owner" || (session.permissions || []).includes(permission)));
}

/** Re-validate the cached session against the backend (on app load). */
export async function refreshSession() {
  try {
    const data = await apiFetch("/api/auth/me");
    const session = toSession(data);
    persistSession(session);
    return session;
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) persistSession(null);
    return null;
  }
}
