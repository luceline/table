import { TCG } from "./game.js";
// Factions de Safir (« Nos Règles s3 ») et sous-factions Kin (unification)
export const FACTIONS = ["Aqua", "Chaos", "Ciel", "Nature", "Ange", "Cosmic", "Démon", "Dragon", "Forêt", "Glace", "Humain", "Orc", "Vampire", "Kin"];
export const KIN_SUB = ["Tian", "Yan", "Lin", "Mercenaire"];
export const ALL_FACTIONS = [...FACTIONS, ...KIN_SUB];

const fold = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Mot lu (approximatif) -> faction connue, ou null
export function matchFaction(word) {
  const w = fold(word);
  if (w.length < 2) return null;
  let best = null, bd = 99;
  for (const f of ALL_FACTIONS) {
    const d = lev(w, fold(f));
    if (d < bd) { bd = d; best = f; }
  }
  const tol = w.length <= 4 ? 1 : 2;
  return bd <= tol ? best : null;
}

// Ligne de faction lue (« -Kin/Chaos/Nature- ») -> liste, ou null si un mot n'est pas une faction
export function parseFactionLine(s) {
  const parts = (s || "").split(/[/|\\lI1]{1}(?=[A-ZÀ-Ý])|[/|\\]+/).map((x) => x.trim()).filter((x) => fold(x).length >= 2);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    const f = matchFaction(p);
    if (!f) return null;
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

// Liste stockée (JSON) -> tableau propre
// Safir : seules les factions connues ; Flesh and Blood (classes, talents) et Sorcery (éléments) : les valeurs choisies au scan
export const factionsOf = (c) =>
  Array.isArray(c?.factions)
    ? c.factions.filter((f) => (TCG === "safir" ? ALL_FACTIONS.includes(f) : typeof f === "string" && f.length > 0 && f.length <= 30))
    : [];
