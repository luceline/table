// Agenda des disponibilités (semaine type, par jeu) et propositions de partie.
// Mon agenda est privé : les autres joueurs ne reçoivent que les créneaux en commun (route /api/table/agenda-matches).
import { useEffect, useState } from "react";
import { pb, safeUn } from "../pb.js";

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Préférences de jeu, montrées aux joueurs disponibles en même temps (not : préférence contraire, décochée d'office)
export const PREFS = [
  { id: "vocal", label: "🎧 Vocal OK", not: "novocal" },
  { id: "novocal", label: "🔇 Sans vocal", not: "vocal" },
  { id: "filme", label: "🎥 Je joue filmé (cartes réelles)" },
  { id: "numerique", label: "🃏 Cartes numériques" },
  { id: "pret", label: "🤝 Je peux prêter un deck" },
  { id: "debutant", label: "🌱 Débutant" },
  { id: "explique", label: "📚 J'explique les règles" },
  { id: "detente", label: "😌 Partie détente", not: "compet" },
  { id: "compet", label: "🏆 Compétitif", not: "detente" },
];
export const PREF_BY_ID = Object.fromEntries(PREFS.map((p) => [p.id, p]));
const W = 7 * 1440;

// 1230 -> "20 h 30"
export const hm = (m) => {
  if (m === 1440) return "minuit";
  m = ((m % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
// heures proposées dans les listes : toutes les 30 minutes
export const STEPS = Array.from({ length: 49 }, (_, i) => i * 30);
export const curOff = () => new Date().getTimezoneOffset(); // minutes, UTC - heure locale

const pbDate = (v) => String(v || "").replace(" ", "T");
const toPb = (d) => d.toISOString().replace("T", " ");

// Lundi de la semaine suivante, 0 h (heure locale)
export function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((7 - ((d.getDay() + 6) % 7)) || 7));
  return d;
}
export const isPaused = (rec) => !!rec?.paused_until && new Date(pbDate(rec.paused_until)) > new Date();

export async function loadAvail(userId, tcg) {
  try {
    return await pb.collection("avail").getFirstListItem(`user = "${userId}" && tcg = "${tcg}"`, { requestKey: null });
  } catch (_) {
    return null;
  }
}

export async function saveAvail(rec, userId, tcg, patch) {
  const data = { off: curOff(), ...patch };
  if (rec) return pb.collection("avail").update(rec.id, data, { requestKey: null });
  return pb.collection("avail").create({ user: userId, tcg, slots: [], ...data }, { requestKey: null });
}

// Changement d'heure (été / hiver) : le décalage enregistré suit celui du navigateur, sans rien demander
export async function syncOffsets(userId) {
  try {
    const list = await pb.collection("avail").getFullList({ filter: `user = "${userId}"`, requestKey: null });
    for (const r of list) if (r.off !== curOff()) await pb.collection("avail").update(r.id, { off: curOff() }, { requestKey: null });
  } catch (_) {}
}

// Créneaux en commun renvoyés en minutes de la semaine UTC -> heure locale : { d, s, e (peut dépasser 1440), len }
export function localSlot([a, b]) {
  const la = (((a - curOff()) % W) + W) % W;
  const d = Math.floor(la / 1440);
  const s = la % 1440;
  return { d, s, e: s + (b - a), len: b - a };
}

export function slotText(sl) {
  const end = sl.e > 1440 ? `${hm(sl.e)} (${DAYS[(sl.d + 1) % 7].toLowerCase()})` : hm(sl.e);
  return `${DAYS[sl.d]} de ${hm(sl.s)} à ${end}`;
}

// Prochaines dates d'un créneau de la semaine type (cette semaine et la suivante), encore à venir
export function occurrences(sl, n = 2) {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const today = (base.getDay() + 6) % 7;
  for (let w = 0; out.length < n && w < 3; w++) {
    const day = new Date(base);
    day.setDate(base.getDate() + ((sl.d - today + 7) % 7) + 7 * w);
    const end = new Date(day.getTime() + sl.e * 60000);
    if (end > new Date(Date.now() + 30 * 60000)) out.push(day);
  }
  return out;
}

export function dayText(d) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  const long = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return diff === 0 ? `aujourd'hui (${long})` : diff === 1 ? `demain (${long})` : long;
}

export function whenText(at, end) {
  const a = new Date(pbDate(at));
  const e = end ? new Date(pbDate(end)) : null;
  const day = dayText(new Date(a.getFullYear(), a.getMonth(), a.getDate()));
  const t = (d) => hm(d.getHours() * 60 + d.getMinutes());
  const late = e && (e.getHours() * 60 + e.getMinutes() === 0) ? "minuit" : e ? t(e) : "";
  return `${day}, ${t(a)}${e ? ` à ${late}` : ""}`;
}

export async function loadMatches(tcg) {
  try {
    const r = await pb.send(`/api/table/agenda-matches?tcg=${tcg}`, { requestKey: null });
    // créneaux rangés par date à venir (aujourd'hui d'abord)
    const today = (new Date().getDay() + 6) % 7;
    const rank = (sl) => ((sl.d - today + 7) % 7) * 1440 + sl.s;
    return (r.players || []).map((p) => ({ ...p, slots: p.slots.map(localSlot).sort((x, y) => rank(x) - rank(y)) }));
  } catch (_) {
    return [];
  }
}

export async function loadInvites(userId, tcg) {
  const since = toPb(new Date(Date.now() - 3 * 3600 * 1000));
  try {
    return await pb.collection("invites").getFullList({
      filter: `(from = "${userId}" || to = "${userId}") && tcg = "${tcg}" && at >= "${since}" && status != "cancelled"`,
      sort: "at",
      requestKey: null,
    });
  } catch (_) {
    return [];
  }
}

export async function sendInvite({ me, to, toName, tcg, at, end, note }) {
  return pb.collection("invites").create({
    from: me.id, to, tcg, at: toPb(at), end: toPb(end), note: note.trim().slice(0, 200),
    label: whenText(toPb(at), toPb(end)), from_name: me.name || "Joueur", to_name: toName || "Joueur", status: "pending",
  }, { requestKey: null });
}

// Accueil : propositions reçues en attente, parties prévues, joueurs en commun (tenu à jour en direct)
export function useAgenda(userId, tcg) {
  const [invites, setInvites] = useState([]);
  const [players, setPlayers] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    syncOffsets(userId).then(() => loadMatches(tcg)).then((p) => alive && setPlayers(p));
    return () => { alive = false; };
  }, [userId, tcg]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let unsub = null;
    const refresh = () => loadInvites(userId, tcg).then((l) => alive && setInvites(l));
    refresh();
    pb.collection("invites").subscribe("*", refresh, { requestKey: null })
      .then((u) => (alive ? (unsub = u) : safeUn(u)))
      .catch(() => {});
    const t = setInterval(() => setTick((n) => n + 1), 30000); // boutons « Ouvrir la table » à l'heure dite
    return () => { alive = false; safeUn(unsub); clearInterval(t); };
  }, [userId, tcg]);
  const received = invites.filter((i) => i.status === "pending" && i.to === userId);
  const planned = invites.filter((i) => i.status === "accepted");
  return { invites, received, planned, players, tick };
}

// Une partie prévue peut se lancer 30 minutes avant l'heure, et jusqu'à la fin du créneau
export function startFrom(inv) {
  const a = new Date(new Date(pbDate(inv.at)).getTime() - 30 * 60000);
  return a.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
}
export function canStart(inv) {
  const a = new Date(pbDate(inv.at)).getTime();
  const e = inv.end ? new Date(pbDate(inv.end)).getTime() : a + 3 * 3600 * 1000;
  return Date.now() >= a - 30 * 60000 && Date.now() <= e;
}
