import { normTcg } from "./tcg.js";
// Présence (qui est en ligne), titres des joueurs et fiches de profil
import { useEffect, useState } from "react";
import { pb, me } from "../pb.js";

const nowIso = () => new Date().toISOString().replace("T", " ");
let rec = null; // mon enregistrement « online »
let where = "accueil";
let timer = null;

// Signe de vie toutes les 60 s quand l'appli est affichée (pas si le joueur a choisi d'apparaître hors ligne)
async function beat() {
  const u = me();
  if (!u || document.visibilityState !== "visible") return;
  if (u.hide_online) {
    if (rec) pb.collection("online").delete(rec.id, { requestKey: null }).catch(() => {});
    rec = null;
    return;
  }
  try {
    if (rec) {
      rec = await pb.collection("online").update(rec.id, { at: nowIso(), where }, { requestKey: null });
      return;
    }
  } catch (_) {
    rec = null;
  }
  try {
    rec = await pb.collection("online").getFirstListItem(`user = "${u.id}"`, { requestKey: null });
    rec = await pb.collection("online").update(rec.id, { at: nowIso(), where }, { requestKey: null });
  } catch (_) {
    rec = await pb.collection("online").create({ user: u.id, at: nowIso(), where }, { requestKey: null }).catch(() => null);
  }
}
export function startPresence() {
  if (timer) return;
  beat();
  timer = setInterval(beat, 60000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && beat());
}
// Endroit affiché aux autres : accueil, salons, partie, vocal
export function setWhere(w) {
  if (w === where) return;
  where = w;
  beat();
}
export async function goOffline() {
  if (rec) await pb.collection("online").delete(rec.id, { requestKey: null }).catch(() => {});
  rec = null;
}

export const WHERE = { accueil: "sur l'accueil", salons: "dans les salons", partie: "en partie", vocal: "au vocal", carte: "à la carte du jour" };

// Qui est en ligne, parties en cours et vocal, pour un jeu (rafraîchi toutes les 45 s)
export function useOnline(tcg) {
  const [data, setData] = useState({ online: [], games: 0, voice: 0, ids: new Set() });
  useEffect(() => {
    let alive = true;
    const load = () =>
      pb.send(`/api/table/online?tcg=${normTcg(tcg)}`, { requestKey: null })
        .then((r) => alive && setData({ ...r, ids: new Set((r.online || []).map((x) => x.id)) }))
        .catch(() => {});
    load();
    const t = setInterval(load, 45000);
    return () => { alive = false; clearInterval(t); };
  }, [tcg]);
  return data;
}

// Titres (selon les parties des 30 derniers jours), gardés 10 minutes
const titleCache = new Map(); // id -> { t, at }
export function useTitles(ids) {
  const key = [...new Set(ids)].filter(Boolean).sort().join(",");
  const [, setN] = useState(0);
  useEffect(() => {
    const need = key.split(",").filter((id) => id && !(titleCache.get(id)?.at > Date.now() - 600000));
    if (!need.length) return;
    let alive = true;
    pb.send(`/api/table/titles?ids=${need.slice(0, 60).join(",")}`, { requestKey: null })
      .then((r) => {
        for (const id of need) titleCache.set(id, { t: r.titles?.[id] || null, at: Date.now() });
        if (alive) setN((n) => n + 1);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return (id) => titleCache.get(id)?.t || null;
}

export const loadProfile = (uid) => pb.send(`/api/table/profile?u=${uid}`, { requestKey: null });
