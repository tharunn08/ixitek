// compareStore — up to 4 SKUs to compare (per-browser convenience only).
const KEY = "ixitek_compare_v1";
const EVT = "ixitek:compare";
export const MAX_COMPARE = 4;

export function getCompare() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}
export function toggleCompare(p) {
  const list = getCompare();
  const i = list.findIndex((x) => x.slug === p.slug);
  if (i >= 0) list.splice(i, 1);
  else if (list.length < MAX_COMPARE) list.push({ slug: p.slug, sku: p.sku, name: p.name });
  save(list);
  return list;
}
export function clearCompare() {
  save([]);
}
export function onCompareChange(cb) {
  const h = () => cb(getCompare());
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => (window.removeEventListener(EVT, h), window.removeEventListener("storage", h));
}
