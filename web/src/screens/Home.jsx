import { useSalonsSummary } from "../lib/salons.js";
import { useAgenda, canStart, startFrom, whenText } from "../lib/agenda.js";
import OpenAlertToggle from "../components/OpenAlertToggle.jsx";
import PushToggle from "../components/PushToggle.jsx";
import { LegalFooter } from "./Legal.jsx";
import NewsPopup from "../components/NewsPopup.jsx";
import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg, safeUn } from "../pb.js";
import { buildState, genCode } from "../lib/game.js";
import { checkDeck, checkDeckFor } from "../lib/deckrules.js";
import { Sheet } from "../components/ui.jsx";
import TutoVideo from "../components/TutoVideo.jsx";
import MatBgSettings, { CardBackSettings, ThemeSettings } from "../components/MatBgSettings.jsx";
import { applyTheme, storedTheme } from "../lib/theme.js";
import { useLive, ago } from "../lib/live.js";
import { useResults, ratioText } from "../lib/results.js";
import { useStats, plural } from "../lib/stats.js";
import { TCG_LIST, currentTcg, setCurrentTcg, tcgFilter, tcgOf, tcgName, activateTcg } from "../lib/tcg.js";

// Dates PocketBase (« AAAA-MM-JJ HH:MM:SS.sssZ ») et affichage en heure locale
const pbDate = (v) => String(v || "").replace(" ", "T");
function fmtWhen(v) {
  const d = new Date(pbDate(v));
  if (isNaN(d)) return "";
  const today = new Date();
  const tom = new Date(today.getTime() + 86400000);
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `aujourd'hui à ${hm}`;
  if (d.toDateString() === tom.toDateString()) return `demain à ${hm}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${hm}`;
}
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

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
  const [info, setInfo] = useState("");
  // Tables ouvertes : parties en attente visibles de tous les joueurs du jeu choisi
  const [openTables, setOpenTables] = useState([]);
  const [openForm, setOpenForm] = useState(null); // { later: bool, when: "AAAA-MM-JJTHH:MM", note }
  const [busy, setBusy] = useState(false);
  const [tcg, setTcg] = useState(() => activateTcg(currentTcg()));
  const stats = useStats(); // joueurs inscrits (affichés sous le choix du jeu)
  const [filmed, setFilmed] = useState(false);
  const [soloForm, setSoloForm] = useState(null); // partie solo : { a, b } decks choisis pour les deux côtés // je joue avec mes cartes réelles, filmées par un téléphone
  const [lobby, setLobby] = useState("open"); // onglet : tables ouvertes ou parties en direct
  // Arrivée depuis une notification « table ouverte » (?tables=jeu) : bon jeu, onglet Tables ouvertes à l'écran
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("tables")) return;
    const t = q.get("tables") === "fab" ? "fab" : "safir";
    window.history.replaceState(null, "", window.location.pathname);
    if (t !== tcg) pickTcg(t);
    setLobby("open");
    setTimeout(() => document.querySelector(".open-tables")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  }, []);
  // Arrivée depuis une notification de proposition de partie (?agenda=jeu)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("agenda")) return;
    const t = q.get("agenda") === "fab" ? "fab" : "safir";
    window.history.replaceState(null, "", window.location.pathname);
    if (t !== tcg) pickTcg(t);
    go("agenda");
  }, []);
  const agenda = useAgenda(user?.id, tcg); // propositions de partie et parties prévues
  const [newsOpen, setNewsOpen] = useState(false); // relire les nouveautés
  const wl = useResults(user?.id, tcg, decks.map((d) => d.id)); // victoires / défaites par deck (privé)
  const live = useLive(tcg); // parties en cours des autres joueurs, à regarder en spectateur
  // thème enregistré sur le compte (choisi sur un autre appareil) : appliqué ici
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    if (user?.theme && user.theme !== storedTheme()) {
      applyTheme(user.theme);
      setThemeKey((k) => k + 1);
    }
  }, []); // jeu sélectionné : collection, decks et parties de ce jeu seulement

  async function load(id = tcg) {
    try {
      const f = tcgFilter(id);
      const [c, d, g] = await Promise.all([
        pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${f}`, sort: "-created" }),
        pb.collection("decks").getFullList({ filter: `owner="${user.id}" && ${f}`, sort: "-updated" }),
        pb.collection("games").getFullList({
          filter: `(p1="${user.id}" || p2="${user.id}") && status!="finished" && ${f}`,
          sort: "-updated",
          fields: "id,code,p1,p2,n1,n2,status,updated,solo",
        }),
      ]);
      setCards(c);
      setDecks(d);
      setGames(g);
      setDeckId((cur) => (d.some((x) => x.id === cur) ? cur : d[0]?.id || ""));
      setLoanId((cur) => (d.some((x) => x.id === cur) ? cur : ""));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  useEffect(() => { load(); }, []);

  async function loadOpen(id = tcg) {
    try {
      const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString().replace("T", " ");
      const list = await pb.collection("games").getFullList({
        filter: `open = true && p2 = "" && status = "waiting" && ${tcgFilter(id)} && (created >= "${since}" || opens_at >= "${since}")`,
        sort: "opens_at,created",
        fields: "id,code,p1,n1,opens_at,note,created,loan",
      });
      setOpenTables(list);
    } catch (_) { /* champ absent avant mise à jour du serveur */ }
  }
  const tcgRef = useRef(tcg);
  tcgRef.current = tcg;
  useEffect(() => {
    loadOpen();
    let unsub = null, alive = true;
    pb.collection("games").subscribe("*", (e) => { if (e.record.open || e.action === "delete") loadOpen(tcgRef.current); })
      .then((u) => (alive ? (unsub = u) : safeUn(u)))
      .catch(() => {});
    const t = setInterval(() => loadOpen(tcgRef.current), 60000); // les tables qui ouvrent passent en « ouverte »
    return () => { alive = false; safeUn(unsub); clearInterval(t); };
  }, []);

  function openTable() {
    const f = openForm || {};
    let opensAt = "";
    if (f.later) {
      const d = new Date(f.when || "");
      if (!f.when || isNaN(d)) return setErr("Choisissez la date et l'heure d'ouverture.");
      if (d < new Date(Date.now() - 60000)) return setErr("Cette heure est déjà passée.");
      opensAt = d.toISOString().replace("T", " ");
    }
    createGame({ open: true, opensAt, note: (f.note || "").trim().slice(0, 80), stay: !!opensAt });
  }

  function pickTcg(id) {
    if (id === tcg) return;
    setCurrentTcg(id);
    activateTcg(id);
    setTcg(id);
    setErr("");
    load(id);
    loadOpen(id);
  }

  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  // Safir : le commandant compte dans les cartes du deck (le héros de Flesh and Blood, non)
  const deckSize = (d) => (d.entries || []).reduce((n, e) => n + (e.tok || cardsById[e.card]?.kind === "jeton" || cardsById[e.card]?.kind === "arene" || cardsById[e.card]?.kind === "heros" ? 0 : e.qty || 0), 0) + (tcg !== "fab" && d.commander && cardsById[d.commander] ? 1 : 0);

  const myName = user.name || user.email.split("@")[0];

  function myState(asFilmed) {
    if (filmed || asFilmed) {
      // cartes réelles : aucun deck dans l'appli, l'adversaire voit le tapis filmé
      const st = buildState({ name: myName, deck: { id: "", name: "Cartes réelles", entries: [] }, cardsById: {} });
      st.filmed = true;
      st.log = [{ t: Date.now(), m: "joue avec ses cartes réelles, filmées en direct" }];
      return st;
    }
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) throw new Error("Choisissez un deck.");
    const chk = checkDeckFor(deck, cardsById);
    if (!chk.ok) throw new Error(`Deck « ${deck.name} » non conforme : ${chk.problems.join(" ")}`);
    return buildState({ name: myName, deck, cardsById });
  }

  // Partie solo : je joue mes deux decks l'un contre l'autre (decks non conformes acceptés, c'est pour tester)
  async function createSolo() {
    const da = decks.find((d) => d.id === soloForm.a), db = decks.find((d) => d.id === soloForm.b);
    if (!da || !db) return setErr("Choisissez les deux decks.");
    setErr("");
    setBusy(true);
    try {
      const stA = buildState({ name: da.name, deck: da, cardsById });
      const stB = buildState({ name: db.id === da.id ? `${db.name} (2)` : db.name, deck: db, cardsById });
      let rec = null;
      for (let i = 0; i < 4 && !rec; i++) {
        try {
          rec = await pb.collection("games").create({ code: genCode(), p1: user.id, n1: stA.name, p2: user.id, n2: stB.name, status: "playing", tcg, solo: true });
        } catch (e) {
          if (i === 3) throw e;
        }
      }
      await pb.collection("seats").create({ game: rec.id, player: user.id, state: stA, slot: "" });
      await pb.collection("seats").create({ game: rec.id, player: user.id, state: stB, slot: "b" });
      setSoloForm(null);
      go("table", { gameId: rec.id });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Instantané du deck prêté, stocké dans la partie
  function loanSnapshot(deck) {
    const ents = (deck.entries || []).filter((e) => cardsById[e.card] && e.qty > 0);
    const cmd = deck.commander && cardsById[deck.commander];
    const snap = (c) => ({ id: c.id, image: c.image, name: c.name, orient: c.orient, kind: c.kind, val: c.val, ...(c.pitch ? { pitch: c.pitch } : null) });
    return {
      name: deck.name,
      by: myName,
      entries: ents.map((e) => ({ card: e.card, qty: e.qty, ...(e.tok ? { tok: true } : null) })),
      commander: cmd ? cmd.id : "",
      cards: [...ents.map((e) => snap(cardsById[e.card])), ...(cmd ? [snap(cmd)] : [])],
      ...(deck.format ? { format: deck.format } : null),
      ...(deck.initiation ? { initiation: true } : null),
    };
  }

  function loanState(loan) {
    return buildState({
      name: myName,
      deck: { id: "pret", name: `${loan.name} (prêté par ${loan.by})`, entries: loan.entries, commander: loan.commander || "", ...(loan.format ? { format: loan.format } : null), ...(loan.initiation ? { initiation: true } : null) },
      cardsById: Object.fromEntries(loan.cards.map((c) => [c.id, c])),
    });
  }

  async function createGame(opts = {}) {
    setErr("");
    setBusy(true);
    try {
      const state = myState();
      const lent = filmed ? null : decks.find((d) => d.id === loanId);
      if (lent) {
        const chk = checkDeckFor(lent, cardsById);
        if (!chk.ok) throw new Error(`Deck à prêter « ${lent.name} » non conforme : ${chk.problems.join(" ")}`);
      }
      const loan = lent ? loanSnapshot(lent) : null;
      let rec = null;
      for (let i = 0; i < 4 && !rec; i++) {
        try {
          rec = await pb.collection("games").create({
            code: genCode(), p1: user.id, n1: state.name, status: "waiting", loan, tcg,
            ...(opts.open ? { open: true, opens_at: opts.opensAt || "", note: opts.note || "" } : null),
          });
        } catch (e) {
          if (i === 3) throw e;
        }
      }
      await pb.collection("seats").create({ game: rec.id, player: user.id, state });
      if (opts.invite) await pb.collection("invites").update(opts.invite.id, { code: rec.code, game: rec.id }).catch(() => {});
      if (opts.stay) {
        // table ouverte plus tard : on reste sur l'accueil
        setOpenForm(null);
        setInfo(`Votre table ouvrira ${fmtWhen(opts.opensAt)}. Si quelqu'un s'assoit, la partie apparaîtra dans « Parties en cours ».`);
        load();
        return;
      }
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
      await joinRecord(g);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinRecord(g) {
      if (g.p1 === user.id || g.p2 === user.id) return go("table", { gameId: g.id });
      if (tcgOf(g) !== tcg) {
        // partie d'un autre jeu : on bascule sur ce jeu pour choisir un de ses decks
        pickTcg(tcgOf(g));
        throw new Error(`Cette partie est une partie de ${tcgName(tcgOf(g))}. Le jeu a été sélectionné : choisissez un deck puis touchez à nouveau « Rejoindre ».`);
      }
      if (g.p2) throw new Error("Cette partie a déjà deux joueurs.");
      if (filmed) return await sit(g, false);
      if (g.loan?.cards?.length) {
        // Deck prêté disponible : direct si je n'ai pas de deck, sinon je choisis
        if (!decks.length) return await sit(g, true);
        return setJoinChoice(g);
      }
      // Ni deck ni prêt : proposer de jouer avec mes cartes réelles, filmées
      if (!decks.length) return setJoinChoice(g);
      await sit(g, false);
  }

  // Partie prévue (agenda) : le premier arrivé ouvre la table, l'autre la rejoint
  async function startPlanned(inv) {
    setErr("");
    setInfo("");
    try {
      const fresh = await pb.collection("invites").getOne(inv.id, { requestKey: null });
      if (fresh.status !== "accepted") throw new Error("Cette partie a été annulée.");
      if (!fresh.code) return await createGame({ invite: fresh });
      setBusy(true);
      let g;
      try {
        g = await pb.collection("games").getFirstListItem(`code="${fresh.code}"`);
      } catch {
        // table supprimée entre-temps : on en ouvre une nouvelle
        setBusy(false);
        return await createGame({ invite: fresh });
      }
      await joinRecord(g);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // S'asseoir à une table ouverte
  async function sitOpen(g) {
    setErr("");
    setInfo("");
    if (g.opens_at && new Date(pbDate(g.opens_at)) > new Date()) return setErr(`Cette table ouvre ${fmtWhen(g.opens_at)}.`);
    setBusy(true);
    try {
      const fresh = await pb.collection("games").getOne(g.id).catch(() => null);
      if (!fresh || fresh.p2) throw new Error("Trop tard : quelqu'un s'est déjà assis à cette table.");
      await joinRecord(fresh);
    } catch (e) {
      setErr(errMsg(e));
      loadOpen();
    } finally {
      setBusy(false);
    }
  }

  async function sit(g, useLoan, asFilmed) {
    const state = useLoan ? loanState(g.loan) : myState(asFilmed);
    await pb.collection("games").update(g.id, { p2: user.id, n2: state.name, status: "playing" });
    await pb.collection("seats").create({ game: g.id, player: user.id, state });
    go("table", { gameId: g.id });
  }

  async function chooseJoin(how) {
    const g = joinChoice;
    setJoinChoice(null);
    setErr("");
    setBusy(true);
    try {
      if (how === "filmed") setFilmed(true);
      await sit(g, how === "loan", how === "filmed");
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
      const d = await pb.collection("decks").create({ owner: user.id, name: name.trim(), entries: [], tcg });
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

      {TCG_LIST.length > 1 && (
        <div className="tcg-pick" role="tablist" aria-label="Jeu">
          {TCG_LIST.map((g) => (
            <button key={g.id} role="tab" aria-selected={tcg === g.id} className={tcg === g.id ? "on" : ""} onClick={() => pickTcg(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {stats && (
        <p className="players-count">
          👥 {plural(stats.users, "joueur inscrit", "joueurs inscrits")}
          {stats.tcg?.[tcg] != null && <>, dont {stats.tcg[tcg]} avec des cartes {tcgName(tcg)}</>}
        </p>
      )}

      {err && <div className="err">{err}</div>}
      {info && <div className="info-msg">{info}</div>}

      {/* ouvert d'office seulement pour un nouveau joueur de Safir (aucune carte) ; fermé sinon */}
      <TutoVideo key={`${tcg}-${cards.length ? "o" : "n"}`} tcg={tcg} open={tcg === "safir" && !cards.length} />

      <SalonsCard tcg={tcg} userId={user.id} go={go} />
      <AgendaCard agenda={agenda} go={go} />

      <div className="card-box">
        <h2>Jouer</h2>
        <label className="init-toggle filmed-toggle">
          <input type="checkbox" checked={filmed} onChange={(e) => setFilmed(e.target.checked)} />
          <span>
            <b>🎥 Je joue avec mes cartes réelles</b>
            <span className="muted small"> : un téléphone filme mon tapis et mon adversaire le voit en direct. Il me faut un deuxième écran (ordinateur, tablette) pour voir son tapis.</span>
          </span>
        </label>
        {filmed ? null : decks.length === 0 ? (
          <p className="muted small">
            Pas encore de deck ? Cochez « Je joue avec mes cartes réelles » pour jouer avec vos cartes filmées, ou rejoignez une partie dont le créateur vous prête un deck : entrez son code ci-dessous. Pour jouer avec des cartes numériques, scannez vos cartes puis créez un deck.
          </p>
        ) : (
          <>
            <div className="field">
              <label>Mon deck pour cette partie</label>
              <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prêter un deck à l'adversaire (s'il n'a pas de cartes)</label>
              <select className="input" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">Aucun prêt</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn primary" onClick={createGame} disabled={busy || (!decks.length && !filmed)}>Créer une partie</button>
          <div className="row grow" style={{ minWidth: 230, flexWrap: "wrap" }}>
            <input
              className="input code"
              placeholder="CODE"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              style={{ textTransform: "uppercase" }}
            />
            <button className="btn" onClick={joinGame} disabled={busy}>Rejoindre</button>
            <button
              className="btn ghost"
              title="Regarder la partie en spectateur"
              disabled={code.length !== 6}
              onClick={() => { window.location.href = `${window.location.pathname}?voir=${code}`; }}
            >
              👁 Regarder
            </button>
          </div>
        </div>
        {!filmed && decks.length > 0 && (
          <button className="btn sm ghost solo-btn" onClick={() => setSoloForm({ a: decks[0].id, b: (decks[1] || decks[0]).id })} disabled={busy}>
            🧪 Partie solo : tester deux de mes decks
          </button>
        )}
        {agenda.planned.length > 0 && (
          <>
            <div className="spacer" />
            <div className="muted small" style={{ marginBottom: 6 }}>📅 Parties prévues</div>
            <div className="list">
              {agenda.planned.map((i) => {
                const other = i.from === user.id ? i.to_name : i.from_name;
                const ready = canStart(i);
                return (
                  <div className="list-item" key={i.id}>
                    <span className="grow small">Avec <b>{other}</b>, {whenText(i.at, i.end)}</span>
                    {ready ? (
                      <button className="btn sm primary" disabled={busy || (!decks.length && !filmed && !i.code)} onClick={() => startPlanned(i)}>
                        {i.code ? "Rejoindre" : "Ouvrir la table"}
                      </button>
                    ) : (
                      <span className="muted small" title="La table se lance 30 minutes avant l'heure prévue">dès {startFrom(i)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {games.length > 0 && (
          <>
            <div className="spacer" />
            <div className="muted small" style={{ marginBottom: 6 }}>Parties en cours</div>
            {games.some((g) => g.status === "waiting" && g.p1 === user.id) && <PushToggle />}
            <div className="list">
              {games.map((g) => {
                const opp = g.p1 === user.id ? g.n2 : g.n1;
                return (
                  <div className="list-item" key={g.id}>
                    <span className="code">{g.code}</span>
                    <span className="grow small">{g.solo ? `🧪 solo : ${g.n1} contre ${g.n2}` : opp ? `contre ${opp}` : "en attente d'un adversaire"}</span>
                    <button className="btn sm primary" onClick={() => go("table", { gameId: g.id })}>Reprendre</button>
                    <button className="btn sm ghost danger" onClick={() => removeGame(g)} aria-label="Supprimer">✕</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card-box open-tables">
        <div className="lobby-tabs">
          <button className={lobby === "open" ? "on" : ""} onClick={() => setLobby("open")}>
            Tables ouvertes{openTables.length ? <span className="lobby-n">{openTables.length}</span> : null}
          </button>
          <button className={lobby === "live" ? "on" : ""} onClick={() => setLobby("live")}>
            En direct{live?.length ? <span className="lobby-n live">{live.length}</span> : null}
          </button>
        </div>
        {lobby === "live" && (
          <>
            <p className="muted small">Les parties de {tcgName(tcg)} en cours chez les autres joueurs. Regardez-les en spectateur et commentez dans la tribune.</p>
            {live === null && <p className="muted small" style={{ marginBottom: 0 }}>Chargement…</p>}
            {live?.length === 0 && <p className="muted small" style={{ marginBottom: 0 }}>Aucune partie en cours pour le moment.</p>}
            <div className="list">
              {(live || []).map((g) => (
                <div className="list-item open-item" key={g.code}>
                  <div className="grow">
                    <div><b>{g.n1 || "Joueur"}</b> <span className="muted small">contre</span> <b>{g.n2 || "Joueur"}</b></div>
                    <div className="small">
                      <span className="open-now">● En jeu</span>
                      <span className="muted"> · dernière action {ago(g.last)}{g.watching ? ` · 👁 ${g.watching}` : ""}</span>
                    </div>
                  </div>
                  <button className="btn sm primary" onClick={() => { window.location.href = `${window.location.pathname}?voir=${g.code}`; }}>👁 Regarder</button>
                </div>
              ))}
            </div>
          </>
        )}
        {lobby === "open" && (
        <>
        <OpenAlertToggle tcg={tcg} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
          {!openForm && (
            <button className="btn sm" onClick={() => setOpenForm({ later: false, when: localInput(new Date(Date.now() + 3600000)), note: "" })} disabled={!decks.length && !filmed}>
              Ouvrir une table
            </button>
          )}
        </div>
        <p className="muted small">
          Une table visible par tous les joueurs de {tcgName(tcg)} : le premier disponible s'assoit, sans échanger de code.
          Vous pouvez aussi annoncer une heure : « je joue ce soir à 21 h ».
        </p>
        {openForm && (
          <div className="open-form">
            <div className="hand-tabs" style={{ marginBottom: 8 }}>
              <button className={!openForm.later ? "on" : ""} onClick={() => setOpenForm({ ...openForm, later: false })}>Maintenant</button>
              <button className={openForm.later ? "on" : ""} onClick={() => setOpenForm({ ...openForm, later: true })}>À une heure précise</button>
            </div>
            {openForm.later && (
              <div className="field">
                <label>Ouverture de la table</label>
                <input className="input" type="datetime-local" value={openForm.when} min={localInput(new Date())} onChange={(e) => setOpenForm({ ...openForm, when: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label>Message <span className="muted">(facultatif)</span></label>
              <input className="input" value={openForm.note} maxLength={80} placeholder={tcg === "fab" ? "Ex. Silver Age, débutants bienvenus" : "Ex. Partie détente, débutants bienvenus"} onChange={(e) => setOpenForm({ ...openForm, note: e.target.value })} />
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>
              {filmed ? "Avec vos cartes réelles, filmées (choisi dans « Jouer »)." : <>Avec votre deck « {decks.find((d) => d.id === deckId)?.name || "?"} »{decks.find((d) => d.id === loanId) ? ` et le prêt « ${decks.find((d) => d.id === loanId).name} »` : ""} (choisis dans « Jouer »).</>}
            </p>
            <div className="row">
              <button className="btn primary" onClick={openTable} disabled={busy}>{openForm.later ? "Programmer la table" : "Ouvrir et attendre"}</button>
              <button className="btn ghost" onClick={() => setOpenForm(null)}>Annuler</button>
            </div>
          </div>
        )}
        {openTables.length === 0 && !openForm && <p className="muted small" style={{ marginBottom: 0 }}>Aucune table ouverte pour le moment.</p>}
        <div className="list">
          {openTables.map((g) => {
            const later = g.opens_at && new Date(pbDate(g.opens_at)) > new Date();
            const minePlace = g.p1 === user.id;
            return (
              <div className="list-item open-item" key={g.id}>
                <div className="grow">
                  <div><b>{g.n1 || "Joueur"}</b>{g.loan?.cards?.length ? <span className="muted small"> · prête un deck</span> : null}</div>
                  {g.note && <div className="small">« {g.note} »</div>}
                  <div className={`small ${later ? "muted" : "open-now"}`}>{later ? `🕘 Ouvre ${fmtWhen(g.opens_at)}` : "● Ouverte, en attente d'un adversaire"}</div>
                </div>
                {minePlace ? (
                  <>
                    <span className="muted small">Votre table</span>
                    <button className="btn sm ghost danger" onClick={() => removeGame(g)} aria-label="Fermer ma table">✕</button>
                  </>
                ) : (
                  <button className="btn sm primary" onClick={() => sitOpen(g)} disabled={busy || later}>S'asseoir</button>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>

      <Sheet open={!!soloForm} onClose={() => setSoloForm(null)} title="Partie solo">
        {soloForm && (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              Vous jouez les deux côtés pour tester vos decks. En partie, le bouton ⇄ en haut passe d'un deck à l'autre.
              Les decks non conformes sont acceptés.
            </p>
            {[["a", "Côté 1"], ["b", "Côté 2"]].map(([k, label]) => (
              <div className="field" key={k}>
                <label>{label}</label>
                <select className="input" value={soloForm[k]} onChange={(e) => setSoloForm({ ...soloForm, [k]: e.target.value })}>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({deckSize(d)} cartes{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
                  ))}
                </select>
              </div>
            ))}
            <button className="btn primary" onClick={createSolo} disabled={busy}>Lancer la partie solo</button>
          </>
        )}
      </Sheet>
      <Sheet open={!!joinChoice} onClose={() => setJoinChoice(null)} title="Avec quoi jouer ?">
        {joinChoice && (
          <div className="actions">
            {joinChoice.loan?.cards?.length > 0 && (
              <button className="btn primary" onClick={() => chooseJoin("loan")}>
                Deck prêté par {joinChoice.loan.by} : « {joinChoice.loan.name} »
              </button>
            )}
            {decks.length > 0 && (
              <button className="btn" onClick={() => chooseJoin("deck")}>
                Mon deck : « {decks.find((d) => d.id === deckId)?.name} »
              </button>
            )}
            <button className={`btn ${!joinChoice.loan?.cards?.length && !decks.length ? "primary" : ""}`} onClick={() => chooseJoin("filmed")}>
              🎥 Mes cartes réelles, filmées par mon téléphone
            </button>
          </div>
        )}
        {joinChoice && !decks.length && (
          <p className="muted small">
            Vous n'avez pas encore de deck dans l'appli. Avec vos cartes réelles, un téléphone filme votre tapis et votre adversaire le voit en direct ;
            il vous faut un deuxième écran pour voir son tapis.
          </p>
        )}
      </Sheet>

      <div className="card-box">
        <h2>Ma collection</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          {cards.length} carte{cards.length > 1 ? "s" : ""} scannée{cards.length > 1 ? "s" : ""}. Vos scans restent privés et ne servent qu'à vos decks.
        </p>
        <div className="row" style={{ flexWrap: "wrap" }}>
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
              <span className="grow">
                {d.name}
                {wl.byDeck[d.id] && <span className="small deck-ratio" title="Victoires · défaites · taux de victoire (visible de vous seul)">{ratioText(wl.byDeck[d.id])}</span>}
              </span>
              <span className={`small ${checkDeckFor(d, cardsById).ok ? "muted" : "warn"}`}>
                {deckSize(d)} cartes{d.commander && cardsById[d.commander] ? ` · ${cardsById[d.commander].name}` : ""}
                {checkDeckFor(d, cardsById).ok ? (d.initiation && tcg === "fab" ? " · initiation" : "") : " · non conforme"}
              </span>
              <button className="btn sm" onClick={() => go("deck", { deckId: d.id })}>Modifier</button>
            </div>
          ))}
          {Object.entries(wl.byName).map(([n, v]) => (
            <div className="list-item" key={"n:" + n}>
              <span className="grow">
                <span className="muted">{n}</span>
                <span className="small deck-ratio">{ratioText(v)}</span>
              </span>
            </div>
          ))}
        </div>
        {(Object.keys(wl.byDeck).length > 0 || Object.keys(wl.byName).length > 0) && (
          <p className="muted small" style={{ margin: "8px 0 0" }}>Bilan V · D visible de vous seul, hors parties solo.</p>
        )}
      </div>

      <ThemeSettings key={themeKey} />
      <MatBgSettings />
      <CardBackSettings />
      <p className="news-link"><button className="btn sm ghost" onClick={() => setNewsOpen(true)}>🎉 Dernières nouveautés</button></p>
      <LegalFooter />
      <NewsPopup user={user} tcg={tcg} forceOpen={newsOpen} onClose={() => setNewsOpen(false)} />
    </div>
  );
}

// Accès aux salons de discussion du jeu, avec les messages non lus
function SalonsCard({ tcg, userId, go }) {
  const { channels, unread } = useSalonsSummary(tcg, userId);
  const total = channels.reduce((n, c) => n + (unread[c.id] || 0), 0);
  if (!channels.length) return null;
  return (
    <div className="card-box salons-card">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="grow" style={{ margin: 0 }}>💬 Salons{total > 0 && <span className="lobby-n live" style={{ marginLeft: 8, verticalAlign: "middle" }}>{total > 99 ? "99+" : total}</span>}</h2>
        <button className="btn sm primary" onClick={() => go("salons", {})}>Ouvrir</button>
      </div>
      <div className="salons-chips">
        {channels.map((c) => (
          <button key={c.id} className="salon-chip" onClick={() => go("salons", { channelId: c.id })}>
            <span className="hash">#</span>{c.name}
            {unread[c.id] > 0 && <span className="salon-n">{unread[c.id] > 99 ? "99+" : unread[c.id]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Accueil : agenda des disponibilités (propositions reçues, joueurs disponibles en même temps)
function AgendaCard({ agenda, go }) {
  const n = agenda.received.length;
  const p = agenda.players?.length || 0;
  return (
    <div className="card-box agenda-card">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="grow" style={{ margin: 0 }}>
          📅 Disponibilités{n > 0 && <span className="lobby-n live" style={{ marginLeft: 8, verticalAlign: "middle" }}>{n}</span>}
        </h2>
        <button className="btn sm primary" onClick={() => go("agenda")}>Ouvrir</button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        {n > 0
          ? `${n} proposition${n > 1 ? "s" : ""} de partie à voir.`
          : p > 0
            ? `${p} joueur${p > 1 ? "s" : ""} disponible${p > 1 ? "s" : ""} en même temps que vous : proposez-leur une partie.`
            : "Indiquez vos jours et heures de jeu : l'appli vous montre les joueurs disponibles en même temps."}
      </p>
    </div>
  );
}
