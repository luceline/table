import { useSalonsSummary, useIsAdmin } from "../lib/salons.js";
import { useDmUnread } from "../lib/dms.js";
import { useVoiceRooms } from "../lib/voicechan.js";
import { useAgenda, canStart, startFrom, whenText } from "../lib/agenda.js";
import OpenAlertToggle from "../components/OpenAlertToggle.jsx";
import PushToggle from "../components/PushToggle.jsx";
import { useOnline } from "../lib/presence.js";
import { fxSetting, setFxSetting, playArrival, iceFall, ARRIVALS } from "../lib/fx.js";
import { LegalFooter } from "./Legal.jsx";
import NewsPopup from "../components/NewsPopup.jsx";
import ProfileSheet from "../components/Profile.jsx";
import { loadDaily } from "./Daily.jsx";
import Salons from "./Salons.jsx";
import Trades, { useTrades } from "../components/Trades.jsx";
import { CitySettings, PlayersMap, usePlayersMap, km, cityLabel } from "../components/PlayerMap.jsx";
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
import { TCG_LIST, currentTcg, setCurrentTcg, tcgFilter, tcgOf, tcgName, tcgShort, activateTcg, normTcg } from "../lib/tcg.js";

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
  const [filmed, setFilmedRaw] = useState(false);
  const setFilmed = (v) => setFilmedRaw(v && currentTcg() !== "sorcery"); // Sorcery : royaume partagé, jamais filmé
  const [soloForm, setSoloForm] = useState(null); // partie solo : { a, b } decks choisis pour les deux côtés // je joue avec mes cartes réelles, filmées par un téléphone
  const [lobby, setLobby] = useState("open"); // onglet : tables ouvertes ou parties en direct
  // Onglets de l'accueil (mémorisés sur l'appareil) ; grand écran : salons dans une colonne à droite
  const [tab, setTabState] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("echanges")) return "echanges";
    try { return localStorage.getItem("home_tab") || "jouer"; } catch (_) { return "jouer"; }
  });
  const setTab = (t) => {
    setTabState(t);
    try { localStorage.setItem("home_tab", t); } catch (_) {}
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("echanges")) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [wideHome, setWideHome] = useState(() => window.matchMedia("(min-width: 1180px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1180px)");
    const f = () => setWideHome(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const [profOpen, setProfOpen] = useState(false);
  const [notifKey, setNotifKey] = useState(0); // recharge le réglage « partenaire recherché » quand les notifications changent
  const [mapOpen, setMapOpen] = useState(false);
  const { players: mapAll, reload: reloadMap } = usePlayersMap();
  const onlineNow = useOnline(tcg); // joueurs en ligne (point vert sur la carte)
  // seulement les joueurs du jeu choisi
  const mapPlayers = mapAll && mapAll.filter((p) => (p.games || []).includes(normTcg(tcg)));
  // Arrivée depuis une notification « table ouverte » (?tables=jeu) : bon jeu, onglet Tables ouvertes à l'écran
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("tables")) return;
    const t = normTcg(q.get("tables"));
    window.history.replaceState(null, "", window.location.pathname);
    if (t !== tcg) pickTcg(t);
    setLobby("open");
    setTimeout(() => document.querySelector(".open-tables")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  }, []);
  // Arrivée depuis une notification de message privé (?dm=joueur)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("dm")) return;
    const uid = q.get("dm") || "";
    window.history.replaceState(null, "", window.location.pathname);
    go("salons", { dm: uid });
  }, []);
  // Arrivée depuis une notification de proposition de partie (?agenda=jeu)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("agenda")) return;
    const t = normTcg(q.get("agenda"));
    window.history.replaceState(null, "", window.location.pathname);
    if (t !== tcg) pickTcg(t);
    go("agenda");
  }, []);
  const agenda = useAgenda(user?.id, tcg); // propositions de partie et parties prévues
  const [newsOpen, setNewsOpen] = useState(false); // relire les nouveautés
  const isAdmin = useIsAdmin(user?.id);
  const trades = useTrades(tcg);
  const wl = useResults(user?.id, tcg, decks.map((d) => d.id)); // victoires / défaites par deck (privé)
  const live = useLive(tcg); // parties en cours des autres joueurs, à regarder en spectateur
  // thème enregistré sur le compte (choisi sur un autre appareil) : appliqué ici
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    if (user?.theme && user.theme !== storedTheme()) {
      applyTheme(user.theme, true);
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
    if (id === "sorcery") setFilmedRaw(false);
    setErr("");
    load(id);
    loadOpen(id);
  }

  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  // Safir : le commandant compte dans les cartes du deck (le héros de Flesh and Blood, non)
  const deckSize = (d) => (d.entries || []).reduce((n, e) => n + (e.tok || cardsById[e.card]?.kind === "jeton" || cardsById[e.card]?.kind === "arene" || cardsById[e.card]?.kind === "heros" ? 0 : e.qty || 0), 0) + (tcg === "safir" && d.commander && cardsById[d.commander] ? 1 : 0);
  // Sorcery : grimoire et atlas comptés à part (l'avatar n'est dans aucun des deux)
  const deckLabel = (d) => {
    if (tcg !== "sorcery") return `${deckSize(d)} cartes`;
    let sp = 0, at = 0;
    for (const e of d.entries || []) {
      const k = cardsById[e.card]?.kind;
      if (e.tok || !k || k === "jeton" || k === "avatar") continue;
      if (k === "site") at += e.qty || 0;
      else sp += e.qty || 0;
    }
    return `grimoire ${sp} · atlas ${at}`;
  };

  const myName = user.name || user.email.split("@")[0];

  function myState(asFilmed, id = deckId) {
    if (asFilmed ?? filmed) {
      // cartes réelles : aucun deck dans l'appli, l'adversaire voit le tapis filmé
      const st = buildState({ name: myName, deck: { id: "", name: "Cartes réelles", entries: [] }, cardsById: {} });
      st.filmed = true;
      st.log = [{ t: Date.now(), m: "joue avec ses cartes réelles, filmées en direct" }];
      return st;
    }
    const deck = decks.find((d) => d.id === id);
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
    const snap = (c) => ({
      id: c.id, image: c.image, name: c.name, orient: c.orient, kind: c.kind, val: c.val,
      ...(c.atk ? { atk: c.atk } : null), ...(c.def ? { def: c.def } : null),
      ...(Array.isArray(c.factions) && c.factions.length ? { factions: c.factions } : null),
      ...(c.pitch ? { pitch: c.pitch } : null),
    });
    return {
      name: deck.name,
      by: myName,
      entries: ents.map((e) => ({ card: e.card, qty: e.qty, ...(e.tok ? { tok: true } : null), ...(e.fx && !e.tok ? { fx: e.fx } : null) })),
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

  // ask : table ouverte, on demande toujours avec quel deck s'asseoir (le choix du haut de page n'est pas visible depuis la liste)
  async function joinRecord(g, ask) {
      if (g.p1 === user.id || g.p2 === user.id) return go("table", { gameId: g.id });
      if (tcgOf(g) !== tcg) {
        // partie d'un autre jeu : on bascule sur ce jeu pour choisir un de ses decks
        pickTcg(tcgOf(g));
        throw new Error(`Cette partie est une partie de ${tcgName(tcgOf(g))}. Le jeu a été sélectionné : choisissez un deck puis touchez à nouveau « Rejoindre ».`);
      }
      if (g.p2) throw new Error("Cette partie a déjà deux joueurs.");
      if (ask && (decks.length || g.loan?.cards?.length || tcg !== "sorcery")) {
        // deck proposé d'office : celui choisi plus haut s'il est conforme, sinon le premier deck conforme
        const cur = decks.find((d) => d.id === deckId);
        if (!cur || !checkDeckFor(cur, cardsById).ok) {
          const ok = decks.find((d) => checkDeckFor(d, cardsById).ok);
          if (ok) setDeckId(ok.id);
        }
        return setJoinChoice(g);
      }
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
      await joinRecord(fresh, true);
    } catch (e) {
      setErr(errMsg(e));
      loadOpen();
    } finally {
      setBusy(false);
    }
  }

  async function sit(g, useLoan, asFilmed, id) {
    const state = useLoan ? loanState(g.loan) : myState(asFilmed, id || deckId);
    await pb.collection("games").update(g.id, { p2: user.id, n2: state.name, status: "playing" });
    await pb.collection("seats").create({ game: g.id, player: user.id, state });
    go("table", { gameId: g.id });
  }

  async function chooseJoin(how, id) {
    const g = joinChoice;
    setJoinChoice(null);
    setErr("");
    setBusy(true);
    try {
      if (how === "filmed") setFilmed(true);
      await sit(g, how === "loan", how === "filmed", id);
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

  const TABS = [
    ["jouer", "🎲 Jouer"],
    ["cartes", "🃏 Mes cartes"],
    ["echanges", "🤝 Échanges", trades.matches.length],
    ["perso", "🎨 Personnalisation"],
  ];
  return (
    <div className={`home ${wideHome ? "home-wide" : ""}`}>
    <div className="page home-main">
      <div className="topbar">
        <div className="brand grow">Table de jeu</div>
        <span className="muted small">{user.name || user.email}</span>
        <button className="btn sm ghost" onClick={() => pb.authStore.clear()}>Déconnexion</button>
      </div>

      {TCG_LIST.length > 1 && (
        <div className="tcg-pick" role="tablist" aria-label="Jeu">
          {TCG_LIST.map((g) => (
            <button key={g.id} role="tab" aria-selected={tcg === g.id} className={tcg === g.id ? "on" : ""} onClick={() => pickTcg(g.id)}>
              {g.short ? <><span className="tp-long">{g.name}</span><span className="tp-short">{g.short}</span></> : g.name}
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

      <div className="home-tabs" role="tablist" aria-label="Accueil">
        {TABS.map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}{n ? <span className="lobby-n live">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === "jouer" && (<>
      {/* ouvert d'office seulement pour un nouveau joueur de Safir (aucune carte) ; fermé sinon */}
      {tcg !== "sorcery" && <TutoVideo key={`${tcg}-${cards.length ? "o" : "n"}`} tcg={tcg} open={tcg === "safir" && !cards.length} />}

      <DailyCard tcg={tcg} userId={user.id} go={go} />
      {!wideHome && <SalonsCard tcg={tcg} userId={user.id} go={go} />}
      <AgendaCard agenda={agenda} go={go} />
      <MapCard players={mapPlayers} tcg={tcg} onlineIds={onlineNow.ids} onOpen={() => setMapOpen(true)} onSetCity={() => setTab("perso")} />

      <div className="card-box">
        <h2>Jouer</h2>
        {tcg === "sorcery" ? (
          <p className="muted small" style={{ marginTop: 0 }}>Sorcery se joue sur un royaume partagé par les deux joueurs : uniquement avec un deck de l'appli (pas de cartes filmées).</p>
        ) : (
        <label className="init-toggle filmed-toggle">
          <input type="checkbox" checked={filmed} onChange={(e) => setFilmed(e.target.checked)} />
          <span>
            <b>🎥 Je joue avec mes cartes réelles</b>
            <span className="muted small"> : un téléphone filme mon tapis et mon adversaire le voit en direct. Il me faut un deuxième écran (ordinateur, tablette) pour voir son tapis.</span>
          </span>
        </label>
        )}
        {filmed ? null : decks.length === 0 ? (
          <p className="muted small">
            {tcg === "sorcery"
              ? "Pas encore de deck ? Scannez vos cartes (avatar, sites, sorts) puis créez un deck, ou rejoignez une partie dont le créateur vous prête un deck : entrez son code ci-dessous."
              : "Pas encore de deck ? Cochez « Je joue avec mes cartes réelles » pour jouer avec vos cartes filmées, ou rejoignez une partie dont le créateur vous prête un deck : entrez son code ci-dessous. Pour jouer avec des cartes numériques, scannez vos cartes puis créez un deck."}
          </p>
        ) : (
          <>
            <div className="field">
              <label>Mon deck pour cette partie</label>
              <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckLabel(d)}{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prêter un deck à l'adversaire (s'il n'a pas de cartes)</label>
              <select className="input" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">Aucun prêt</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({deckLabel(d)}{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
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
        {!openForm && (
          <div className="row partner-row">
            <button className="btn primary" onClick={() => createGame({ open: true })} disabled={busy || (!decks.length && !filmed) || openTables.some((g) => g.p1 === user.id)}>
              🔔 Je cherche un partenaire
            </button>
            <button className="btn sm ghost" onClick={() => setOpenForm({ later: false, when: localInput(new Date(Date.now() + 3600000)), note: "" })} disabled={!decks.length && !filmed}>
              Avec un message ou une heure…
            </button>
          </div>
        )}
        <p className="muted small">
          Ouvre une table visible par tous les joueurs de {tcgName(tcg)} : le premier disponible s'assoit, sans échanger de code.
          Les joueurs qui ont un deck de {tcgName(tcg)} et les notifications activées sont prévenus sur leur téléphone ou leur ordinateur.
        </p>
        <OpenAlertToggle tcg={tcg} hasDeck={decks.length > 0} />
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

      </>)}

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
                    <option key={d.id} value={d.id}>{d.name} ({deckLabel(d)}{checkDeckFor(d, cardsById).ok ? "" : ", non conforme"})</option>
                  ))}
                </select>
              </div>
            ))}
            <button className="btn primary" onClick={createSolo} disabled={busy}>Lancer la partie solo</button>
          </>
        )}
      </Sheet>
      <Sheet open={!!joinChoice} onClose={() => setJoinChoice(null)} title={joinChoice?.open && joinChoice?.n1 ? `S'asseoir à la table de ${joinChoice.n1}` : "Avec quoi jouer ?"}>
        {joinChoice && decks.length > 0 && (() => {
          const d = decks.find((x) => x.id === deckId) || decks[0];
          const chk = d ? checkDeckFor(d, cardsById) : null;
          return (
            <div className="join-deck">
              <div className="field">
                <label>Mon deck pour cette partie</label>
                <select className="input" value={d?.id || ""} onChange={(e) => setDeckId(e.target.value)}>
                  {decks.map((x) => (
                    <option key={x.id} value={x.id}>{x.name} ({deckLabel(x)}{checkDeckFor(x, cardsById).ok ? "" : ", non conforme"})</option>
                  ))}
                </select>
              </div>
              {chk && !chk.ok && <p className="err small" style={{ margin: "0 0 8px" }}>Deck non conforme : {chk.problems.join(" ")}</p>}
              <button className="btn primary" disabled={!chk?.ok} onClick={() => chooseJoin("deck", d?.id)}>
                Jouer avec « {d?.name} »
              </button>
            </div>
          );
        })()}
        {joinChoice && (
          <div className="actions">
            {joinChoice.loan?.cards?.length > 0 && (
              <button className={`btn ${decks.length ? "" : "primary"}`} onClick={() => chooseJoin("loan")}>
                Deck prêté par {joinChoice.loan.by} : « {joinChoice.loan.name} »
              </button>
            )}
            {tcg !== "sorcery" && (
              <button className={`btn ${!joinChoice.loan?.cards?.length && !decks.length ? "primary" : ""}`} onClick={() => chooseJoin("filmed")}>
                🎥 Mes cartes réelles, filmées par mon téléphone
              </button>
            )}
          </div>
        )}
        {joinChoice && !decks.length && tcg !== "sorcery" && (
          <p className="muted small">
            Vous n'avez pas encore de deck dans l'appli. Avec vos cartes réelles, un téléphone filme votre tapis et votre adversaire le voit en direct ;
            il vous faut un deuxième écran pour voir son tapis.
          </p>
        )}
      </Sheet>

      {tab === "cartes" && (<>
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
                {deckLabel(d)}{d.commander && cardsById[d.commander] ? ` · ${cardsById[d.commander].name}` : ""}
                {checkDeckFor(d, cardsById).ok ? (d.initiation && tcg !== "safir" ? " · initiation" : "") : " · non conforme"}
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

      </>)}

      {tab === "echanges" && <Trades tcg={tcg} go={go} admin={isAdmin} data={trades} />}

      {tab === "perso" && (<>
      <h3 className="perso-sec">Pour tous les jeux</h3>
      <div className="card-box">
        <div className="row" style={{ alignItems: "center" }}>
          <h2 className="grow" style={{ margin: 0 }}>🏅 Mon profil</h2>
          <button className="btn sm" onClick={() => setProfOpen(true)}>Voir mon profil et mes badges</button>
        </div>
        <p className="muted small" style={{ margin: "6px 0 0" }}>Titre, badges, série de la carte du jour, et réglage « Apparaître hors ligne ».</p>
      </div>
      <NotifSettings onChange={() => setNotifKey((x) => x + 1)} />
      <CitySettings onOpenMap={() => setMapOpen(true)} onSaved={reloadMap} />
      <ThemeSettings key={themeKey} />
      <MatBgSettings />
      <CardBackSettings />
      <h3 className="perso-sec">Pour {tcgName(tcg)} uniquement</h3>
      <div className="card-box">
        <h2 style={{ margin: 0 }}>🔔 Partenaire recherché</h2>
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Être prévenu quand un joueur de {tcgName(tcg)} clique sur « Je cherche un partenaire ».
        </p>
        <OpenAlertToggle key={tcg + notifKey} tcg={tcg} hasDeck={decks.length > 0} />
      </div>
      {tcg === "safir" && <FxSettings />}
      </>)}
      <ProfileSheet uid={profOpen ? user.id : null} onClose={() => setProfOpen(false)} />
      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} title={`🗺 Joueurs de ${tcgShort(tcg)}`}>
        {mapOpen && <PlayersMap go={(...a) => { setMapOpen(false); go(...a); }} players={mapPlayers} onlineIds={onlineNow.ids} />}
      </Sheet>
      <p className="news-link">
        <button className="btn sm ghost" onClick={() => setNewsOpen(true)}>🎉 Dernières nouveautés</button>
        {isAdmin && <button className="btn sm ghost" onClick={() => go("moderation")}>⚑ Signalements</button>}
      </p>
      <LegalFooter />
      <NewsPopup user={user} tcg={tcg} forceOpen={newsOpen} onClose={() => setNewsOpen(false)} />
    </div>
    {wideHome && (
      <aside className="home-side">
        <Salons key={tcg} go={go} embedded />
      </aside>
    )}
    </div>
  );
}

// Carte des joueurs : combien ont indiqué leur ville, et le plus proche de moi
function MapCard({ players, tcg, onlineIds, onOpen, onSetCity }) {
  const u = me();
  if (!players) return null;
  const others = players.filter((p) => p.id !== u.id);
  const live = others.filter((p) => onlineIds?.has(p.id)).length;
  const mine = u.city ? { lat: u.city_lat, lon: u.city_lon } : null;
  const nearest = mine && others.length ? others.map((p) => ({ ...p, d: km(mine, p) })).sort((a, b) => a.d - b.d)[0] : null;
  return (
    <div className="card-box map-card">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="grow" style={{ margin: 0 }}>🗺 Joueurs de {tcgShort(tcg)} près de chez vous</h2>
        <button className="btn sm primary" onClick={onOpen}>Voir la carte</button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        {others.length ? `${others.length} joueur${others.length > 1 ? "s ont indiqué leur" : " a indiqué sa"} ville` : "Aucun joueur n'a encore indiqué sa ville"}
        {live ? <> · <i className="dot-live" />{live} en ligne</> : null}
        {nearest ? <> · le plus proche : <b>{nearest.name}</b>, {cityLabel(nearest.city, nearest.tag)}, à {nearest.d} km{onlineIds?.has(nearest.id) ? " (en ligne)" : ""}</> : null}
        {!mine && <> · <button className="linkish" onClick={onSetCity}>indiquer ma ville</button> pour trouver des partenaires en vrai</>}
      </p>
    </div>
  );
}

// Carte du jour (mini-jeu quotidien) et accès à son profil (titre, badges)
function DailyCard({ tcg, userId, go }) {
  const [d, setD] = useState(null);
  const [prof, setProf] = useState(false);
  useEffect(() => {
    let alive = true;
    loadDaily(normTcg(tcg)).then((r) => alive && setD(r)).catch(() => {});
    return () => { alive = false; };
  }, [tcg]);
  if (!d || d.empty) return null;
  const n = d.tries?.length || 0;
  return (
    <div className="card-box daily-card">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="grow" style={{ margin: 0 }}>
          🃏 Carte du jour <span className="muted small">n°{d.num}</span>
          {!d.done && <span className="lobby-n live" style={{ marginLeft: 8, verticalAlign: "middle" }}>!</span>}
        </h2>
        <button className="btn sm primary" onClick={() => go("daily")}>{d.done ? "Voir" : n ? "Continuer" : "Jouer"}</button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        {d.done ? (d.found ? `Trouvée en ${n} essai${n > 1 ? "s" : ""} ✓` : "Pas trouvée aujourd'hui") : n ? `${n} essai${n > 1 ? "s" : ""} sur ${d.max}` : "Devinez la carte à partir d'un morceau de son illustration."}
        {" "}· 🔥 série {d.streak.current} jour{d.streak.current > 1 ? "s" : ""}
        {" "}· <button className="linkish" onClick={() => setProf(true)}>🏅 Mon profil et mes badges</button>
      </p>
      <ProfileSheet uid={prof ? userId : null} onClose={() => setProf(false)} />
    </div>
  );
}

// Accès aux salons de discussion du jeu, avec les messages non lus
function SalonsCard({ tcg, userId, go }) {
  const { channels, unread } = useSalonsSummary(tcg, userId);
  const dmUnread = useDmUnread(userId);
  const { rooms: vrooms, byRoom } = useVoiceRooms(tcg);
  const total = channels.reduce((n, c) => n + (unread[c.id] || 0), 0);
  if (!channels.length) return null;
  return (
    <div className="card-box salons-card">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 className="grow" style={{ margin: 0 }}>💬 Salons{total > 0 && <span className="lobby-n live" style={{ marginLeft: 8, verticalAlign: "middle" }}>{total > 99 ? "99+" : total}</span>}</h2>
        <button className="btn sm primary" onClick={() => go("salons", {})}>Ouvrir</button>
      </div>
      <div className="salons-chips">
        {dmUnread > 0 && (
          <button className="salon-chip dm-chip" onClick={() => go("salons", { dm: "" })}>
            ✉ Messages privés <span className="salon-n">{dmUnread > 99 ? "99+" : dmUnread}</span>
          </button>
        )}
        {vrooms.filter((r) => byRoom[r.id]?.length).map((r) => (
          <button key={r.id} className="salon-chip vroom in" onClick={() => go("salons", { voice: r.id })} title={byRoom[r.id].map((h) => h.name).join(", ")}>
            🔊 {r.name} <span className="vroom-n">{byRoom[r.id].length}</span>
          </button>
        ))}
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

// Personnalisation : notifications de cet appareil (messages privés, groupes, table rejointe, partenaire recherché, échanges)
function NotifSettings({ onChange }) {
  return (
    <div className="card-box">
      <h2 style={{ margin: 0 }}>🔔 Notifications</h2>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        Sur cet appareil, même appli fermée : messages privés et de groupe, joueur qui rejoint votre table, carte d'échange qui vous intéresse,
        et joueur qui cherche un partenaire (réglable pour chaque jeu, plus bas). Sur iPhone, l'appli doit être ajoutée à l'écran d'accueil.
      </p>
      <PushToggle onText="Notifications activées sur cet appareil." offText="Notifications désactivées sur cet appareil." onChange={onChange} />
    </div>
  );
}

// Personnalisation : effets spéciaux de Safir (effets d'arrivée choisis dans les decks, Gel), réglage de cet appareil
function FxSettings() {
  const [v, setV] = useState(fxSetting);
  const demo = (kind) => playArrival(kind, { cx: window.innerWidth / 2, cy: window.innerHeight / 2, w: 90, h: 125, atk: kind === "aura" ? 11 : null, demo: true });
  function pick(x) {
    setFxSetting(x);
    setV(x);
  }
  return (
    <div className="card-box">
      <h2 style={{ margin: 0 }}>✨ Effets spéciaux</h2>
      <p className="muted small" style={{ margin: "6px 0 8px" }}>
        Effets d'arrivée sur le terrain (d'office pour les cartes Yan, Lin et Tian ; aura de puissance pour 2 cartes au choix, bouton 💥 dans l'éditeur de deck)
        et stalactites de glace quand un territoire est gelé. Réglage de cet appareil, modifiable aussi en partie (menu ☰).
      </p>
      <div className="hand-tabs">
        <button className={v === "full" ? "on" : ""} onClick={() => pick("full")}>Activés</button>
        <button className={v === "off" ? "on" : ""} onClick={() => pick("off")}>Coupés</button>
      </div>
      {v === "full" && (
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {ARRIVALS.map((a) => (
            <button key={a.id} className="btn sm ghost" onClick={() => demo(a.id)}>{a.icon} {a.label}</button>
          ))}
          <button className="btn sm ghost" onClick={() => iceFall({ left: window.innerWidth * 0.3, top: window.innerHeight * 0.45, width: window.innerWidth * 0.4, height: window.innerHeight * 0.4 })}>🧊 Gel</button>
        </div>
      )}
    </div>
  );
}
