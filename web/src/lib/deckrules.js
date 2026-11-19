// Règles de construction d'un deck (« Nos Règles s3 », chapitre I)
export const DECK_MIN = 30;
export const DECK_MAX = 40;
export const COPY_MAX = 2;

// Nom comparable : sans accents, sans majuscules, espaces normalisés
export const nameKey = (t) =>
  (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// entries : [{card, qty}] ; cardsById : {id: {name, kind}}
// Les cartes jetons (réserve) ne comptent pas. Deux scans du même nom comptent comme la même carte.
export function checkDeck(entries, cardsById) {
  let total = 0;
  const byName = {};
  for (const e of entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || !(e.qty > 0)) continue;
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
