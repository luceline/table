import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { checkFab, fabKey, fabLabel, FAB_RULES, PITCH } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { Sheet } from "../components/ui.jsx";
import { factionsOf } from "../lib/factions.js";
import { FAB_CLASSES, FAB_TALENTS } from "../components/FabFields.jsx";

const PITCH_HEX = { r: "#c83a32", y: "#d6b13b", b: "#3b78c8" };

// Deck Flesh and Blood : héros (obligatoire), format Classic Constructed ou Blitz, cartes du deck,
// armes et équipements (réserve de la partie, hors deck), jetons.
export default function DeckEditorFab({ go, deckId }) {
  const user = me();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [qty, setQty] = useState({});
  const [name, setName] = useState("");
  const [format, setFormat] = useState("cc");
  const [hero, setHero] = useState("");
  const [pickHero, setPickHero] = useState(false);
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [onlyIn, setOnlyIn] = useState(false);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState(""); // filtre par classe / talent

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          pb.collection("decks").getOne(deckId),
          pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${tcgFilter(currentTcg())}`, sort: "name,-created" }),
        ]);
        setDeck(d);
        setName(d.name);
        setFormat(d.format === "blitz" ? "blitz" : "cc");
        setHero(d.commander && c.some((x) => x.id === d.commander) ? d.commander : "");
        setCards(c);
        const qq = {};
        for (const e of d.entries || []) if (c.some((x) => x.id === e.card)) qq[e.card] = e.qty;
        setQty(qq);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [deckId]);

  const R = FAB_RULES[format];
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const deckCards = cards.filter((c) => !c.kind || c.kind === "carte");
  const arena = cards.filter((c) => c.kind === "arene");
  const heroes = cards.filter((c) => c.kind === "heros");
  const tokens = cards.filter((c) => c.kind === "jeton");
  const entries = Object.entries(qty).map(([card, n]) => ({ card, qty: n }));
  const chk = checkFab({ format, entries, commander: hero }, byId);
  const nTok = tokens.filter((c) => qty[c.id]).length;
  // exemplaires déjà pris pour cette carte unique (même nom et même couleur, scans différents)
  const same = (c) => cards.filter((x) => x.id !== c.id && x.kind !== "jeton" && fabKey(x) === fabKey(c)).reduce((n, x) => n + (qty[x.id] || 0), 0);
  const pool = chk.total + chk.arena;
  const maxFor = (c) => {
    const left = R.copies - same(c);
    const roomPool = (qty[c.id] || 0) + R.pool - pool;
    const roomDeck = R.deckMax && c.kind !== "arene" ? (qty[c.id] || 0) + R.deckMax - chk.total : 99;
    return Math.max(0, Math.min(left, roomPool, roomDeck));
  };

  function setN(id, n) {
    const c = byId[id];
    const cap = c && c.kind !== "jeton" ? maxFor(c) : 1;
    if (n > cap) {
      setErr(
        same(c) + (qty[id] || 0) >= R.copies
          ? `${R.copies} exemplaire${R.copies > 1 ? "s" : ""} au maximum de « ${fabLabel(c)} » en ${R.name}.`
          : R.deckMax && c.kind !== "arene" && chk.total >= R.deckMax
            ? `Le deck compte exactement ${R.deckMax} cartes en ${R.name}.`
            : `${R.pool} cartes au maximum (deck, armes et équipements) en ${R.name}.`,
      );
      return;
    }
    setErr("");
    setQty((qq) => {
      const r = { ...qq, [id]: Math.max(0, Math.min(cap, n)) };
      if (!r[id]) delete r[id];
      return r;
    });
    setDirty(true);
  }

  async function save(leave) {
    try {
      await pb.collection("decks").update(deckId, { name: name.trim() || deck.name, entries, commander: hero, format });
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

  const fold = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const match = (c) => !q.trim() || fold(c.name).includes(fold(q.trim()));
  const clsOk = (c) => !cls || factionsOf(c).includes(cls);
  const filt = (list) => list.filter((c) => (!onlyIn || qty[c.id]) && match(c) && clsOk(c));
  const heroCard = byId[hero];
  const tags = [...FAB_CLASSES, ...FAB_TALENTS].filter((f) => cards.some((c) => factionsOf(c).includes(f)));

  const thumb = (c) => (
    <>
      <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
      <div className="cap">{c.name || "Sans nom"}</div>
      {c.pitch && <span className="pitch-tag" style={{ background: PITCH_HEX[c.pitch] }} title={PITCH[c.pitch]} />}
    </>
  );
  const grid = (list, empty) => (
    <>
      {list.length === 0 && <p className="muted small">{empty}</p>}
      <div className="grid">
        {list.map((c) => (
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
    </>
  );

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={back} aria-label="Retour">←</button>
        <h1>Deck</h1>
        <span className={`chip ${chk.ok ? "ok" : "warn"}`}>
          {chk.total} / {R.deckMax ? R.deckMax : `${R.deckMin}+`}{chk.arena ? ` + ${chk.arena} équip.` : ""}{nTok ? ` + ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}
        </span>
        <button className="btn primary sm" onClick={() => save(true)} disabled={!deck}>Enregistrer</button>
      </div>
      {err && <div className="err">{err}</div>}
      {deck && (
        <>
          <div className="field">
            <label>Nom du deck</label>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} maxLength={80} />
          </div>
          <div className="field">
            <label>Format</label>
            <div className="hand-tabs">
              {Object.entries(FAB_RULES).map(([k, v]) => (
                <button key={k} className={format === k ? "on" : ""} onClick={() => { setFormat(k); setDirty(true); }}>{v.name}</button>
              ))}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              {format === "blitz"
                ? "Jeune héros, deck d'exactement 40 cartes, 52 cartes au plus avec armes et équipements, 1 exemplaire de chaque carte. 20 de vie au départ (à ajuster selon le héros)."
                : "Héros adulte, deck d'au moins 60 cartes, 80 cartes au plus avec armes et équipements, 3 exemplaires au plus de chaque carte. 40 de vie au départ (à ajuster selon le héros)."}
            </p>
          </div>

          <p className={`small ${chk.ok ? "muted" : "warn"}`}>
            {chk.ok ? `Deck conforme (${R.name}) : ${chk.total} cartes, ${chk.arena} arme(s) et équipement(s).` : `Deck non conforme, il ne pourra pas être joué : ${chk.problems.join(" ")}`}
          </p>

          <div className="cmd-box">
            <div className="grow">
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Héros</h2>
              <p className="muted small" style={{ margin: 0 }}>Posé automatiquement dans la zone Héros au début de la partie. Scannez-le avec le type « Héros ».</p>
            </div>
            {heroCard ? (
              <div className="cmd-chosen">
                <img src={fileUrl("cards", heroCard.id, heroCard.image, "0x300")} alt={heroCard.name} className={heroCard.orient === "l" ? "l" : "p"} />
                <div className="small"><b>{heroCard.name}</b></div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm" onClick={() => setPickHero(true)}>Changer</button>
                  <button className="btn sm ghost" onClick={() => { setHero(""); setDirty(true); }}>Retirer</button>
                </div>
              </div>
            ) : (
              <button className="btn" onClick={() => setPickHero(true)}>Choisir un héros</button>
            )}
          </div>
          <Sheet open={pickHero} onClose={() => setPickHero(false)} title="Choisir le héros">
            {heroes.length === 0 && <p className="muted small">Aucun héros dans votre collection. Au scan, choisissez le type « Héros » (ou changez le type d'une carte dans « Mes cartes »).</p>}
            <div className="grid cmd-grid">
              {heroes.map((c) => (
                <div key={c.id} className={`thumb ${c.id === hero ? "sel" : ""}`} onClick={() => { setHero(c.id); setDirty(true); setPickHero(false); }}>
                  {thumb(c)}
                </div>
              ))}
            </div>
          </Sheet>

          <input className="input" placeholder="Rechercher une carte par nom" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn sm ${onlyIn ? "" : "ghost"}`} onClick={() => setOnlyIn(!onlyIn)}>
              {onlyIn ? "Afficher toute ma collection" : "Seulement les cartes du deck"}
            </button>
            <span className="grow" />
            <button className="btn sm danger ghost" onClick={remove}>Supprimer le deck</button>
          </div>
          {tags.length > 0 && (
            <div className="fac-chips" style={{ marginBottom: 10 }}>
              <button className={`fac ${!cls ? "on" : ""}`} onClick={() => setCls("")}>Toutes</button>
              {tags.map((f) => (
                <button key={f} className={`fac ${cls === f ? "on" : ""}`} onClick={() => setCls(cls === f ? "" : f)}>{f}</button>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Cartes du deck <span className="muted small">({chk.total})</span></h2>
          {grid(filt(deckCards), deckCards.length ? "Aucune carte ne correspond." : "Aucune carte scannée pour le deck.")}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Armes et équipements <span className="muted small">({chk.arena})</span></h2>
          <p className="muted small" style={{ marginTop: 0 }}>Hors deck : en partie, ils sont dans l'onglet « Inventaire » et se posent dans leurs zones.</p>
          {grid(filt(arena), arena.length ? "Aucune carte ne correspond." : "Aucune arme ni équipement. Au scan, choisissez le type « Arme / équipement ».")}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Jetons</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Rangés dans la réserve à côté du tapis. En partie, chaque glisser-déposer en crée une copie.</p>
          {tokens.length === 0 && <p className="muted small">Aucun jeton. Au scan, choisissez le type « Jeton ».</p>}
          <div className="grid">
            {filt(tokens).map((c) => (
              <div key={c.id}>
                <div className="thumb" onClick={() => setN(c.id, qty[c.id] ? 0 : 1)} style={{ opacity: qty[c.id] ? 1 : 0.45 }}>
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
