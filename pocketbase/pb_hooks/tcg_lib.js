// Jeux pris en charge côté serveur : Safir (tcg vide ou "safir"), Flesh and Blood, Sorcery: Contested Realm,
// et Netrunner (joué sur jinteki.net : ici seulement salons, disponibilités et carte des joueurs)
const IDS = ["safir", "fab", "sorcery", "netrunner"];
const norm = (t) => (IDS.indexOf(t) > 0 ? t : "safir");
module.exports = {
  IDS,
  norm,
  // filtre SQL brut sur une colonne tcg (ex. "g.tcg")
  sql: (t, col) => (norm(t) === "safir" ? `(${col} = '' OR ${col} = 'safir')` : `${col} = '${norm(t)}'`),
  // filtre PocketBase
  pbf: (t, col) => (norm(t) === "safir" ? `(${col || "tcg"} = '' || ${col || "tcg"} = 'safir')` : `${col || "tcg"} = '${norm(t)}'`),
  short: (t) => ({ safir: "Safir", fab: "Flesh and Blood", sorcery: "Sorcery", netrunner: "Netrunner" })[norm(t)],
  full: (t) => ({ safir: "Safir Cards", fab: "Flesh and Blood", sorcery: "Sorcery: Contested Realm", netrunner: "Netrunner" })[norm(t)],
};
