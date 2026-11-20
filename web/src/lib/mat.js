// Géométrie du tapis 600 x 300 mm, relevée sur tapis_60x30.svg.
// Toutes les coordonnées sont en mm, origine en haut à gauche du tapis du joueur.

export const MAT_W = 600;
export let MAT_H = 300; // Safir 300 ; Flesh and Blood 386 (une rangée de plus pour la chaîne de combat)
export const GAP = 10; // espace entre les deux tapis à l'écran
export let BOARD_H = MAT_H * 2 + GAP;

export const CARD = { p: { w: 63, h: 88 }, l: { w: 88, h: 63 } };

// ---------- Safir : 3 territoires (combattants, magies, défausse), commandant, deck ----------
const COLS = [
  [6.5, 71.5, 136.5],
  [203.5, 268.5, 333.5],
  [400.5, 465.5, 530.5],
];
const SAFIR_ROMAN = ["I", "II", "III"];

const SAFIR_SLOTS = [];
COLS.forEach((xs, t) =>
  xs.forEach((x, i) => {
    SAFIR_SLOTS.push({ id: `t${t}c${i}`, kind: "combattant", t, x, y: 36, w: 63, h: 88, label: "COMBATTANT" });
    SAFIR_SLOTS.push({ id: `t${t}m${i}`, kind: "magie", t, x, y: 130, w: 63, h: 88, label: "MAGIE" });
  })
);
SAFIR_SLOTS.push({ id: "cmd", kind: "commandant", x: 6.5, y: 226, w: 88, h: 63, label: "COMMANDANT" });

const SAFIR_PILES = [
  { id: "d1", x: 111.5, y: 226, w: 88, h: 63, label: "DÉFAUSSE DU TERRITOIRE I", short: "Défausse I" },
  { id: "d2", x: 256, y: 226, w: 88, h: 63, // centrée sous la magie du milieu du territoire II
    label: "DÉFAUSSE DU TERRITOIRE II", short: "Défausse II" },
  { id: "d3", x: 400.5, y: 226, w: 88, h: 63, label: "DÉFAUSSE DU TERRITOIRE III", short: "Défausse III" },
  { id: "deck", x: 505.5, y: 226, w: 88, h: 63, label: "DECK", short: "Deck" },
];

const SAFIR_TITLES = [
  { x: 103, y: 26, text: "TERRITOIRE I" },
  { x: 300, y: 26, text: "TERRITOIRE II" },
  { x: 497, y: 26, text: "TERRITOIRE III" },
];
const SAFIR_DIVIDERS = [201.5, 398.5];

// ---------- Flesh and Blood : schéma maison des zones (pas le visuel officiel) ----------
// Disposition du tapis officiel (traduite) : chaîne de combat en haut, au centre de la table ;
// à gauche tête, torse, bras, jambes ; au centre arme, héros, arme et l'arsenal dessous ;
// à droite cimetière, pitch, deck, bannis. Zone libre au-dessus des armes : l'arène (auras, objets, alliés).
// 9 colonnes de 63 mm ; coin haut droit laissé libre pour la loupe du tapis.
const FX = [6, 72, 138, 204, 270, 336, 402, 468, 534];
const FY = [6, 104, 198, 292];
const FAB_H = 386;
const fs = (id, kind, c, r, label, name) => ({ id, kind, x: FX[c], y: FY[r], w: 63, h: 88, label, name });
const FAB_SLOTS = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((c, i) => fs(`ch${i}`, "chain", c, 0, "CHAÎNE", "la chaîne de combat")),
  fs("head", "head", 0, 1, "TÊTE", "Tête"),
  ...[2, 3, 4, 5, 6].map((c, i) => fs(`ar${i}`, "arena", c, 1, "ARÈNE", "l'arène")),
  fs("chest", "chest", 0, 2, "TORSE", "Torse"),
  fs("arms", "arms", 1, 2, "BRAS", "Bras"),
  fs("w1", "weapon", 3, 2, "ARME", "Arme"),
  fs("hero", "hero", 4, 2, "HÉROS", "Héros"),
  fs("w2", "weapon", 5, 2, "ARME", "Arme"),
  fs("legs", "legs", 0, 3, "JAMBES", "Jambes"),
  fs("arsenal", "arsenal", 4, 3, "ARSENAL", "l'arsenal"),
];
const fp = (id, c, r, lines, short, de, dans) => ({ id, x: FX[c], y: FY[r], w: 63, h: 88, lines, label: lines.join(" "), short, de, dans });
const FAB_PILES = [
  fp("pitch", 7, 2, ["PITCH"], "Pitch", "de sa zone de pitch", "dans sa zone de pitch"),
  fp("deck", 8, 2, ["DECK"], "Deck", "de son deck", "dans son deck"),
  fp("grave", 8, 1, ["CIMETIÈRE"], "Cimetière", "de son cimetière", "dans son cimetière"),
  fp("banish", 8, 3, ["BANNIS"], "Bannis", "de ses cartes bannies", "en bannissement"),
];

// ---------- Géométrie du jeu actif (liaisons vivantes : les écrans lisent toujours la valeur courante) ----------
export let SLOTS = SAFIR_SLOTS;
export let PILES = SAFIR_PILES;
export let PILE_BY_ID = Object.fromEntries(PILES.map((p) => [p.id, p]));
export let TITLES = SAFIR_TITLES;
export let DIVIDERS = SAFIR_DIVIDERS;
export let ROMAN = SAFIR_ROMAN;
export let MAT_KIND = "safir";

export function setGeometry(id) {
  const fab = id === "fab";
  MAT_KIND = fab ? "fab" : "safir";
  MAT_H = fab ? FAB_H : 300;
  BOARD_H = MAT_H * 2 + GAP;
  SLOTS = fab ? FAB_SLOTS : SAFIR_SLOTS;
  PILES = fab ? FAB_PILES : SAFIR_PILES;
  PILE_BY_ID = Object.fromEntries(PILES.map((p) => [p.id, p]));
  TITLES = fab ? [] : SAFIR_TITLES;
  DIVIDERS = fab ? [] : SAFIR_DIVIDERS;
  ROMAN = fab ? [] : SAFIR_ROMAN;
}

export const TRACK = { x: 295.5, cw: 101 / 15, ch: 11 };
export const PI_ROW_Y = 232.5;
export const PV_ROWS_Y = [252, 263];

export function piCell(v) {
  return { x: TRACK.x + (v - 1) * TRACK.cw, y: PI_ROW_Y, w: TRACK.cw, h: TRACK.ch };
}
export function pvCell(v) {
  const row = v <= 15 ? 0 : 1;
  const col = (v - 1) % 15;
  return { x: TRACK.x + col * TRACK.cw, y: PV_ROWS_Y[row], w: TRACK.cw, h: TRACK.ch };
}

export function inRect(px, py, r, pad = 0) {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

export function slotAt(x, y) {
  return SLOTS.find((s) => inRect(x, y, s)) || null;
}
export function pileAt(x, y) {
  return PILES.find((p) => inRect(x, y, p, 2)) || null;
}

export function trackAt(x, y) {
  if (x < TRACK.x || x > TRACK.x + 15 * TRACK.cw) return null;
  const col = Math.floor((x - TRACK.x) / TRACK.cw);
  if (y >= PI_ROW_Y && y <= PI_ROW_Y + TRACK.ch) return { kind: "pi", v: col + 1 };
  if (y >= PV_ROWS_Y[0] && y <= PV_ROWS_Y[0] + TRACK.ch) return { kind: "pv", v: col + 1 };
  if (y >= PV_ROWS_Y[1] && y <= PV_ROWS_Y[1] + TRACK.ch) return { kind: "pv", v: col + 16 };
  return null;
}

export function placeName(x, y) {
  if (MAT_KIND === "fab") {
    const f = slotAt(x, y);
    return f ? f.name : "le plateau";
  }
  const s = slotAt(x, y);
  if (s) return s.kind === "commandant" ? "Commandant" : `${s.kind === "magie" ? "Magie" : "Combattant"} du Territoire ${ROMAN[s.t]}`;
  if (y < 220) return `Territoire ${ROMAN[x < 201.5 ? 0 : x < 398.5 ? 1 : 2]}`;
  return "le plateau";
}

// Rectangle d'un élément de taille w x h centré en (cx, cy), avec rotation 90/270 éventuelle.
export function boxAt(cx, cy, w, h, rot) {
  const swap = rot % 180 !== 0;
  const bw = swap ? h : w;
  const bh = swap ? w : h;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

// Rotation d'un vecteur (repère écran, y vers le bas), deg multiple de 90 en pratique
export function rotPt(x, y, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(a) * 1e6) / 1e6;
  const s = Math.round(Math.sin(a) * 1e6) / 1e6;
  return [x * c - y * s, x * s + y * c];
}
