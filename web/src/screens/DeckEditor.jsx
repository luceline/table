import { useEffect, useState } from "react";
import { BANLIST, BANLIST_NOTE, banText, banWarnings } from "../lib/banlist.js";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { checkDeck, nameKey, DECK_MIN, DECK_MAX, COPY_MAX } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { Sheet } from "../components/ui.jsx";
import { parseVal } from "../lib/game.js";
import { DeckLayout, DeckList, CardZoom } from "../components/DeckBuild.jsx";
import { ALL_FACTIONS, KIN_SUB, factionsOf } from "../lib/factions.js";
import { ARRIVAL_MAX, arrivalOf, autoArrival, playArrival } from "../lib/fx.js";

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
  const [kind, setKind] = useState(""); // filtre par type : "" tous, "cbt" combattants, "mag" magies, "none" sans stats
  const [valF, setValF] = useState(null); // filtre par Valeur (barre de la courbe touchée)
  const [zoom, setZoom] = useState(null); // carte ouverte en grand (toucher une carte ne l'ajoute plus)
  const [fx, setFx] = useState({}); // cartes à qui le joueur donne l'aura de puissance (2 cartes différentes au plus)

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
        const q = {}, t = {}, f = {};
        for (const e of d.entries || []) {
          if (!c.some((x) => x.id === e.card)) continue;
          (e.tok ? t : q)[e.card] = e.tok ? 1 : e.qty;
          if (!e.tok && e.fx === "aura" && Object.keys(f).length < ARRIVAL_MAX) f[e.card] = "aura";
        }
        setQty(q);
        setTq(t);
        setFx(f);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [deckId]);

  const normal = cards.filter((c) => c.kind !== "jeton");
  // Jetons : cartes jetons, et cartes normales qui existent aussi en jeton (choix séparé de leurs exemplaires du deck)
  const tokens = cards.filter((c) => c.kind === "jeton" || c.token_too);
  const tokOn = (c) => !!(c.kind === "jeton" ? qty[c.id] : tq[c.id]);
  // le commandant compte dans les 30 à 40 cartes du deck
  const total = normal.reduce((n, c) => n + (qty[c.id] || 0), 0) + (commander ? 1 : 0);
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
  const chk = checkDeck(Object.entries(qty).map(([card, n]) => ({ card, qty: n })), byId, commander);
  // liste officielle des cartes limitées / bannies : avertissement seulement, le deck n'est pas bloqué
  const banWarn = banWarnings(Object.entries(qty).map(([card, n]) => ({ card, qty: n })), byId, commander);
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
    if (n <= 0) setFx((f) => { if (!f[id]) return f; const r = { ...f }; delete r[id]; return r; });
    setDirty(true);
  }

  // 2 cartes différentes au plus par effet
  // Aura de puissance : choisie par le joueur, 2 cartes différentes au plus ; elle remplace l'effet de faction (Yan, Lin, Tian)
  const auraCount = Object.keys(fx).filter((id) => qty[id]).length;
  function toggleAura(c) {
    if (fx[c.id]) {
      setFx((f) => { const r = { ...f }; delete r[c.id]; return r; });
      setDirty(true);
      return;
    }
    if (auraCount >= ARRIVAL_MAX) return setErr(`Aura de puissance : ${ARRIVAL_MAX} cartes au plus par deck. Retirez-la d'une autre carte d'abord.`);
    setErr("");
    setFx((f) => ({ ...f, [c.id]: "aura" }));
    setDirty(true);
    playArrival("aura", { cx: window.innerWidth / 2, cy: window.innerHeight / 2, w: 90, h: 125, atk: null, demo: true });
  }

  async function save(leave) {
    try {
      const entries = [
        ...Object.entries(qty).map(([card, n]) => ({ card, qty: n, ...(fx[card] ? { fx: fx[card] } : null) })),
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
  // Type : magie = une Valeur seule ; combattant = une ATK ou une DEF ; sinon stats non renseignées
  const kindOf = (c) => (isMagic(c) ? "mag" : c.atk || c.def ? "cbt" : "none");
  const kindOk = (c) => !kind || kindOf(c) === kind;
  // Courbe de Valeur (coût) : exemplaires du deck par Valeur, combattants et magies, commandant à part ; 10 et plus regroupés
  const VMAX = 10;
  const vBucket = (c) => { const v = parseVal(c.val); return v === null ? null : Math.min(VMAX, Math.max(0, v)); };
  const curve = Array.from({ length: VMAX + 1 }, () => ({ cbt: 0, mag: 0 }));
  let noVal = 0, vSum = 0, vN = 0;
  for (const c of normal) {
    const n = qty[c.id] || 0;
    if (!n) continue;
    const b = vBucket(c);
    if (b === null) { noVal += n; continue; }
    curve[b][isMagic(c) ? "mag" : "cbt"] += n;
    vSum += parseVal(c.val) * n;
    vN += n;
  }
  const vHi = Math.max(5, ...curve.map((x, i) => (x.cbt + x.mag ? i : 0)));
  const vTop = Math.max(1, ...curve.map((x) => x.cbt + x.mag));
  const valOk = (c) => valF === null || vBucket(c) === valF;
  const shown = normal.filter((c) => (!onlyIn || qty[c.id]) && match(c) && facOk(c) && kindOk(c) && valOk(c));
  const kindN = (k) => normal.filter((c) => (!onlyIn || qty[c.id]) && match(c) && facOk(c) && kindOf(c) === k).length;
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
  // Combattants de la faction du commandant : seulement les cartes du deck (une carte « Les deux » mise dans le deck compte ;
  // les jetons de la réserve ne comptent pas)
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

  // Liste du deck (colonne de droite sur grand écran, panneau sur téléphone)
  const byVal = (a, b) => (parseVal(a.val) ?? 99) - (parseVal(b.val) ?? 99) || (a.name || "").localeCompare(b.name || "", "fr");
  const deckList = (
    <DeckList
      summary={`${total} carte${total > 1 ? "s" : ""}${nTok ? `, ${nTok} jeton${nTok > 1 ? "s" : ""} en réserve` : ""}. Touchez un nom pour voir la carte.`}
      onOpen={(c) => setZoom(c.id)}
      onSet={setN}
      groups={[
        ...(cmdCard ? [{ key: "cmd", title: "Commandant", rows: [{ c: cmdCard, n: 1, fixed: true }] }] : []),
        {
          key: "deck",
          title: "Cartes",
          count: total - (cmdCard ? 1 : 0),
          empty: "Ajoutez des cartes avec +.",
          rows: normal.filter((c) => qty[c.id]).sort(byVal).map((c) => ({
            c, n: qty[c.id], max: maxFor(c),
            meta: `${parseVal(c.val) !== null ? `V${parseVal(c.val)}` : ""}${isMagic(c) ? " ✦" : ""}${fx[c.id] ? " 💥" : ""}`,
          })),
        },
        ...(tokens.some(tokOn) ? [{ key: "tok", title: "Jetons (réserve)", rows: tokens.filter(tokOn).map((c) => ({ c, n: 1, toggle: true, set: () => toggleTok(c) })) }] : []),
      ]}
    />
  );
  const zc = zoom && cards.find((c) => c.id === zoom);
  const zInfo = zc && [
    parseVal(zc.val) !== null ? `Valeur ${parseVal(zc.val)}` : null,
    zc.atk ? `ATK ${zc.atk}` : null,
    zc.def ? `DEF ${zc.def}` : null,
    factionsOf(zc).join(", ") || null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="page page-deck">
      <div className="topbar">
        <button className="btn icon ghost" onClick={back} aria-label="Retour">←</button>
        <h1>Deck</h1>
        <span className={`chip ${chk.ok ? "ok" : "warn"}`}>{total} / {DECK_MIN}-{DECK_MAX}{nTok ? ` + ${nTok} jeton${nTok > 1 ? "s" : ""}` : ""}</span>
        <button className="btn primary sm" onClick={() => save(true)} disabled={!deck}>Enregistrer</button>
      </div>
      {err && <div className="err">{err}</div>}
      {deck && (
        <DeckLayout list={deckList} count={total}>
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
          {banWarn.length > 0 && (
            <div className="ban-warn">
              <b>⚠ Liste des cartes limitées et bannies</b>
              {banWarn.map((w, i) => <span key={i}>{w.ban ? "⛔" : "1️⃣"} {w.text}</span>)}
              <small>Le deck reste jouable entre amis ; pour un événement officiel, il faut le corriger.</small>
            </div>
          )}
          <details className="ban-list">
            <summary>📋 Cartes limitées et bannies (événements officiels)</summary>
            <p className="muted small">{BANLIST_NOTE}</p>
            <ul>
              {BANLIST.map((b) => (
                <li key={b.season + b.n + b.name}>
                  <span className="muted small">{b.season} · {b.n}</span> {b.name} : <b className={b.max === 0 ? "ban" : "lim"}>{banText(b)}</b>
                </li>
              ))}
            </ul>
          </details>
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
          {vN + noVal > 0 && (
            <div className="vcurve-box">
              <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b className="small">📊 Courbe de Valeur</b>
                <span className="muted small">
                  moyenne {vN ? (vSum / vN).toFixed(1).replace(".", ",") : "?"}
                  {noVal ? ` · ${noVal} carte${noVal > 1 ? "s" : ""} sans Valeur` : ""}
                </span>
                <span className="vc-legend small"><i className="cbt" /> combattants <i className="mag" /> magies</span>
              </div>
              <div className="vcurve">
                {curve.slice(0, vHi + 1).map((x, i) => {
                  const n = x.cbt + x.mag;
                  return (
                    <button
                      key={i}
                      className={`vc-col ${valF === i ? "on" : ""}`}
                      onClick={() => setValF(valF === i ? null : i)}
                      title={`Valeur ${i === VMAX ? VMAX + " et plus" : i} : ${x.cbt} combattant${x.cbt > 1 ? "s" : ""}, ${x.mag} magie${x.mag > 1 ? "s" : ""}. Touchez pour filtrer.`}
                    >
                      <span className="vc-n">{n || ""}</span>
                      <span className="vc-bar" style={{ height: `${(n / vTop) * 72}%` }}>
                        {x.mag > 0 && <span className="mag" style={{ flexGrow: x.mag }} />}
                        {x.cbt > 0 && <span className="cbt" style={{ flexGrow: x.cbt }} />}
                      </span>
                      <span className="vc-v">{i === VMAX ? `${VMAX}+` : i}</span>
                    </button>
                  );
                })}
              </div>
              {valF !== null && (
                <div className="small" style={{ marginTop: 4 }}>
                  Cartes de Valeur {valF === VMAX ? `${VMAX} et plus` : valF} affichées{" "}
                  <button className="linkish" onClick={() => setValF(null)}>✕ tout afficher</button>
                </div>
              )}
            </div>
          )}
          <div className="fac-chips" style={{ marginBottom: 6 }}>
            <span className="muted small">Type :</span>
            <button className={`fac ${!kind ? "on" : ""}`} onClick={() => setKind("")}>Tous</button>
            <button className={`fac ${kind === "cbt" ? "on" : ""}`} onClick={() => setKind(kind === "cbt" ? "" : "cbt")}>⚔ Combattants {kindN("cbt")}</button>
            <button className={`fac ${kind === "mag" ? "on" : ""}`} onClick={() => setKind(kind === "mag" ? "" : "mag")} title="Magie : une Valeur seule, sans ATK ni DEF">✦ Magies {kindN("mag")}</button>
            {(kind === "none" || kindN("none") > 0) && (
              <button className={`fac ${kind === "none" ? "on" : ""}`} onClick={() => setKind(kind === "none" ? "" : "none")} title="Ni Valeur, ni ATK, ni DEF : à compléter dans Mes cartes">? Sans stats {kindN("none")}</button>
            )}
          </div>
          {facInCollection.length > 0 && (
            <div className="fac-chips" style={{ marginBottom: 10 }}>
              <span className="muted small">Faction :</span>
              <button className={`fac ${!fac ? "on" : ""}`} onClick={() => setFac("")}>Toutes</button>
              {facInCollection.map((f) => (
                <button key={f} className={`fac ${fac === f ? "on" : ""}`} onClick={() => setFac(fac === f ? "" : f)}>{f}</button>
              ))}
            </div>
          )}
          <h2 style={{ fontSize: 17, marginBottom: 4 }}>Cartes du deck</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Effets d'arrivée sur le terrain (vus aussi par l'adversaire et les spectateurs) : les cartes Yan, Lin et Tian ont d'office le leur
            (🔥 vague de flammes, 🍃 volée de feuilles, ❄ arrivée enneigée). Touchez 💥 sous une carte pour lui donner à la place
            l'aura de puissance : {ARRIVAL_MAX} cartes au plus, <b>{auraCount} / {ARRIVAL_MAX}</b>.
          </p>
          {normal.length === 0 && <p className="muted">Aucune carte normale scannée.</p>}
          {normal.length > 0 && shown.length === 0 && <p className="muted small">Aucune carte ne correspond.</p>}
          <div className="grid">
            {shown.map((c) => (
              <div key={c.id}>
                <div className="thumb" onClick={() => setZoom(c.id)} title="Voir la carte en grand" style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null}>
                  {thumb(c)}
                  {qty[c.id] > 0 && <span className="badge">×{qty[c.id]}</span>}
                  {qty[c.id] > 0 && (fx[c.id] || autoArrival(c.factions)) && (
                    <span className={`fx-badge ${fx[c.id] ? "" : "auto"}`} title={arrivalOf(fx[c.id] || autoArrival(c.factions)).label}>
                      {arrivalOf(fx[c.id] || autoArrival(c.factions)).icon}
                    </span>
                  )}
                </div>
                <div className="qty">
                  <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) - 1)} disabled={!qty[c.id]}>−</button>
                  <b>{qty[c.id] || 0}</b>
                  <button className="btn sm icon" onClick={() => setN(c.id, (qty[c.id] || 0) + 1)} disabled={(qty[c.id] || 0) >= maxFor(c)}>+</button>
                  {qty[c.id] > 0 && (
                    <button
                      className={`btn sm icon fx-btn ${fx[c.id] ? "on" : ""}`}
                      onClick={() => toggleAura(c)}
                      aria-label={fx[c.id] ? "Retirer l'aura de puissance" : "Aura de puissance"}
                      title={fx[c.id] ? "Retirer l'aura de puissance" : "Donner l'aura de puissance (effet d'arrivée)"}
                    >
                      💥
                    </button>
                  )}
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
                  onClick={() => setZoom(c.id)}
                  title="Voir la carte en grand"
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
        </DeckLayout>
      )}
      {zc && (
        <CardZoom
          card={zc}
          onClose={() => setZoom(null)}
          info={zInfo}
          toggle={zc.kind === "jeton"}
          n={zc.kind === "jeton" ? (tokOn(zc) ? 1 : 0) : qty[zc.id] || 0}
          max={maxFor(zc)}
          onSet={(id, n) => (zc.kind === "jeton" ? toggleTok(zc) : setN(id, n))}
          extra={zc.kind !== "jeton" && qty[zc.id] > 0 && (
            <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
              <button className={`btn sm ${fx[zc.id] ? "primary" : "ghost"}`} onClick={() => toggleAura(zc)}>
                💥 {fx[zc.id] ? "Aura de puissance : oui" : "Donner l'aura de puissance"} ({auraCount}/{ARRIVAL_MAX})
              </button>
            </div>
          )}
        />
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
          Compte dans les 30 à 40 cartes du deck. Posé automatiquement dans la zone Commandant au début de la partie. Il exige 15 combattants de sa faction dans le deck.
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
