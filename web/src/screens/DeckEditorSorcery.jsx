import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { checkSorcery, nameKey, SORC_RULES, sorcCopiesOf } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { Sheet } from "../components/ui.jsx";
import { factionsOf } from "../lib/factions.js";
import { SORC_ELEMENTS, parseVal } from "../lib/game.js";
import { sorcRarityLabel, SORC_KIND_LABEL } from "../components/SorceryFields.jsx";
import { DeckLayout, DeckList, CardZoom } from "../components/DeckBuild.jsx";

// Deck Sorcery: Contested Realm : avatar (obligatoire), grimoire (sorts, 60 et plus), atlas (sites, 30 et plus), jetons.
// Exemplaires selon la rareté (Ordinaire 4, Exceptionnelle 3, Élite 2, Unique 1).
export default function DeckEditorSorcery({ go, deckId }) {
  const user = me();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [qty, setQty] = useState({});
  const [name, setName] = useState("");
  const [init, setInit] = useState(false); // deck de découverte : règles de construction ignorées
  const [avatar, setAvatar] = useState("");
  const [pickAv, setPickAv] = useState(false);
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [onlyIn, setOnlyIn] = useState(false);
  const [q, setQ] = useState("");
  const [el, setEl] = useState(""); // filtre par élément
  const [zoom, setZoom] = useState(null); // carte ouverte en grand (toucher une carte ne l'ajoute plus)

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          pb.collection("decks").getOne(deckId),
          pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${tcgFilter(currentTcg())}`, sort: "name,-created" }),
        ]);
        setDeck(d);
        setName(d.name);
        setInit(!!d.initiation);
        setAvatar(d.commander && c.some((x) => x.id === d.commander) ? d.commander : "");
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
  const spells = cards.filter((c) => !c.kind || c.kind === "sort" || c.kind === "carte");
  const sites = cards.filter((c) => c.kind === "site");
  const avatars = cards.filter((c) => c.kind === "avatar");
  const tokens = cards.filter((c) => c.kind === "jeton");
  const entries = Object.entries(qty).map(([card, n]) => ({ card, qty: n }));
  const chk = checkSorcery({ entries, commander: avatar, initiation: init }, byId);
  const nTok = tokens.filter((c) => qty[c.id]).length;
  // exemplaires déjà pris pour cette carte (même nom, scans différents)
  const same = (c) => cards.filter((x) => x.id !== c.id && x.kind !== "jeton" && nameKey(x.name) === nameKey(c.name)).reduce((n, x) => n + (qty[x.id] || 0), 0);
  const maxFor = (c) => (init ? 99 : Math.max(0, sorcCopiesOf(c) - same(c)));

  function setN(id, n) {
    const c = byId[id];
    const cap = c && c.kind !== "jeton" ? maxFor(c) : 1;
    if (n > cap) {
      setErr(`${sorcCopiesOf(c)} exemplaire${sorcCopiesOf(c) > 1 ? "s" : ""} au maximum de « ${c.name} » (${sorcRarityLabel(c.rarity) || "rareté non renseignée : comptée Ordinaire"}).`);
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
      await pb.collection("decks").update(deckId, { name: name.trim() || deck.name, entries, commander: avatar, initiation: init });
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
  const elOk = (c) => !el || factionsOf(c).includes(el);
  const filt = (list) => list.filter((c) => (!onlyIn || qty[c.id]) && match(c) && elOk(c));
  const avCard = byId[avatar];

  // Courbe de mana du grimoire (exemplaires par coût)
  const curve = Array.from({ length: 8 }, () => 0);
  let noCost = 0;
  for (const c of spells) {
    const n = qty[c.id] || 0;
    if (!n) continue;
    const v = parseVal(c.val);
    if (v === null) noCost += n;
    else curve[Math.min(7, Math.max(0, v))] += n;
  }
  const top = Math.max(1, ...curve);

  const thumb = (c) => (
    <>
      <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
      <div className="cap">{c.name || "Sans nom"}</div>
      {factionsOf(c).length > 0 && (
        <span className="sorc-els">
          {SORC_ELEMENTS.filter((e) => factionsOf(c).includes(e.id)).map((e) => <i key={e.id} style={{ color: e.hex }}>{e.icon}</i>)}
        </span>
      )}
    </>
  );
  const grid = (list, empty) => (
    <>
      {list.length === 0 && <p className="muted small">{empty}</p>}
      <div className="grid">
        {list.map((c) => (
          <div key={c.id}>
            <div className="thumb" onClick={() => setZoom(c.id)} title="Voir la carte en grand" style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null}>
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

  // Liste du deck (colonne de droite sur grand écran, panneau sur téléphone) : grimoire par coût, atlas par nom
  const elIcons = (c) => SORC_ELEMENTS.filter((e) => factionsOf(c).includes(e.id)).map((e) => e.icon).join("");
  const byCost = (a, b) => (parseVal(a.val) ?? 99) - (parseVal(b.val) ?? 99) || (a.name || "").localeCompare(b.name || "", "fr");
  const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "fr");
  const rowsOf = (list, sort) => list.filter((c) => qty[c.id]).sort(sort).map((c) => ({
    c, n: qty[c.id], max: maxFor(c),
    meta: `${parseVal(c.val) !== null && c.kind !== "site" ? `${parseVal(c.val)} ` : ""}${elIcons(c)}`,
  }));
  const deckList = (
    <DeckList
      summary={`Grimoire ${chk.spellbook}, atlas ${chk.atlas}${nTok ? `, ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}. Touchez un nom pour voir la carte.`}
      onOpen={(c) => setZoom(c.id)}
      onSet={setN}
      groups={[
        ...(avCard ? [{ key: "av", title: "Avatar", rows: [{ c: avCard, n: 1, fixed: true }] }] : []),
        { key: "sb", title: "Grimoire", count: `${chk.spellbook} / ${SORC_RULES.spellbook}+`, empty: "Ajoutez des sorts avec +.", rows: rowsOf(spells, byCost) },
        { key: "at", title: "Atlas", count: `${chk.atlas} / ${SORC_RULES.atlas}+`, empty: "Ajoutez des sites avec +.", rows: rowsOf(sites, byName) },
        ...(nTok ? [{ key: "tok", title: "Jetons (réserve)", rows: tokens.filter((c) => qty[c.id]).map((c) => ({ c, n: 1, toggle: true })) }] : []),
      ]}
    />
  );
  const zc = zoom && byId[zoom];

  return (
    <div className="page page-deck">
      <div className="topbar">
        <button className="btn icon ghost" onClick={back} aria-label="Retour">←</button>
        <h1>Deck</h1>
        <span className={`chip ${chk.ok ? "ok" : "warn"}`}>
          {chk.spellbook} + {chk.atlas}{nTok ? ` + ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}
        </span>
        <button className="btn primary sm" onClick={() => save(true)} disabled={!deck}>Enregistrer</button>
      </div>
      {err && <div className="err">{err}</div>}
      {deck && (
        <DeckLayout list={deckList} count={chk.spellbook + chk.atlas}>
          <div className="field">
            <label>Nom du deck</label>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} maxLength={80} />
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Règles officielles (Constructed) : 1 avatar, un grimoire d'au moins {SORC_RULES.spellbook} sorts, un atlas d'au moins {SORC_RULES.atlas} sites.
            Exemplaires selon la rareté : Ordinaire 4, Exceptionnelle 3, Élite 2, Unique 1 (rareté non renseignée : comptée Ordinaire).
          </p>
          <label className="init-toggle">
            <input type="checkbox" checked={init} onChange={(e) => { setInit(e.target.checked); setDirty(true); setErr(""); }} />
            <span>
              <b>Deck de découverte</b>
              <span className="muted small"> : petit deck pour apprendre ou pour une partie libre, jouable même s'il ne suit pas les règles (nombre de cartes, exemplaires). Seul l'avatar reste obligatoire.</span>
            </span>
          </label>
          <p className={`small ${chk.ok ? "muted" : "warn"}`}>
            {chk.ok && init
              ? `Deck de découverte : grimoire de ${chk.spellbook}, atlas de ${chk.atlas}. Règles de construction ignorées.`
              : chk.ok
                ? `Deck conforme : grimoire de ${chk.spellbook}, atlas de ${chk.atlas}.`
                : `Deck non conforme, il ne pourra pas être joué : ${chk.problems.join(" ")}`}
          </p>

          <div className="cmd-box">
            <div className="grow">
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Avatar</h2>
              <p className="muted small" style={{ margin: 0 }}>Posé sur la case du milieu de votre rangée au début de la partie. Sa vie (saisie au scan) est votre vie de départ, 20 sinon.</p>
            </div>
            {avCard ? (
              <div className="cmd-chosen">
                <img src={fileUrl("cards", avCard.id, avCard.image, "0x300")} alt={avCard.name} className={avCard.orient === "l" ? "l" : "p"} />
                <div className="small"><b>{avCard.name}</b>{parseVal(avCard.val) ? ` · ${parseVal(avCard.val)} de vie` : ""}</div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm" onClick={() => setPickAv(true)}>Changer</button>
                  <button className="btn sm ghost" onClick={() => { setAvatar(""); setDirty(true); }}>Retirer</button>
                </div>
              </div>
            ) : (
              <button className="btn" onClick={() => setPickAv(true)}>Choisir un avatar</button>
            )}
          </div>
          <Sheet open={pickAv} onClose={() => setPickAv(false)} title="Choisir l'avatar">
            {avatars.length === 0 && <p className="muted small">Aucun avatar dans votre collection. Au scan, choisissez le type « Avatar » (ou changez le type d'une carte dans « Mes cartes »).</p>}
            <div className="grid cmd-grid">
              {avatars.map((c) => (
                <div key={c.id} className={`thumb ${c.id === avatar ? "sel" : ""}`} onClick={() => { setAvatar(c.id); setDirty(true); setPickAv(false); }}>
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
          <div className="fac-chips" style={{ marginBottom: 10 }}>
            <span className="muted small">Élément :</span>
            <button className={`fac ${!el ? "on" : ""}`} onClick={() => setEl("")}>Tous</button>
            {SORC_ELEMENTS.map((e) => (
              <button key={e.id} className={`fac ${el === e.id ? "on" : ""}`} onClick={() => setEl(el === e.id ? "" : e.id)}>
                <span style={{ color: e.hex }}>{e.icon}</span> {e.label}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Grimoire <span className="muted small">({chk.spellbook} / {SORC_RULES.spellbook}+)</span></h2>
          {chk.spellbook > 0 && (
            <div className="vcurve-box">
              <b className="small">📊 Courbe de mana</b>
              {noCost > 0 && <span className="muted small"> · {noCost} sans coût renseigné</span>}
              <div className="vcurve">
                {curve.map((n, i) => (
                  <div key={i} className="vc-col" title={`Coût ${i === 7 ? "7 et plus" : i} : ${n}`}>
                    <span className="vc-n">{n || ""}</span>
                    <span className="vc-bar" style={{ height: `${(n / top) * 72}%` }}><span className="cbt" style={{ flexGrow: 1 }} /></span>
                    <span className="vc-v">{i === 7 ? "7+" : i}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {grid(filt(spells), spells.length ? "Aucune carte ne correspond." : "Aucun sort scanné. Au scan, choisissez le type « Sort ».")}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Atlas <span className="muted small">({chk.atlas} / {SORC_RULES.atlas}+)</span></h2>
          <p className="muted small" style={{ marginTop: 0 }}>Les sites : en partie, ils sont dans votre atlas, à part du grimoire.</p>
          {grid(filt(sites), sites.length ? "Aucun site ne correspond." : "Aucun site scanné. Au scan, choisissez le type « Site ».")}

          <div className="spacer" />
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Jetons</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Rangés dans la réserve. En partie, chaque glisser-déposer en crée une copie.</p>
          {tokens.length === 0 && <p className="muted small">Aucun jeton. Au scan, choisissez le type « Jeton ».</p>}
          <div className="grid">
            {filt(tokens).map((c) => (
              <div key={c.id}>
                <div className="thumb" onClick={() => setZoom(c.id)} title="Voir la carte en grand" style={{ opacity: qty[c.id] ? 1 : 0.45, ...(c.orient === "l" ? { aspectRatio: "88 / 63" } : null) }}>
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
        </DeckLayout>
      )}
      {zc && (
        <CardZoom
          card={zc}
          onClose={() => setZoom(null)}
          info={[
            SORC_KIND_LABEL[zc.kind] || null,
            sorcRarityLabel(zc.rarity) || null,
            zc.kind === "avatar" ? (zc.val ? `Vie ${zc.val}` : null) : zc.val ? `Coût ${zc.val}` : null,
            zc.atk ? `Puissance ${zc.atk}` : null,
            zc.def ? `Défense ${zc.def}` : null,
            factionsOf(zc).join(", ") || null,
          ].filter(Boolean).join(" · ")}
          toggle={zc.kind === "jeton"}
          fixed={zc.kind === "avatar"}
          n={qty[zc.id] || 0}
          max={zc.kind === "jeton" ? 1 : maxFor(zc)}
          onSet={setN}
        />
      )}
    </div>
  );
}
