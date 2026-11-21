// Tribune des spectateurs (tchat) et présence des spectateurs (compteur pour les joueurs).
import { pb, PB_URL, safeUn } from "../pb.js";
import { rid } from "./game.js";

export const BEAT_MS = 30000; // un spectateur se signale toutes les 30 s
const ALIVE_MS = 75000; // au-delà, il est considéré comme parti
const NAME_KEY = "table_spec_name";
const MUTE_KEY = "table_tribune_mute";

// Écart entre l'horloge du serveur et celle de l'appareil (les dates des lignes sont celles du serveur)
let skewP = null;
export function serverSkew() {
  if (!skewP) {
    skewP = fetch(`${PB_URL}/api/health`, { cache: "no-store" })
      .then((r) => {
        const d = Date.parse(r.headers.get("date") || "");
        return Number.isFinite(d) ? d - Date.now() : 0;
      })
      .catch(() => 0);
  }
  return skewP;
}

const pbDate = (s) => Date.parse(String(s || "").replace(" ", "T"));

export function countAlive(list, skew) {
  const now = Date.now() + (skew || 0);
  return list.filter((w) => now - pbDate(w.updated) < ALIVE_MS).length;
}

// Nombre de spectateurs présents (joueurs ; spectateurs avec query = {spectate}), mis à jour en direct. Renvoie une fonction d'arrêt.
export function watchCount(gameId, onCount, query) {
  const opt = query ? { query } : {};
  let stop = false;
  let list = [];
  let skew = 0;
  let unsub = null;
  const emit = () => !stop && onCount(countAlive(list, skew));
  const load = async () => {
    try {
      list = await pb.collection("watchers").getFullList({ filter: `game="${gameId}"`, fields: "id,sid,updated", ...opt });
      emit();
      // ménage : lignes de spectateurs partis depuis plus d'une heure
      const old = Date.now() + skew - 3600000;
      list.filter((w) => pbDate(w.updated) < old).forEach((w) => pb.collection("watchers").delete(w.id, opt).catch(() => {}));
    } catch (_) { /* collection absente ou hors ligne */ }
  };
  (async () => {
    skew = await serverSkew();
    await load();
    try {
      unsub = await pb.collection("watchers").subscribe("*", (e) => {
        if (e.record.game !== gameId) return;
        if (e.action === "delete") list = list.filter((w) => w.id !== e.record.id);
        else list = [...list.filter((w) => w.id !== e.record.id), e.record];
        emit();
      }, { filter: `game="${gameId}"`, ...opt });
      if (stop) safeUn(unsub);
    } catch (_) {}
  })();
  const tick = setInterval(emit, 15000);
  const reload = setInterval(load, 120000);
  return () => {
    stop = true;
    clearInterval(tick);
    clearInterval(reload);
    safeUn(unsub);
  };
}

// Côté spectateur : se signaler présent tant que la page est ouverte. Renvoie une fonction d'arrêt.
export function beWatcher(gameId, code) {
  const q = { spectate: code };
  let sid = "";
  try {
    sid = sessionStorage.getItem("table_watch_sid") || "";
    if (!sid) sessionStorage.setItem("table_watch_sid", (sid = rid(12)));
  } catch (_) {
    sid = rid(12);
  }
  let recId = null;
  let beat = 0;
  let stop = false;
  const ping = async () => {
    if (stop || document.visibilityState === "hidden") return;
    try {
      if (recId) {
        await pb.collection("watchers").update(recId, { beat: ++beat }, { query: q });
        return;
      }
      try {
        const r = await pb.collection("watchers").create({ game: gameId, sid, beat: 0 }, { query: q });
        recId = r.id;
      } catch (_) {
        // déjà présent (rechargement de la page) : on reprend sa ligne
        const r = await pb.collection("watchers").getFirstListItem(`game="${gameId}" && sid="${sid}"`, { query: q });
        recId = r.id;
        await pb.collection("watchers").update(recId, { beat: ++beat }, { query: q });
      }
    } catch (_) {
      recId = null; // ligne supprimée (ménage) : recréée au prochain battement
    }
  };
  const leave = () => {
    if (!recId) return;
    // keepalive : la requête part même si la page se ferme
    fetch(`${PB_URL}/api/collections/watchers/records/${recId}?spectate=${encodeURIComponent(code)}`, { method: "DELETE", keepalive: true }).catch(() => {});
    recId = null;
  };
  const vis = () => (document.visibilityState === "visible" ? ping() : null);
  ping();
  const t = setInterval(ping, BEAT_MS);
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("pagehide", leave);
  return () => {
    stop = true;
    clearInterval(t);
    document.removeEventListener("visibilitychange", vis);
    window.removeEventListener("pagehide", leave);
    leave();
  };
}

export function specName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch (_) { return ""; }
}
export function setSpecName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch (_) {}
}
export function tribuneMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (_) { return false; }
}
export function setTribuneMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch (_) {}
}
