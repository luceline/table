// Jeux pris en charge côté serveur : Safir (tcg vide ou "safir"), Flesh and Blood, Sorcery: Contested Realm,
// Netrunner (joué sur jinteki.net : ici seulement salons, disponibilités et carte des joueurs)
// et Héros, le prototype du jeu maison (réservé à l'admin et à ses invités)
const IDS = ["safir", "fab", "sorcery", "netrunner", "heros"];
const norm = (t) => (IDS.indexOf(t) > 0 ? t : "safir");
module.exports = {
  IDS,
  norm,
  // filtre SQL brut sur une colonne tcg (ex. "g.tcg")
  sql: (t, col) => (norm(t) === "safir" ? `(${col} = '' OR ${col} = 'safir')` : `${col} = '${norm(t)}'`),
  // filtre PocketBase
  pbf: (t, col) => (norm(t) === "safir" ? `(${col || "tcg"} = '' || ${col || "tcg"} = 'safir')` : `${col || "tcg"} = '${norm(t)}'`),
  short: (t) => ({ safir: "Safir", fab: "Flesh and Blood", sorcery: "Sorcery", netrunner: "Netrunner", heros: "Héros" })[norm(t)],
  full: (t) => ({ safir: "Safir Cards", fab: "Flesh and Blood", sorcery: "Sorcery: Contested Realm", netrunner: "Netrunner", heros: "Héros (prototype)" })[norm(t)],
};
