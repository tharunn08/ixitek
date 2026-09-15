// Frontend-only "database" for enquiries and career applications.
//
// There is no backend, so every submission is persisted with
// window.localStorage under the admin's browser profile. This is enough to
// satisfy "every enquiry must be stored and visible in the admin panel" for
// a static site, but it does mean the data lives on one device/browser —
// see ADMIN_SETUP.md if you later want this synced across devices via a
// small backend.

const STORAGE_KEY = "ixitek_admin_enquiries_v1";
const UPDATE_EVENT = "ixitek:enquiries-updated";
const MAX_RECORDS = 500; // keep localStorage from growing without bound

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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_RECORDS)));
  } catch (error) {
    // Most likely a quota error (e.g. large resume attachments). The UI
    // still works — it just won't be able to persist this particular write.
    console.error("[Ixitek] Could not save to the admin panel — browser storage may be full.", error);
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

/** Newest first. */
export function getEnquiries() {
  return readAll()
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

function makeId() {
  return `enq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Save a new enquiry / application.
 * `data.type` should be "enquiry" or "career".
 */
export function addEnquiry(data) {
  const record = {
    id: makeId(),
    status: "new", // new | read | responded | archived
    createdAt: Date.now(),
    ...data,
  };
  const list = readAll();
  list.push(record);
  writeAll(list);
  return record;
}

export function updateEnquiry(id, patch) {
  const list = readAll();
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  writeAll(list);
  return list[idx];
}

export function deleteEnquiry(id) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function clearAllEnquiries() {
  writeAll([]);
}

/** Fires `callback(latestList)` whenever data changes — including from
 * another browser tab (via the native `storage` event). */
export function subscribeToEnquiries(callback) {
  const handler = () => callback(getEnquiries());
  window.addEventListener(UPDATE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const ENQUIRY_UPDATE_EVENT = UPDATE_EVENT;
export const ENQUIRY_STATUSES = ["new", "read", "responded", "archived"];
