import { useEffect, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { buildState, genCode } from "../lib/game.js";
import { checkDeck } from "../lib/deckrules.js";
import { Sheet } from "../components/ui.jsx";
import TutoVideo from "../components/TutoVideo.jsx";

export default function Home({ go, pendingJoin, clearJoin }) {
  const user = me();
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([]);
  const [games, setGames] = useState([]);
  const [deckId, setDeckId] = useState("");
  const [loanId, setLoanId] = useState(""); // deck prêté à l'adversaire ("" = aucun)
  const [joinChoice, setJoinChoice] = useState(null); // partie avec deck prêté : choisir lequel jouer
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

  const myName = user.name || user.email.split("@")[0];

  function myState() {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) throw new Error("Choisissez un deck.");
    const chk = checkDeck(deck.entries, cardsById);
    if (!chk.ok) throw new Error(`Deck « ${deck.name} » non conforme : ${chk.problems.join(" ")}`);
    return buildState({ name: myName, deck, cardsById });
  }

  // Instantané du deck prêté, stocké dans la partie
  function loanSnapshot(deck) {
    const ents = (deck.entries || []).filter((e) => cardsById[e.card] && e.qty > 0);
    return {
      name: deck.name,
      by: myName,
      entries: ents.map((e) => ({ card: e.card, qty: e.qty })),
      cards: ents.map((e) => {
        const c = cardsById[e.card];
        return { id: c.id, image: c.image, name: c.name, orient: c.orient, kind: c.kind };
      }),
    };
  }

  function loanState(loan) {
    return buildState({
      name: myName,
      deck: { id: "pret", name: `${loan.name} (prêté par ${loan.by})`, entries: loan.entries },
      cardsById: Object.fromEntries(loan.cards.map((c) => [c.id, c])),
    });
  }

  async function createGame() {
    setErr("");
    setBusy(true);
    try {
      const state = myState();
      const lent = decks.find((d) => d.id === loanId);
      if (lent) {
        const chk = checkDeck(lent.entries, cardsById);
        if (!chk.ok) throw new Error(`Deck à prêter « ${lent.name} » non conforme : ${chk.problems.join(" ")}`);
      }
      const loan = lent ? loanSnapshot(lent) : null;
      let rec = null;
      for (let i = 0; i < 4 && !rec; i++) {
        try {
          rec = await pb.collection("games").create({ code: genCode(), p1: user.id, n1: state.name, status: "waiting", loan });
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
      if (g.loan?.cards?.length) {
        // Deck prêté disponible : direct si je n'ai pas de deck, sinon je choisis
        if (!decks.length) return await sit(g, true);
        return setJoinChoice(g);
      }
      if (!decks.length) throw new Error("Vous n'avez pas encore de deck, et cette partie n'en prête pas.");
      await sit(g, false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function sit(g, useLoan) {
    const state = useLoan ? loanState(g.loan) : myState();
    await pb.collection("games").update(g.id, { p2: user.id, n2: state.name, status: "playing" });
    await pb.collection("seats").create({ game: g.id, player: user.id, state });
    go("table", { gameId: g.id });
  }

  async function chooseJoin(useLoan) {
    const g = joinChoice;
    setJoinChoice(null);
    setErr("");
    setBusy(true);
    try {
      await sit(g, useLoan);
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

      <TutoVideo key={cards.length ? "o" : "n"} open={!cards.length} />

      <div className="card-box">
        <h2>Jouer</h2>
        {decks.length === 0 ? (
          <p className="muted small">
            Pas encore de deck ? Vous pouvez rejoindre une partie dont le créateur vous prête un deck : entrez son code ci-dessous. Pour créer vos propres parties, scannez vos cartes puis créez un deck.
          </p>
        ) : (
          <>
            <div className="field">
              <label>Mon deck pour cette partie</label>
              <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes{checkDeck(d.entries, cardsById).ok ? "" : ", non conforme"})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prêter un deck à l'adversaire (s'il n'a pas de cartes)</label>
              <select className="input" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">Aucun prêt</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes{checkDeck(d.entries, cardsById).ok ? "" : ", non conforme"})</option>
                ))}
              </select>
            </div>
          </>
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
            <button className="btn" onClick={joinGame} disabled={busy}>Rejoindre</button>
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

      <Sheet open={!!joinChoice} onClose={() => setJoinChoice(null)} title="Avec quel deck jouer ?">
        {joinChoice && (
          <div className="actions">
            <button className="btn primary" onClick={() => chooseJoin(true)}>
              Deck prêté par {joinChoice.loan.by} : « {joinChoice.loan.name} »
            </button>
            <button className="btn" onClick={() => chooseJoin(false)}>
              Mon deck : « {decks.find((d) => d.id === deckId)?.name} »
            </button>
          </div>
        )}
      </Sheet>

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
              <span className={`small ${checkDeck(d.entries, cardsById).ok ? "muted" : "warn"}`}>
                {deckSize(d)} cartes{checkDeck(d.entries, cardsById).ok ? "" : " · non conforme"}
              </span>
              <button className="btn sm" onClick={() => go("deck", { deckId: d.id })}>Modifier</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
