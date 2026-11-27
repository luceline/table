import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { checkHeros, nameKey, HEROS_RULES, HEROS_TIERS } from "../lib/deckrules.js";
import { DeckLayout, DeckList, CardZoom } from "../components/DeckBuild.jsx";
import { HEROS_EQUIP } from "../lib/mat.js";

// Deck du prototype Héros (Référence v0.2, section 2) : 30 cartes Action / Réaction (3 exemplaires au plus),
// réserve de 10 quêtes (1 copie de chacune, au moins 2 par palier), 7 pièces d'équipement au plus (une par emplacement).
const KIND_LABEL = { action: "Action", reaction: "Réaction", quete: "Quête", equipement: "Équipement" };
const TIER_ORDER = { simple: 1, intermediaire: 2, complexe: 3 };

export default function DeckEditorHeros({ go, deckId }) {
  const user = me();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [qty, setQty] = useState({});
  const [name, setName] = useState("");
  const [init, setInit] = useState(false);
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [onlyIn, setOnlyIn] = useState(false);
  const [q, setQ] = useState("");
  const [fam, setFam] = useState("");
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          pb.collection("decks").getOne(deckId),
          pb.collection("cards").getFullList({ filter: `owner="${user.id}" && tcg = "heros"`, sort: "name,-created" }),
        ]);
        setDeck(d);
        setName(d.name);
        setInit(!!d.initiation);
        setCards(c);
        const qq = {};
        for (const e of d.entries || []) if (c.some((x) => x.id === e.card)) qq[e.card] = e.qty;
        setQty(qq);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [deckId]);

  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const lvl = (c) => parseInt(c.atk, 10) || 0;
  const cost = (c) => parseInt(c.val, 10) || 0;
  const playable = cards.filter((c) => c.kind === "action" || c.kind === "reaction").sort((a, b) => lvl(a) - lvl(b) || cost(a) - cost(b) || (a.name || "").localeCompare(b.name || "", "fr"));
  const quests = cards.filter((c) => c.kind === "quete").sort((a, b) => (TIER_ORDER[a.rarity] || 9) - (TIER_ORDER[b.rarity] || 9) || (a.name || "").localeCompare(b.name || "", "fr"));
  const equip = cards.filter((c) => c.kind === "equipement").sort((a, b) => HEROS_EQUIP.indexOf((a.factions || [])[0]) - HEROS_EQUIP.indexOf((b.factions || [])[0]));
  const families = [...new Set(playable.flatMap((c) => c.factions || []))];
  const entries = Object.entries(qty).map(([card, n]) => ({ card, qty: n }));
  const chk = checkHeros({ entries, initiation: init }, byId);
  const same = (c) => cards.filter((x) => x.id !== c.id && x.kind === c.kind && nameKey(x.name) === nameKey(c.name)).reduce((n, x) => n + (qty[x.id] || 0), 0);
  const maxFor = (c) => (init ? 99 : c.kind === "quete" || c.kind === "equipement" ? 1 : Math.max(0, HEROS_RULES.copies - same(c)));

  function setN(id, n) {
    const c = byId[id];
    const cap = c ? maxFor(c) : 0;
    if (n > cap) {
      setErr(c.kind === "quete" ? "Une seule copie de chaque quête." : c.kind === "equipement" ? "Une seule copie de chaque pièce." : `${HEROS_RULES.copies} exemplaires au maximum.`);
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
      await pb.collection("decks").update(deckId, { name: name.trim() || deck.name, entries, initiation: init });
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
  const filt = (list, useFam) => list.filter((c) => (!onlyIn || qty[c.id]) && match(c) && (!useFam || !fam || (c.factions || []).includes(fam)));
  const meta = (c) =>
    c.kind === "quete" ? `${HEROS_TIERS[c.rarity] || ""} · ${cost(c)} mana`
    : c.kind === "equipement" ? `${(c.factions || [])[0] || ""} · ${cost(c)} pts`
    : `niv. ${lvl(c)} · ${cost(c)} mana${c.kind === "reaction" ? " · Réaction" : ""}`;

  // Courbe des niveaux requis (30 cartes)
  const curve = Array.from({ length: 10 }, () => 0);
  for (const c of playable) if (qty[c.id]) curve[Math.min(9, Math.max(0, lvl(c) - 1))] += qty[c.id];
  const top = Math.max(1, ...curve);

  const grid = (list, empty, toggle) => (
    <>
      {list.length === 0 && <p className="muted small">{empty}</p>}
      <div className="grid">
        {list.map((c) => (
          <div key={c.id}>
            <div className="thumb" onClick={() => setZoom(c.id)} title="Voir la carte en grand" style={toggle && !qty[c.id] ? { opacity: 0.5 } : null}>
              <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
              <div className="cap">{c.name}</div>
              {qty[c.id] > 0 && <span className="badge">{toggle ? "✓" : `×${qty[c.id]}`}</span>}
            </div>
            {toggle ? (
              <div className="qty" style={{ justifyContent: "center" }}>
                <button className={`btn sm ${qty[c.id] ? "primary" : ""}`} onClick={() => setN(c.id, qty[c.id] ? 0 : 1)}>{qty[c.id] ? "Retirer" : "Ajouter"}</button>
              </div>
            ) : (
              <div className="qty">
                <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) - 1)} disabled={!qty[c.id]}>−</button>
                <b>{qty[c.id] || 0}</b>
                <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) + 1)} disabled={(qty[c.id] || 0) >= maxFor(c)}>+</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );

  const rowsOf = (list, toggle) => list.filter((c) => qty[c.id]).map((c) => ({ c, n: qty[c.id], max: maxFor(c), meta: meta(c), toggle }));
  const deckList = (
    <DeckList
      summary={`${chk.total} cartes, ${chk.quests} quêtes, ${chk.equip} pièces. Touchez un nom pour voir la carte.`}
      onOpen={(c) => setZoom(c.id)}
      onSet={setN}
      groups={[
        { key: "c", title: "Cartes", count: `${chk.total} / ${HEROS_RULES.cards}`, empty: "Ajoutez des cartes avec +.", rows: rowsOf(playable) },
        { key: "q", title: "Réserve de quêtes", count: `${chk.quests} / ${HEROS_RULES.quests}`, empty: "Ajoutez 10 quêtes.", rows: rowsOf(quests, true) },
        { key: "e", title: "Équipement", count: `${chk.equip} / ${HEROS_RULES.equip}`, empty: "Ajoutez les pièces.", rows: rowsOf(equip, true) },
      ]}
    />
  );
  const zc = zoom && byId[zoom];

  return (
    <div className="page page-deck">
      <div className="topbar">
        <button className="btn icon ghost" onClick={back} aria-label="Retour">←</button>
        <h1>Deck</h1>
        <span className={`chip ${chk.ok ? "ok" : "warn"}`}>{chk.total} + {chk.quests} q.</span>
        <button className="btn primary sm" onClick={() => save(true)} disabled={!deck}>Enregistrer</button>
      </div>
      {err && <div className="err">{err}</div>}
      {deck && (
        <DeckLayout list={deckList} count={chk.total + chk.quests}>
          <div className="field">
            <label>Nom du deck</label>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} maxLength={80} />
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Référence v0.2 : {HEROS_RULES.cards} cartes Action / Réaction ({HEROS_RULES.copies} exemplaires au plus), {HEROS_RULES.quests} quêtes (une copie de chacune, au moins {HEROS_RULES.perTier} par palier), {HEROS_RULES.equip} pièces d'équipement au plus, une par emplacement.
          </p>
          <label className="init-toggle">
            <input type="checkbox" checked={init} onChange={(e) => { setInit(e.target.checked); setDirty(true); setErr(""); }} />
            <span><b>Deck d'essai</b><span className="muted small"> : jouable même s'il ne suit pas ces règles.</span></span>
          </label>
          <p className={`small ${chk.ok ? "muted" : "warn"}`}>
            {chk.ok ? (init ? "Deck d'essai : règles de construction ignorées." : "Deck conforme.") : `Deck non conforme : ${chk.problems.join(" ")}`}
          </p>

          <input className="input" placeholder="Rechercher une carte par nom" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn sm ${onlyIn ? "" : "ghost"}`} onClick={() => setOnlyIn(!onlyIn)}>{onlyIn ? "Afficher toutes les cartes" : "Seulement les cartes du deck"}</button>
            <span className="grow" />
            <button className="btn sm danger ghost" onClick={remove}>Supprimer le deck</button>
          </div>

          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Cartes <span className="muted small">({chk.total} / {HEROS_RULES.cards})</span></h2>
          {families.length > 0 && (
            <div className="fac-chips" style={{ marginBottom: 10 }}>
              <span className="muted small">Famille :</span>
              <button className={`fac ${!fam ? "on" : ""}`} onClick={() => setFam("")}>Toutes</button>
              {families.map((f) => <button key={f} className={`fac ${fam === f ? "on" : ""}`} onClick={() => setFam(fam === f ? "" : f)}>[{f}]</button>)}
            </div>
          )}
          {chk.total > 0 && (
            <div className="vcurve-box">
              <b className="small">📊 Niveaux requis</b>
              <div className="vcurve">
                {curve.map((n, i) => (
                  <div key={i} className="vc-col" title={`Niveau ${i + 1} : ${n}`}>
                    <span className="vc-n">{n || ""}</span>
                    <span className="vc-bar" style={{ height: `${(n / top) * 72}%` }}><span className="cbt" style={{ flexGrow: 1 }} /></span>
                    <span className="vc-v">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {grid(filt(playable, true), playable.length ? "Aucune carte ne correspond." : "Aucune carte : installez les cartes de démo depuis l'accueil.")}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Réserve de quêtes <span className="muted small">({chk.quests} / {HEROS_RULES.quests} · simples {chk.tiers.simple}, intermédiaires {chk.tiers.intermediaire}, complexes {chk.tiers.complexe})</span></h2>
          {grid(filt(quests), "Aucune quête.", true)}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Équipement <span className="muted small">({chk.equip} / {HEROS_RULES.equip})</span></h2>
          <p className="muted small" style={{ marginTop: 0 }}>Posé inactif sur son emplacement au début de la partie ; une pièce tournée de côté = débloquée.</p>
          {grid(filt(equip), "Aucune pièce.", true)}
        </DeckLayout>
      )}
      {zc && (
        <CardZoom
          card={zc}
          onClose={() => setZoom(null)}
          info={[KIND_LABEL[zc.kind], meta(zc), (zc.factions || []).length && zc.kind !== "equipement" ? `[${zc.factions.join(", ")}]` : null].filter(Boolean).join(" · ")}
          toggle={zc.kind === "quete" || zc.kind === "equipement"}
          n={qty[zc.id] || 0}
          max={maxFor(zc)}
          onSet={setN}
        />
      )}
    </div>
  );
}
