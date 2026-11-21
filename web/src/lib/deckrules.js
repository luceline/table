import { TCG } from "./game.js";
// Règles de construction d'un deck (« Nos Règles s3 », chapitre I)
export const DECK_MIN = 30;
export const DECK_MAX = 40;
export const COPY_MAX = 2;

// Nom comparable : sans accents, sans majuscules, espaces normalisés
export const nameKey = (t) =>
  (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// entries : [{card, qty, tok?}] ; cardsById : {id: {name, kind}} ; tok = copie jeton d'une carte normale (réserve)
// Les cartes jetons (réserve) ne comptent pas. Deux scans du même nom comptent comme la même carte.
// Le commandant (facultatif) compte dans les 30 à 40 cartes.
export function checkDeck(entries, cardsById, commander) {
  let total = commander && cardsById[commander] ? 1 : 0;
  const byName = {};
  for (const e of entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || e.tok || !(e.qty > 0)) continue;
    total += e.qty;
    const k = nameKey(c.name) || c.id;
    byName[k] = { name: c.name || "Sans nom", n: (byName[k]?.n || 0) + e.qty };
  }
  const problems = [];
  if (total < DECK_MIN) problems.push(`${total} carte${total > 1 ? "s" : ""} : il en faut au moins ${DECK_MIN}.`);
  if (total > DECK_MAX) problems.push(`${total} cartes : ${DECK_MAX} au maximum.`);
  for (const v of Object.values(byName)) {
    if (v.n > COPY_MAX) problems.push(`« ${v.name} » en ${v.n} exemplaires : ${COPY_MAX} au maximum.`);
  }
  return { total, problems, ok: problems.length === 0 };
}

// ---------- Flesh and Blood ----------
// Règles officielles (rules.fabtcg.com, Tournament Rules and Policy, section 7, et fabtcg.com) :
// Classic Constructed : 1 héros adulte, deck d'au moins 60 cartes, réserve totale (deck + armes et équipements) de 80 au plus,
//   3 exemplaires au plus de chaque carte unique.
// Silver Age (depuis novembre 2025, format de tournoi qui remplace Blitz) : 1 jeune héros, deck d'exactement 40 cartes,
//   réserve de 55 au plus, 2 exemplaires au plus, uniquement des cartes communes, rares ou basiques (héros compris) :
//   la rareté n'est pas connue de l'appli, elle n'est donc pas vérifiée.
// Blitz (plus joué en tournoi, reste un format libre) : 1 jeune héros, deck d'exactement 40 cartes, réserve de 52 au plus,
//   1 exemplaire au plus. Une carte est unique par son nom ET sa couleur de pitch.
export const FAB_RULES = {
  cc: { name: "Classic Constructed", deckMin: 60, deckMax: null, pool: 80, copies: 3 },
  sage: { name: "Silver Age", deckMin: 40, deckMax: 40, pool: 55, copies: 2 },
  blitz: { name: "Blitz", deckMin: 40, deckMax: 40, pool: 52, copies: 1 },
};
export const fabFormat = (f) => (f && FAB_RULES[f] ? f : "cc");
export const PITCH = { r: "rouge", y: "jaune", b: "bleu" };
export const fabKey = (c) => `${nameKey(c?.name) || c?.id}|${c?.pitch || ""}`;
export const fabLabel = (c) => `${c?.name || "Sans nom"}${c?.pitch ? ` (${PITCH[c.pitch]})` : ""}`;

export function checkFab(deck, cardsById) {
  const R = FAB_RULES[fabFormat(deck?.format)];
  let total = 0, arena = 0;
  const byKey = {};
  for (const e of deck?.entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || e.tok || c.kind === "heros" || !(e.qty > 0)) continue;
    if (c.kind === "arene") arena += e.qty;
    else total += e.qty;
    const k = fabKey(c);
    byKey[k] = { name: fabLabel(c), n: (byKey[k]?.n || 0) + e.qty };
  }
  const problems = [];
  const hero = deck?.commander && cardsById[deck.commander];
  if (!hero) problems.push("Choisissez un héros.");
  // Deck initiation : règles de construction ignorées, seul le héros est demandé
  if (deck?.initiation) return { total, arena, problems, ok: problems.length === 0, initiation: true };
  if (R.deckMax === R.deckMin && total !== R.deckMin) problems.push(`${total} carte${total > 1 ? "s" : ""} dans le deck : il en faut exactement ${R.deckMin} en ${R.name}.`);
  else if (total < R.deckMin) problems.push(`${total} carte${total > 1 ? "s" : ""} dans le deck : il en faut au moins ${R.deckMin} en ${R.name}.`);
  if (total + arena > R.pool) problems.push(`${total + arena} cartes avec les armes et équipements : ${R.pool} au maximum en ${R.name}.`);
  for (const v of Object.values(byKey)) {
    if (v.n > R.copies) problems.push(`« ${v.name} » en ${v.n} exemplaires : ${R.copies} au maximum en ${R.name}.`);
  }
  return { total, arena, problems, ok: problems.length === 0 };
}

// Contrôle du deck selon le jeu actif (Safir : règles d'origine, inchangées)
export function checkDeckFor(deck, cardsById) {
  return TCG === "fab" ? checkFab(deck, cardsById) : checkDeck(deck?.entries, cardsById, deck?.commander);
}
