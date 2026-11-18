import PocketBase from "pocketbase";

// Même origine en production : PocketBase est derrière le même préfixe que l'appli (/table).
export const PB_URL = (import.meta.env.VITE_PB_URL || window.location.origin + import.meta.env.BASE_URL).replace(/\/$/, "");
export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

export function me() {
  return pb.authStore.record || pb.authStore.model;
}

export function fileUrl(collection, recordId, filename, thumb) {
  if (!recordId || !filename) return "";
  const base = `${PB_URL}/api/files/${collection}/${recordId}/${filename}`;
  return thumb ? `${base}?thumb=${thumb}` : base;
}

export function cardUrl(c, full = false) {
  // c = { c: recordId, f: filename }
  if (!c) return "";
  return fileUrl("cards", c.c, c.f, full ? null : "0x300");
}

export function errMsg(e) {
  const d = e?.response?.data;
  if (d && typeof d === "object") {
    const k = Object.keys(d)[0];
    if (k && d[k]?.message) return `${k} : ${d[k].message}`;
  }
  return e?.response?.message || e?.message || "Erreur inconnue";
}
