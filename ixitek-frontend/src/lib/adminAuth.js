// Frontend-only admin authentication. No backend/API — the credential
// check happens in the browser, either against the SHA-256 hash from
// adminConfig.js (the primary/owner login) or against a teammate record
// from staffStore.js, and the resulting session is a signed-nothing token
// kept in localStorage. See adminConfig.js for the security caveats.

import { ADMIN_CONFIG } from "./adminConfig.js";
import { sha256Hex } from "./hash.js";
import { findStaffByEmail } from "./staffStore.js";

const SESSION_KEY = "ixitek_admin_session_v1";
const SHORT_TTL = 8 * 60 * 60 * 1000; // 8 hours
const LONG_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days ("keep me signed in")
export const ADMIN_AUTH_EVENT = "ixitek:admin-auth-changed";

// `identifier` is the primary admin's username OR a teammate's email —
// the login form has a single field and we try both.
export async function login(identifier, password, { remember = false } = {}) {
  const trimmed = (identifier ?? "").trim();
  const inputHash = await sha256Hex(password ?? "");

  let session = null;

  const isOwner =
    trimmed.toLowerCase() === ADMIN_CONFIG.username.trim().toLowerCase() &&
    inputHash === ADMIN_CONFIG.passwordHash;

  if (isOwner) {
    session = {
      role: "owner",
      username: ADMIN_CONFIG.username,
      name: ADMIN_CONFIG.username,
      email: ADMIN_CONFIG.notifyEmail,
    };
  } else {
    const staff = findStaffByEmail(trimmed);
    if (staff && staff.passwordHash === inputHash) {
      session = {
        role: "staff",
        username: staff.email,
        name: staff.name,
        email: staff.email,
        staffId: staff.id,
      };
    }
  }

  if (!session) {
    const error = new Error("The username/email or password you entered is incorrect.");
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }

  const fullSession = {
    ...session,
    issuedAt: Date.now(),
    expiresAt: Date.now() + (remember ? LONG_TTL : SHORT_TTL),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(fullSession));
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EVENT));
  return fullSession;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EVENT));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.expiresAt || session.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getSession());
}
