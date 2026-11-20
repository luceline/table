import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { checkDeck, nameKey, DECK_MIN, DECK_MAX, COPY_MAX } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { Sheet } from "../components/ui.jsx";
import { ALL_FACTIONS, KIN_SUB, factionsOf } from "../lib/factions.js";

const CMD_MIN = 15; // combattants de la faction du commandant exigés dans le deck
// Magie = une Valeur sans ATK ni DEF (sinon on la compte comme combattant)
const isMagic = (c) => !!c.val && !c.atk && !c.def;

export default function DeckEditor({ go, deckId }) {
  const user = me();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [qty, setQty] = useState({});
  const [tq, setTq] = useState({}); // cartes normales choisies aussi comme jeton
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [onlyIn, setOnlyIn] = useState(false);
  const [q, setQ] = useState("");
  const [commander, setCommander] = useState(""); // id de la carte commandant (facultatif)
  const [pickCmd, setPickCmd] = useState(false);
  const [cq, setCq] = useState("");
  const [fac, setFac] = useState(""); // filtre par faction

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          pb.collection("decks").getOne(deckId),
          pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${tcgFilter(currentTcg())}`, sort: "name,-created" }),
        ]);
        setDeck(d);
        setName(d.name);
        setCommander(d.commander && c.some((x) => x.id === d.commander) ? d.commander : "");
        setCards(c);
        const q = {}, t = {};
        for (const e of d.entries || []) if (c.some((x) => x.id === e.card)) (e.tok ? t : q)[e.card] = e.tok ? 1 : e.qty;
        setQty(q);
        setTq(t);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [deckId]);

  const normal = cards.filter((c) => c.kind !== "jeton");
  // Jetons : cartes jetons, et cartes normales qui existent aussi en jeton (choix séparé de leurs exemplaires du deck)
  const tokens = cards.filter((c) => c.kind === "jeton" || c.token_too);
  const tokOn = (c) => !!(c.kind === "jeton" ? qty[c.id] : tq[c.id]);
  const total = normal.reduce((n, c) => n + (qty[c.id] || 0), 0);
  const nTok = tokens.filter(tokOn).length;
  function toggleTok(c) {
    if (c.kind === "jeton") return setN(c.id, qty[c.id] ? 0 : 1);
    setTq((t) => {
      const r = { ...t };
      if (r[c.id]) delete r[c.id];
      else r[c.id] = 1;
      return r;
    });
    setDirty(true);
  }

  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const chk = checkDeck(Object.entries(qty).map(([card, n]) => ({ card, qty: n })), byId);
  // Exemplaires déjà pris pour ce nom (deux scans du même nom comptent ensemble)
  const sameName = (c) => normal.filter((x) => x.id !== c.id && nameKey(x.name) === nameKey(c.name)).reduce((n, x) => n + (qty[x.id] || 0), 0);
  const maxFor = (c) => Math.max(0, Math.min(COPY_MAX - sameName(c), (qty[c.id] || 0) + DECK_MAX - total));

  function setN(id, n) {
    const c = byId[id];
    const cap = c && c.kind !== "jeton" ? maxFor(c) : 1;
    if (n > cap) {
      setErr(total >= DECK_MAX ? `Un deck compte ${DECK_MAX} cartes au maximum.` : `${COPY_MAX} exemplaires au maximum de « ${c?.name || "cette carte"} ».`);
      return;
    }
    setErr("");
    setQty((q) => {
      const r = { ...q, [id]: Math.max(0, Math.min(cap, n)) };
      if (!r[id]) delete r[id];
      return r;
    });
    setDirty(true);
  }

  async function save(leave) {
    try {
      const entries = [
        ...Object.entries(qty).map(([card, n]) => ({ card, qty: n })),
        ...Object.keys(tq).map((card) => ({ card, qty: 1, tok: true })),
      ];
      await pb.collection("decks").update(deckId, { name: name.trim() || deck.name, entries, commander });
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
  const facOk = (c) => !fac || factionsOf(c).includes(fac);
  const shown = normal.filter((c) => (!onlyIn || qty[c.id]) && match(c) && facOk(c));
  // Nombre de cartes du deck par faction (exemplaires compris)
  const facCount = {};
  let untagged = 0;
  for (const c of normal) {
    const n = qty[c.id] || 0;
    if (!n) continue;
    const fs = factionsOf(c);
    if (!fs.length) untagged += n;
    for (const f of fs) facCount[f] = (facCount[f] || 0) + n;
  }
  const facInCollection = ALL_FACTIONS.filter((f) => normal.some((c) => factionsOf(c).includes(f)));
  const cmdCard = cards.find((c) => c.id === commander);
  // Faction du commandant : sa sous-faction Kin si elle est indiquée (ex. Lin), sinon ses factions
  const cmdAll = factionsOf(cmdCard);
  const cmdF = cmdAll.some((f) => KIN_SUB.includes(f)) ? cmdAll.filter((f) => KIN_SUB.includes(f)) : cmdAll;
  const cmdCount = normal
    .filter((c) => qty[c.id] && !isMagic(c) && factionsOf(c).some((f) => cmdF.includes(f)))
    .reduce((n, c) => n + qty[c.id], 0);
  const shownTok = tokens.filter((c) => (!onlyIn || tokOn(c)) && match(c));
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
        <span className={`chip ${chk.ok ? "ok" : "warn"}`}>{total} / {DECK_MIN}-{DECK_MAX}{nTok ? ` + ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}</span>
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

          <p className={`small ${chk.ok ? "muted" : "warn"}`} style={{ marginTop: 0 }}>
            {chk.ok
              ? `Deck conforme : ${total} cartes, ${COPY_MAX} exemplaires au plus par carte.`
              : `Deck non conforme, il ne pourra pas être joué : ${chk.problems.join(" ")}`}
          </p>
          <CommanderBox
            card={cmdCard}
            factions={cmdF}
            count={cmdCount}
            onPick={() => { setCq(""); setPickCmd(true); }}
            onClear={() => { setCommander(""); setDirty(true); }}
          />
          <Sheet open={pickCmd} onClose={() => setPickCmd(false)} title="Choisir le commandant">
            <input className="input" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Rechercher par nom" style={{ marginBottom: 10 }} />
            <div className="grid cmd-grid">
              {normal
                .filter((c) => !cq.trim() || nameKey(c.name).includes(nameKey(cq)))
                .sort((a, b) => (a.orient === "l" ? 0 : 1) - (b.orient === "l" ? 0 : 1))
                .map((c) => (
                  <div
                    key={c.id}
                    className={`thumb ${c.id === commander ? "sel" : ""}`}
                    style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null}
                    onClick={() => { setCommander(c.id); setDirty(true); setPickCmd(false); }}
                  >
                    <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
                    <div className="cap">{c.name}</div>
                  </div>
                ))}
            </div>
            <p className="muted small">Les cartes au format paysage (les commandants le sont) sont affichées en premier.</p>
          </Sheet>
          {(Object.keys(facCount).length > 0 || untagged > 0) && (
            <div className="fac-sum">
              <span className="muted small">Factions du deck :</span>
              {ALL_FACTIONS.filter((f) => facCount[f]).map((f) => (
                <span key={f} className="fac on">{f} {facCount[f]}</span>
              ))}
              {untagged > 0 && <span className="fac">sans faction {untagged}</span>}
            </div>
          )}
          {facInCollection.length > 0 && (
            <div className="fac-chips" style={{ marginBottom: 10 }}>
              <button className={`fac ${!fac ? "on" : ""}`} onClick={() => setFac("")}>Toutes</button>
              {facInCollection.map((f) => (
                <button key={f} className={`fac ${fac === f ? "on" : ""}`} onClick={() => setFac(fac === f ? "" : f)}>{f}</button>
              ))}
            </div>
          )}
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
                  <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) + 1)} disabled={(qty[c.id] || 0) >= maxFor(c)}>+</button>
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
                  onClick={() => toggleTok(c)}
                  style={{ ...(c.orient === "l" ? { aspectRatio: "88 / 63" } : null), opacity: tokOn(c) ? 1 : 0.45 }}
                >
                  {thumb(c)}
                  {tokOn(c) && <span className="badge">✓</span>}
                </div>
                <div className="qty" style={{ justifyContent: "center" }}>
                  <button className={`btn sm ${tokOn(c) ? "primary" : ""}`} onClick={() => toggleTok(c)}>
                    {tokOn(c) ? "Dans la réserve" : "Ajouter"}
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

// Commandant du deck : facultatif, hors des 30 à 40 cartes, posé d'office dans la zone Commandant en début de partie
function CommanderBox({ card, factions, count, onPick, onClear }) {
  return (
    <div className="cmd-box">
      <div className="grow">
        <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Commandant <span className="muted small">(facultatif)</span></h2>
        <p className="muted small" style={{ margin: 0 }}>
          Hors deck, posé automatiquement dans la zone Commandant au début de la partie. Il exige 15 combattants de sa faction dans le deck.
        </p>
      </div>
      {card ? (
        <div className="cmd-chosen">
          <img src={fileUrl("cards", card.id, card.image, "0x300")} alt={card.name} className={card.orient === "l" ? "l" : "p"} />
          <div className="small"><b>{card.name}</b></div>
          {factions.length ? (
            <div className={`small ${count >= CMD_MIN ? "ok-txt" : "warn"}`}>
              {count >= CMD_MIN ? "✓" : "⚠"} {count} / {CMD_MIN} combattants {factions.join(" ou ")}
            </div>
          ) : (
            <div className="small warn">Indiquez sa faction dans « Mes cartes » pour vérifier les 15 combattants.</div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={onPick}>Changer</button>
            <button className="btn sm ghost" onClick={onClear}>Retirer</button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={onPick}>Choisir un commandant</button>
      )}
    </div>
  );
}
