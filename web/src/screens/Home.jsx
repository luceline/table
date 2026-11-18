import { useEffect, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { buildState, genCode } from "../lib/game.js";

export default function Home({ go, pendingJoin, clearJoin }) {
  const user = me();
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [games, setGames] = useState([]);
  const [deckId, setDeckId] = useState("");
  const [code, setCode] = useState(pendingJoin || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [c, d, g] = await Promise.all([
        pb.collection("cards").getFullList({ filter: `owner="${user.id}"`, sort: "-created" }),
        pb.collection("decks").getFullList({ filter: `owner="${user.id}"`, sort: "-updated" }),
        pb.collection("games").getFullList({
          filter: `(p1="${user.id}" || p2="${user.id}") && status!="finished"`,
          sort: "-updated",
          fields: "id,code,p1,p2,n1,n2,status,updated",
        }),
      ]);
      setCards(c);
      setDecks(d);
      setGames(g);
      setDeckId((cur) => cur || d[0]?.id || "");
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  useEffect(() => { load(); }, []);

  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  const deckSize = (d) => (d.entries || []).reduce((n, e) => n + (cardsById[e.card]?.kind === "jeton" ? 0 : e.qty || 0), 0);

  function myState() {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) throw new Error("Choisissez un deck.");
    if (!deckSize(deck)) throw new Error("Ce deck est vide.");
    return buildState({ name: user.name || user.email.split("@")[0], deck, cardsById });
  }

  async function createGame() {
    setErr("");
    setBusy(true);
    try {
      const state = myState();
      let rec = null;
      for (let i = 0; i < 4 && !rec; i++) {
        try {
          rec = await pb.collection("games").create({ code: genCode(), p1: user.id, n1: state.name, status: "waiting" });
        } catch (e) {
          if (i === 3) throw e;
        }
      }
      await pb.collection("seats").create({ game: rec.id, player: user.id, state });
      go("table", { gameId: rec.id });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinGame() {
    setErr("");
    const c = code.toUpperCase().trim();
    if (c.length !== 6) return setErr("Le code fait 6 caractères.");
    setBusy(true);
    try {
      let g;
      try {
        g = await pb.collection("games").getFirstListItem(`code="${c}"`);
      } catch {
        throw new Error("Aucune partie ouverte avec ce code.");
      }
      clearJoin();
      if (g.p1 === user.id || g.p2 === user.id) return go("table", { gameId: g.id });
      if (g.p2) throw new Error("Cette partie a déjà deux joueurs.");
      const state = myState();
      await pb.collection("games").update(g.id, { p2: user.id, n2: state.name, status: "playing" });
      await pb.collection("seats").create({ game: g.id, player: user.id, state });
      go("table", { gameId: g.id });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeGame(g) {
    if (!confirm(g.p1 === user.id ? "Supprimer cette partie ?" : "Quitter cette partie ? Elle restera chez votre adversaire.")) return;
    try {
      if (g.p1 === user.id) await pb.collection("games").delete(g.id);
      else await pb.collection("games").update(g.id, { status: "finished" });
      load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function newDeck() {
    const name = prompt("Nom du deck", `Deck ${decks.length + 1}`);
    if (!name) return;
    try {
      const d = await pb.collection("decks").create({ owner: user.id, name: name.trim(), entries: [] });
      go("deck", { deckId: d.id });
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand grow">Table de jeu</div>
        <span className="muted small">{user.name || user.email}</span>
        <button className="btn sm ghost" onClick={() => pb.authStore.clear()}>Déconnexion</button>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="card-box">
        <h2>Jouer</h2>
        {decks.length === 0 ? (
          <p className="muted small">Scannez vos cartes puis créez un deck pour pouvoir jouer.</p>
        ) : (
          <div className="field">
            <label>Mon deck pour cette partie</label>
            <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes)</option>
              ))}
            </select>
          </div>
        )}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn primary" onClick={createGame} disabled={busy || !decks.length}>Créer une partie</button>
          <div className="row grow" style={{ minWidth: 230 }}>
            <input
              className="input code"
              placeholder="CODE"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              style={{ textTransform: "uppercase" }}
            />
            <button className="btn" onClick={joinGame} disabled={busy || !decks.length}>Rejoindre</button>
          </div>
        </div>
        {games.length > 0 && (
          <>
            <div className="spacer" />
            <div className="muted small" style={{ marginBottom: 6 }}>Parties en cours</div>
            <div className="list">
              {games.map((g) => {
                const opp = g.p1 === user.id ? g.n2 : g.n1;
                return (
                  <div className="list-item" key={g.id}>
                    <span className="code">{g.code}</span>
                    <span className="grow small">{opp ? `contre ${opp}` : "en attente d'un adversaire"}</span>
                    <button className="btn sm primary" onClick={() => go("table", { gameId: g.id })}>Reprendre</button>
                    <button className="btn sm ghost danger" onClick={() => removeGame(g)} aria-label="Supprimer">✕</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card-box">
        <h2>Ma collection</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          {cards.length} carte{cards.length > 1 ? "s" : ""} scannée{cards.length > 1 ? "s" : ""}. Vos scans restent privés et ne servent qu'à vos decks.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => go("scan")}>Scanner des cartes</button>
          <button className="btn" onClick={() => go("library")}>Voir mes cartes</button>
        </div>
      </div>

      <div className="card-box">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 className="grow" style={{ margin: 0 }}>Mes decks</h2>
          <button className="btn sm" onClick={newDeck} disabled={!cards.length}>Nouveau deck</button>
        </div>
        {decks.length === 0 && <p className="muted small">Aucun deck pour l'instant.</p>}
        <div className="list">
          {decks.map((d) => (
            <div className="list-item" key={d.id}>
              <span className="grow">{d.name}</span>
              <span className="muted small">{deckSize(d)} cartes</span>
              <button className="btn sm" onClick={() => go("deck", { deckId: d.id })}>Modifier</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
