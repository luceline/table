// Victoires et défaites par deck : privées (règles PocketBase : seul le joueur voit ses résultats).
// Une ligne par partie et par joueur ; un nouveau résultat pour la même partie remplace l'ancien.
import { useEffect, useState } from "react";
import { pb } from "../pb.js";
import { tcgFilter } from "./tcg.js";

export async function myResult(userId, gameId) {
  try {
    return await pb.collection("results").getFirstListItem(`owner = "${userId}" && game = "${gameId}"`, { requestKey: null });
  } catch (_) {
    return null;
  }
}

// outcome : "win" | "loss" | null (ne pas compter cette partie)
export async function saveResult({ userId, gameId, st, tcg, outcome, oppName }) {
  const cur = await myResult(userId, gameId);
  if (!outcome) {
    if (cur) await pb.collection("results").delete(cur.id, { requestKey: null });
    return null;
  }
  const data = {
    deck: (st?.deckId && st.deckId !== "pret" ? st.deckId : "").slice(0, 30),
    deck_name: (st?.deckName || (st?.filmed ? "Cartes réelles" : "Deck")).slice(0, 200),
    tcg,
    outcome,
    opp_name: (oppName || "").slice(0, 100),
  };
  if (cur) return pb.collection("results").update(cur.id, data, { requestKey: null });
  return pb.collection("results").create({ owner: userId, game: gameId, ...data }, { requestKey: null });
}

// Bilan d'un jeu : { byDeck: {deckId: {w, l}}, byName: {nom: {w, l}} (decks sans fiche : prêtés, cartes réelles, supprimés) }
export function useResults(userId, tcg, deckIds) {
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    pb.collection("results")
      .getFullList({ filter: `owner = "${userId}" && ${tcgFilter(tcg)}`, fields: "deck,deck_name,outcome", requestKey: null })
      .then((r) => alive && setRes(r))
      .catch(() => {});
    return () => { alive = false; };
  }, [userId, tcg]);
  const known = new Set(deckIds);
  const byDeck = {};
  const byName = {};
  for (const r of res) {
    const box = r.deck && known.has(r.deck) ? (byDeck[r.deck] ||= { w: 0, l: 0 }) : (byName[r.deck_name || "Deck"] ||= { w: 0, l: 0 });
    if (r.outcome === "win") box.w++;
    else box.l++;
  }
  return { byDeck, byName };
}

export function ratioText(s) {
  if (!s || !(s.w + s.l)) return "";
  return `${s.w} V · ${s.l} D · ${Math.round((100 * s.w) / (s.w + s.l))} %`;
}
