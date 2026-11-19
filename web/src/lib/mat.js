// Géométrie du tapis 600 x 300 mm, relevée sur tapis_60x30.svg.
// Toutes les coordonnées sont en mm, origine en haut à gauche du tapis du joueur.

export const MAT_W = 600;
export const MAT_H = 300;
export const GAP = 10; // espace entre les deux tapis à l'écran
export const BOARD_H = MAT_H * 2 + GAP;

export const CARD = { p: { w: 63, h: 88 }, l: { w: 88, h: 63 } };

const COLS = [
  [6.5, 71.5, 136.5],
  [203.5, 268.5, 333.5],
  [400.5, 465.5, 530.5],
];
export const ROMAN = ["I", "II", "III"];

export const SLOTS = [];
COLS.forEach((xs, t) =>
  xs.forEach((x, i) => {
    SLOTS.push({ id: `t${t}c${i}`, kind: "combattant", t, x, y: 36, w: 63, h: 88, label: "COMBATTANT" });
    SLOTS.push({ id: `t${t}m${i}`, kind: "magie", t, x, y: 130, w: 63, h: 88, label: "MAGIE" });
  })
);
SLOTS.push({ id: "cmd", kind: "commandant", x: 6.5, y: 226, w: 88, h: 63, label: "COMMANDANT" });

export const PILES = [
  { id: "d1", x: 111.5, y: 226, w: 88, h: 63, label: "DÉFAUSSE DU TERRITOIRE I", short: "Défausse I" },
  { id: "d2", x: 256, y: 226, w: 88, h: 63, // centrée sous la magie du milieu du territoire II
    label: "DÉFAUSSE DU TERRITOIRE II", short: "Défausse II" },
  { id: "d3", x: 400.5, y: 226, w: 88, h: 63, label: "DÉFAUSSE DU TERRITOIRE III", short: "Défausse III" },
  { id: "deck", x: 505.5, y: 226, w: 88, h: 63, label: "DECK", short: "Deck" },
];
export const PILE_BY_ID = Object.fromEntries(PILES.map((p) => [p.id, p]));

export const TITLES = [
  { x: 103, y: 26, text: "TERRITOIRE I" },
  { x: 300, y: 26, text: "TERRITOIRE II" },
  { x: 497, y: 26, text: "TERRITOIRE III" },
];
export const DIVIDERS = [201.5, 398.5];

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
