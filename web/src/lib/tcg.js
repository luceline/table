// Jeux de cartes pris en charge et jeu sélectionné à l'accueil (mémorisé sur l'appareil).
// Les cartes, decks et parties portent un champ « tcg » ; vide = Safir (données d'avant le multi-jeux).
import { setGeometry } from "./mat.js";
import { setRules } from "./game.js";

export const TCG_LIST = [
  { id: "safir", name: "Safir Cards" },
  { id: "fab", name: "Flesh and Blood" },
];
export const DEFAULT_TCG = "safir";
const KEY = "table_tcg";

export const tcgOf = (rec) => rec?.tcg || DEFAULT_TCG;
export const tcgName = (id) => TCG_LIST.find((g) => g.id === id)?.name || id;

export function currentTcg() {
  try {
    const v = localStorage.getItem(KEY);
    return TCG_LIST.some((g) => g.id === v) ? v : DEFAULT_TCG;
  } catch (_) {
    return DEFAULT_TCG;
  }
}
export function setCurrentTcg(id) {
  try { localStorage.setItem(KEY, id); } catch (_) {}
}

// Filtre PocketBase des enregistrements d'un jeu
export function tcgFilter(id) {
  return id === DEFAULT_TCG ? `(tcg = "" || tcg = "${DEFAULT_TCG}")` : `tcg = "${id}"`;
}

// Active les règles et le tapis d'un jeu pour tous les écrans (tapis, phases, piles, compteurs)
export function activateTcg(id) {
  const v = id === "fab" ? "fab" : DEFAULT_TCG;
  setGeometry(v);
  setRules(v);
  return v;
}
