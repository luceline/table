import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";

export default function DeckEditor({ go, deckId }) {
  const user = me();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [qty, setQty] = useState({});
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [onlyIn, setOnlyIn] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          pb.collection("decks").getOne(deckId),
          pb.collection("cards").getFullList({ filter: `owner="${user.id}"`, sort: "name,-created" }),
        ]);
        setDeck(d);
        setName(d.name);
        setCards(c);
        const q = {};
        for (const e of d.entries || []) if (c.some((x) => x.id === e.card)) q[e.card] = e.qty;
        setQty(q);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [deckId]);

  const normal = cards.filter((c) => c.kind !== "jeton");
  const tokens = cards.filter((c) => c.kind === "jeton");
  const total = normal.reduce((n, c) => n + (qty[c.id] || 0), 0);
  const nTok = tokens.filter((c) => qty[c.id]).length;

  function setN(id, n) {
    setQty((q) => {
      const r = { ...q, [id]: Math.max(0, Math.min(20, n)) };
      if (!r[id]) delete r[id];
      return r;
    });
    setDirty(true);
  }

  async function save(leave) {
    try {
      const entries = Object.entries(qty).map(([card, n]) => ({ card, qty: n }));
      await pb.collection("decks").update(deckId, { name: name.trim() || deck.name, entries });
      setDirty(false);
      if (leave) go("home");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function remove() {
    if (!confirm("Supprimer ce deck ?")) return;
    await pb.collection("decks").delete(deckId);
    go("home");
  }

  function back() {
    if (dirty && !confirm("Quitter sans enregistrer ?")) return;
    go("home");
  }

  // Recherche sans tenir compte des accents ni des majuscules (« pretre » trouve « Prêtre »)
  const fold = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = (c) => !q.trim() || fold(c.name).includes(fold(q.trim()));
  const shown = normal.filter((c) => (!onlyIn || qty[c.id]) && match(c));
  const shownTok = tokens.filter((c) => (!onlyIn || qty[c.id]) && match(c));
  const thumb = (c) => (
    <>
      <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
      <div className="cap">{c.name || "Sans nom"}</div>
    </>
  );

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={back} aria-label="Retour">←</button>
        <h1>Deck</h1>
        <span className="chip">{total} cartes{nTok ? ` + ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}</span>
        <button className="btn primary sm" onClick={() => save(true)} disabled={!deck}>Enregistrer</button>
      </div>
      {err && <div className="err">{err}</div>}
      {deck && (
        <>
          <div className="field">
            <label>Nom du deck</label>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} maxLength={80} />
          </div>
          <input
            className="input"
            placeholder="Rechercher une carte par nom"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn sm ${onlyIn ? "" : "ghost"}`} onClick={() => setOnlyIn(!onlyIn)}>
              {onlyIn ? "Afficher toute ma collection" : "Seulement les cartes du deck"}
            </button>
            <span className="grow" />
            <button className="btn sm danger ghost" onClick={remove}>Supprimer le deck</button>
          </div>

          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Cartes du deck</h2>
          {normal.length === 0 && <p className="muted">Aucune carte normale scannée.</p>}
          {normal.length > 0 && shown.length === 0 && <p className="muted small">Aucune carte ne correspond.</p>}
          <div className="grid">
            {shown.map((c) => (
              <div key={c.id}>
                <div className="thumb" onClick={() => setN(c.id, (qty[c.id] || 0) + 1)} style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null}>
                  {thumb(c)}
                  {qty[c.id] > 0 && <span className="badge">×{qty[c.id]}</span>}
                </div>
                <div className="qty">
                  <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) - 1)} disabled={!qty[c.id]}>−</button>
                  <b>{qty[c.id] || 0}</b>
                  <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Cartes jetons</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Rangées dans la réserve à côté du tapis, hors du deck. En partie, chaque glisser-déposer en crée une copie.
          </p>
          {tokens.length === 0 && <p className="muted small">Aucune carte jeton. Au scan, activez « Carte jeton », ou changez le type d'une carte dans « Mes cartes ».</p>}
          <div className="grid">
            {shownTok.map((c) => (
              <div key={c.id}>
                <div
                  className="thumb"
                  onClick={() => setN(c.id, qty[c.id] ? 0 : 1)}
                  style={{ ...(c.orient === "l" ? { aspectRatio: "88 / 63" } : null), opacity: qty[c.id] ? 1 : 0.45 }}
                >
                  {thumb(c)}
                  {qty[c.id] > 0 && <span className="badge">✓</span>}
                </div>
                <div className="qty" style={{ justifyContent: "center" }}>
                  <button className={`btn sm ${qty[c.id] ? "primary" : ""}`} onClick={() => setN(c.id, qty[c.id] ? 0 : 1)}>
                    {qty[c.id] ? "Dans la réserve" : "Ajouter"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
