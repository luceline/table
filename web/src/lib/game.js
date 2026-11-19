// État d'un joueur (stocké dans games.s1 / games.s2) :
// { name, deckId, deckName, cards: {iid: {c, f, n, o, tok?}}, reserve: [{tid, c, f, n, o}], deck: [iid], hand: [iid],
//   piles: {d1:[], d2:[], d3:[]}, board: [{iid, x, y, rot, down}], pi, pv, log: [{t, m}] }
// Jetons partagés (games.tokens) : {rev, by, list: [{id, side: 'p1'|'p2', x, y, color, v, on?, dx?, dy?}]}
// on = iid de la carte portant le jeton (dx, dy = décalage dans le repère de la carte)

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
  for (const e of deck.entries || []) {
    const rec = cardsById[e.card];
    if (!rec || !(e.qty > 0)) continue;
    const base = { c: rec.id, f: rec.image, n: rec.name || "Carte", o: rec.orient || "p", v: parseVal(rec.val) };
    // Cartes jetons : modèles en réserve, copies illimitées, jamais dans le deck
    if (rec.kind === "jeton") {
      reserve.push({ tid: rec.id, ...base });
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
    cards[iid] = { c: cmd.id, f: cmd.image, n: cmd.name || "Commandant", o: cmd.orient || "l", cmd: true };
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
    piles: { d1: [], d2: [], d3: [] },
    board,
    pi: START_PI,
    pv: START_PV,
    ...TURN_RESET,
    log: [{ t: Date.now(), m: `rejoint la table avec le deck « ${deck.name} » (${ids.length} cartes${reserve.length ? `, ${reserve.length} carte(s) jeton` : ""}${cmd ? `, commandant « ${cmd.name} »` : ""})` }],
  };
}

// Zone Commandant du tapis (x 6.5, y 226, 88 x 63) ; une carte portrait y est couchée
export function commanderSpot(iid, o) {
  return { iid, x: 6.5 + 44, y: 226 + 31.5, rot: o === "p" ? 90 : 0, down: false };
}

export const START_PI = 4;
export const START_PV = 0;

// Phases d'un tour de joueur (règles « Nos Règles s3 », chapitre VI)
export const PHASES = [
  { id: "lan", label: "Lancement", short: "Lanc." },
  { id: "inv", label: "Invocation", short: "Invoc." },
  { id: "com", label: "Combat", short: "Combat" },
  { id: "cal", label: "Calcul PI/PV", short: "Calcul" },
];
export const PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p]));

// Bonus rappelés sous le badge d'unification (Saison 3, Kin)
export const UNIF_BONUS = ["", "+1 DEF", "+1 ATK, +1 pioche", "+1 Valeur, +1 PI"];

// phase = null hors de son tour ; turn = numéro de son tour (début de tour à début de tour suivant)
// arrows = flèches d'attaque / de ciblage ; mull = mulligan déjà fait
export const TURN_RESET = { phase: null, turn: 0, unif: 0, arrows: [], mull: false };

export function resetState(s) {
  const cards = {};
  for (const [k, v] of Object.entries(s.cards)) if (!v.tok) cards[k] = v;
  const cmd = Object.keys(cards).filter((k) => cards[k].cmd);
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
  return { name: "", cards: {}, reserve: [], deck: [], hand: [], piles: { d1: [], d2: [], d3: [] }, board: [], pi: START_PI, pv: START_PV, ...TURN_RESET, log: [] };
}

export function normalize(s) {
  if (!s || typeof s !== "object" || !s.cards) return emptyState();
  return {
    ...emptyState(),
    ...s,
    piles: { d1: [], d2: [], d3: [], ...(s.piles || {}) },
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
