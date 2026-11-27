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

// ---------- Sorcery: Contested Realm ----------
// Règles officielles (sorcerytcg.com, format Constructed, livret de règles de décembre 2025) : 1 avatar ;
// grimoire d'au moins 60 cartes (sbires, magies, auras, artefacts) ; atlas d'au moins 30 sites ;
// exemplaires selon la rareté : Ordinaire 4, Exceptionnelle 3, Élite 2, Unique 1 (rareté inconnue : comptée Ordinaire).
// Une carte est unique par son nom. La « collection » de 10 cartes des tournois n'est pas gérée.
export const SORC_RULES = { spellbook: 60, atlas: 30 };
const SORC_COPIES = { ordinary: 4, exceptional: 3, elite: 2, unique: 1 };
export const sorcCopiesOf = (c) => SORC_COPIES[c?.rarity] ?? 4;
export function checkSorcery(deck, cardsById) {
  let spellbook = 0, atlas = 0;
  const byName = {};
  for (const e of deck?.entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || c.kind === "avatar" || e.tok || !(e.qty > 0)) continue;
    if (c.kind === "site") atlas += e.qty;
    else spellbook += e.qty;
    const k = nameKey(c.name) || c.id;
    byName[k] = { name: c.name || "Sans nom", n: (byName[k]?.n || 0) + e.qty, max: Math.min(byName[k]?.max ?? 9, sorcCopiesOf(c)) };
  }
  const problems = [];
  const avatar = deck?.commander && cardsById[deck.commander];
  if (!avatar) problems.push("Choisissez un avatar.");
  if (deck?.initiation) return { spellbook, atlas, total: spellbook + atlas, problems, ok: problems.length === 0, initiation: true };
  if (spellbook < SORC_RULES.spellbook) problems.push(`${spellbook} carte${spellbook > 1 ? "s" : ""} dans le grimoire : il en faut au moins ${SORC_RULES.spellbook}.`);
  if (atlas < SORC_RULES.atlas) problems.push(`${atlas} site${atlas > 1 ? "s" : ""} dans l'atlas : il en faut au moins ${SORC_RULES.atlas}.`);
  for (const v of Object.values(byName)) {
    if (v.n > v.max) problems.push(`« ${v.name} » en ${v.n} exemplaires : ${v.max} au maximum pour sa rareté.`);
  }
  return { spellbook, atlas, total: spellbook + atlas, problems, ok: problems.length === 0 };
}

// ---------- Héros (prototype, Référence v0.2, section 2) ----------
// 30 cartes Action / Réaction, 3 exemplaires au plus ; 10 quêtes, 1 copie de chacune, au moins 2 de chaque palier ;
// équipement : 7 pièces au plus, une par emplacement. Deck de découverte : règles ignorées.
export const HEROS_RULES = { cards: 30, copies: 3, quests: 10, perTier: 2, equip: 7 };
export const HEROS_TIERS = { simple: "Simple", intermediaire: "Intermédiaire", complexe: "Complexe" };
export function checkHeros(deck, cardsById) {
  let total = 0, quests = 0, equip = 0;
  const byName = {}, tiers = { simple: 0, intermediaire: 0, complexe: 0 }, slots = {};
  const problems = [];
  for (const e of deck?.entries || []) {
    const c = cardsById[e.card];
    if (!c || !(e.qty > 0)) continue;
    if (c.kind === "quete") {
      quests += e.qty;
      if (tiers[c.rarity] !== undefined) tiers[c.rarity] += e.qty;
      if (e.qty > 1) problems.push(`Quête « ${c.name} » en ${e.qty} copies : une seule.`);
      continue;
    }
    if (c.kind === "equipement") {
      equip += e.qty;
      const sl = (c.factions || [])[0] || "?";
      slots[sl] = (slots[sl] || 0) + e.qty;
      continue;
    }
    if (c.kind === "jeton" || e.tok) continue;
    total += e.qty;
    const k = nameKey(c.name) || c.id;
    byName[k] = { name: c.name || "Sans nom", n: (byName[k]?.n || 0) + e.qty };
  }
  if (deck?.initiation) return { total, quests, equip, tiers, problems: [], ok: true, initiation: true };
  if (total !== HEROS_RULES.cards) problems.push(`${total} carte${total > 1 ? "s" : ""} Action / Réaction : il en faut ${HEROS_RULES.cards}.`);
  for (const v of Object.values(byName)) if (v.n > HEROS_RULES.copies) problems.push(`« ${v.name} » en ${v.n} exemplaires : ${HEROS_RULES.copies} au maximum.`);
  if (quests !== HEROS_RULES.quests) problems.push(`${quests} quête${quests > 1 ? "s" : ""} : il en faut ${HEROS_RULES.quests}.`);
  for (const [t, n] of Object.entries(tiers)) if (n < HEROS_RULES.perTier) problems.push(`${n} quête${n > 1 ? "s" : ""} ${HEROS_TIERS[t].toLowerCase()}${n > 1 ? "s" : ""} : au moins ${HEROS_RULES.perTier}.`);
  if (equip > HEROS_RULES.equip) problems.push(`${equip} pièces d'équipement : ${HEROS_RULES.equip} au maximum.`);
  for (const [sl, n] of Object.entries(slots)) if (n > 1) problems.push(`${n} pièces pour l'emplacement ${sl} : une seule.`);
  return { total, quests, equip, tiers, problems, ok: problems.length === 0 };
}

// Contrôle du deck selon le jeu actif (Safir : règles d'origine, inchangées)
export function checkDeckFor(deck, cardsById) {
  if (TCG === "heros") return checkHeros(deck, cardsById);
  if (TCG === "sorcery") return checkSorcery(deck, cardsById);
  return TCG === "fab" ? checkFab(deck, cardsById) : checkDeck(deck?.entries, cardsById, deck?.commander);
}
