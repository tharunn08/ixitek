// Small shared helper — SHA-256 hashing done entirely in the browser via the
// Web Crypto API. Used by adminAuth.js (the primary login) and staffStore.js
// (teammate accounts) so neither ever stores a raw password.
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text ?? "");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
