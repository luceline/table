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

export const FAB_PITCH_VAL = { r: 1, y: 2, b: 3 };

export function buildState({ name, deck, cardsById }) {
  const cards = {};
  const ids = [];
  const reserve = [];
  const inv = []; // Flesh and Blood : armes et équipements, hors deck
  const atlas = []; // Sorcery : atlas (deck de sites)
  for (const e of deck.entries || []) {
    const rec = cardsById[e.card];
    if (!rec || !(e.qty > 0)) continue;
    const base = { c: rec.id, f: rec.image, n: rec.name || "Carte", o: rec.orient || "p", v: parseVal(rec.val), a: parseVal(rec.atk), d: parseVal(rec.def), k: kinSub(rec.factions) };
    // Flesh and Blood : valeur de pitch déduite de la couleur (rouge 1, jaune 2, bleu 3), ajoutée aux RES quand la carte est pitchée
    if (TCG === "fab" && FAB_PITCH_VAL[rec.pitch]) base.p = FAB_PITCH_VAL[rec.pitch];
    // Cartes jetons : modèles en réserve, copies illimitées, jamais dans le deck
    // (tok : carte normale choisie aussi comme jeton, son entrée de réserve est distincte de celle du deck)
    if (rec.kind === "jeton" || e.tok) {
      reserve.push({ tid: rec.id, ...base });
      continue;
    }
    // Sorcery : éléments (seuil des sorts, affinité des sites) ; sites rangés dans l'atlas, à part du grimoire
    if (TCG === "sorcery") {
      const el = sorcElements(rec.factions);
      if (el.length) base.el = el;
      if (rec.kind === "site") {
        base.site = true;
        for (let i = 0; i < e.qty; i++) {
          const iid = rid(7);
          cards[iid] = { ...base };
          atlas.push(iid);
        }
        continue;
      }
    }
    if (TCG === "fab" && rec.kind === "arene") {
      for (let i = 0; i < e.qty; i++) {
        const iid = rid(7);
        cards[iid] = { ...base, arena: true };
        inv.push(iid);
      }
      continue;
    }
    // effet d'arrivée choisi dans l'éditeur de deck (Safir)
    // aura de puissance choisie dans l'éditeur de deck (les effets Yan, Lin, Tian viennent d'office de la sous-faction)
    const card = TCG === "safir" && e.fx === "aura" ? { ...base, fx: "aura" } : base;
    for (let i = 0; i < e.qty; i++) {
      const iid = rid(7);
      cards[iid] = card;
      ids.push(iid);
    }
  }
  // Commandant (facultatif) : hors du deck, posé d'office dans la zone Commandant
  const board = [];
  const cmd = deck.commander && cardsById[deck.commander];
  if (cmd) {
    const iid = rid(7);
    cards[iid] = { c: cmd.id, f: cmd.image, n: cmd.name || (TCG === "fab" ? "Héros" : TCG === "sorcery" ? "Avatar" : "Commandant"), o: cmd.orient || (TCG === "safir" ? "l" : "p"), cmd: true };
    // Sorcery : la vie de départ est imprimée sur l'avatar (saisie dans « Coût / Vie » au scan), 20 par défaut
    if (TCG === "sorcery") cards[iid].life = parseVal(cmd.val) || SORC_LIFE;
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
    piles: TCG === "fab" ? { ...emptyPiles(), inv } : TCG === "sorcery" ? { ...emptyPiles(), atlas: shuffle(atlas) } : { d1: [], d2: [], d3: [] },
    board,
    pi: START_PI,
    pv: TCG === "fab" ? fabLife(deck.format) : TCG === "sorcery" ? sorcLife(cards) : START_PV,
    ...TURN_RESET,
    ...(TCG === "fab" ? { format: FAB_FORMATS[deck.format] ? deck.format : "cc" } : null),
    log: [{ t: Date.now(), m: TCG === "sorcery"
      ? `rejoint la table avec le deck « ${deck.name} » (grimoire de ${ids.length} cartes, atlas de ${atlas.length} sites${cmd ? `, avatar « ${cmd.name} »` : ""})`
      : TCG === "fab"
      ? `rejoint la table avec le deck « ${deck.name} » (${FAB_FORMATS[deck.format] || FAB_FORMATS.cc}${deck.initiation ? " initiation" : ""}, ${ids.length} cartes${inv.length ? `, ${inv.length} arme(s) et équipement(s)` : ""}${cmd ? `, héros « ${cmd.name} »` : ""})`
      : `rejoint la table avec le deck « ${deck.name} » (${ids.length} cartes${reserve.length ? `, ${reserve.length} carte(s) jeton` : ""}${cmd ? `, commandant « ${cmd.name} »` : ""})` }],
  };
}

// Zone Commandant du tapis (x 6.5, y 226, 88 x 63) ; une carte portrait y est couchée
export function commanderSpot(iid, o) {
  if (TCG === "sorcery") {
    // case du milieu de sa rangée (la plus proche de soi)
    return { iid, x: 300, y: 309, rot: o === "l" ? 90 : 0, down: false };
  }
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
export const FAB_FORMATS = { cc: "Classic Constructed", sage: "Silver Age", blitz: "Blitz" };
export const fabLife = (format) => (format === "blitz" || format === "sage" ? 20 : 40); // valeur de départ (jeune héros : 20), à ajuster selon le héros

// Sorcery : début, principale, fin (identifiants repris des couleurs des phases Safir)
const SORC_PHASES = [
  { id: "lan", label: "Début", short: "Début" },
  { id: "com", label: "Principale", short: "Princ." },
  { id: "cal", label: "Fin", short: "Fin" },
];
export const SORC_LIFE = 20;
// Vie de départ : celle de l'avatar
export const sorcLife = (cards) => Object.values(cards || {}).find((c) => c.cmd)?.life || SORC_LIFE;
// Les quatre éléments (seuils et affinité), tels que saisis au scan
export const SORC_ELEMENTS = [
  { id: "Air", label: "Air", icon: "💨", hex: "#a9c7e8" },
  { id: "Terre", label: "Terre", icon: "⛰️", hex: "#b59a6a" },
  { id: "Feu", label: "Feu", icon: "🔥", hex: "#e0643c" },
  { id: "Eau", label: "Eau", icon: "💧", hex: "#3f8fd6" },
];
// Éléments d'une carte : une même valeur peut apparaître plusieurs fois (« Feu », « Feu » = seuil de 2 en Feu)
export const sorcElements = (factions) => (Array.isArray(factions) ? factions.filter((f) => SORC_ELEMENTS.some((e) => e.id === f)) : []);
// Affinité d'un joueur : éléments de ses sites face visible dans le royaume ; mana : 1 par site
export function sorcAffinity(st) {
  const out = { Air: 0, Terre: 0, Feu: 0, Eau: 0, sites: 0 };
  for (const b of st?.board || []) {
    const c = st.cards?.[b.iid];
    if (!c?.site || b.down) continue;
    out.sites++;
    for (const e of c.el || []) out[e]++;
  }
  return out;
}

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
  const sorc = id === "sorcery";
  TCG = fab ? "fab" : sorc ? "sorcery" : "safir";
  START_PI = fab || sorc ? 0 : 4;
  START_PV = fab ? 40 : sorc ? SORC_LIFE : 0;
  PHASES = fab ? FAB_PHASES : sorc ? SORC_PHASES : SAFIR_PHASES;
  PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));
  PILE_IDS = fab ? ["pitch", "grave", "banish"] : sorc ? ["atlas", "grave", "banish"] : ["d1", "d2", "d3"];
}

// Bonus rappelés sous le badge d'unification (Saison 3, Kin)
// Bonus cumulés : le niveau 2 donne aussi celui du 1, le niveau 3 ceux du 1 et du 2
export const UNIF_BONUS = ["", "+1 DEF", "+1 ATK, +1 DEF, +1 pioche", "+1 ATK, +1 DEF, +1 Valeur, +1 pioche, +1 PI"];
// Sous-faction Kin d'une carte (couleur des jetons d'unification) : "Tian", "Yan", "Lin", "Mercenaire" ou ""
export const kinSub = (factions) => (Array.isArray(factions) ? ["Tian", "Yan", "Lin", "Mercenaire"].find((f) => factions.includes(f)) : "") || "";
export const KIN_COLOR = { Yan: "red", Tian: "blue", Lin: "green" };
// Bonus d'unification sur un combattant Tian / Yan / Lin, par niveau (cumulés, d'après le rappel des règles)
export const UNIF_STATS = [null, { a: 0, v: 0, d: 1 }, { a: 1, v: 0, d: 1 }, { a: 1, v: 1, d: 1 }];

// phase = null hors de son tour ; turn = numéro de son tour (début de tour à début de tour suivant)
// arrows = flèches d'attaque / de ciblage ; mull = mulligan déjà fait
export const TURN_RESET = { phase: null, turn: 0, unif: 0, arrows: [], mull: false };

export function resetState(s) {
  const cards = {};
  for (const [k, v] of Object.entries(s.cards)) if (!v.tok) cards[k] = v;
  const cmd = Object.keys(cards).filter((k) => cards[k].cmd);
  if (TCG === "sorcery") {
    // sites dans l'atlas, sorts dans le grimoire, avatar à sa place, vie de l'avatar
    return {
      ...s,
      cards,
      deck: shuffle(Object.keys(cards).filter((k) => !cards[k].cmd && !cards[k].site)),
      hand: [],
      piles: { ...emptyPiles(), atlas: shuffle(Object.keys(cards).filter((k) => cards[k].site)) },
      board: cmd.map((k) => commanderSpot(k, cards[k].o)),
      pi: START_PI,
      pv: sorcLife(cards),
      ...TURN_RESET,
      ping: null,
      reveal: null,
    };
  }
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
  if (TCG === "sorcery") return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: emptyPiles(), board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
  if (TCG === "fab") return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: { ...emptyPiles(), inv: [] }, board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
  return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: { d1: [], d2: [], d3: [] }, board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
}

export function normalize(s) {
  if (!s || typeof s !== "object" || !s.cards) return emptyState();
  // Cartes jetons égarées hors du plateau (anciennes versions : renvoyées dans le deck, en main ou dans une pile) : elles quittent le jeu,
  // sauf en Safir dans les défausses de territoire
  if (Object.values(s.cards).some((c) => c?.tok)) {
    const onBoard = new Set((s.board || []).map((b) => b.iid));
    const stray = (iid) => s.cards[iid]?.tok && !onBoard.has(iid);
    // Safir : les jetons restent dans les défausses de territoire (effets de cartes)
    const where = [...(s.deck || []), ...(s.hand || []), ...Object.entries(s.piles || {}).filter(([k]) => !(TCG === "safir" && /^d[123]$/.test(k))).flatMap(([, v]) => v || [])];
    if (where.some(stray)) {
      const cards = { ...s.cards };
      for (const iid of where) if (stray(iid)) delete cards[iid];
      const keep = (arr) => (arr || []).filter((iid) => cards[iid] || !s.cards[iid]);
      s = { ...s, cards, deck: keep(s.deck), hand: keep(s.hand), piles: Object.fromEntries(Object.entries(s.piles || {}).map(([k, v]) => [k, keep(v)])) };
    }
  }
  return {
    ...emptyState(),
    ...s,
    piles: TCG === "fab" ? { ...emptyPiles(), inv: [], ...(s.piles || {}) } : TCG === "sorcery" ? { ...emptyPiles(), ...(s.piles || {}) } : { d1: [], d2: [], d3: [], ...(s.piles || {}) },
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

// Cartes empilées sur le plateau (posées au même endroit, à moins de STACK_NEAR unités) : regroupées dans l'ordre du plateau
// (la dernière posée est dessus). Chaque carte est décalée vers le bas de l'écran pour laisser voir le haut (nom) de celles du dessous
// (dy dans le repère du propriétaire : à inverser pour un tapis vu retourné).
const STACK_NEAR = 18;
export function stacksOf(board) {
  const groups = [];
  const at = {};
  for (const b of board || []) {
    const g = groups.find((q) => Math.abs(q.x - b.x) < STACK_NEAR && Math.abs(q.y - b.y) < STACK_NEAR);
    if (g) g.ids.push(b.iid);
    else groups.push({ x: b.x, y: b.y, ids: [b.iid] });
  }
  for (const g of groups) {
    const n = g.ids.length;
    const step = n > 1 ? Math.min(13, 36 / (n - 1)) : 0;
    // décalage centré : la pile reste à l'endroit où elle a été posée
    g.ids.forEach((iid, i) => (at[iid] = { dy: (i - (n - 1) / 2) * step, i, n, ids: g.ids }));
  }
  return at;
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
    if (typeof c.v === "number") out[t].sum += Math.max(0, c.v + (b.u === 3 ? 1 : 0) + (b.bx?.v || 0)); // unification 3 : +1 Valeur ; bonus d'autres cartes
    else out[t].unknown++;
  }
  return out;
}
