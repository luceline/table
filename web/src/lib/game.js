// État d'un joueur (stocké dans games.s1 / games.s2) :
// { name, deckId, deckName, cards: {iid: {c, f, n, o, tok?}}, reserve: [{tid, c, f, n, o}], deck: [iid], hand: [iid],
//   piles: {d1:[], d2:[], d3:[]}, board: [{iid, x, y, rot, down}], pi, pv, log: [{t, m}] }
// Jetons partagés (games.tokens) : {rev, by, list: [{id, side: 'p1'|'p2', x, y, color, v, on?, dx?, dy?}]}
// on = iid de la carte portant le jeton (dx, dy = décalage dans le repère de la carte)

import { SLOTS } from "./mat.js";

export function rid(n = 8) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += a[r[i] % a.length];
  return s;
}

export function genCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) s += a[r[i] % a.length];
  return s;
}

export function shuffle(arr) {
  const a = [...arr];
  const r = crypto.getRandomValues(new Uint32Array(a.length));
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildState({ name, deck, cardsById }) {
  const cards = {};
  const ids = [];
  const reserve = [];
  const inv = []; // Flesh and Blood : armes et équipements, hors deck
  for (const e of deck.entries || []) {
    const rec = cardsById[e.card];
    if (!rec || !(e.qty > 0)) continue;
    const base = { c: rec.id, f: rec.image, n: rec.name || "Carte", o: rec.orient || "p", v: parseVal(rec.val) };
    // Cartes jetons : modèles en réserve, copies illimitées, jamais dans le deck
    // (tok : carte normale choisie aussi comme jeton, son entrée de réserve est distincte de celle du deck)
    if (rec.kind === "jeton" || e.tok) {
      reserve.push({ tid: rec.id, ...base });
      continue;
    }
    if (TCG === "fab" && rec.kind === "arene") {
      for (let i = 0; i < e.qty; i++) {
        const iid = rid(7);
        cards[iid] = { ...base, arena: true };
        inv.push(iid);
      }
      continue;
    }
    for (let i = 0; i < e.qty; i++) {
      const iid = rid(7);
      cards[iid] = base;
      ids.push(iid);
    }
  }
  // Commandant (facultatif) : hors du deck, posé d'office dans la zone Commandant
  const board = [];
  const cmd = deck.commander && cardsById[deck.commander];
  if (cmd) {
    const iid = rid(7);
    cards[iid] = { c: cmd.id, f: cmd.image, n: cmd.name || (TCG === "fab" ? "Héros" : "Commandant"), o: cmd.orient || (TCG === "fab" ? "p" : "l"), cmd: true };
    board.push(commanderSpot(iid, cards[iid].o));
  }
  return {
    name,
    deckId: deck.id,
    deckName: deck.name,
    cards,
    reserve,
    deck: shuffle(ids),
    hand: [],
    piles: TCG === "fab" ? { ...emptyPiles(), inv } : { d1: [], d2: [], d3: [] },
    board,
    pi: START_PI,
    pv: TCG === "fab" ? fabLife(deck.format) : START_PV,
    ...TURN_RESET,
    ...(TCG === "fab" ? { format: deck.format === "blitz" ? "blitz" : "cc" } : null),
    log: [{ t: Date.now(), m: TCG === "fab"
      ? `rejoint la table avec le deck « ${deck.name} » (${FAB_FORMATS[deck.format === "blitz" ? "blitz" : "cc"]}${deck.initiation ? " initiation" : ""}, ${ids.length} cartes${inv.length ? `, ${inv.length} arme(s) et équipement(s)` : ""}${cmd ? `, héros « ${cmd.name} »` : ""})`
      : `rejoint la table avec le deck « ${deck.name} » (${ids.length} cartes${reserve.length ? `, ${reserve.length} carte(s) jeton` : ""}${cmd ? `, commandant « ${cmd.name} »` : ""})` }],
  };
}

// Zone Commandant du tapis (x 6.5, y 226, 88 x 63) ; une carte portrait y est couchée
export function commanderSpot(iid, o) {
  if (TCG === "fab") {
    const h = SLOTS.find((sl) => sl.kind === "hero"); // zone Héros, portrait
    return { iid, x: h.x + h.w / 2, y: h.y + h.h / 2, rot: o === "l" ? 90 : 0, down: false };
  }
  return { iid, x: 6.5 + 44, y: 226 + 31.5, rot: o === "p" ? 90 : 0, down: false };
}

// Phases d'un tour de joueur (règles « Nos Règles s3 », chapitre VI)
const SAFIR_PHASES = [
  { id: "lan", label: "Lancement", short: "Lanc." },
  { id: "inv", label: "Invocation", short: "Invoc." },
  { id: "com", label: "Combat", short: "Combat" },
  { id: "cal", label: "Calcul PI/PV", short: "Calcul" },
];
// Flesh and Blood : début, action, fin (les identifiants reprennent les couleurs des phases Safir)
const FAB_PHASES = [
  { id: "lan", label: "Début", short: "Début" },
  { id: "com", label: "Action", short: "Action" },
  { id: "cal", label: "Fin de tour", short: "Fin" },
];
export const FAB_FORMATS = { cc: "Classic Constructed", blitz: "Blitz" };
export const fabLife = (format) => (format === "blitz" ? 20 : 40); // valeur de départ, à ajuster selon le héros

// ---------- Jeu actif (liaisons vivantes) ----------
export let TCG = "safir";
export let START_PI = 4;
export let START_PV = 0;
export let PHASES = SAFIR_PHASES;
export let PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));
export let PILE_IDS = ["d1", "d2", "d3"];
export const emptyPiles = () => Object.fromEntries(PILE_IDS.map((k) => [k, []]));

export function setRules(id) {
  const fab = id === "fab";
  TCG = fab ? "fab" : "safir";
  START_PI = fab ? 0 : 4;
  START_PV = fab ? 40 : 0;
  PHASES = fab ? FAB_PHASES : SAFIR_PHASES;
  PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));
  PILE_IDS = fab ? ["pitch", "grave", "banish"] : ["d1", "d2", "d3"];
}

// Bonus rappelés sous le badge d'unification (Saison 3, Kin)
// Bonus cumulés : le niveau 2 donne aussi celui du 1, le niveau 3 ceux du 1 et du 2
export const UNIF_BONUS = ["", "+1 DEF", "+1 ATK, +1 DEF, +1 pioche", "+1 ATK, +1 DEF, +1 Valeur, +1 pioche, +1 PI"];

// phase = null hors de son tour ; turn = numéro de son tour (début de tour à début de tour suivant)
// arrows = flèches d'attaque / de ciblage ; mull = mulligan déjà fait
export const TURN_RESET = { phase: null, turn: 0, unif: 0, arrows: [], mull: false };

export function resetState(s) {
  const cards = {};
  for (const [k, v] of Object.entries(s.cards)) if (!v.tok) cards[k] = v;
  const cmd = Object.keys(cards).filter((k) => cards[k].cmd);
  if (TCG === "fab") {
    // armes et équipements reviennent dans l'inventaire, la vie repart de la valeur du format
    return {
      ...s,
      cards,
      deck: shuffle(Object.keys(cards).filter((k) => !cards[k].cmd && !cards[k].arena)),
      hand: [],
      piles: { ...emptyPiles(), inv: Object.keys(cards).filter((k) => cards[k].arena) },
      board: cmd.map((k) => commanderSpot(k, cards[k].o)),
      pi: START_PI,
      pv: fabLife(s.format),
      ...TURN_RESET,
      ping: null,
      reveal: null,
    };
  }
  return {
    ...s,
    cards,
    deck: shuffle(Object.keys(cards).filter((k) => !cards[k].cmd)),
    hand: [],
    piles: { d1: [], d2: [], d3: [] },
    board: cmd.map((k) => commanderSpot(k, cards[k].o)),
    pi: START_PI,
    pv: START_PV,
    ...TURN_RESET,
    ping: null,
    reveal: null,
  };
}

export function emptyState() {
  if (TCG === "fab") return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: { ...emptyPiles(), inv: [] }, board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
  return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: { d1: [], d2: [], d3: [] }, board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
}

export function normalize(s) {
  if (!s || typeof s !== "object" || !s.cards) return emptyState();
  return {
    ...emptyState(),
    ...s,
    piles: TCG === "fab" ? { ...emptyPiles(), inv: [], ...(s.piles || {}) } : { d1: [], d2: [], d3: [], ...(s.piles || {}) },
    arrows: Array.isArray(s.arrows) ? s.arrows : [],
  };
}

// Retire une instance de partout (main, deck, piles, plateau)
export function detach(s, iid) {
  s.hand = s.hand.filter((x) => x !== iid);
  s.deck = s.deck.filter((x) => x !== iid);
  for (const k of Object.keys(s.piles)) s.piles[k] = s.piles[k].filter((x) => x !== iid);
  s.board = s.board.filter((b) => b.iid !== iid);
}

export function whereIs(s, iid) {
  if (s.hand.includes(iid)) return "hand";
  if (s.deck.includes(iid)) return "deck";
  for (const k of Object.keys(s.piles)) if (s.piles[k].includes(iid)) return k;
  if (s.board.some((b) => b.iid === iid)) return "board";
  return null;
}

// k : clé de regroupement (ex. réglages successifs d'un même compteur fusionnés en une ligne)
export function addLog(s, m, k) {
  s.log = [...(s.log || []), k ? { t: Date.now(), m, k } : { t: Date.now(), m }].slice(-150);
}

export const TOKEN_COLORS = [
  { id: "red", hex: "#d64545", label: "Rouge" },
  { id: "blue", hex: "#3b82d6", label: "Bleu" },
  { id: "green", hex: "#3fae6a", label: "Vert" },
  { id: "gold", hex: "#d6a93b", label: "Or" },
  { id: "white", hex: "#e8e6e0", label: "Blanc" },
];
// Marqueurs de territoire prêts à l'emploi (texte libre aussi possible)
export const MARKER_PRESETS = ["Gel", "Bloqué", "Silence", "Immunité", "Bonus", "Malus"];
export const MARKER_ICON = { Gel: "❄", "Bloqué": "⛔", Silence: "🔇", "Immunité": "🛡", Bonus: "▲", Malus: "▼" };

export const TOKEN_HEX = Object.fromEntries(TOKEN_COLORS.map((c) => [c.id, c.hex]));

// Valeur saisie sur la carte : chiffres ou chiffres romains (raretés UR et plus). null si absente ou illisible.
const ROMAN_V = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function parseVal(txt) {
  const t = String(txt ?? "").trim().toUpperCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^[IVXLC]+$/.test(t)) return null;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const a = ROMAN_V[t[i]], b = ROMAN_V[t[i + 1]] || 0;
    n += a < b ? -a : a;
  }
  return n;
}

// Valeur totale des combattants visibles de chaque territoire (indicatif : les effets des cartes ne sont pas pris en compte).
// Les magies, le commandant et les cartes face cachée ne comptent pas.
export function territoryValues(st) {
  const out = [0, 1, 2].map(() => ({ sum: 0, n: 0, unknown: 0 }));
  if (!st) return out;
  for (const b of st.board || []) {
    const c = st.cards?.[b.iid];
    if (!c || c.cmd || b.down) continue;
    if (b.y < 30 || b.y > 130) continue; // rangée des combattants seulement
    const t = b.x < 201.5 ? 0 : b.x < 398.5 ? 1 : 2;
    out[t].n++;
    if (typeof c.v === "number") out[t].sum += c.v;
    else out[t].unknown++;
  }
  return out;
}
