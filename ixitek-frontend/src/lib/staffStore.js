// Teammate ("staff") accounts for the admin panel — frontend-only, saved in
// this browser via localStorage, same as enquiries. See the note in
// StaffManager.jsx / ADMIN_SETUP.md: without a backend, an account added
// here only works to sign in from THIS SAME browser/device — add each
// teammate's account from the browser they'll actually use.

import { sha256Hex } from "./hash.js";

const STORAGE_KEY = "ixitek_admin_staff_v1";
const UPDATE_EVENT = "ixitek:staff-updated";

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readAll() {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY) || "[]");
}

function writeAll(list) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function makeId() {
  return `staff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function stripHash({ passwordHash, ...rest }) {
  void passwordHash;
  return rest;
}

/** Newest first. Never includes password hashes. */
export function getStaff() {
  return readAll()
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(stripHash);
}

export async function addStaff({ name, email, password }) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const list = readAll();

  if (!normalizedEmail || !password) {
    throw new Error("Name, email and password are all required.");
  }
  if (list.some((s) => s.email === normalizedEmail)) {
    const error = new Error("A teammate with this email already has access.");
    error.code = "DUPLICATE_EMAIL";
    throw error;
  }

  const record = {
    id: makeId(),
    name: (name || "").trim() || normalizedEmail,
    email: normalizedEmail,
    passwordHash: await sha256Hex(password),
    createdAt: Date.now(),
  };
  list.push(record);
  writeAll(list);
  return stripHash(record);
}

export function deleteStaff(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** Internal — used by adminAuth.js during login. Includes the hash. */
export function findStaffByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  return readAll().find((s) => s.email === normalized) || null;
}

export function subscribeToStaff(callback) {
  const handler = () => callback(getStaff());
  window.addEventListener(UPDATE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const STAFF_UPDATE_EVENT = UPDATE_EVENT;
