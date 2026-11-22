// Safir : cartes limitées et bannies pour les événements et tournois officiels (liste communiquée par l'éditeur ;
// elle peut évoluer à tout moment). Le deck n'est jamais bloqué : les noms sont saisis à la main au scan et peuvent
// contenir des fautes, l'appli prévient seulement quand un nom ressemble à une carte de la liste.
import { nameKey } from "./deckrules.js";

export const BANLIST_NOTE = "Liste à respecter pour les événements et tournois officiels. Elle peut évoluer à tout moment.";
// max : 0 = bannie, 1 = limitée à 1 exemplaire
export const BANLIST = [
  { season: "Saison 1", n: "31", name: "Adieu", max: 1 },
  { season: "Saison 1", n: "46", name: "Eraimel du néant", max: 1 },
  { season: "Saison 1", n: "49", name: "Potions", max: 0 },
  { season: "Saison 1", n: "82", name: "Norcam", max: 0 },
  { season: "Saison 1", n: "85", name: "Contrôle Mental", max: 0 },
  { season: "Saison 1", n: "100", name: "Blackstar", max: 1 },
  { season: "Saison 1", n: "108", name: "Mooneater", max: 1 },
  { season: "Saison 1", n: "109", name: "Stareater", max: 1 },
  { season: "Saison 1", n: "110", name: "Temujin et Attila", max: 0 },
  { season: "Saison 1", n: "114", name: "Akkad", max: 0 },
  { season: "Saison 1", n: "124", name: "Solitude", max: 1 },
  { season: "Saison 1", n: "125", name: "Gros raton", max: 1 },
  { season: "Saison 2", n: "21", name: "Episte", max: 1 },
  { season: "Saison 2", n: "80", name: "Prêtresse", max: 1 },
  { season: "Saison 2", n: "85", name: "Oxel", max: 1 },
  { season: "Saison 2", n: "86", name: "Sirène des forêts", max: 1 },
  { season: "Saison 2", n: "98", name: "Ziakos", max: 1 },
  { season: "Saison 2", n: "136", name: "Lyra l'œil des tempêtes", max: 1 },
  { season: "Saison 2", n: "143", name: "Arbre de Kin", max: 0 },
  { season: "Saison 2", n: "149", name: "Soutien des Cieux", max: 0 },
  { season: "Saison 2", n: "160", name: "Aki de la foudre", max: 0 },
  { season: "Saison 2.5", n: "P/100", name: "Tigre de Barf (promo)", max: 0, alias: ["Tigre de Barf"] },
  { season: "Saison 2.5", n: "P/100", name: "Réveillon", max: 1 },
  { season: "Saison 3", n: "199", name: "Trou Noir", max: 0 },
];
export const banText = (b) => (b.max === 0 ? "bannie" : `limitée à ${b.max}`);

// Nom comparable : sans accents, majuscules, ponctuation ni ligatures (œ -> oe)
const norm = (t) => nameKey(String(t || "").replace(/œ/gi, "oe").replace(/æ/gi, "ae").replace(/&/g, " et ")).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Recherche dans une liste : nom exact (après nettoyage), ou ressemblant (fautes de frappe : 1 lettre d'écart, 2 pour les noms longs)
export function makeMatcher(list) {
  const KEYS = list.map((b) => ({ b, keys: [b.name, ...(b.alias || [])].map(norm) }));
  return (name) => {
    const k = norm(name);
    if (!k) return [];
    const exact = KEYS.filter(({ keys }) => keys.includes(k)).map(({ b }) => ({ b, exact: true }));
    if (exact.length) return exact;
    const near = [];
    for (const { b, keys } of KEYS) {
      if (keys.some((key) => { const tol = key.length >= 10 ? 2 : key.length >= 5 ? 1 : 0; return tol && lev(k, key) <= tol; })) near.push({ b, exact: false });
    }
    return near;
  };
}
const matchSafir = makeMatcher(BANLIST);
export const banMatch = (name) => matchSafir(name)[0] || null;

// Avertissements d'un deck (commandant compris) : [{ text, ban }]
export function banWarnings(entries, cardsById, commander) {
  const found = new Map(); // carte de la liste -> { n, names, exact }
  const add = (c, qty) => {
    const m = c && banMatch(c.name);
    if (!m) return;
    const f = found.get(m.b) || { n: 0, names: new Set(), exact: true };
    f.n += qty;
    f.names.add(c.name);
    f.exact = f.exact && m.exact;
    found.set(m.b, f);
  };
  for (const e of entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || e.tok || !(e.qty > 0)) continue;
    add(c, e.qty);
  }
  if (commander) add(cardsById[commander], 1);
  const out = [];
  for (const [b, f] of found) {
    if (f.n <= b.max) continue;
    const seen = [...f.names].map((n) => `« ${n} »`).join(", ");
    const like = f.exact ? "" : ` (votre carte ${seen} ressemble à « ${b.name} »)`;
    out.push({
      ban: b.max === 0,
      text: b.max === 0
        ? `« ${b.name} » est bannie en événement officiel${like}.`
        : `« ${b.name} » est limitée à ${b.max} exemplaire en événement officiel : ${f.n} dans ce deck${like}.`,
    });
  }
  return out;
}
