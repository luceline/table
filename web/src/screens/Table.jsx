import PushToggle from "../components/PushToggle.jsx";
import FxToggle from "../components/FxToggle.jsx";
import ZoomView, { ZoomPreview } from "../components/ZoomView.jsx";
import { ReactionPicker, ReactionLayer, useReactionQueue } from "../components/Reactions.jsx";
import { reactionOf, reactionText } from "../lib/reactions.js";
import { beHere } from "../lib/here.js";
import { SignalBar, SignalBadge, SignalButton } from "../components/Signals.jsx";
import { useLooks } from "../lib/looks.js";
import ReportSheet, { ReportButton } from "../components/ReportLook.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { pb, me, cardUrl, errMsg, fileUrl, safeUn } from "../pb.js";
import { startRecording, canRecord, extFor, playVoice, unlockAudio, onVoiceState, MAX_SEC } from "../lib/voice.js";
import { watchCount, tribuneMuted, setTribuneMuted } from "../lib/tribune.js";
import { matBgOf, cardBackOf } from "../components/MatBgSettings.jsx";
import { Mat, frozenTerritories } from "./Mat.jsx";
import { RulesPanel } from "./Rules.jsx";
import { Sheet, Toast, PhaseFlash } from "../components/ui.jsx";
import { MAT_W, MAT_H, GAP, BOARD_H, CARD, SLOTS, TITLES, ROMAN, PILE_BY_ID, slotAt, pileAt, placeName, boxAt, inRect, rotPt, mirrorX, MAT_KIND, setSorcSeat } from "../lib/mat.js";
import {
  normalize, detach, addLog, shuffle, resetState, rid, TOKEN_COLORS, TOKEN_HEX,
  PHASES, PHASE_BY_ID, UNIF_BONUS, UNIF_STATS, KIN_COLOR, kinSub, MARKER_PRESETS, MARKER_ICON, parseVal, TCG, PILE_IDS, fabLife, START_PI, START_PV,
  sorcLife, sorcAffinity, SORC_ELEMENTS,
} from "../lib/game.js";
import { activateTcg, tcgOf, tcgFilter } from "../lib/tcg.js";
import { myResult, saveResult } from "../lib/results.js";
import { useTableRtc } from "../lib/useTableRtc.js";
import { audioOut } from "../lib/rtc.js";
import { CamOverlay, QrImg, VideoTokens, videoToBoard, videoPointAt } from "../components/CamView.jsx";

const ZOOMS = [1, 1.6, 2.4, 3.2]; // niveaux de zoom de la loupe (vue d'un seul tapis)
export const BAR = 48; // bandeau PI/PV en portrait (px écran)
export const RAIL = 96; // colonne PI/PV en paysage (px écran)
export const SORC_BAR = 64; // bandeau Sorcery en portrait : nom, phase et éléments sur trois lignes
// Royaume partagé de Sorcery : toujours le même fond (carte ancienne), jamais le tapis personnalisé d'un joueur
export const SORC_REALM_BG = { url: "/sorcery/realm.jpg", dim: 0 };
export const barH = () => (MAT_KIND === "sorcery" ? SORC_BAR : BAR);
const PILE_NAMES = { d1: "Défausse I", d2: "Défausse II", d3: "Défausse III", deck: "Deck" };
// Noms des piles du jeu actif (Safir : PILE_NAMES ; Flesh and Blood : zones du tapis + inventaire)
const pileName = (id) => (TCG !== "safir" ? (id === "inv" ? "Inventaire" : PILE_BY_ID[id]?.short || id) : PILE_NAMES[id]);
const deSa = (id) => (TCG !== "safir" ? (id === "inv" ? "de son inventaire" : PILE_BY_ID[id]?.de || "") : `de sa ${PILE_NAMES[id]}`);
const dansSa = (id) => (TCG !== "safir" ? (id === "inv" ? "dans son inventaire" : PILE_BY_ID[id]?.dans || "") : `dans sa ${PILE_NAMES[id]}`);
// Libellés des compteurs (Safir : PI / PV ; Flesh and Blood : ressources / vie)
export const counterLabel = (k) => (TCG === "fab" ? (k === "pi" ? "RES" : "VIE") : TCG === "sorcery" ? (k === "pi" ? "MANA" : "VIE") : k === "pi" ? "PI" : "PV");
const PHASE_H = 40; // barre des phases au-dessus de la main (portrait)
const WIN_PV = 30;
const QUICK = ["OK", "Attends", "Je réagis", "Riposte ?", "Vol vie ?", "À toi", "Bien joué !"];
const ARROW_HEX = { atk: "#ff3b3b", cib: "#4ba3ff" };
const logLine = (who, m) => (m.startsWith("⚠ ") ? `⚠ ${who} ${m.slice(2)}` : `${who} ${m}`);
const terrOf = (x) => (x < 201.5 ? 0 : x < 398.5 ? 1 : 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// side : "b" pour le second côté d'une partie solo (sinon "")
export default function Table({ go, gameId, side = "" }) {
  const user = me();
  const mySlot = side === "b" ? "b" : "";
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);
  const [opp, setOpp] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState(null);
  const [zoom, setZoom] = useState(0);
  const [camZoom, setCamZoom] = useState(null); // tapis filmé en grand : "opp" ou "mine"
  const [hover, setHover] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [offline, setOffline] = useState(false);
  const [handH, setHandH] = useState(null);
  const [landscape, setLandscape] = useState(false);
  const [vp, setVp] = useState({ w: 360, h: 600 });
  const [focus, setFocus] = useState(null); // null = vue d'ensemble, "mine" / "opp" = loupe sur un tapis
  const [panel, setPanel] = useState("hand");
  const [wide, setWide] = useState(false); // ordinateur : colonne latérale large (main, réserve, règles)
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState(null); // dernier message adverse affiché sur son tapis
  // Spectateurs : nombre connectés, tribune (leur tchat) que chaque joueur peut couper
  const [watching, setWatching] = useState(0);
  const [tribune, setTribune] = useState([]);
  const [trUnread, setTrUnread] = useState(0);
  const [trMute, setTrMute] = useState(tribuneMuted);
  const [trBubble, setTrBubble] = useState(null);
  const trMuteRef = useRef(trMute);
  const trTabRef = useRef(false); // onglet Tribune ouvert
  const trIds = useRef(new Set());
  const [banner, setBanner] = useState(""); // « À vous de jouer »
  const [phaseFlash, setPhaseFlash] = useState(null); // phase de l'adversaire annoncée en grand
  // Tapis et dos de cartes de l'adversaire (signalables)
  const looks = useLooks(gameId, !!meta && !meta.solo);
  const oppId = meta && !meta.solo ? (meta.p1 === user.id ? meta.p2 : meta.p1) : "";
  const oppLook = looks.look(oppId);
  const [reportOpen, setReportOpen] = useState(false);
  const [reacts, pushReact] = useReactionQueue(); // réactions rapides affichées en grand
  const lastReact = useRef(0);
  const [winner, setWinner] = useState(null);
  const [result, setResult] = useState(undefined); // mon résultat enregistré pour cette partie : "win" | "loss" | null
  const [aim, setAim] = useState(null); // {iid, k: "atk" | "cib"} : choix de la cible d'une flèche ({v: [u, v]} depuis un tapis filmé)
  const [camGeo, setCamGeo] = useState({}); // tapis filmés affichés : { mine|opp: { ar, rot } } (placement des flèches)
  // Face à un joueur filmé (Safir) : son image est vue « assis en face » (retournée) et mes territoires sont inversés
  // (III · II · I) pour rester face aux siens. Le joueur filmé, lui, garde l'affichage habituel.
  const mirrorMine = TCG === "safir" && !!opp?.filmed && !mine?.filmed;
  const mirrorRef = useRef(false);
  mirrorRef.current = mirrorMine;
  const [pings, setPings] = useState([]); // [{owner: "mine"|"opp", iid, k}]
  const [speaking, setSpeaking] = useState(null); // message vocal en cours de lecture
  const mainRef = useRef();
  const sheetRef = useRef(null);
  // Vocal en direct et caméra d'un joueur filmé (pair à pair)
  const rtc = useTableRtc({ gameId: meta && !meta.solo ? gameId : null, userId: user.id, meta, mine, opp });
  const oppMicSeen = useRef(false);
  useEffect(() => {
    if (rtc.oppMic && !oppMicSeen.current && !rtc.mic && opp) setToast(`🎧 ${opp.name} a ouvert son micro : touchez 🎧 pour lui répondre`);
    oppMicSeen.current = rtc.oppMic;
  }, [rtc.oppMic]);
  const msgIds = useRef(new Set());
  const lastOppPhase = useRef(undefined);
  const lastPing = useRef(null);
  const pvPrev = useRef({});

  const mineRef = useRef(null);
  const oppRef = useRef(null);
  const tokRef = useRef([]);
  const pendMarks = useRef({});
  const sideRef = useRef("p1");
  const seatRef = useRef(null);
  const sync = useRef({ mBusy: false, mDirty: false });
  const lastOppLog = useRef(null);
  const lastReveal = useRef(null);
  const vpRef = useRef();
  const myMatRef = useRef();
  const oppMatRef = useRef();
  const handRef = useRef();
  const ghostRef = useRef();
  const dragRef = useRef(null);
  const sRef = useRef(0.5);

  // Échelle : vue d'ensemble des deux tapis, ou loupe plein écran sur un seul tapis
  const fitS = landscape
    ? Math.min((vp.w - 12 - RAIL) / MAT_W, (vp.h - 12) / (focus ? MAT_H : BOARD_H))
    : Math.min((vp.w - 12) / MAT_W, (vp.h - 12 - (focus ? barH() : 2 * barH())) / (focus ? MAT_H : BOARD_H));
  const s = Math.max(0.15, fitS) * (focus ? ZOOMS[zoom] : 1);
  sRef.current = s;
  const mySide = sideRef.current;
  const oppSide = mySide === "p1" ? "p2" : "p1";

  // ---------- Synchronisation serveur ----------
  // games : métadonnées + jetons partagés ; seats : un enregistrement d'état par joueur
  // (deux enregistrements distincts : les écritures des deux joueurs ne s'écrasent jamais)
  const applyGame = useCallback((r) => {
    sideRef.current = r.solo ? (mySlot === "b" ? "p2" : "p1") : r.p1 === user.id ? "p1" : "p2";
    setSorcSeat(sideRef.current === "p1"); // Sorcery : numéros des cases écrits dans le journal du point de vue du joueur 1
    setMeta({ code: r.code, p1: r.p1, p2: r.p2, status: r.status, ...(r.open ? { open: true } : null), ...(r.solo ? { solo: true } : null) });
  }, [user.id, mySlot]);

  // Jetons : un enregistrement "marks" par jeton, modifié indépendamment
  const setMarks = (list) => {
    tokRef.current = list;
    setTokens(list);
  };
  const applyMark = useCallback((action, rec) => {
    const cur = tokRef.current;
    if (action === "delete") return setMarks(cur.filter((t) => t.id !== rec.id));
    if (pendMarks.current[rec.id] > 0) return; // écho d'une écriture locale encore en vol
    const i = cur.findIndex((t) => t.id === rec.id);
    setMarks(i < 0 ? [...cur, rec] : cur.map((t) => (t.id === rec.id ? rec : t)));
  }, []);

  const addPing = useCallback((owner, iid) => {
    const k = rid(6);
    setPings((l) => [...l, { owner, iid, k }]);
    setTimeout(() => setPings((l) => l.filter((x) => x.k !== k)), 2800);
  }, []);

  const applySeat = useCallback((rec) => {
    // mon siège : le mien, et en solo celui du côté choisi (slot)
    if (rec.player === user.id && (rec.slot || "") === mySlot) {
      seatRef.current = rec.id;
      const srv = normalize(rec.state);
      const loc = mineRef.current;
      const sy = sync.current;
      if (!loc || (!sy.mBusy && !sy.mDirty && (srv.rev || 0) >= (loc.rev || 0))) {
        mineRef.current = srv;
        setMine(srv);
      }
      return;
    }
    const o = rec.state && rec.state.cards ? normalize(rec.state) : null;
    if (o) {
      const last = o.log?.[o.log.length - 1];
      // (un changement de phase est annoncé en grand : pas de bandeau en plus)
      const phaseMsg = last && /^(commence son tour|passe en phase)/.test(last.m) && o.phase && o.phase !== lastOppPhase.current;
      if (last && lastOppLog.current !== null && last.t > lastOppLog.current && !phaseMsg) setToast(logLine(o.name, last.m));
      lastOppLog.current = last ? last.t : 0;
      // Carte montrée par l'adversaire (ignorée au premier chargement)
      const rv = o.reveal;
      const rvc = rv && (rv.card || o.cards[rv.iid]);
      if (rv && lastReveal.current !== null && rv.t > lastReveal.current && rvc) {
        setSheet({ kind: "view", c: rvc, title: `${o.name} vous montre`, hint: rvc.n });
      }
      lastReveal.current = rv ? rv.t : 0;
      // Fin du tour adverse : c'est à moi
      if (lastOppPhase.current && !o.phase) setBanner(`${o.name} a fini son tour : à vous de jouer !`);
      // Nouvelle phase de l'adversaire : annoncée en grand (pas au chargement de la partie)
      if (lastOppPhase.current !== undefined && o.phase && o.phase !== lastOppPhase.current && PHASE_BY_ID[o.phase]) {
        setPhaseFlash({ key: Date.now(), id: o.phase, who: `${o.name}${phaseMsg && last.m.startsWith("commence") ? ` · tour ${o.turn}` : ""}`, label: PHASE_BY_ID[o.phase].label });
      }
      lastOppPhase.current = o.phase || null;
      // Carte signalée par l'adversaire (appui long)
      const pg = o.ping;
      if (pg && lastPing.current !== null && pg.t > lastPing.current) {
        const owner = pg.s === "me" ? "opp" : "mine";
        const st2 = owner === "opp" ? o : mineRef.current;
        const b = st2?.board.find((x) => x.iid === pg.iid);
        if (b) {
          addPing(owner, pg.iid);
          const nm = b.down && owner === "opp" ? "une carte face cachée" : `« ${st2.cards[pg.iid]?.n || "carte"} »`;
          setToast(`${o.name} signale ${nm}`);
        }
      }
      lastPing.current = pg ? pg.t : 0;
    }
    oppRef.current = o;
    setOpp(o);
  }, [user.id, addPing, mySlot]);

  const applyMsg = useCallback((m) => {
    if (msgIds.current.has(m.id)) return;
    msgIds.current.add(m.id);
    // réaction rapide : affichée en grand, pas dans le tchat
    const r = reactionOf(m);
    if (r) return pushReact({ r, name: m.name, mine: m.author === user.id });
    setMessages((l) => [...l, m].slice(-200));
    if (m.author !== user.id) {
      if (sheetRef.current !== "chat") setUnread((n) => n + 1);
      if (m.audio) playVoice(fileUrl("messages", m.id, m.audio), { name: m.name, dur: m.dur, id: m.id });
      else setBubble({ name: m.name, text: m.text, k: m.id });
    }
  }, [user.id]);

  const loadAll = useCallback(async () => {
    const [g, seats, marks, msgs] = await Promise.all([
      pb.collection("games").getOne(gameId),
      pb.collection("seats").getFullList({ filter: `game="${gameId}"` }),
      pb.collection("marks").getFullList({ filter: `game="${gameId}"` }),
      pb.collection("messages").getList(1, 100, { filter: `game="${gameId}"`, sort: "-created" }).catch(() => ({ items: [] })),
    ]);
    // Messages déjà lus : pas de bulle au chargement
    const fresh = msgs.items.filter((m) => !msgIds.current.has(m.id) && !reactionOf(m)).reverse();
    msgs.items.forEach((m) => msgIds.current.add(m.id)); // réactions déjà passées : pas rejouées
    if (fresh.length) setMessages((l) => [...l, ...fresh].sort((a, b) => (a.created < b.created ? -1 : 1)).slice(-200));
    activateTcg(tcgOf(g)); // tapis et règles du jeu de cette partie
    applyGame(g);
    const pending = tokRef.current.filter((t) => pendMarks.current[t.id] > 0);
    setMarks([...marks.filter((m) => !pendMarks.current[m.id]), ...pending]);
    seats.forEach(applySeat);
    if (!seats.some((x) => x.player === user.id)) setErr("Vous n'êtes pas assis à cette table.");
  }, [gameId, applyGame, applySeat, user.id]);

  useEffect(() => {
    let alive = true;
    const unsubs = [];
    (async () => {
      try {
        await loadAll();
        if (!alive) return;
        unsubs.push(await pb.collection("games").subscribe(gameId, (e) => {
          if (e.action === "delete") return setErr("Cette partie a été supprimée.");
          applyGame(e.record);
        }));
        unsubs.push(await pb.collection("seats").subscribe("*", (e) => {
          if (e.action !== "delete" && e.record.game === gameId) applySeat(e.record);
        }, { filter: `game="${gameId}"` }));
        unsubs.push(await pb.collection("marks").subscribe("*", (e) => {
          if (e.record.game === gameId) applyMark(e.action, e.record);
        }, { filter: `game="${gameId}"` }));
        unsubs.push(await pb.collection("messages").subscribe("*", (e) => {
          if (e.action === "create" && e.record.game === gameId) applyMsg(e.record);
        }, { filter: `game="${gameId}"` }).catch(() => null));
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
    const refresh = () => {
      if (document.visibilityState === "visible") loadAll().catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive = false;
      unsubs.forEach(safeUn);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [gameId, loadAll, applyGame, applySeat, applyMark, applyMsg]);

  // Victoire : un joueur atteint 30 PV (pas au chargement d'une partie déjà gagnée)
  useEffect(() => {
    for (const [k, st] of [["mine", mine], ["opp", opp]]) {
      if (!st) continue;
      const prev = pvPrev.current[k];
      if (TCG === "sorcery") {
        // Sorcery : à 0, l'avatar est aux portes de la mort (immunisé jusqu'à la fin du tour) ; le coup suivant l'achève
        if (prev !== undefined && prev > 0 && st.pv <= 0) setToast(`☠ ${k === "mine" ? "Votre avatar est" : `L'avatar de ${st.name || "l'adversaire"} est`} aux portes de la mort : le prochain dégât (pas une perte de vie) achève la partie.`);
      } else if (TCG === "fab") {
        // Flesh and Blood : le héros qui tombe à 0 point de vie perd la partie
        const other = k === "mine" ? opp : mine;
        if (prev !== undefined && prev > 0 && st.pv <= 0) setWinner({ name: other?.name || (k === "mine" ? "L'adversaire" : "Vous"), mine: k !== "mine", fab: true, loser: st.name || (k === "mine" ? "Vous" : "L'adversaire") });
      } else if (prev !== undefined && prev < WIN_PV && st.pv >= WIN_PV) setWinner({ name: st.name || (k === "mine" ? "Vous" : "L'adversaire"), mine: k === "mine" });
      pvPrev.current[k] = st.pv;
    }
  }, [mine?.pv, opp?.pv]);

  // Présence à la table (pour la liste « En direct » des autres joueurs)
  useEffect(() => (meta && !meta.solo ? beHere(gameId, user.id) : undefined), [gameId, !!meta, meta?.solo]);
  // Une partie par manche : « Nouvelle partie » (tout remettre à zéro) ouvre une nouvelle ligne de bilan
  const resKey = mine?.round ? `${gameId}-${mine.round}` : gameId;
  // Bilan par deck (privé) : résultat enregistré pour cette partie, compté d'office à la victoire ou à la défaite
  useEffect(() => {
    if (!meta || meta.solo) return;
    setResult(undefined);
    myResult(user.id, resKey).then((r) => setResult(r ? r.outcome : null));
  }, [resKey, !!meta, meta?.solo]);
  async function recordResult(outcome) {
    if (!meta || meta.solo || !mine) return;
    try {
      await saveResult({ userId: user.id, gameId: resKey, st: mine, tcg: TCG, outcome, oppName: opp?.name });
      setResult(outcome);
    } catch (_) {
      setToast("Résultat non enregistré, réessayez depuis le menu ☰.");
    }
  }
  useEffect(() => {
    if (winner && !meta?.solo) recordResult(winner.mine ? "win" : "loss");
  }, [winner]);

  useEffect(() => {
    sheetRef.current = sheet?.kind || null;
    if (sheet?.kind === "chat") setUnread(0);
  }, [sheet]);

  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 5000);
    return () => clearTimeout(t);
  }, [bubble]);
  useEffect(() => {
    if (!trBubble) return;
    const t = setTimeout(() => setTrBubble(null), 4500);
    return () => clearTimeout(t);
  }, [trBubble]);

  // Spectateurs : compteur en direct et tribune
  useEffect(() => watchCount(gameId, setWatching), [gameId]);
  useEffect(() => {
    let unsub = null, alive = true;
    const add = (m, live) => {
      if (trIds.current.has(m.id)) return;
      trIds.current.add(m.id);
      setTribune((l) => [...l, m].slice(-200));
      if (!live || trTabRef.current) return;
      setTrUnread((n) => n + 1);
      if (!trMuteRef.current) setTrBubble({ name: m.name, text: m.text, k: m.id });
    };
    (async () => {
      try {
        const r = await pb.collection("tribune").getList(1, 100, { filter: `game="${gameId}"`, sort: "-created" });
        if (!alive) return;
        r.items.reverse().forEach((m) => add(m, false));
        unsub = await pb.collection("tribune").subscribe("*", (e) => e.action === "create" && e.record.game === gameId && add(e.record, true), { filter: `game="${gameId}"` });
        if (!alive) unsub?.();
      } catch (_) { /* tribune indisponible */ }
    })();
    return () => {
      alive = false;
      safeUn(unsub);
    };
  }, [gameId]);
  const muteTribune = (v) => {
    trMuteRef.current = v;
    setTrMute(v);
    setTribuneMuted(v);
    if (v) setTrBubble(null);
  };
  const seeTribune = (open) => {
    trTabRef.current = open;
    if (open) setTrUnread(0);
  };
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  const pushMine = useCallback(async () => {
    const sy = sync.current;
    if (sy.mBusy) { sy.mDirty = true; return; }
    if (!seatRef.current) return;
    sy.mBusy = true;
    let failed = false;
    try {
      do {
        sy.mDirty = false;
        await pb.collection("seats").update(seatRef.current, { state: mineRef.current });
      } while (sy.mDirty);
      setOffline(false);
    } catch (e) {
      failed = true;
      setOffline(true);
    } finally {
      sy.mBusy = false;
    }
    if (failed) setTimeout(() => pushMine(), 2500);
  }, []);

  // Partie solo : passer à l'autre deck (après envoi de mes derniers changements)
  const switchSide = async () => {
    for (let i = 0; i < 40 && (sync.current.mBusy || sync.current.mDirty); i++) await new Promise((r) => setTimeout(r, 100));
    if (sync.current.mDirty || sync.current.mBusy) await pushMine();
    go("table", { gameId, side: mySlot === "b" ? "" : "b" });
  };

  // Mutation de mon état : fn(s) modifie s et renvoie le message du journal, ou false pour annuler.
  // key : les messages successifs de même clé (moins de 8 s d'écart) sont fusionnés en une ligne
  const mut = useCallback((fn, key) => {
    if (!mineRef.current) return;
    const st = structuredClone(mineRef.current);
    const msg = fn(st);
    // valeur de départ d'une suite de changements (« de 12 à 18 »), gardée tant que la ligne du journal est fusionnée
    const from = st.__from;
    delete st.__from;
    if (msg === false) return;
    if (typeof msg === "string") {
      const last = st.log?.[st.log.length - 1];
      if (last && key && last.k === key && Date.now() - last.t < 8000) {
        st.log = [...st.log.slice(0, -1), { t: Date.now(), m: msg, k: key, ...(last.from !== undefined ? { from: last.from } : null) }];
      } else {
        addLog(st, msg, key);
        if (from !== undefined) st.log[st.log.length - 1].from = from;
      }
    }
    st.rev = (st.rev || 0) + 1;
    mineRef.current = st;
    setMine(st);
    pushMine();
  }, [pushMine]);

  // Parties créées avant l'enregistrement des valeurs : on complète une fois la Valeur de mes cartes
  // depuis ma collection (les cartes d'un deck prêté restent sans valeur si on n'y a pas accès).
  const valsFilled = useRef(false);
  useEffect(() => {
    if (!mine || valsFilled.current) return;
    const missing = [...new Set(Object.values(mine.cards).filter((c) => !("v" in c) || !("a" in c) || !("k" in c)).map((c) => c.c))];
    valsFilled.current = true;
    if (!missing.length) return;
    (async () => {
      const vals = {};
      for (let i = 0; i < missing.length; i += 30) {
        const part = missing.slice(i, i + 30);
        try {
          const recs = await pb.collection("cards").getFullList({ filter: part.map((id) => `id="${id}"`).join(" || "), fields: "id,val,atk,def,factions" });
          recs.forEach((r) => (vals[r.id] = { v: parseVal(r.val), a: parseVal(r.atk), d: parseVal(r.def), k: kinSub(r.factions) }));
        } catch { /* cartes inaccessibles : valeur inconnue */ }
      }
      mut((st) => {
        for (const c of Object.values(st.cards)) {
          for (const k of ["v", "a", "d", "k"]) if (!(k in c)) c[k] = vals[c.c]?.[k] ?? (k === "k" ? "" : null);
        }
        return true; // sans ligne de journal
      });
    })();
  }, [mine, mut]);

  const track = async (id, fn) => {
    pendMarks.current[id] = (pendMarks.current[id] || 0) + 1;
    try {
      await fn();
      setOffline(false);
    } catch (e) {
      if (e?.status !== 404) setOffline(true);
    } finally {
      pendMarks.current[id]--;
    }
  };
  const addMark = (m) => {
    const rec = { id: rid(15), game: gameId, on: "", dx: 0, dy: 0, ...m, on: m.on || "" };
    setMarks([...tokRef.current, rec]);
    track(rec.id, () => pb.collection("marks").create(rec));
  };
  const updMark = (id, patch) => {
    const p = { ...patch };
    if ("on" in p) p.on = p.on || "";
    setMarks(tokRef.current.map((t) => (t.id === id ? { ...t, ...p } : t)));
    track(id, () => pb.collection("marks").update(id, p));
  };
  const delMark = (id) => {
    setMarks(tokRef.current.filter((t) => t.id !== id));
    track(id, () => pb.collection("marks").delete(id));
  };

  // Statistiques d'un combattant : 3 jetons à la couleur de sa sous-faction (Yan rouge, Tian bleu, Lin vert), posés sur
  // ATK (en haut à gauche), Valeur (en haut au milieu) et DEF (en haut à droite). Valeur affichée = valeur imprimée
  // + bonus d'unification (niveau 1 à 3) + bonus ou malus venant d'autres cartes (bx = { a, v, d }).
  // Les jetons existants sont mis à jour sur place ; sans unification ni bonus, ils sont retirés.
  const STAT_KEYS = [["a", "ATK", -0.26, -0.35], ["v", "Valeur", 0, -0.38], ["d", "DEF", 0.26, -0.35]];
  const applyStats = (iid, lvl, bx, logText) => {
    const st = mineRef.current;
    const b = st?.board.find((x) => x.iid === iid);
    const c = st?.cards[iid];
    if (!b || !c) return;
    const extra = { a: bx?.a || 0, v: bx?.v || 0, d: bx?.d || 0 };
    const hasExtra = extra.a || extra.v || extra.d;
    const bonus = UNIF_STATS[lvl] || (hasExtra ? { a: 0, v: 0, d: 0 } : null);
    const keys = bonus ? STAT_KEYS.filter(([k]) => typeof c[k] === "number") : [];
    const old = (b.ut || []).filter((id) => tokRef.current.some((t) => t.id === id));
    const reuse = bonus && old.length === keys.length && old.length === (b.ut || []).length;
    if (!reuse) for (const id of old) delMark(id);
    const ids = [];
    const shown = [];
    if (bonus) {
      const dim = CARD[c.o === "l" ? "l" : "p"];
      const color = KIN_COLOR[c.k] || "gold";
      keys.forEach(([k, label, fx, fy], n) => {
        const v = Math.max(0, c[k] + bonus[k] + extra[k]);
        shown.push(`${label} ${v}`);
        if (reuse) {
          ids.push(old[n]);
          updMark(old[n], { v });
        } else {
          const id = rid(15);
          ids.push(id);
          addMark({ id, side: mySide, color, v, on: iid, dx: fx * dim.w, dy: fy * dim.h, x: b.x, y: b.y }); // sur les valeurs imprimées en haut de la carte
        }
      });
    }
    const missing = bonus ? STAT_KEYS.filter(([k]) => typeof c[k] !== "number").map(([, l]) => l) : [];
    if (missing.length) setToast(`${missing.join(", ")} non renseignée${missing.length > 1 ? "s" : ""} sur « ${c.n} » : à compléter dans Mes cartes.`);
    mut((s2) => {
      const bb = s2.board.find((x) => x.iid === iid);
      if (!bb) return false;
      if (lvl) bb.u = lvl;
      else delete bb.u;
      if (hasExtra) bb.bx = extra;
      else delete bb.bx;
      if (ids.length) bb.ut = ids;
      else delete bb.ut;
      return logText(shown.length ? ` : ${shown.join(" · ")}` : "");
    });
  };
  const setCardUnif = (iid, lvl) => {
    const b = mineRef.current?.board.find((x) => x.iid === iid);
    const c = mineRef.current?.cards[iid];
    if (!b || !c) return;
    applyStats(iid, lvl, b.bx, (t) => (lvl ? `passe « ${c.n} » en Unification ${lvl}${t}` : `retire l'unification de « ${c.n} »${t}`));
  };
  // Bonus (ou malus) venant d'une autre carte, ajouté par-dessus l'unification. k : "a", "v" ou "d" ; delta : +1 / -1 ; null = tout retirer
  const setCardBonus = (iid, k, delta) => {
    const b = mineRef.current?.board.find((x) => x.iid === iid);
    const c = mineRef.current?.cards[iid];
    if (!b || !c) return;
    const bx = { a: 0, v: 0, d: 0, ...(b.bx || {}) };
    if (k) bx[k] = Math.max(-9, Math.min(9, bx[k] + delta));
    const label = { a: "ATK", v: "Valeur", d: "DEF" }[k];
    applyStats(iid, b.u || 0, k ? bx : null, (t) =>
      k ? `${delta > 0 ? "ajoute" : "retire"} 1 ${label} à « ${c.n} » (effet d'une carte)${t}` : `retire les bonus d'autres cartes de « ${c.n} »${t}`,
    );
  };

  // Signal rapide (« Attendez ! »…) : sur mon tapis, chez tous ; rien dans le tchat ni dans le journal
  const setSignal = (k) =>
    mut((st) => {
      if (k) st.sig = { k, t: Date.now() };
      else delete st.sig;
      return true;
    });

  // Retirer d'un coup tous mes jetons de couleur (les marqueurs de territoire restent)
  const clearMyTokens = () => {
    const mineT = tokRef.current.filter((t) => t.side === mySide && !t.label);
    if (!mineT.length) return;
    mineT.forEach((t) => delMark(t.id));
    mut(() => `retire tous ses jetons (${mineT.length})`);
  };

  // Description d'un jeton / marqueur pour le journal
  const tokDesc = (t, where = true) => {
    if (!t) return "un jeton";
    const what = t.label ? `le marqueur « ${t.label} »` : `un jeton ${(TOKEN_COLORS.find((c) => c.id === t.color)?.label || "").toLowerCase()}`;
    if (!where) return what;
    const st = mineRef.current;
    if (t.on === "v") return `${what} sur son tapis filmé`;
    const on = t.on && st?.cards[t.on] ? ` sur « ${st.board.find((b) => b.iid === t.on)?.down ? "une carte face cachée" : st.cards[t.on].n} »` : ` sur ${placeName(t.x, t.y)}`;
    return what + on;
  };
  // Modification d'un jeton par le joueur, tracée dans le journal
  const editMark = (id, patch) => {
    const t = tokRef.current.find((x) => x.id === id);
    if (!t) return;
    if (patch === "delete") {
      delMark(id);
      return mut(() => `retire ${tokDesc(t)}`);
    }
    updMark(id, patch);
    const nt = { ...t, ...patch };
    if ("v" in patch && patch.v !== t.v) {
      mut((st) => {
        const from = fromOf(st, `tok:${id}`, t.v || 0);
        return from === patch.v ? `remet ${tokDesc(nt)} à ${patch.v}` : `passe ${tokDesc(nt)} de ${from} à ${patch.v}`;
      }, `tok:${id}`);
    }
    else if ("label" in patch && patch.label !== t.label) mut(() => `renomme le marqueur « ${t.label} » en « ${patch.label} »`);
    else if ("x" in patch || "on" in patch) mut(() => `déplace ${tokDesc(t, false)}${tokDesc(nt).slice(tokDesc(nt, false).length)}`);
    else if ("color" in patch && patch.color !== t.color) mut(() => `change la couleur de ${tokDesc(t)}`, `tokc:${id}`);
  };

  // ---------- Mise à l'échelle ----------
  // Portrait : le plateau prend la largeur, la place restante agrandit la main.
  const hasReserve = !!mine?.reserve?.length;
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // Mise en page « côte à côte » : téléphone en paysage, ou ordinateur / tablette en paysage
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 560px), (min-width: 1000px) and (min-aspect-ratio: 5/4)");
    const compute = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      setLandscape(mq.matches);
      setWide(window.matchMedia("(min-width: 1000px) and (min-aspect-ratio: 5/4)").matches);
      if (mq.matches) return setHandH(null);
      const ctrl = 46 + PHASE_H + (hasReserve ? 38 : 0);
      const fitW = (W - 12) / MAT_W;
      const boardH = BOARD_H * fitW + 2 * barH() + 12;
      setHandH(clamp(H - ctrl - boardH, 112, 250));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    mq.addEventListener?.("change", compute);
    return () => {
      ro.disconnect();
      mq.removeEventListener?.("change", compute);
    };
  }, [hasReserve]);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Loupe : on recentre la vue à chaque changement
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
  }, [zoom, focus]);

  const openFocus = (which) => {
    setZoom(0);
    setFocus(which);
  };

  // ---------- Actions de jeu ----------
  const nameOf = (st, iid) => st.cards[iid]?.n || "Carte";

  // Pose (ou déplace) une carte sur mon tapis, avec aimantation sur les emplacements
  function placeIn(st, iid, x, y, from, faceDown) {
    const c = st.cards[iid];
    if (!c) return false;
    const dim = CARD[c.o === "l" ? "l" : "p"];
    const prev = st.board.find((b) => b.iid === iid);
    // Sorcery : seuls les sites se calent au centre d'une case ; les autres cartes se posent librement (sur un site)
    const slot = TCG === "sorcery" && !c.site ? null : slotAt(x, y);
    let cx = x, cy = y, rot = prev?.rot || 0;
    if (slot) {
      cx = slot.x + slot.w / 2;
      cy = slot.y + slot.h / 2;
      rot = (slot.w > slot.h) !== (dim.w > dim.h) ? 90 : 0;
    }
    const swap = rot % 180 !== 0;
    const bw = swap ? dim.h : dim.w;
    const bh = swap ? dim.w : dim.h;
    cx = clamp(cx, bw / 2, MAT_W - bw / 2);
    cy = clamp(cy, bh / 2, MAT_H - bh / 2);
    const down = faceDown ? true : from === "deck" ? true : from === "board" ? !!prev?.down : false;
    const searched = from === "deck" && st.deck[st.deck.length - 1] !== iid; // carte choisie dans le deck, pas celle du dessus
    detach(st, iid);
    st.board.push({ iid, x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, rot, down });
    const where = placeName(cx, cy);
    // Sorcery : un site qui entre dans le royaume pendant son tour donne tout de suite 1 mana
    let mana = "";
    if (TCG === "sorcery" && c.site && !down && from !== "board" && st.phase) {
      st.pi = clamp((st.pi ?? 0) + 1, 0, 99);
      mana = ` (+1 mana, ${st.pi} en tout)`;
    }
    if (from === "atlas") return `pose le site « ${c.n} » de son atlas sur ${where}${mana}`;
    if (mana && from === "hand") return `joue le site « ${c.n} » sur ${where}${mana}`;
    const nm = down ? "une carte face cachée" : `« ${c.n} »`;
    if (from === "board") return prev && Math.hypot(prev.x - cx, prev.y - cy) < 1 ? false : `déplace ${nm} vers ${where}`;
    if (from === "reserve") return `crée le jeton « ${c.n} » sur ${where}`;
    if (from === "hand") return `joue ${nm} sur ${where}`;
    if (from === "deck") return searched ? `⚠ prend une carte choisie dans son deck et la pose face cachée sur ${where}` : `pose la carte du dessus de son deck, face cachée, sur ${where}`;
    return `sort « ${c.n} » ${deSa(from)} vers ${where}`;
  }

  const placeOnBoard = (iid, x, y, from, faceDown) => mut((st) => placeIn(st, iid, x, y, from, faceDown));

  const createFromReserve = (tid, x, y) =>
    mut((st) => {
      const tpl = (st.reserve || []).find((r) => r.tid === tid);
      if (!tpl) return false;
      const { tid: _t, ...base } = tpl;
      const iid = rid(7);
      st.cards[iid] = { ...base, tok: true };
      return placeIn(st, iid, x, y, "reserve");
    });

  // Retire les jetons posés sur une carte qui quitte le tapis
  const clearTokensOn = (iid) => {
    tokRef.current.filter((t) => t.on === iid).forEach((t) => delMark(t.id));
  };

  // Une carte jeton n'existe que sur le plateau : renvoyée en main, dans le deck ou une pile, elle quitte le jeu
  // (sinon elle restait mélangée au deck et revenait comme une vraie carte)
  const tokenLeaves = (st, iid) => {
    const c = st.cards[iid];
    detach(st, iid);
    delete st.cards[iid];
    return `retire le jeton « ${c.n} » du jeu (un jeton qui quitte le plateau disparaît)`;
  };

  const removeTokenCard = (iid) => {
    mut((st) => {
      const c = st.cards[iid];
      if (!c) return false;
      detach(st, iid);
      delete st.cards[iid];
      return `retire le jeton « ${c.n} »`;
    });
    clearTokensOn(iid);
  };

  // faceDown : pose face cachée, de préférence dans un emplacement Magie (cartes |Caché|)
  const placeFree = (iid, from, faceDown) => {
    const st = mineRef.current;
    const taken = (sl) => st.board.some((b) => Math.abs(b.x - (sl.x + sl.w / 2)) < 3 && Math.abs(b.y - (sl.y + sl.h / 2)) < 3);
    if (TCG === "sorcery") {
      // site : première case libre en partant de sa rangée ; autre carte : sur la case de son avatar
      const c = st.cards[iid];
      const sq = SLOTS.filter((sl) => sl.kind === "realm").sort((a, b) => b.r - a.r || Math.abs(a.c - 2) - Math.abs(b.c - 2));
      const hasSite = (sl) => st.board.some((b) => st.cards[b.iid]?.site && inRect(b.x, b.y, sl));
      const av = st.board.find((b) => st.cards[b.iid]?.cmd);
      if (c?.site) {
        const f = sq.find((sl) => !hasSite(sl)) || sq[0];
        return placeOnBoard(iid, f.x + f.w / 2, f.y + f.h / 2, from, faceDown);
      }
      return placeOnBoard(iid, av ? av.x + 14 : 300, av ? av.y - 20 : 250, from, faceDown);
    }
    const free = TCG === "fab"
      ? (faceDown && SLOTS.find((sl) => sl.kind === "arsenal" && !taken(sl))) || SLOTS.find((sl) => sl.kind === "arena" && !taken(sl)) || SLOTS.find((sl) => sl.kind === "chain" && !taken(sl))
      : (faceDown && SLOTS.find((sl) => sl.kind === "magie" && !taken(sl))) ||
        SLOTS.find((sl) => sl.kind !== "commandant" && !taken(sl));
    if (free) placeOnBoard(iid, free.x + free.w / 2, free.y + free.h / 2, from, faceDown);
    else placeOnBoard(iid, 300, 130, from, faceDown);
  };

  // Les cartes jetons se déplacent comme les autres (détruites, elles vont en défausse du territoire)
  const toHand = useCallback((iid, from) => {
    if (from === "board") clearTokensOn(iid);
    mut((st) => {
      const c = st.cards[iid];
      const prev = st.board.find((b) => b.iid === iid);
      const searched = from === "deck" && st.deck[st.deck.length - 1] !== iid;
      const searchedA = from === "atlas" && (st.piles.atlas || [])[(st.piles.atlas || []).length - 1] !== iid;
      if (c?.tok) return tokenLeaves(st, iid);
      detach(st, iid);
      st.hand.push(iid);
      // Flesh and Blood : carte reprise de la zone de pitch (erreur), ses ressources sont retirées
      let res = "";
      if (TCG === "fab" && from === "pitch" && c.p) {
        const before = st.pi ?? 0;
        st.pi = clamp(before - c.p, 0, 99);
        if (st.pi !== before) res = ` (−${before - st.pi} RES, ${st.pi} en tout)`;
      }
      if (res) return `reprend « ${c.n} » ${deSa(from)} en main${res}`;
      if (from === "atlas") return searchedA ? `⚠ cherche dans son atlas et prend « ${c.n} » en main` : "pioche 1 site (dessus de son atlas)";
      if (from === "deck") return searched ? `⚠ cherche dans son deck et prend « ${c.n} » en main` : "pioche 1 carte (dessus du deck)";
      if (from === "board") return prev?.down ? "reprend une carte face cachée en main" : `reprend « ${c.n} » en main`;
      return `reprend « ${c.n} » ${deSa(from)} en main`;
    });
  }, [mut]);

  const toPile = useCallback((iid, pid, from, bottom = false) => {
    if (from === "board") clearTokensOn(iid);
    mut((st) => {
      const c = st.cards[iid];
      const prev = st.board.find((b) => b.iid === iid);
      const searched = from === "deck" && st.deck[st.deck.length - 1] !== iid;
      const atl = st.piles.atlas || [];
      const searchedA = from === "atlas" && atl[atl.length - 1] !== iid;
      if (c?.tok) return tokenLeaves(st, iid);
      detach(st, iid);
      const deckW = TCG === "sorcery" ? "grimoire" : "deck";
      if (pid === "deck") {
        bottom ? st.deck.unshift(iid) : st.deck.push(iid);
        const hidden = from === "hand" || from === "deck" || prev?.down;
        const what = searched ? `⚠ déplace une carte choisie dans son ${deckW}` : `place ${hidden ? "une carte" : `« ${c.n} »`}${from === "hand" ? " de sa main" : ""}`;
        return `${what} ${bottom ? "sous" : "sur"} son ${deckW}`;
      }
      if (TCG === "sorcery" && pid === "atlas") {
        bottom ? st.piles.atlas.unshift(iid) : st.piles.atlas.push(iid);
        const hidden = from === "hand" || from === "atlas" || prev?.down;
        const what = searchedA ? "⚠ déplace un site choisi dans son atlas" : `place ${hidden ? "un site" : `« ${c.n} »`}${from === "hand" ? " de sa main" : ""}`;
        return `${what} ${bottom ? "sous" : "sur"} son atlas`;
      }
      st.piles[pid].push(iid);
      if (TCG === "sorcery") {
        if (from === "deck") return `${searched ? "⚠ cherche dans son grimoire et met" : "met la carte du dessus de son grimoire,"} « ${c.n} » ${dansSa(pid)}`;
        if (from === "atlas") return `${searchedA ? "⚠ cherche dans son atlas et met" : "met le site du dessus de son atlas,"} « ${c.n} » ${dansSa(pid)}`;
        return `met « ${c.n} »${from === "hand" ? " de sa main" : ""} ${dansSa(pid)}`;
      }
      if (TCG === "fab") {
        // carte pitchée : sa valeur de pitch (couleur) s'ajoute aux ressources ; reprise du pitch : retirée
        let res = "";
        if (c.p && (pid === "pitch") !== (from === "pitch")) {
          const before = st.pi ?? 0;
          st.pi = clamp(before + (pid === "pitch" ? c.p : -c.p), 0, 99);
          if (st.pi !== before) res = ` (${pid === "pitch" ? "+" : "−"}${Math.abs(st.pi - before)} RES, ${st.pi} en tout)`;
        }
        if (from === "deck") return `${searched ? "⚠ cherche dans son deck et met" : "met la carte du dessus de son deck,"} « ${c.n} » ${dansSa(pid)}${res}`;
        return `met « ${c.n} »${from === "hand" ? " de sa main" : from === "inv" ? " de son inventaire" : ""} ${dansSa(pid)}${res}`;
      }
      if (from === "deck") return `${searched ? "⚠ cherche dans son deck et défausse" : "défausse la carte du dessus de son deck,"} « ${c.n} » dans sa ${PILE_NAMES[pid]}`;
      return `défausse « ${c.n} »${from === "hand" ? " de sa main" : ""} dans sa ${PILE_NAMES[pid]}`;
    });
  }, [mut]);

  const draw = (n) =>
    mut((st) => {
      const k = Math.min(n, st.deck.length);
      if (!k) {
        setToast("Votre deck est vide.");
        return false;
      }
      for (let i = 0; i < k; i++) st.hand.push(st.deck.pop());
      return `pioche ${k} carte${k > 1 ? "s" : ""}${TCG === "sorcery" ? " (grimoire)" : ""}`;
    });

  // Sorcery : piocher dans son atlas (sites)
  const drawAtlas = (n) =>
    mut((st) => {
      const a = st.piles.atlas || [];
      const k = Math.min(n, a.length);
      if (!k) {
        setToast("Votre atlas est vide.");
        return false;
      }
      for (let i = 0; i < k; i++) st.hand.push(a.pop());
      return `pioche ${k} site${k > 1 ? "s" : ""} (atlas)`;
    });
  const shuffleAtlas = () =>
    mut((st) => {
      st.piles.atlas = shuffle(st.piles.atlas || []);
      return "mélange son atlas";
    });
  const peekAtlas = () => {
    mut(() => "⚠ consulte le contenu de son atlas", "peek");
    setSheet({ kind: "pile", pile: "atlas", side: "mine", open: true });
  };

  // Flesh and Blood : compléter sa main jusqu'à l'intellect du héros
  const drawUpTo = (n) => {
    const st = mineRef.current;
    if (!st) return;
    const k = n - st.hand.length;
    if (k <= 0) return setToast(`Vous avez déjà ${st.hand.length} cartes en main.`);
    draw(k);
  };

  // Flesh and Blood : fin de tour, les cartes pitchées vont sous le deck
  const pitchToDeck = () =>
    mut((st) => {
      const arr = st.piles.pitch || [];
      if (!arr.length) return false;
      st.deck = [...shuffle(arr), ...st.deck];
      st.piles.pitch = [];
      return `remet ${arr.length} carte${arr.length > 1 ? "s" : ""} de sa zone de pitch sous son deck`;
    });

  // Consulter son deck est visible de l'adversaire (comme fouiller son deck à une vraie table)
  const peekDeck = () => {
    mut(() => "⚠ consulte le contenu de son deck", "peek");
    setSheet({ kind: "pile", pile: "deck", side: "mine" });
  };

  const shuffleDeck = () =>
    mut((st) => {
      st.deck = shuffle(st.deck);
      return "mélange son deck";
    });

  // Valeur de départ d'une suite de changements rapprochés (même ligne de journal) : « de 12 à 18 »
  const fromOf = (st, key, cur) => {
    const last = st.log?.[st.log.length - 1];
    const v = last && last.k === key && Date.now() - last.t < 8000 && last.from !== undefined ? last.from : cur;
    st.__from = v;
    return v;
  };
  const setTrack = (kind, v) =>
    mut((st) => {
      const max = TCG !== "safir" ? 99 : kind === "pi" ? 15 : 99; // PV Safir : la victoire se déclare à 30, mais le compteur peut continuer à monter
      const nv = clamp(v, 0, max);
      if (st[kind] === nv) return false;
      const from = fromOf(st, kind, st[kind] ?? 0);
      st[kind] = nv;
      const what = TCG === "fab" ? (kind === "pv" ? "sa vie" : "ses ressources") : TCG === "sorcery" ? (kind === "pv" ? "sa vie" : "son mana") : `ses ${kind.toUpperCase()}`;
      return from === nv ? `remet ${what} à ${nv}` : `passe ${what} de ${from} à ${nv}`;
    }, kind);

  // Joueur filmé : sens de l'image de sa caméra, le même chez tous (si le téléphone est posé dans l'autre sens)
  const flipCam = () =>
    mut((st) => {
      st.camRot = st.camRot === 180 ? 0 : 180;
      return "retourne l'image de sa caméra";
    });

  // Joueur filmé : montrer une carte de sa collection (elle n'est pas dans l'état de partie)
  const showScan = (rec) =>
    mut((st) => {
      st.reveal = { iid: `x${rid(6)}`, t: Date.now(), card: { c: rec.id, f: rec.image, n: rec.name || "Carte", o: rec.orient || "p" } };
      return `montre « ${rec.name || "une carte"} »`;
    });

  const showCard = (iid) =>
    mut((st) => {
      if (!st.cards[iid]) return false;
      st.reveal = { iid, t: Date.now() };
      return `montre « ${st.cards[iid].n} » de sa main`;
    });

  const toggleTap = (iid) =>
    mut((st) => {
      const b = st.board.find((x) => x.iid === iid);
      if (!b) return false;
      b.rot = b.rot ? 0 : 90;
      return `${b.rot ? "engage" : "dégage"} ${b.down ? "une carte face cachée" : `« ${nameOf(st, iid)} »`}`;
    });

  const flipCard = (iid) =>
    mut((st) => {
      const b = st.board.find((x) => x.iid === iid);
      if (!b) return false;
      b.down = !b.down;
      return b.down ? `retourne « ${nameOf(st, iid)} » face cachée` : `révèle « ${nameOf(st, iid)} »`;
    });

  const resetMine = () => {
    if (mineRef.current?.filmed) {
      if (!confirm(`Nouvelle partie : revenir à PI ${START_PI} / PV ${START_PV} et retirer vos jetons ?`)) return;
    } else if (TCG === "sorcery") {
      if (!confirm(`Remettre vos sites dans l'atlas et vos sorts dans le grimoire, les mélanger, remettre votre avatar à sa place, retirer vos cartes jetons et revenir à ${sorcLife(mineRef.current?.cards)} de vie ?`)) return;
    } else if (TCG === "fab") {
      if (!confirm(`Remettre vos cartes dans le deck (armes et équipements dans l'inventaire), le mélanger, retirer vos cartes jetons et revenir à ${fabLife(mineRef.current?.format)} de vie ?`)) return;
    } else if (!confirm("Remettre toutes vos cartes dans le deck, le mélanger, retirer vos cartes jetons et revenir à PI 4 / PV 0 ?")) return;
    mut((st) => {
      const r = resetState(st);
      Object.assign(st, r, { round: (st.round || 0) + 1 });
      return st.filmed ? "commence une nouvelle partie (compteurs remis à zéro)" : "commence une nouvelle partie : remet tout son jeu dans son deck et le mélange";
    });
    tokRef.current.filter((t) => t.side === mySide).forEach((t) => delMark(t.id));
  };

  // ---------- Tour, phases, unification ----------
  const setPhase = (id) =>
    mut((st) => {
      if (st.phase === id) return false;
      const start = !st.phase;
      if (start) st.turn = (st.turn || 0) + 1;
      st.phase = id;
      if (id === "cal") st.arrows = [];
      const lb = PHASE_BY_ID[id].label;
      // Sorcery : début du tour, on redresse ses cartes et chaque site donne 1 mana
      if (start && TCG === "sorcery") {
        let n = 0;
        for (const b of st.board) if (b.rot) { b.rot = 0; n++; }
        st.pi = sorcAffinity(st).sites;
        return `commence son tour ${st.turn} : ${lb}${n ? `, redresse ${n} carte${n > 1 ? "s" : ""}` : ""}, ${st.pi} mana (1 par site)`;
      }
      return start ? `commence son tour ${st.turn} : ${lb}` : `passe en phase ${lb}`;
    });

  const endTurn = () =>
    mut((st) => {
      if (!st.phase) return false;
      st.phase = null;
      st.arrows = [];
      if (TCG !== "safir") st.pi = 0; // Flesh and Blood, Sorcery : ressources ou mana inutilisés perdus
      return `termine son tour ${st.turn}`;
    });

  const cycleUnif = () => {
    const n = ((mineRef.current?.unif || 0) + 1) % 4;
    mut((st) => {
      st.unif = n;
      return n ? `passe en Unification ${n} (${UNIF_BONUS[n]})` : "n'est plus en Unification";
    });
    setToast(n ? `Unification ${n} : ${UNIF_BONUS[n]}` : "Unification retirée");
  };

  const coin = () => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "Pile" : "Face";
    mut(() => `lance une pièce : ${r}`);
    setToast(`Pièce : ${r}`);
  };

  const mulligan = (ids) =>
    mut((st) => {
      const back = ids.filter((iid) => st.hand.includes(iid));
      if (!back.length) return false;
      st.hand = st.hand.filter((x) => !back.includes(x));
      st.deck = shuffle([...st.deck, ...back]);
      for (let i = 0; i < back.length && st.deck.length; i++) st.hand.push(st.deck.pop());
      st.mull = true;
      return `fait un mulligan : ${back.length} carte${back.length > 1 ? "s" : ""} renvoyée${back.length > 1 ? "s" : ""} et repiochée${back.length > 1 ? "s" : ""}`;
    });

  // ---------- Flèches et signalements ----------
  const descTarget = (to) => {
    const o = oppRef.current;
    const m = mineRef.current;
    if (to.p) return to.s === "opp" ? "l'adversaire" : "lui-même";
    if (to.v) return to.s === "opp" ? "un point du tapis filmé adverse" : "un point de son tapis filmé";
    if (to.t != null) return `${to.s === "opp" ? "le Territoire adverse" : "son Territoire"} ${ROMAN[to.t]}`;
    const st = to.s === "opp" ? o : m;
    const b = st?.board.find((x) => x.iid === to.iid);
    if (!b) return "une carte";
    if (b.down && to.s === "opp") return "une carte face cachée";
    return `« ${st.cards[to.iid]?.n || "carte"} »`;
  };

  const addArrow = (a, to) =>
    mut((st) => {
      // flèche partant d'un point du tapis filmé (joueur qui joue avec ses cartes réelles)
      if (a.v) {
        st.arrows = [...(st.arrows || []), { id: rid(6), from: "", fv: a.v, to, k: a.k }];
        return a.k === "atk" ? `attaque ${descTarget(to)} depuis son tapis filmé` : `cible ${descTarget(to)} depuis son tapis filmé`;
      }
      if (!st.board.some((b) => b.iid === a.iid)) return false;
      if (!to.p && to.t == null && !to.v && to.s === "me" && to.iid === a.iid) return false;
      st.arrows = [...(st.arrows || []), { id: rid(6), from: a.iid, to, k: a.k }];
      const src = `« ${nameOf(st, a.iid)} »`;
      return a.k === "atk" ? `attaque ${descTarget(to)} avec ${src}` : `cible ${descTarget(to)} avec ${src}`;
    });

  const clearArrows = (iid) =>
    mut((st) => {
      const before = st.arrows?.length || 0;
      st.arrows = iid ? st.arrows.filter((a) => a.from !== iid) : [];
      return before === st.arrows.length ? false : true;
    });

  const pingCard = (owner, iid) => {
    addPing(owner, iid);
    navigator.vibrate?.(25);
    mut((st) => {
      st.ping = { iid, s: owner === "mine" ? "me" : "opp", t: Date.now() };
      return true;
    });
  };

  const startAim = (iid, k) => {
    setSheet(null);
    setAim(iid && typeof iid === "object" ? { v: iid.v, k } : { iid, k });
  };

  function aimAt(to) {
    const a = aim;
    setAim(null);
    if (a) addArrow(a, to);
  }

  // Cible sous un point de l'écran (raccourcis souris) : carte, compteur, image d'un tapis filmé ou territoire
  function targetAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      const ov = el.closest?.(".cam-overlay");
      if (ov) {
        const v = videoPointAt(ov, x, y);
        return v ? { s: ov.dataset.side === "mine" ? "me" : "opp", v } : null;
      }
      const sc = el.closest?.(".score");
      if (sc) return { s: sc.classList.contains("mine") ? "me" : "opp", p: true };
      const bc = el.closest?.(".bcard[data-iid]");
      if (bc) {
        const s = bc.dataset.side === "mine" ? "me" : "opp";
        const st = s === "me" ? mineRef.current : oppRef.current;
        if (st?.board.some((b) => b.iid === bc.dataset.iid)) return { s, iid: bc.dataset.iid };
      }
    }
    const loc = locate(x, y);
    if (!loc || (loc.area !== "mine" && loc.area !== "opp") || TCG !== "safir" || loc.y > 222) return null;
    return { s: loc.area === "mine" ? "me" : "opp", t: terrOf(loc.x) };
  }
  // Le pointeur est-il au-dessus du côté adverse (son tapis, son image filmée ou son compteur) ?
  const overOpp = (x, y) => locate(x, y)?.area === "opp" || document.elementsFromPoint(x, y).some((el) => el.closest?.(".score.opp"));
  // Trait de visée pendant un glissé (mis à jour sans rendu React)
  const lineRef = useRef();
  const showLine = (d, x, y, k) => {
    const l = lineRef.current;
    if (!l) return;
    if (!k) return void (l.style.display = "none");
    l.style.display = "block";
    l.setAttribute("class", `drag-line ${k}`);
    const ln = l.querySelector("line");
    ln.setAttribute("x1", d.c0.x); ln.setAttribute("y1", d.c0.y); ln.setAttribute("x2", x); ln.setAttribute("y2", y);
    l.querySelector("circle").setAttribute("cx", x); l.querySelector("circle").setAttribute("cy", y);
  };

  // Tap sur une zone vide du plateau pendant le choix d'une cible : vise le territoire
  function boardDown(e) {
    // Tapis filmé : la cible (ou l'origine) est un point de l'image, retrouvé au même endroit chez chacun
    const ov = e.target.closest?.(".cam-overlay");
    if (ov && !e.target.closest(".cam-rot, button, a")) {
      const v = videoPointAt(ov, e.clientX, e.clientY);
      if (aim) {
        if (!v) return setToast("La caméra n'est pas encore connectée : touchez le compteur du joueur.");
        return aimAt({ s: ov.dataset.side === "mine" ? "me" : "opp", v });
      }
      if (v && ov.dataset.side === "mine" && mineRef.current?.filmed) return setSheet({ kind: "vaim", v });
      // tapis filmé de l'adversaire : le toucher l'ouvre en grand
      if (v && ov.dataset.side === "opp") return setCamZoom("opp");
      return;
    }
    if (!aim || e.target.closest?.(".loupe-btn, .score")) return;
    const loc = locate(e.clientX, e.clientY);
    if (!loc || (loc.area !== "mine" && loc.area !== "opp")) return;
    if (TCG !== "safir") return setToast("Touchez une carte ou le compteur adverse.");
    if (loc.y > 222) return setToast("Touchez une carte, un territoire ou le compteur adverse.");
    aimAt({ s: loc.area === "mine" ? "me" : "opp", t: terrOf(loc.x) });
  }

  // ---------- Tchat ----------
  // Réaction rapide (au plus une par seconde et demie, pour ne pas inonder la partie)
  const sendReaction = async (r) => {
    if (Date.now() - lastReact.current < 1500) return;
    lastReact.current = Date.now();
    try {
      const rec = await pb.collection("messages").create({ game: gameId, author: user.id, name: mineRef.current?.name || user.name || "", text: reactionText(r) });
      applyMsg(rec);
    } catch (e) {
      setToast(errMsg(e));
    }
  };

  const sendMsg = async (text) => {
    const t = (text || "").trim().slice(0, 300);
    if (!t) return;
    try {
      const rec = await pb.collection("messages").create({ game: gameId, author: user.id, name: mineRef.current?.name || user.name || "", text: t });
      applyMsg(rec);
    } catch (e) {
      setToast(errMsg(e));
    }
  };

  useEffect(() => {
    onVoiceState(setSpeaking);
    return () => onVoiceState(null);
  }, []);

  // Talkie-walkie : envoi d'un message vocal
  const sendVoice = async ({ blob, dur, mime }) => {
    try {
      const fd = new FormData();
      fd.append("game", gameId);
      fd.append("author", user.id);
      fd.append("name", mineRef.current?.name || user.name || "");
      fd.append("text", "");
      fd.append("dur", String(Math.round(dur * 10) / 10));
      fd.append("audio", new File([blob], `vocal.${extFor(mime)}`, { type: mime.split(";")[0] }));
      const rec = await pb.collection("messages").create(fd);
      applyMsg(rec);
    } catch (e) {
      setToast(`Message vocal non envoyé : ${errMsg(e)}`);
    }
  };

  // ---------- Marqueurs de territoire ----------
  const addMarker = ({ label, v, t, color }) => {
    // Joueur filmé : marqueur posé sur l'image, vers le haut du territoire choisi (tiers de l'image), à ajuster en le faisant glisser
    if (mineRef.current?.filmed) {
      const n = tokRef.current.filter((m) => m.side === mySide && m.label && m.on === "v").length;
      addMark({ side: mySide, color: color || "white", v: v || 0, label: label.slice(0, 40), on: "v", x: [167, 500, 833][t] + [0, -60, 60][n % 3], y: 90 + (Math.floor(n / 3) % 8) * 60 });
      return mut(() => `pose le marqueur « ${label}${v ? ` ${v}` : ""} » sur son Territoire ${ROMAN[t]} (tapis filmé)`);
    }
    const n = tokRef.current.filter((m) => m.side === mySide && m.label && terrOf(m.x) === t && !m.on).length;
    const dx = [0, -62, 62, -31, 31][n % 5];
    const dy = Math.floor(n / 5) * 14;
    addMark({ side: mySide, color: color || "white", v: v || 0, label: label.slice(0, 40), x: TITLES[t].x + dx, y: 24 + dy, on: null });
    mut(() => `pose le marqueur « ${label}${v ? ` ${v}` : ""} » sur son Territoire ${ROMAN[t]}`);
  };

  // ---------- Glisser-déposer ----------
  function locate(cx, cy) {
    const inR = (r) => r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    const hr = handRef.current?.getBoundingClientRect();
    if (inR(hr)) return { area: "hand" };
    const vr = vpRef.current?.getBoundingClientRect();
    if (!inR(vr)) return null;
    const sc = sRef.current;
    const mr = myMatRef.current?.getBoundingClientRect();
    if (inR(mr)) {
      const x = (cx - mr.left) / sc, y = (cy - mr.top) / sc;
      return { area: "mine", x: mirrorRef.current ? mirrorX(x, y) : x, y };
    }
    const or = oppMatRef.current?.getBoundingClientRect();
    if (inR(or)) return { area: "opp", x: (cx - or.left) / sc, y: MAT_H - (cy - or.top) / sc };
    return null;
  }

  const isCard = (src) => src.type === "hand" || src.type === "board" || src.type === "pile" || src.type === "reserve" || src.type === "inv";

  // Accroche un jeton à la carte située sous le point (sinon jeton libre)
  function attachAt(side, x, y, excludeId) {
    const st = side === mySide ? mineRef.current : oppRef.current;
    const free = { on: null, dx: 0, dy: 0, x, y };
    if (!st) return free;
    for (let i = st.board.length - 1; i >= 0; i--) {
      const b = st.board[i];
      const c = st.cards[b.iid];
      if (!c) continue;
      const dim = CARD[c.o === "l" ? "l" : "p"];
      if (!inRect(x, y, boxAt(b.x, b.y, dim.w, dim.h, b.rot || 0))) continue;
      // Écart mesuré tel qu'on le voit sur l'image de la carte : sur un tapis inversé gauche/droite (face à un
      // joueur filmé), la carte reste à l'endroit, donc l'écart horizontal se lit dans le sens de l'écran.
      const mx = side === mySide && mirrorRef.current ? mirrorX(x, y) - mirrorX(b.x, b.y) : x - b.x;
      let [dx, dy] = rotPt(mx, y - b.y, -(b.rot || 0));
      const others = tokRef.current.filter((t) => t.on === b.iid && t.id !== excludeId);
      // Écart entre jetons d'une même carte, calé sur leur taille à l'écran. Le jeton reste là où on le lâche ;
      // il ne se décale que s'il tomberait presque exactement sur un autre (sinon il serait caché dessous).
      const step = Math.max(9, (Math.max(20, 8 * sRef.current) / sRef.current) * 0.75);
      for (let g = 0; g < 12 && others.some((t) => Math.hypot(t.dx - dx, t.dy - dy) < step * 0.35); g++) {
        dy += step;
        if (dy > dim.h / 2) { dy = -dim.h / 2 + step / 2; dx += step; if (dx > dim.w / 2) dx = -dim.w / 2 + step / 2; }
      }
      return { on: b.iid, dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, x, y };
    }
    return free;
  }

  function topOf(st, pile) {
    const arr = pile === "deck" ? st.deck : st.piles[pile];
    return arr[arr.length - 1];
  }

  function canDrag(src) {
    if (src.type === "hand" || src.type === "board" || src.type === "token" || src.type === "palette" || src.type === "reserve" || src.type === "inv") return true;
    if (src.type === "pile") return src.side === "mine" && !!topOf(mineRef.current, src.pile);
    return false;
  }

  function beginDrag(src, e) {
    const sc = sRef.current;
    let g;
    if (src.type === "token" || src.type === "palette") {
      const tk = src.type === "token" ? tokRef.current.find((t) => t.id === src.id) : null;
      const color = src.type === "palette" ? src.color : tk?.color;
      const d = Math.max(30, 10 * sc);
      g = tk?.label
        ? { pill: true, color, label: tk.label, v: tk.v }
        : { tok: true, color, w: d, h: d, v: tk ? tk.v : 1 };
      setDragKey(src.type === "token" ? `token:${src.id}` : null);
    } else if (src.type === "reserve") {
      const tpl = mineRef.current.reserve.find((r) => r.tid === src.tid);
      const dim = CARD[tpl?.o === "l" ? "l" : "p"];
      const k = Math.max(sc, 64 / dim.w);
      g = { src: cardUrl(tpl), w: dim.w * k, h: dim.h * k };
    } else {
      if (src.type !== "inv") setPanel("hand");
      const st = mineRef.current;
      const iid = src.type === "pile" ? topOf(st, src.pile) : src.iid;
      const c = st.cards[iid];
      const dim = CARD[c?.o === "l" ? "l" : "p"];
      const k = Math.max(sc, 64 / dim.w);
      g = { src: src.type === "pile" && (src.pile === "deck" || src.pile === "atlas") ? null : cardUrl(c), w: dim.w * k, h: dim.h * k };
      setDragKey(src.type === "pile" ? `pile:mine:${src.pile}` : src.type === "board" ? `board:${iid}` : src.type === "inv" ? `inv:${iid}` : `hand:${iid}`);
    }
    setGhost({ ...g, x: e.clientX, y: e.clientY });
  }

  function hoverFor(src, loc) {
    if (!loc) return null;
    if (loc.area === "hand") return isCard(src) && src.type !== "hand" && src.type !== "reserve" ? { area: "hand", key: "hand" } : null;
    if (loc.area !== "mine" || !isCard(src)) return null;
    const p = pileAt(loc.x, loc.y);
    if (p) return { side: "mine", rect: p, key: `p${p.id}` };
    const sl = slotAt(loc.x, loc.y);
    if (sl) return { side: "mine", rect: sl, key: `s${sl.id}` };
    return null;
  }

  const handlers = useRef({});
  handlers.current.move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    // clic droit glissé depuis une de mes cartes : trait de ciblage
    if (d.right) {
      if (!d.started && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7) return;
      d.started = true;
      if (e.cancelable) e.preventDefault();
      return showLine(d, e.clientX, e.clientY, "cib");
    }
    if (!d.started) {
      if (d.long) return;
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7) return;
      clearTimeout(d.timer);
      if (!canDrag(d.src) || aim) return;
      d.started = true;
      beginDrag(d.src, e);
    }
    if (e.cancelable) e.preventDefault();
    if (ghostRef.current) {
      ghostRef.current.style.left = `${e.clientX}px`;
      ghostRef.current.style.top = `${e.clientY}px`;
    }
    // une de mes cartes en jeu glissée sur le côté adverse : trait d'attaque à la place de la carte
    if (d.src.type === "board" && d.c0) {
      const atk = overOpp(e.clientX, e.clientY);
      if (ghostRef.current) ghostRef.current.style.visibility = atk ? "hidden" : "";
      showLine(d, e.clientX, e.clientY, atk ? "atk" : null);
    }
    const h = hoverFor(d.src, locate(e.clientX, e.clientY));
    if ((h?.key || null) !== (d.hk || null)) {
      d.hk = h?.key || null;
      setHover(h);
    }
  };
  handlers.current.up = (e) => {
    const d = dragRef.current;
    detachListeners();
    dragRef.current = null;
    if (!d) return;
    showLine(d, 0, 0, null);
    if (d.right) {
      if (!d.started) return;
      const to = targetAt(e.clientX, e.clientY);
      if (!to || (to.s === "me" && to.iid === d.src.iid)) return setToast("Relâchez sur une carte, un territoire ou un compteur pour cibler.");
      return addArrow({ iid: d.src.iid, k: "cib" }, to);
    }
    clearTimeout(d.timer);
    if (d.long) return;
    if (d.started) {
      const loc = locate(e.clientX, e.clientY);
      endDrag();
      drop(d.src, loc, e);
    } else tap(d.src);
  };
  handlers.current.cancel = () => {
    if (dragRef.current) showLine(dragRef.current, 0, 0, null);
    clearTimeout(dragRef.current?.timer);
    detachListeners();
    dragRef.current = null;
    endDrag();
  };
  handlers.current.ping = (src) => pingCard(src.type === "board" ? "mine" : "opp", src.iid);
  const L = useRef({
    move: (e) => handlers.current.move(e),
    up: (e) => handlers.current.up(e),
    cancel: (e) => handlers.current.cancel(e),
  }).current;

  function detachListeners() {
    window.removeEventListener("pointermove", L.move);
    window.removeEventListener("pointerup", L.up);
    window.removeEventListener("pointercancel", L.cancel);
  }
  function endDrag() {
    setGhost(null);
    setDragKey(null);
    setHover(null);
  }

  const press = useCallback((e, src) => {
    // clic droit maintenu sur une de mes cartes en jeu, puis glisser : ciblage
    const right = e.button === 2 && src.type === "board";
    if (e.button > 0 && !right) return;
    e.stopPropagation();
    detachListeners();
    const d = { src, x0: e.clientX, y0: e.clientY, started: false, right };
    const card = src.type === "board" ? e.target.closest?.(".bcard")?.getBoundingClientRect() : null;
    if (card) d.c0 = { x: card.left + card.width / 2, y: card.top + card.height / 2 };
    if (right) {
      dragRef.current = d;
      window.addEventListener("pointermove", L.move, { passive: false });
      window.addEventListener("pointerup", L.up);
      window.addEventListener("pointercancel", L.cancel);
      return;
    }
    // Appui long sur une carte en jeu : la signaler à l'adversaire
    if (src.type === "board" || src.type === "oppboard") {
      d.timer = setTimeout(() => {
        if (dragRef.current !== d || d.started) return;
        d.long = true;
        handlers.current.ping(src);
      }, 550);
    }
    dragRef.current = d;
    window.addEventListener("pointermove", L.move, { passive: false });
    window.addEventListener("pointerup", L.up);
    window.addEventListener("pointercancel", L.cancel);
  }, []);

  useEffect(() => () => detachListeners(), []);

  function drop(src, loc, e) {
    // Joueur filmé : jetons et marqueurs posés sur l'image de son tapis (point de l'image, retrouvé chez chacun)
    if (mineRef.current?.filmed && (src.type === "palette" || src.type === "token")) {
      const ov = document.querySelector('.cam-overlay[data-side="mine"]');
      const r = ov?.getBoundingClientRect();
      const inside = r && e && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        if (src.type !== "token") return;
        if (loc?.area === "opp") return setToast("Chacun ne joue que sur son côté du plateau.");
        return editMark(src.id, "delete");
      }
      const v = videoPointAt(ov, e.clientX, e.clientY);
      if (!v) return setToast("La caméra n'est pas encore connectée : les jetons se posent sur l'image de votre tapis.");
      const pos = { on: "v", dx: 0, dy: 0, x: Math.round(v[0] * 1000), y: Math.round(v[1] * 1000) };
      if (src.type === "palette") {
        addMark({ side: mySide, color: src.color, v: 1, ...pos });
        return mut(() => `pose ${tokDesc({ color: src.color, ...pos })} (valeur 1)`);
      }
      return editMark(src.id, { side: mySide, ...pos });
    }
    if (src.type === "palette") {
      if (!loc || loc.area === "hand") return;
      if (loc.area === "opp") return setToast("Chacun ne joue que sur son côté du plateau.");
      const a = attachAt(mySide, clamp(loc.x, 4, MAT_W - 4), clamp(loc.y, 4, MAT_H - 4));
      addMark({ side: mySide, color: src.color, v: 1, ...a });
      return mut(() => `pose ${tokDesc({ color: src.color, ...a })} (valeur 1)`);
    }
    if (src.type === "token") {
      if (loc?.area === "opp") return setToast("Chacun ne joue que sur son côté du plateau.");
      if (!loc || loc.area === "hand") return editMark(src.id, "delete");
      const tk = tokRef.current.find((t) => t.id === src.id);
      if (tk?.label) return editMark(src.id, { side: mySide, on: null, dx: 0, dy: 0, x: clamp(loc.x, 15, MAT_W - 15), y: clamp(loc.y, 6, MAT_H - 6) });
      return editMark(src.id, { side: mySide, ...attachAt(mySide, clamp(loc.x, 4, MAT_W - 4), clamp(loc.y, 4, MAT_H - 4), src.id) });
    }
    if (src.type === "reserve") {
      if (!loc || loc.area !== "mine") return;
      if (pileAt(loc.x, loc.y)) return setToast("Les cartes jetons se posent sur le tapis.");
      return createFromReserve(src.tid, loc.x, loc.y);
    }
    // une de mes cartes en jeu lâchée sur le côté adverse : attaque (raccourci du bouton « ⚔ Attaquer »)
    if (src.type === "board" && e && overOpp(e.clientX, e.clientY)) {
      const to = targetAt(e.clientX, e.clientY);
      if (to && to.s === "opp") return addArrow({ iid: src.iid, k: "atk" }, to);
      return setToast("Relâchez sur une carte, un territoire ou le compteur adverse pour attaquer.");
    }
    const st = mineRef.current;
    let iid, from;
    if (src.type === "hand") { iid = src.iid; from = "hand"; }
    else if (src.type === "inv") { iid = src.iid; from = "inv"; }
    else if (src.type === "board") { iid = src.iid; from = "board"; }
    else if (src.type === "pile") { iid = topOf(st, src.pile); from = src.pile; }
    if (!iid || !loc) return;
    if (loc.area === "hand") {
      if (from !== "hand") toHand(iid, from);
      return;
    }
    if (loc.area === "opp") return setToast("Chacun ne joue que sur son côté du plateau.");
    const p = pileAt(loc.x, loc.y);
    if (p) {
      if (p.id !== from) toPile(iid, p.id, from);
      return;
    }
    placeOnBoard(iid, loc.x, loc.y, from);
  }

  function tap(src) {
    const o = oppRef.current;
    if (aim) {
      if (src.type === "board") {
        if (!aim.v && src.iid === aim.iid) return setAim(null);
        return aimAt({ s: "me", iid: src.iid });
      }
      if (src.type === "oppboard") return aimAt({ s: "opp", iid: src.iid });
      return setToast("Touchez une carte, un territoire ou le compteur adverse.");
    }
    switch (src.type) {
      case "hand":
        return setSheet({ kind: "card", iid: src.iid, zone: "hand" });
      case "inv":
        return setSheet({ kind: "card", iid: src.iid, zone: "inv" });
      case "board":
        return setSheet({ kind: "card", iid: src.iid, zone: "board" });
      case "oppboard": {
        const b = o?.board.find((x) => x.iid === src.iid);
        if (!b) return;
        if (b.down) return setToast("Carte face cachée (appui long pour la signaler)");
        return setSheet({ kind: "view", c: o.cards[src.iid], ping: { owner: "opp", iid: src.iid } });
      }
      case "pile":
        if (src.side === "mine") return setSheet(src.pile === "deck" ? { kind: "deck" } : src.pile === "atlas" ? { kind: "atlas" } : { kind: "pile", pile: src.pile, side: "mine" });
        if (src.pile === "deck") return setToast(`${TCG === "sorcery" ? "Grimoire" : "Deck"} adverse : ${o?.deck.length || 0} carte(s)`);
        if (src.pile === "atlas") return setToast(`Atlas adverse : ${o?.piles?.atlas?.length || 0} site(s)`);
        return setSheet({ kind: "pile", pile: src.pile, side: "opp" });
      case "token": {
        const t = tokRef.current.find((x) => x.id === src.id);
        return setSheet(t?.label ? { kind: "marker", id: src.id } : { kind: "token", id: src.id });
      }
      case "opptoken": {
        const t = tokRef.current.find((x) => x.id === src.id);
        if (t?.label) return setToast(`Marqueur adverse : ${t.label}${t.v ? ` ${t.v}` : ""}`);
        return t && setToast(`Jeton adverse : ${t.v}`);
      }
      case "reserve": {
        const tpl = mineRef.current?.reserve.find((r) => r.tid === src.tid);
        return tpl && setSheet({ kind: "view", c: tpl, hint: "Faites glisser la carte jeton sur le tapis pour en créer une copie." });
      }
      case "palette":
        return setToast("Faites glisser le jeton sur un tapis.");
      default:
    }
  }

  // ---------- Partage ----------
  const joinLink = meta ? `${window.location.origin}${window.location.pathname}?join=${meta.code}` : "";
  // Lien spectateur (lecture seule, sans compte) : à partager sur Discord
  const watchLink = meta ? `${window.location.origin}${window.location.pathname}?voir=${meta.code}` : "";
  async function shareWatch() {
    try {
      if (navigator.share) await navigator.share({ title: "Regarder la partie", text: "Partie de Safir en direct", url: watchLink });
      else {
        await navigator.clipboard.writeText(watchLink);
        setToast("Lien spectateur copié");
      }
    } catch (_) {}
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Rejoins ma partie", text: `Code : ${meta.code}`, url: joinLink });
      else {
        await navigator.clipboard.writeText(joinLink);
        setToast("Lien copié");
      }
    } catch (_) {}
  }

  // ---------- Rendu ----------
  const myTokens = tokens.filter((t) => t.side === mySide);
  const nMyTok = myTokens.filter((t) => !t.label).length;
  const oppTokens = tokens.filter((t) => t.side !== mySide);
  const frozen = frozenTerritories(tokens);
  const ticker = opp?.log?.length ? logLine(opp.name, opp.log[opp.log.length - 1].m) : "";

  return (
    <div
      className={`table ${cardBackOf(user) ? "has-back" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={() => { unlockAudio(); audioOut.resume(); }}
      style={{ WebkitTouchCallout: "none", ...(cardBackOf(user) ? { "--card-back": `url("${cardBackOf(user)}")` } : null) }}
    >
      <div className="tbar">
        <button className="btn sm ghost icon" onClick={() => go("home")} aria-label="Quitter">←</button>
        {opp ? (
          <>
            <div className="who">
              <b>{opp.name}</b>
              <span className="muted" style={{ fontSize: 11 }}>{opp.filmed ? "cartes réelles, filmées" : `main ${opp.hand.length} · deck ${opp.deck.length}`}</span>
            </div>
          </>
        ) : (
          <span className="muted">En attente d'un adversaire</span>
        )}
        <div
          className="ticker"
          onClick={() => (wide ? setPanel("log") : setSheet({ kind: "log" }))}
          title="Ouvrir le journal"
          style={{ cursor: "pointer" }}
        >
          {offline ? "⚠ connexion perdue, nouvel essai…" : ticker}
        </div>
        {focus && (
          <div className="zoom">
            <button onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Dézoomer" disabled={zoom === 0}>−</button>
            <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoomer" disabled={zoom === ZOOMS.length - 1}>+</button>
            <button className="back" onClick={() => setFocus(null)} aria-label="Vue d'ensemble">⤡ Les 2 tapis</button>
          </div>
        )}
        {watching > 0 && (
          <span key={watching} className="watch-chip pop" title={`${watching} spectateur${watching > 1 ? "s" : ""} regarde${watching > 1 ? "nt" : ""} la partie`}>
            👁 {watching}
          </span>
        )}
        <button
          className={`btn sm ${wide && panel === "rules" ? "on" : ""}`}
          onClick={() => (wide ? setPanel((p) => (p === "rules" ? "hand" : "rules")) : setSheet({ kind: "rules" }))}
          aria-label="Règles"
          title="Rappel des règles"
        >
          📖
        </button>
        {meta?.solo && (
          <button className="btn sm primary solo-switch" onClick={switchSide} title="Jouer l'autre deck">
            ⇄ {opp?.name ? (opp.name.length > 14 ? `${opp.name.slice(0, 13)}…` : opp.name) : "Autre côté"}
          </button>
        )}
        {rtc.ok && !meta?.solo && (
          <button
            className={`btn sm voice-btn ${rtc.mic ? "on" : ""} ${!rtc.mic && rtc.oppMic ? "ping" : ""}`}
            onClick={() => setSheet({ kind: "voice" })}
            aria-label="Vocal en direct"
            title="Vocal en direct"
          >
            🎧
          </button>
        )}
        {canRecord() && !meta?.solo && <TalkButton onClip={sendVoice} setToast={setToast} />}
        {!meta?.solo && opp && <ReactionPicker onPick={sendReaction} />}
        <button className="btn sm chat-btn" onClick={() => setSheet({ kind: "chat" })} aria-label="Tchat">
          💬{unread + (trMute ? 0 : trUnread) > 0 && <span className="unread">{unread + (trMute ? 0 : trUnread)}</span>}
        </button>
        <button className="btn sm" onClick={() => setSheet({ kind: "menu" })} aria-label="Menu">☰</button>
      </div>

      <div className="main-area" ref={mainRef}>
        <div className="viewport" ref={vpRef}>
          {(() => {
            const L = boardLayout(landscape, focus, s);
            const waiting = !opp && meta ? (
              <div className="waiting" style={{ top: 0, bottom: 0 }}>
                <div>Partagez ce code avec votre adversaire</div>
                <div className="code">{meta.code}</div>
                <button className="btn sm" style={{ pointerEvents: "auto" }} onClick={share}>Partager le lien</button>
                {meta.open && <div className="small">Table ouverte : les autres joueurs la voient dans « Tables ouvertes » et peuvent s'asseoir.</div>}
                <div className="small">Vous pouvez déjà préparer votre jeu.</div>
                <PushToggle compact />
              </div>
            ) : null;
            // Loupe : sur le bord haut de mon tapis, à droite, à cheval sur l'espace entre les deux tapis (elle ne cache
            // aucune carte) ; pour l'adversaire, dans sa barre PI/PV, car son coin haut droit est sa zone Commandant
            const loupe = (which, m, inPanel) => (
              <button
                className={`loupe-btn ${inPanel ? "in-panel" : "edge"}`}
                style={inPanel ? null : { left: m.left + MAT_W * s - 34, top: Math.max(0, m.top - 15) }}
                onClick={() => (focus ? setFocus(null) : openFocus(which))}
                aria-label={focus ? "Revenir aux deux tapis" : "Agrandir ce tapis"}
              >
                {focus ? "⤡" : "🔍"}
              </button>
            );
            const aimPanel = (side) => (aim ? () => aimAt({ s: side === "mine" ? "me" : "opp", p: true }) : null);
            return (
              <div className="board" key={TCG} style={{ width: L.w, height: L.h, marginTop: 6, marginBottom: 6 }} onPointerDown={boardDown} onContextMenu={(e) => e.preventDefault()}>
                {L.opp && (
                  <>
                    <ScorePanel st={opp} back={oppLook.back} hand={opp && !opp.filmed ? opp.hand.length : null} layout={L.mode} box={L.opp.panel} onAim={aimPanel("opp")} onUnif={() => opp?.unif && setToast(`${opp.name} : Unification ${opp.unif} (${UNIF_BONUS[opp.unif]})`)} extra={<>{!L.shared && loupe("opp", L.opp.mat, true)}{(oppLook.bg || oppLook.back) && <ReportButton inline onClick={() => setReportOpen(true)} />}</>} />
                    <Mat side="opp" st={opp} vs={mine} bg={L.shared ? SORC_REALM_BG : oppLook.bg} back={oppLook.back} s={s} top={L.opp.mat.top} left={L.opp.mat.left} tokens={oppTokens} frozen={frozen} hover={hover} dragKey={dragKey} onPress={press} matRef={oppMatRef} waiting={waiting} pings={pings.filter((x) => x.owner === "opp")} aiming={!!aim} flipX={L.shared} layer={L.shared ? "base" : undefined} p1View={mySide === "p1"} />
                    {opp?.filmed && (
                      <CamOverlay
                        left={L.opp.mat.left} top={L.opp.mat.top} w={MAT_W * s} h={MAT_H * s}
                        stream={rtc.oppCam?.stream} state={rtc.oppCam?.state} rot={((opp.camRot || 0) + (mirrorMine ? 180 : 0)) % 360} name={opp.name}
                        side="opp" onGeom={(g) => setCamGeo((c) => ({ ...c, opp: g }))} onZoom={() => setCamZoom("opp")}
                        waitText={rtc.ok ? `En attente de la caméra de ${opp.name}…` : "Ce navigateur ne permet pas la vidéo en direct."}
                      />
                    )}
                    {opp?.filmed && (
                      <VideoTokens
                        tokens={oppTokens.filter((t) => t.on === "v")} box={{ left: L.opp.mat.left, top: L.opp.mat.top, w: MAT_W * s, h: MAT_H * s }}
                        geo={camGeo.opp} s={s} dragKey={dragKey} onPress={press} type="opptoken"
                      />
                    )}
                  </>
                )}
                {L.mine && (
                  <>
                    <Mat side="mine" flipX={mirrorMine} st={mine} vs={opp} bg={L.shared ? null : matBgOf(user)} back={cardBackOf(user)} s={s} top={L.mine.mat.top} left={L.mine.mat.left} tokens={myTokens} frozen={frozen} hover={hover} dragKey={dragKey} onPress={press} matRef={myMatRef} pings={pings.filter((x) => x.owner === "mine")} aiming={!!aim} layer={L.shared ? "top" : undefined} />
                    {mine?.filmed && (
                      <CamOverlay
                        left={L.mine.mat.left} top={L.mine.mat.top} w={MAT_W * s} h={MAT_H * s}
                        stream={rtc.myCam?.stream} state={rtc.myCam?.state} rot={mine.camRot || 0} onRot={flipCam} name="votre caméra"
                        side="mine" onGeom={(g) => setCamGeo((c) => ({ ...c, mine: g }))} onZoom={() => setCamZoom("mine")}
                      >
                        <CamSetup link={rtc.camLink} compact={MAT_H * s < 260} />
                      </CamOverlay>
                    )}
                    {mine?.filmed && (
                      <VideoTokens
                        tokens={myTokens.filter((t) => t.on === "v")} box={{ left: L.mine.mat.left, top: L.mine.mat.top, w: MAT_W * s, h: MAT_H * s }}
                        geo={camGeo.mine} s={s} dragKey={dragKey} onPress={press} type="token"
                      />
                    )}
                    <ScorePanel st={mine} mine back={cardBackOf(user)} layout={L.mode} box={L.mine.panel} onSet={setTrack} onAim={aimPanel("mine")} onUnif={cycleUnif} />
                    {!L.shared && loupe("mine", L.mine.mat)}
                  </>
                )}
                <Arrows L={L} s={s} mine={mine} opp={opp} aim={aim} cams={camGeo} flipMine={mirrorMine} />
                {L.opp && <SignalBadge st={opp} box={{ left: L.opp.mat.left, top: L.opp.mat.top, w: MAT_W * s, h: MAT_H * s }} />}
                {L.mine && <SignalBadge st={mine} mine box={{ left: L.mine.mat.left, top: L.mine.mat.top, w: MAT_W * s, h: MAT_H * s }} onClear={() => setSignal(null)} />}
                {camZoom === "opp" && opp?.filmed && rtc.oppCam?.stream && (
                  <ZoomView stream={rtc.oppCam.stream} rot={((opp.camRot || 0) + (mirrorMine ? 180 : 0)) % 360} title={`Tapis de ${opp.name}`} onClose={() => setCamZoom(null)} />
                )}
                {camZoom === "mine" && mine?.filmed && rtc.myCam?.stream && (
                  <ZoomView stream={rtc.myCam.stream} rot={mine.camRot || 0} title="Mon tapis filmé" onClose={() => setCamZoom(null)} />
                )}
              </div>
            );
          })()}
        </div>

        <div className="side">
          <PhaseBar st={mine} opp={opp} onPhase={setPhase} onEnd={endTurn} onClear={() => clearArrows()} extra={opp && !meta?.solo ? <SignalButton st={mine} onSignal={setSignal} /> : null} />
          {opp && !meta?.solo && <SignalBar st={mine} onSignal={setSignal} />}
          {mine?.filmed ? (
            <>
            <div className="controls">
              {TCG === "safir" && <button className="btn sm" onClick={() => setSheet({ kind: "marker" })} title="Marqueur de territoire (Gel, Bloqué…)">＋ Marqueur</button>}
              <div className="palette" title="Jetons : faites glisser sur l'image de votre tapis">
                {TOKEN_COLORS.map((c) => (
                  <div
                    key={c.id}
                    className="tok"
                    style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${c.hex} 55%)` }}
                    onPointerDown={(e) => press(e, { type: "palette", color: c.id })}
                    aria-label={`Jeton ${c.label}`}
                  />
                ))}
              </div>
              {TCG === "safir" && nMyTok > 0 && (
                <button className="btn sm ghost clr-tok" onClick={clearMyTokens} title="Retirer tous mes jetons de couleur (les marqueurs restent)">✕ Jetons ({nMyTok})</button>
              )}
            </div>
            <FilmedSide
              cam={rtc.myCam}
              onQr={() => setSheet({ kind: "camqr" })}
              onShow={() => setSheet({ kind: "showpick" })}
              onPv0={mine.pv ? () => setTrack("pv", 0) : null}
              pvLabel={counterLabel("pv")}
              wide={wide}
              journal={<Journal mine={mine} opp={opp} />}
            />
            </>
          ) : (
          <>
          <div className="controls">
            <button className="btn sm primary" onClick={() => draw(1)} disabled={!mine}>
              Piocher <span style={{ opacity: 0.7 }}>({mine?.deck.length ?? 0})</span>
            </button>
            {TCG === "safir" && <button className="btn sm" onClick={() => setSheet({ kind: "marker" })} title="Marqueur de territoire (Gel, Bloqué…)">＋ Marqueur</button>}
            <div className="palette" title="Jetons : faites glisser sur une carte ou un tapis">
              {TOKEN_COLORS.map((c) => (
                <div
                  key={c.id}
                  className="tok"
                  style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${c.hex} 55%)` }}
                  onPointerDown={(e) => press(e, { type: "palette", color: c.id })}
                  aria-label={`Jeton ${c.label}`}
                />
              ))}
            </div>
            {TCG === "safir" && nMyTok > 0 && (
              <button className="btn sm ghost clr-tok" onClick={clearMyTokens} title="Retirer tous mes jetons de couleur (les marqueurs restent)">✕ Jetons ({nMyTok})</button>
            )}
          </div>
          {(mine?.reserve?.length > 0 || wide || mine?.piles?.inv?.length > 0) && (
            <div className="controls2">
              <div className="hand-tabs">
                <button className={panel === "hand" ? "on" : ""} onClick={() => setPanel("hand")}>Main {mine?.hand.length ?? 0}</button>
                {mine?.piles?.inv?.length > 0 && (
                  <button className={panel === "inv" ? "on" : ""} onClick={() => setPanel("inv")}>Inventaire {mine.piles.inv.length}</button>
                )}
                {mine?.reserve?.length > 0 && (
                  <button className={panel === "reserve" ? "on" : ""} onClick={() => setPanel("reserve")}>Réserve {mine.reserve.length}</button>
                )}
                {wide && <button className={panel === "log" ? "on" : ""} onClick={() => setPanel("log")}>📜 Journal</button>}
                {wide && <button className={panel === "rules" ? "on" : ""} onClick={() => setPanel("rules")}>📖 Règles</button>}
              </div>
            </div>
          )}
          {wide && panel === "rules" ? (
            <RulesPanel />
          ) : wide && panel === "log" ? (
            <div className="side-log"><Journal mine={mine} opp={opp} /></div>
          ) : (
          <div
            ref={handRef}
            className={`hand ${hover?.area === "hand" ? "drop-on" : ""}`}
            style={handH ? { height: handH, "--hc-h": `${Math.min(handH - 18, 190)}px` } : null}
          >
            {panel === "inv" && mine?.piles?.inv?.length > 0 ? (
              mine.piles.inv.map((iid) => {
                const c = mine.cards[iid];
                return (
                  <div
                    key={iid}
                    className={`hcard ${c?.o === "l" ? "l" : ""} ${dragKey === `inv:${iid}` ? "dragging" : ""}`}
                    onPointerDown={(e) => press(e, { type: "inv", iid })}
                  >
                    <img src={cardUrl(c)} alt="" draggable={false} />
                  </div>
                );
              })
            ) : panel === "reserve" && mine?.reserve?.length > 0 ? (
              mine.reserve.map((r) => (
                <div
                  key={r.tid}
                  className={`hcard ${r.o === "l" ? "l" : ""}`}
                  style={{ position: "relative" }}
                  onPointerDown={(e) => press(e, { type: "reserve", tid: r.tid })}
                >
                  <img src={cardUrl(r)} alt="" draggable={false} />
                  <span className="badge">∞</span>
                </div>
              ))
            ) : (
              <>
                {mine && mine.hand.length === 0 && <span className="hand-empty">Main vide. Touchez « Piocher » ou faites glisser le deck ici.</span>}
                {mine?.hand.map((iid) => {
                  const c = mine.cards[iid];
                  return (
                    <div
                      key={iid}
                      className={`hcard ${c?.o === "l" ? "l" : ""} ${dragKey === `hand:${iid}` ? "dragging" : ""}`}
                      onPointerDown={(e) => press(e, { type: "hand", iid })}
                    >
                      <img src={cardUrl(c)} alt="" draggable={false} />
                    </div>
                  );
                })}
              </>
            )}
          </div>
          )}
          </>
          )}
        </div>
      </div>

      <svg ref={lineRef} className="drag-line" style={{ display: "none" }} aria-hidden="true">
        <line x1="0" y1="0" x2="0" y2="0" />
        <circle cx="0" cy="0" r="9" />
      </svg>
      {ghost?.pill && (
        <div ref={ghostRef} className="drag-ghost pill tmarker" style={{ left: ghost.x, top: ghost.y, borderColor: TOKEN_HEX[ghost.color] || "#ccc", fontSize: 13 }}>
          {MARKER_ICON[ghost.label] ? `${MARKER_ICON[ghost.label]} ` : ""}{ghost.label}{ghost.v ? <b>{ghost.v}</b> : null}
        </div>
      )}
      {ghost && !ghost.pill && (
        <div
          ref={ghostRef}
          className={`drag-ghost ${ghost.tok ? "tok" : ""}`}
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.w,
            height: ghost.h,
            ...(ghost.tok
              ? { background: `radial-gradient(circle at 35% 30%, #fff8, ${TOKEN_HEX[ghost.color]} 55%)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#111", fontSize: ghost.w * 0.48 }
              : {}),
          }}
        >
          {ghost.tok ? ghost.v : ghost.src ? <img src={ghost.src} alt="" /> : <div className="back" />}
        </div>
      )}

      {aim && (
        <div className="aim-bar">
          <span>{aim.k === "atk" ? "⚔ Attaque" : "🎯 Ciblage"} {aim.v ? "depuis votre tapis filmé" : <>avec « {mine?.cards[aim.iid]?.n} »</>} : touchez la cible ({TCG !== "safir" ? "carte ou compteur adverse" : "carte, territoire ou compteur adverse"})</span>
          <button className="btn sm" onClick={() => setAim(null)}>Annuler</button>
        </div>
      )}
      {bubble && (
        <div
          className="bubble"
          key={bubble.k}
          style={(() => {
            const r = oppMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
            return r ? { top: r.top + 10, left: r.left + r.width / 2 } : null;
          })()}
          onClick={() => { setBubble(null); setSheet({ kind: "chat" }); }}
        >
          <b>{bubble.name}</b> {bubble.text}
        </div>
      )}
      {trBubble && !trMute && (
        <div
          className="bubble tribune"
          key={trBubble.k}
          style={(() => {
            const r = oppMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
            return r ? { top: r.top + (bubble ? 58 : 10), left: r.left + r.width / 2 } : null;
          })()}
          onClick={() => { setTrBubble(null); setSheet({ kind: "chat", tab: "trib" }); }}
        >
          📣 <b>{trBubble.name}</b> {trBubble.text}
        </div>
      )}
      {speaking && (
        <div
          className="bubble voice"
          style={(() => {
            const r = oppMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
            return r ? { top: r.top + 10, left: r.left + r.width / 2 } : null;
          })()}
        >
          🔊 <b>{speaking.name}</b> parle{speaking.dur ? ` (${Math.round(speaking.dur)} s)` : ""}…
        </div>
      )}
      {banner && (
        <div
          className="banner"
          style={(() => {
            const r = myMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
            return r ? { top: r.top + r.height / 2, left: r.left + r.width / 2 } : null;
          })()}
          onClick={() => setBanner("")}
        >
          {banner}
        </div>
      )}
      {winner && (
        <div className="win-back" onClick={() => setWinner(null)}>
          <div className="win">
            <div className="cup">🏆</div>
            <h2>{winner.mine ? "Victoire !" : `${winner.name} gagne`}</h2>
            {winner.fab ? (
              <p className="muted">{winner.mine ? `${winner.loser} n'a plus de points de vie.` : "Votre héros n'a plus de points de vie."}</p>
            ) : (
              <p className="muted">{winner.mine ? "Vous atteignez" : `${winner.name} atteint`} {WIN_PV} PV.</p>
            )}
            {!meta?.solo && result && <p className="small muted">{result === "win" ? "Victoire" : "Défaite"} comptée pour « {mine?.deckName || "votre deck"} » (bilan privé, modifiable dans ☰).</p>}
            <button className="btn primary">Fermer</button>
          </div>
        </div>
      )}

      {/* Message au milieu du tapis adverse : ne masque ni les compteurs PI/PV ni la main */}
      <Toast
        text={toast}
        onDone={() => setToast("")}
        className="act"
        ms={3500}
        style={(() => {
          const r = oppMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
          return r ? { top: Math.max(r.top + 40, r.top + r.height / 2), left: r.left + r.width / 2 } : null;
        })()}
      />
      <PhaseFlash flash={phaseFlash} onDone={() => setPhaseFlash(null)} />
      <ReactionLayer items={reacts} />
      <ReportSheet
        open={reportOpen} onClose={() => setReportOpen(false)} me={user.id} target={oppId} name={opp?.name} look={oppLook} game={gameId}
        onDone={(kinds) => { kinds.forEach((k) => looks.hide(oppId, k)); setToast("Merci : l'image est masquée et sera vérifiée par l'administrateur."); }}
      />
      {err && (
        <div className="toast" style={{ borderColor: "var(--danger)", pointerEvents: "auto", whiteSpace: "normal", borderRadius: 10 }} onClick={() => setErr("")}>{err}</div>
      )}

      <TableSheets
        sheet={sheet}
        setSheet={setSheet}
        mine={mine}
        opp={opp}
        tokens={tokens}
        meta={meta}
        messages={messages}
        userId={user.id}
        tribune={{ list: tribune, unread: trUnread, mute: trMute, setMute: muteTribune, see: seeTribune, watching }}
        rtc={rtc}
        gameTcg={TCG}
        setToast={setToast}
        result={result}
        onResult={recordResult}
        actions={{
          draw, shuffleDeck, toHand, toPile, placeFree, toggleTap, flipCard, resetMine, share, updMark, delMark, go, removeTokenCard, showCard,
          startAim, clearArrows, pingCard, mulligan, setCardUnif, setCardBonus, coin, sendMsg, addMarker, peekDeck, editMark, shareWatch, hasOpp: !!opp, drawUpTo, pitchToDeck, drawAtlas, shuffleAtlas, peekAtlas, showScan,
        }}
      />
    </div>
  );
}

function TableSheets({ sheet, setSheet, mine, opp, tokens, meta, actions, messages, userId, tribune, rtc, setToast, result, onResult }) {
  const close = () => setSheet(null);
  const A = actions;
  if (!sheet) return null;

  if (sheet.kind === "vaim") {
    return (
      <Sheet open onClose={close} title="Depuis ce point de votre tapis">
        <p className="muted small" style={{ marginTop: 0 }}>Une flèche part de l'endroit touché sur votre image : votre adversaire la voit au même endroit.</p>
        <div className="row">
          <button className="btn atk grow" onClick={() => A.startAim({ v: sheet.v }, "atk")}>⚔ Attaquer</button>
          <button className="btn cib grow" onClick={() => A.startAim({ v: sheet.v }, "cib")}>🎯 Cibler</button>
        </div>
      </Sheet>
    );
  }
  if (sheet.kind === "voice") return <VoiceSheet onClose={close} rtc={rtc} opp={opp} watching={tribune.watching} setToast={setToast} />;
  if (sheet.kind === "camqr") {
    return (
      <Sheet open onClose={close} title="Caméra de votre table">
        <CamSetup link={rtc.camLink} />
        <p className="muted small">État : {camState(rtc.myCam)}</p>
      </Sheet>
    );
  }
  if (sheet.kind === "showpick") return <ShowPickSheet onClose={close} userId={userId} onPick={(rec) => { A.showScan(rec); close(); }} />;

  if (sheet.kind === "card" && mine) {
    const { iid, zone } = sheet;
    const c = mine.cards[iid];
    const b = mine.board.find((x) => x.iid === iid);
    const run = (f) => () => { f(); close(); };
    const btns = [];
    const nArrows = (mine.arrows || []).filter((a) => a.from === iid).length;
    const aimBtns = b ? (
      <div className="actions" style={{ marginBottom: 8 }}>
        <button className="btn atk" onClick={() => A.startAim(iid, "atk")}>⚔ Attaquer</button>
        <button className="btn cib" onClick={() => A.startAim(iid, "cib")}>🎯 Cibler</button>
        <button className="btn" onClick={run(() => A.pingCard("mine", iid))}>📍 Signaler</button>
        {nArrows > 0 && <button className="btn" onClick={run(() => A.clearArrows(iid))}>Retirer ses flèches ({nArrows})</button>}
        <span className="muted small aim-tip">Raccourci : glissez la carte sur l'adversaire pour attaquer ; à la souris, clic droit maintenu et glissé pour cibler.</span>
      </div>
    ) : null;
    if (zone === "hand") {
      if (A.hasOpp) btns.push(["Montrer à l'adversaire", () => A.showCard(iid)]);
    } else if (zone === "board" && b) {
      btns.push([b.rot ? "Dégager" : "Engager", () => A.toggleTap(iid)]);

      btns.push([b.down ? "Révéler" : "Face cachée", () => A.flipCard(iid)]);
    }
    if (c?.tok) {
      if (zone !== "board") btns.push(["Sur le plateau", () => A.placeFree(iid, zone)]);
      btns.push(["Retirer le jeton du jeu", () => A.removeTokenCard(iid)]);
    }
    if (!c?.tok) {
      if (zone !== "hand") btns.push(["En main", () => A.toHand(iid, zone)]);
      if (zone !== "board") btns.push(["Sur le plateau", () => A.placeFree(iid, zone)]);
      if (zone !== "board") btns.push(["Poser face cachée", () => A.placeFree(iid, zone, true)]);
      if (TCG === "sorcery") {
        if (zone !== "grave") btns.push(["Cimetière", () => A.toPile(iid, "grave", zone)]);
        if (zone !== "banish") btns.push(["Bannir", () => A.toPile(iid, "banish", zone)]);
      } else if (TCG === "fab") {
        for (const p of PILE_IDS) if (p !== zone) btns.push([pileName(p), () => A.toPile(iid, p, zone)]);
        if (c?.arena && zone !== "inv") btns.push(["Inventaire", () => A.toPile(iid, "inv", zone)]);
      } else for (const p of ["d1", "d2", "d3"]) if (p !== zone) btns.push([PILE_NAMES[p], () => A.toPile(iid, p, zone)]);
      if (TCG === "sorcery" && c?.site) {
        btns.push(["Dessus de l'atlas", () => A.toPile(iid, "atlas", zone)]);
        btns.push(["Dessous de l'atlas", () => A.toPile(iid, "atlas", zone, true)]);
      } else {
        btns.push([TCG === "sorcery" ? "Dessus du grimoire" : "Dessus du deck", () => A.toPile(iid, "deck", zone)]);
        btns.push([TCG === "sorcery" ? "Dessous du grimoire" : "Dessous du deck", () => A.toPile(iid, "deck", zone, true)]);
      }
    }
    // Unification d'un combattant (Safir) : jetons ATK / Valeur / DEF avec les bonus du niveau
    const unifBtns = zone === "board" && b && TCG === "safir" && !c?.tok && !c?.cmd ? (
      <div className="unif-row">
        <span className="muted small">Unification :</span>
        {[1, 2, 3].map((n) => (
          <button key={n} className={`btn sm ${b.u === n ? "primary" : ""}`} onClick={run(() => A.setCardUnif(iid, n))} title={UNIF_BONUS[n]}>Unif {n}</button>
        ))}
        {b.u ? <button className="btn sm ghost" onClick={run(() => A.setCardUnif(iid, 0))}>Retirer</button> : null}
        <span className="muted small unif-legend">3 jetons posés sur ATK · Valeur · DEF, bonus compris, à la couleur de la sous-faction : <i className="dot red" /> Yan · <i className="dot blue" /> Tian · <i className="dot green" /> Lin</span>
        <div className="bonus-row">
          <span className="muted small">Bonus d'autres cartes :</span>
          {[["a", "ATK"], ["v", "VAL"], ["d", "DEF"]].map(([k, l]) => {
            const n = b.bx?.[k] || 0;
            return (
              <span key={k} className="bonus-step">
                <button className="btn sm" onClick={() => A.setCardBonus(iid, k, -1)} aria-label={`${l} moins 1`}>−</button>
                <span className={`bonus-val ${n > 0 ? "up" : n < 0 ? "down" : ""}`}>{l} {n > 0 ? `+${n}` : n}</span>
                <button className="btn sm" onClick={() => A.setCardBonus(iid, k, 1)} aria-label={`${l} plus 1`}>+</button>
              </span>
            );
          })}
          {b.bx ? <button className="btn sm ghost" onClick={() => A.setCardBonus(iid, null)}>Retirer les bonus</button> : null}
        </div>
      </div>
    ) : null;
    return (
      <Sheet open onClose={close} title={c?.n}>
        <ZoomPreview src={cardUrl(c, true)} alt={c?.n} />
        {aimBtns}
        {unifBtns}
        <div className="actions">
          {btns.map(([label, f]) => (
            <button key={label} className="btn" onClick={run(f)}>{label}</button>
          ))}
        </div>
      </Sheet>
    );
  }

  if (sheet.kind === "view") {
    return (
      <Sheet open onClose={close} title={sheet.title || sheet.c?.n}>
        <ZoomPreview src={cardUrl(sheet.c, true)} alt={sheet.c?.n} />
        {sheet.hint && <p className="muted small" style={{ textAlign: "center" }}>{sheet.hint}</p>}
        {sheet.ping && (
          <button className="btn" style={{ width: "100%" }} onClick={() => { A.pingCard(sheet.ping.owner, sheet.ping.iid); close(); }}>
            📍 Signaler cette carte
          </button>
        )}
      </Sheet>
    );
  }

  // Sorcery : atlas (deck de sites), caché comme le grimoire
  if (sheet.kind === "atlas" && mine) {
    const run = (f) => () => { f(); close(); };
    const n = mine.piles.atlas?.length || 0;
    return (
      <Sheet open onClose={close} title={`Mon atlas · ${n} site(s)`}>
        <div className="actions">
          {[1, 3].map((k) => (
            <button key={k} className="btn" onClick={run(() => A.drawAtlas(k))} disabled={!n}>Piocher {k} site{k > 1 ? "s" : ""}</button>
          ))}
          <button className="btn" onClick={run(A.shuffleAtlas)}>Mélanger</button>
          <button className="btn" onClick={A.peekAtlas}>Chercher dans l'atlas</button>
        </div>
        <p className="muted small deck-top-lbl">Mettre le site du dessus de l'atlas, face visible, dans :</p>
        <div className="actions">
          <button className="btn" disabled={!n} onClick={() => A.toPile(mine.piles.atlas[n - 1], "grave", "atlas")}>→ Cimetière</button>
          <button className="btn" disabled={!n} onClick={() => A.toPile(mine.piles.atlas[n - 1], "banish", "atlas")}>→ Bannies</button>
        </div>
        <p className="muted small">Pour jouer un site : glissez le dessus de l'atlas sur une case du royaume, ou piochez-le puis posez-le depuis votre main.</p>
      </Sheet>
    );
  }

  if (sheet.kind === "deck" && mine) {
    const run = (f) => () => { f(); close(); };
    const DK = TCG === "sorcery" ? "grimoire" : "deck";
    return (
      <Sheet open onClose={close} title={`Mon ${DK} · ${mine.deck.length} carte(s)`}>
        <div className="actions">
          {(TCG === "fab" ? [1, 2, 4] : TCG === "sorcery" ? [1, 3] : [1, 3, 5, 7]).map((n) => (
            <button key={n} className="btn" onClick={run(() => A.draw(n))} disabled={!mine.deck.length}>Piocher {n}</button>
          ))}
          {TCG === "fab" && <button className="btn" onClick={run(() => A.drawUpTo(4))} disabled={!mine.deck.length}>Main à 4 cartes</button>}
          <button className="btn" onClick={run(A.shuffleDeck)}>Mélanger</button>
          <button className="btn" onClick={A.peekDeck}>Chercher dans le {DK}</button>
          {TCG === "safir" && <button className="btn" onClick={() => setSheet({ kind: "mull" })} disabled={!mine.hand.length}>Mulligan{mine.mull ? " (déjà fait)" : ""}</button>}
        </div>
        <p className="muted small deck-top-lbl">Mettre la carte du dessus du {DK}, face visible, dans :</p>
        <div className="actions">
          {(TCG !== "safir" ? ["grave", "banish"] : ["d1", "d2", "d3"]).map((pid) => (
            <button
              key={pid}
              className="btn"
              disabled={!mine.deck.length}
              onClick={() => A.toPile(mine.deck[mine.deck.length - 1], pid, "deck")}
            >
              → {pileName(pid)}
            </button>
          ))}
        </div>
        <p className="muted small">La fenêtre reste ouverte : touchez plusieurs fois pour défausser plusieurs cartes. Le journal indique chaque carte.</p>
      </Sheet>
    );
  }

  if (sheet.kind === "pile") {
    const st = sheet.side === "mine" ? mine : opp;
    if (!st) return null;
    const arr = sheet.pile === "deck" ? st.deck : st.piles[sheet.pile] || [];
    const list = [...arr].reverse(); // dessus en premier
    const owner = sheet.side === "mine" ? "Ma" : `${st.name} :`;
    const title = TCG !== "safir"
      ? `${sheet.pile === "deck" ? (TCG === "sorcery" ? "Mon grimoire" : "Mon deck") : `${sheet.side === "mine" ? "Moi" : st.name} : ${pileName(sheet.pile)}`} · ${arr.length}`
      : `${sheet.pile === "deck" ? "Mon deck" : `${owner} ${PILE_NAMES[sheet.pile]}`} · ${arr.length}`;
    return (
      <Sheet open onClose={close} title={title}>
        {list.length === 0 && <p className="muted">Vide.</p>}
        {(sheet.pile === "deck" || sheet.pile === "atlas") && list.length > 0 && <p className="muted small" style={{ marginTop: 0 }}>Du dessus vers le dessous.</p>}
        <div className="pile-grid">
          {list.map((iid) => {
            const c = st.cards[iid];
            return (
              <div
                key={iid}
                className="thumb"
                style={c?.o === "l" ? { aspectRatio: "88 / 63" } : null}
                onClick={() =>
                  sheet.side === "mine"
                    ? setSheet({ kind: "card", iid, zone: sheet.pile })
                    : setSheet({ kind: "view", c })
                }
              >
                <img src={cardUrl(c)} alt={c?.n} />
                <div className="cap">{c?.n}</div>
              </div>
            );
          })}
        </div>
        {sheet.pile === "deck" && (
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => { A.shuffleDeck(); close(); }}>Mélanger et fermer</button>
          </>
        )}
        {sheet.pile === "atlas" && sheet.side === "mine" && (
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => { A.shuffleAtlas(); close(); }}>Mélanger et fermer</button>
          </>
        )}
        {TCG === "fab" && sheet.pile === "pitch" && sheet.side === "mine" && arr.length > 0 && (
          <>
            <div className="spacer" />
            <button className="btn primary" onClick={() => { A.pitchToDeck(); close(); }}>Tout remettre sous le deck (fin de tour)</button>
          </>
        )}
      </Sheet>
    );
  }

  if (sheet.kind === "token") {
    const t = tokens.find((x) => x.id === sheet.id);
    if (!t) return null;
    const upd = (patch) => A.editMark(sheet.id, patch);
    return (
      <Sheet open onClose={close} title="Jeton">
        <div className="row" style={{ justifyContent: "center", gap: 16, marginBottom: 16 }}>
          <button className="btn icon" onClick={() => upd({ v: Math.max(0, t.v - 1) })}>−</button>
          <div
            className="token"
            style={{ position: "relative", width: 64, height: 64, fontSize: 28, background: `radial-gradient(circle at 35% 30%, #fff8, ${TOKEN_HEX[t.color]} 55%)` }}
          >
            {t.v}
          </div>
          <button className="btn icon" onClick={() => upd({ v: Math.min(99, t.v + 1) })}>+</button>
        </div>
        {/* valeur directe de 1 à 12 ; − et + permettent ensuite d'aller plus loin */}
        <div className="val-chips">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <button key={n} className={`btn sm ${t.v === n ? "on" : ""}`} onClick={() => t.v !== n && upd({ v: n })}>{n}</button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "center", marginBottom: 16 }}>
          {TOKEN_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => upd({ color: c.id })}
              aria-label={c.label}
              style={{ width: 32, height: 32, borderRadius: "50%", border: t.color === c.id ? "3px solid #fff" : "2px solid #0008", background: c.hex, cursor: "pointer" }}
            />
          ))}
        </div>
        <button
          className="btn danger"
          style={{ width: "100%" }}
          onClick={() => {
            A.editMark(sheet.id, "delete");
            close();
          }}
        >
          Retirer le jeton
        </button>
        <p className="muted small">Astuce : faire glisser un jeton hors des tapis le retire aussi.</p>
      </Sheet>
    );
  }

  if (sheet.kind === "log") {
    return (
      <Sheet open onClose={close} title="Journal de la partie">
        <Journal mine={mine} opp={opp} />
      </Sheet>
    );
  }

  if (sheet.kind === "menu") {
    return (
      <Sheet open onClose={close} title="Partie">
        {meta && (
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="muted small">Code</span>
            <span className="code">{meta.code}</span>
            <span className="grow" />
            <button className="btn sm" onClick={A.share}>Partager</button>
          </div>
        )}
        {meta && (
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="muted small grow">Spectateurs : lecture seule, sans compte, mains cachées</span>
            <button className="btn sm" onClick={A.shareWatch}>📺 Lien spectateur</button>
          </div>
        )}
        {TCG === "safir" && <FxToggle />}
        <div className="actions" style={{ marginBottom: 14 }}>
          <button className="btn" onClick={() => { A.coin(); close(); }}>Pile ou face</button>
          {mine?.filmed ? (
            <>
              <button className="btn" onClick={() => setSheet({ kind: "camqr" })}>📷 Caméra de ma table</button>
              <button className="btn" onClick={() => setSheet({ kind: "showpick" })}>Montrer une carte</button>
            </>
          ) : (
            <>
          {TCG === "safir" && <button className="btn" onClick={() => setSheet({ kind: "mull" })} disabled={!mine?.hand.length}>Mulligan{mine?.mull ? " (déjà fait)" : ""}</button>}
          <button className="btn" onClick={() => { A.shuffleDeck(); close(); }}>Mélanger mon deck</button>
            </>
          )}
          <button className="btn" style={{ gridColumn: "1 / -1" }} onClick={() => { close(); A.resetMine(); }}>
            🔄 {TCG !== "safir" ? "Nouvelle partie : tout remettre à zéro" : `Nouvelle partie : tout remettre à zéro (PV ${START_PV} / PI ${START_PI})`}
          </button>
          <button className="btn" onClick={() => A.go("home")}>Quitter la table</button>
        </div>
        {meta && !meta.solo && mine && (
          <>
            <h3>Résultat de la partie</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Pour votre bilan par deck, visible de vous seul. {TCG === "sorcery" ? "Le coup fatal n'est pas détecté par l'appli : indiquez ici le résultat." : <>Compté d'office à {TCG === "fab" ? "0 point de vie" : `${WIN_PV} PV`} ; à corriger ici en cas d'abandon.</>}</p>
            <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              {[["win", "Victoire"], ["loss", "Défaite"], [null, "Non comptée"]].map(([k, l]) => (
                <button key={l} className={`btn sm${(result ?? null) === k ? " primary" : ""}`} onClick={() => onResult(k)}>{l}</button>
              ))}
            </div>
          </>
        )}
        <h3>Journal</h3>
        <Journal mine={mine} opp={opp} />
      </Sheet>
    );
  }

  if (sheet.kind === "rules") {
    return (
      <Sheet open onClose={close} title="Règles">
        <div style={{ height: "72vh", display: "flex", flexDirection: "column" }}><RulesPanel /></div>
      </Sheet>
    );
  }
  if (sheet.kind === "chat") return <ChatSheet onClose={close} messages={messages} userId={userId} onSend={A.sendMsg} tribune={tribune} startTab={sheet.tab} />;
  if (sheet.kind === "mull" && mine) return <MulliganSheet onClose={close} st={mine} onDo={A.mulligan} />;
  if (sheet.kind === "marker") {
    const t = sheet.id ? tokens.find((x) => x.id === sheet.id) : null;
    if (sheet.id && !t) return null;
    return <MarkerSheet onClose={close} t={t} onCreate={A.addMarker} onUpd={(p) => A.editMark(sheet.id, p)} onDel={() => A.editMark(sheet.id, "delete")} />;
  }
  return null;
}

// Talkie-walkie : maintenir pour parler, relâcher pour envoyer, glisser hors du bouton pour annuler
function TalkButton({ onClip, setToast }) {
  const [rec, setRec] = useState(null);
  const [sec, setSec] = useState(0);
  const [cancel, setCancel] = useState(false);
  const h = useRef(null);
  const st = useRef({ down: false, x0: 0, y0: 0, cancel: false });

  async function finish(send) {
    st.current.down = false;
    const cur = h.current;
    h.current = null;
    setRec(null);
    if (!cur) return;
    const clip = await cur.stop(send && !st.current.cancel);
    if (!clip) return;
    if (clip.dur < 0.6) return setToast("Trop court : restez appuyé pendant que vous parlez.");
    onClip(clip);
  }

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const v = (performance.now() - rec.t0) / 1000;
      setSec(v);
      if (v >= MAX_SEC) finish(true);
    }, 200);
    return () => clearInterval(t);
  }, [rec]);

  async function down(e) {
    if (e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    st.current = { down: true, x0: e.clientX, y0: e.clientY, cancel: false };
    setCancel(false);
    try {
      const r = await startRecording();
      if (!st.current.down) {
        await r.stop(false);
        return setToast("Micro prêt : restez appuyé sur 🎤 pendant que vous parlez.");
      }
      h.current = r;
      setRec(r);
      setSec(0);
      navigator.vibrate?.(20);
    } catch (_) {
      st.current.down = false;
      setToast("Micro inaccessible : autorisez-le pour ce site dans les réglages du navigateur.");
    }
  }
  function move(e) {
    if (!st.current.down) return;
    const c = Math.hypot(e.clientX - st.current.x0, e.clientY - st.current.y0) > 90;
    st.current.cancel = c;
    setCancel(c);
  }
  function up() {
    if (!h.current) {
      st.current.down = false;
      return;
    }
    finish(true);
  }

  return (
    <>
      <button
        className={`btn sm talk-btn ${rec ? "on" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => finish(false)}
        aria-label="Talkie-walkie : maintenir pour parler"
        title="Maintenir pour parler"
      >
        🎤
      </button>
      {rec && (
        <div className={`rec-pill ${cancel ? "cancel" : ""}`}>
          <span className="dot" /> {Math.floor(sec)} s
          <span className="muted small">{cancel ? "Relâchez pour annuler" : `Relâchez pour envoyer · glissez pour annuler · ${MAX_SEC} s max`}</span>
        </div>
      )}
    </>
  );
}

// Journal des deux joueurs, du plus récent au plus ancien. ⚠ = action sur le deck à surveiller (recherche, consultation)
export function Journal({ mine, opp, onlyOpp, noFilter }) {
  const [filter, setFilter] = useState(onlyOpp ? "opp" : "all");
  const logs = [
    ...(filter !== "opp" ? (mine?.log || []).map((l) => ({ ...l, who: mine.name, me: true })) : []),
    ...(opp?.log || []).map((l) => ({ ...l, who: opp.name, me: false })),
  ].sort((a, b) => b.t - a.t);
  return (
    <div className="journal">
      <div className="hand-tabs" style={{ marginBottom: 8, display: noFilter ? "none" : undefined }}>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Tout</button>
        <button className={filter === "opp" ? "on" : ""} onClick={() => setFilter("opp")}>Adversaire seulement</button>
      </div>
      <div className="log-list">
        {logs.length === 0 && <span className="muted">Rien pour l'instant.</span>}
        {logs.map((l, i) => (
          <div key={i} className={`${l.me ? "me" : "op"} ${l.m.startsWith("⚠") ? "sens" : ""}`}>
            <span className="muted">{new Date(l.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>{" "}
            <b>{l.who}</b> {l.m.replace(/^⚠ /, "")}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatSheet({ onClose, messages, userId, onSend, tribune, startTab }) {
  const [txt, setTxt] = useState("");
  const [tab, setTab] = useState(startTab === "trib" ? "trib" : "game");
  const listRef = useRef();
  const T = tribune;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, tab, T?.list.length]);
  useEffect(() => {
    T?.see(tab === "trib");
    return () => T?.see(false);
  }, [tab]);
  const send = (t) => {
    onSend(t);
    setTxt("");
  };
  const tabs = T && (T.list.length > 0 || T.watching > 0) && (
    <div className="hand-tabs" style={{ marginBottom: 10 }}>
      <button className={tab === "game" ? "on" : ""} onClick={() => setTab("game")}>💬 Joueurs</button>
      <button className={tab === "trib" ? "on" : ""} onClick={() => setTab("trib")}>
        📣 Tribune{T.unread > 0 && tab !== "trib" ? <span className="unread in-tab">{T.unread}</span> : ` (${T.list.length})`}
      </button>
    </div>
  );
  if (tab === "trib" && T) {
    return (
      <Sheet open onClose={onClose} title="Tchat">
        {tabs}
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="muted small grow">
            {T.watching > 0 ? `👁 ${T.watching} spectateur${T.watching > 1 ? "s" : ""} en ligne. ` : ""}Les spectateurs écrivent ici, vous lisez seulement.
          </span>
          <button className={`btn sm ${T.mute ? "on" : ""}`} onClick={() => T.setMute(!T.mute)}>
            {T.mute ? "🔇 Coupée" : "🔔 Active"}
          </button>
        </div>
        <div className="chat-list" ref={listRef}>
          {T.list.length === 0 && <span className="muted small">Aucun message des spectateurs.</span>}
          {T.list.map((m) => (
            <div key={m.id} className="msg trib">
              <b>{m.name} </b>{m.text}
              <span className="t">{new Date(m.created.replace(" ", "T")).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          {T.mute ? "Tribune coupée : pas de bulles ni de compteur, les messages restent lisibles ici." : "Les messages des spectateurs s'affichent en bulle sur le plateau. Coupez la tribune pour rester concentré."}
        </p>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title="Tchat">
      {tabs}
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <span className="muted small">Aucun message. Les réponses rapides s'envoient en un geste.</span>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.author === userId ? "me" : "op"}`}>
            {m.author !== userId && <b>{m.name} </b>}
            {m.audio ? (
              <button className="voice-msg" onClick={() => playVoice(fileUrl("messages", m.id, m.audio), { name: m.name, dur: m.dur, id: m.id })}>
                ▶ 🎤 message vocal{m.dur ? ` · ${Math.round(m.dur)} s` : ""}
              </button>
            ) : (
              m.text
            )}
            <span className="t">{new Date(m.created.replace(" ", "T")).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} className="btn sm" onClick={() => send(q)}>{q}</button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(txt); }}>
        <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Votre message" maxLength={300} />
        <button className="btn primary" disabled={!txt.trim()}>Envoyer</button>
      </form>
    </Sheet>
  );
}

function MulliganSheet({ onClose, st, onDo }) {
  const [sel, setSel] = useState([]);
  const tog = (iid) => setSel((l) => (l.includes(iid) ? l.filter((x) => x !== iid) : [...l, iid]));
  return (
    <Sheet open onClose={onClose} title="Mulligan">
      <p className="muted small" style={{ marginTop: 0 }}>
        Touchez les cartes à renvoyer. Elles retournent dans le deck, il est mélangé, puis vous repiochez le même nombre. Une seule fois par partie.
        {st.mull && <b> Vous avez déjà fait un mulligan.</b>}
      </p>
      <div className="pile-grid">
        {st.hand.map((iid) => {
          const c = st.cards[iid];
          return (
            <div key={iid} className={`thumb ${sel.includes(iid) ? "sel" : ""}`} style={c?.o === "l" ? { aspectRatio: "88 / 63" } : null} onClick={() => tog(iid)}>
              <img src={cardUrl(c)} alt={c?.n} />
              <div className="cap">{c?.n}</div>
              {sel.includes(iid) && <span className="badge">↺</span>}
            </div>
          );
        })}
      </div>
      <div className="spacer" />
      <button className="btn primary" style={{ width: "100%" }} disabled={!sel.length} onClick={() => { onDo(sel); onClose(); }}>
        Renvoyer {sel.length} carte{sel.length > 1 ? "s" : ""} et repiocher
      </button>
    </Sheet>
  );
}

function MarkerSheet({ onClose, t, onCreate, onUpd, onDel }) {
  const editing = !!t;
  const [label, setLabel] = useState(t?.label || "Gel");
  const [v, setV] = useState(t ? t.v || 0 : 1);
  const [terr, setTerr] = useState(0);
  const [color, setColor] = useState(t?.color || "blue");
  const set = (patch) => {
    if ("label" in patch) setLabel(patch.label);
    if ("v" in patch) setV(patch.v);
    if ("color" in patch) setColor(patch.color);
    if (editing) onUpd(patch);
  };
  return (
    <Sheet open onClose={onClose} title={editing ? "Marqueur de territoire" : "Nouveau marqueur de territoire"}>
      <div className="quick" style={{ marginBottom: 10 }}>
        {MARKER_PRESETS.map((p) => (
          <button key={p} className={`btn sm ${label === p ? "on" : ""}`} onClick={() => set({ label: p })}>
            {MARKER_ICON[p]} {p}
          </button>
        ))}
      </div>
      <div className="field">
        <label>Texte</label>
        <input className="input" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} onBlur={() => editing && label.trim() && onUpd({ label: label.trim() })} />
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" }}>
        <div className="row">
          <span className="muted small">Valeur</span>
          <button className="btn icon" onClick={() => set({ v: Math.max(0, v - 1) })}>−</button>
          <b style={{ minWidth: 26, textAlign: "center", fontSize: 20 }}>{v || "–"}</b>
          <button className="btn icon" onClick={() => set({ v: Math.min(99, v + 1) })}>+</button>
        </div>
        <div className="row">
          {TOKEN_COLORS.map((c) => (
            <button key={c.id} onClick={() => set({ color: c.id })} aria-label={c.label}
              style={{ width: 28, height: 28, borderRadius: "50%", border: color === c.id ? "3px solid #fff" : "2px solid #0008", background: c.hex, cursor: "pointer" }} />
          ))}
        </div>
      </div>
      {!editing && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted small">Territoire</span>
          {ROMAN.map((r, i) => (
            <button key={r} className={`btn sm ${terr === i ? "on" : ""}`} onClick={() => setTerr(i)}>{r}</button>
          ))}
        </div>
      )}
      {editing ? (
        <button className="btn danger" style={{ width: "100%" }} onClick={() => { onDel(); onClose(); }}>Retirer le marqueur</button>
      ) : (
        <button className="btn primary" style={{ width: "100%" }} disabled={!label.trim()} onClick={() => { onCreate({ label: label.trim(), v, t: terr, color }); onClose(); }}>
          Poser sur le Territoire {ROMAN[terr]}
        </button>
      )}
      <p className="muted small">La valeur sert de compteur (ex. tours de Gel restants), à baisser à la main. Le marqueur se déplace en le faisant glisser ; hors du tapis, il est retiré.</p>
    </Sheet>
  );
}

// Barre des phases du joueur (au-dessus de la main)
function PhaseBar({ st, opp, onPhase, onEnd, onClear, extra }) {
  if (!st) return <div className="phases" />;
  const n = st.arrows?.length || 0;
  return (
    <div className="phases">
      {!st.phase && <span className="turn-hint">{opp?.phase ? `Tour de ${opp.name}` : "Votre tour ?"}</span>}
      {PHASES.map((p) => (
        <button key={p.id} className={`ph ${p.id} ${st.phase === p.id ? "on" : ""}`} onClick={() => onPhase(p.id)} title={p.label}>
          {p.short}
        </button>
      ))}
      {n > 0 && <button className="ph clr" onClick={onClear} title="Effacer mes flèches">✕ {n}</button>}
      <button className="ph end" onClick={onEnd} disabled={!st.phase}>{TCG !== "safir" ? "Tour fini ⏎" : "Fin ⏎"}</button>
      {extra}
    </div>
  );
}

// Flèches d'attaque (rouges) et de ciblage (bleues), en px du plateau
// Sorcery : affinité (éléments des sites) et nombre de sites, sous les compteurs
// Sorcery : seuils des 4 éléments (éléments des sites du joueur dans le royaume)
function SorcEls({ st }) {
  const a = sorcAffinity(st);
  return (
    <span className="sorc-thr" title="Seuils : éléments des sites dans le royaume">
      {SORC_ELEMENTS.map((e) => (
        <i key={e.id} className={a[e.id] ? "" : "off"} aria-label={`${e.label} ${a[e.id] || 0}`}>{e.icon}<b style={{ color: e.hex }}>{a[e.id] || 0}</b></i>
      ))}
    </span>
  );
}

// Sorcery : vie (grand cadre rouge), mana disponible / total (1 par site) et seuils des 4 éléments
function SorcStats({ st, onSet }) {
  const a = sorcAffinity(st);
  const pi = st?.pi ?? 0, pv = st?.pv ?? 0;
  const btn = (k, d, lbl) => onSet && <button onClick={(e) => { e.stopPropagation(); onSet(k, (k === "pi" ? pi : pv) + d); }} aria-label={`${lbl} ${d > 0 ? "plus" : "moins"} 1`}>{d > 0 ? "+" : "−"}</button>;
  return (
    <div className={`sorc-nums ${onSet ? "" : "ro"}`}>
      <div className="sorc-stat mana" title="Mana disponible / total (1 par site dans le royaume)">
        {btn("pi", -1, "Mana")}
        <div className="v"><small>MANA</small><b>{pi}<span>/{a.sites}</span></b></div>
        {btn("pi", 1, "Mana")}
      </div>
      <div className="sorc-stat life" title="Points de vie">
        {btn("pv", -1, "Vie")}
        <div className="v"><small>VIE</small><b>{pv}</b></div>
        {btn("pv", 1, "Vie")}
      </div>
    </div>
  );
}

export function Arrows({ L, s, mine, opp, aim, cams, flipMine }) {
  const pos = (owner, tgt) => {
    const m = L[owner];
    if (!m) return null;
    if (tgt.p) return { x: m.panel.left + m.panel.width / 2, y: m.panel.top + m.panel.height / 2 };
    const st = owner === "mine" ? mine : opp;
    if (tgt.v) {
      // point d'un tapis filmé : placé sur l'image telle qu'elle est affichée ici
      const box = { left: m.mat.left, top: m.mat.top, w: MAT_W * s, h: MAT_H * s };
      return videoToBoard(box, cams?.[owner] || { rot: 0 }, tgt.v);
    }
    let x, y;
    if (tgt.iid) {
      const b = st?.board.find((q) => q.iid === tgt.iid);
      if (!b) return null;
      x = b.x;
      y = b.y;
    } else if (tgt.t != null) {
      x = TITLES[tgt.t].x;
      y = 125;
    } else return null;
    if (owner === "mine" && flipMine) x = mirrorX(x, y);
    if (owner !== "mine" && MAT_KIND === "sorcery") x = MAT_W - x; // royaume partagé : l'adversaire est vu retourné de 180°
    return owner === "mine"
      ? { x: m.mat.left + x * s, y: m.mat.top + y * s }
      : { x: m.mat.left + x * s, y: m.mat.top + (MAT_H - y) * s };
  };
  const list = [];
  const seen = {};
  for (const [owner, st] of [["mine", mine], ["opp", opp]]) {
    for (const a of st?.arrows || []) {
      const p0 = pos(owner, a.fv ? { v: a.fv } : { iid: a.from });
      const tOwner = a.to.s === "me" ? owner : owner === "mine" ? "opp" : "mine";
      const p1 = pos(tOwner, a.to);
      if (!p0 || !p1) continue;
      // Attaque combinée : les flèches vers une même cible s'écartent les unes des autres
      const key = `${tOwner}:${a.to.iid || a.to.t || (a.to.p ? "p" : "") || (a.to.v ? a.to.v.join(",") : "")}`;
      seen[key] = (seen[key] || 0) + 1;
      const i = seen[key] - 1;
      const bend = (i % 2 ? -1 : 1) * (0.15 + 0.12 * Math.floor((i + 1) / 2));
      list.push({ id: `${owner}${a.id}`, p0, p1, bend, k: a.k === "atk" ? "atk" : "cib" });
    }
  }
  const src = aim ? pos("mine", aim.v ? { v: aim.v } : { iid: aim.iid }) : null;
  if (!list.length && !src) return null;
  const sw = Math.max(3, 1.3 * s * 3);
  return (
    <svg className="arrows" width={L.w} height={L.h}>
      <defs>
        {Object.entries(ARROW_HEX).map(([k, c]) => (
          <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} stroke="#000" strokeWidth="0.8" />
          </marker>
        ))}
      </defs>
      {list.map(({ id, p0, p1, k, bend }) => {
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const cx = (p0.x + p1.x) / 2 - (dy / len) * len * bend;
        const cy = (p0.y + p1.y) / 2 + (dx / len) * len * bend;
        const d = `M${p0.x},${p0.y} Q${cx},${cy} ${p1.x},${p1.y}`;
        return (
          <g key={id}>
            <path d={d} fill="none" stroke="rgba(0,0,0,.65)" strokeWidth={sw + 3} strokeLinecap="round" />
            <path d={d} fill="none" stroke={ARROW_HEX[k]} strokeWidth={sw} strokeLinecap="round" markerEnd={`url(#ah-${k})`} className="arrow-line" />
            <circle cx={p0.x} cy={p0.y} r={sw * 1.4} fill={ARROW_HEX[k]} stroke="#000" strokeWidth="1" />
          </g>
        );
      })}
      {src && <circle cx={src.x} cy={src.y} r={18} fill="none" stroke={ARROW_HEX[aim.k]} strokeWidth="3" className="aim-src" />}
    </svg>
  );
}

// Position des tapis et des panneaux PI/PV (px écran)
export function boardLayout(side, focus, s) {
  const mw = MAT_W * s;
  const mh = MAT_H * s;
  const gap = GAP * s;
  if (MAT_KIND === "sorcery") {
    // Royaume partagé : les deux tapis au même endroit (celui de l'adversaire dessous, retourné), compteurs de chaque côté
    if (side) {
      const half = mh / 2;
      return {
        mode: "side", w: RAIL + mw, h: mh, shared: true,
        opp: { mat: { left: RAIL, top: 0 }, panel: { left: 0, top: 0, width: RAIL, height: half } },
        mine: { mat: { left: RAIL, top: 0 }, panel: { left: 0, top: half, width: RAIL, height: half } },
      };
    }
    const B = SORC_BAR;
    return {
      mode: "bar", w: mw, h: 2 * B + mh, shared: true,
      opp: { mat: { left: 0, top: B }, panel: { left: 0, top: 0, width: mw, height: B } },
      mine: { mat: { left: 0, top: B }, panel: { left: 0, top: B + mh, width: mw, height: B } },
    };
  }
  if (side) {
    const panel = (top) => ({ left: 0, top, width: RAIL, height: mh });
    if (focus === "mine") return { mode: "side", w: RAIL + mw, h: mh, mine: { mat: { left: RAIL, top: 0 }, panel: panel(0) } };
    if (focus === "opp") return { mode: "side", w: RAIL + mw, h: mh, opp: { mat: { left: RAIL, top: 0 }, panel: panel(0) } };
    return {
      mode: "side", w: RAIL + mw, h: 2 * mh + gap,
      opp: { mat: { left: RAIL, top: 0 }, panel: panel(0) },
      mine: { mat: { left: RAIL, top: mh + gap }, panel: panel(mh + gap) },
    };
  }
  const bar = (top) => ({ left: 0, top, width: mw, height: BAR });
  if (focus === "mine") return { mode: "bar", w: mw, h: mh + BAR, mine: { mat: { left: 0, top: 0 }, panel: bar(mh) } };
  if (focus === "opp") return { mode: "bar", w: mw, h: mh + BAR, opp: { mat: { left: 0, top: BAR }, panel: bar(0) } };
  return {
    mode: "bar", w: mw, h: 2 * BAR + 2 * mh + gap,
    opp: { mat: { left: 0, top: BAR }, panel: bar(0) },
    mine: { mat: { left: 0, top: BAR + mh + gap }, panel: bar(BAR + 2 * mh + gap) },
  };
}

function Stat({ label, k, v, cls, onSet }) {
  return (
    <div className={`stat ${cls}`}>
      {onSet && <button onClick={() => onSet(k, v - 1)} aria-label={`${label} moins 1`}>−</button>}
      <div className="val">
        <small>{label}</small>
        <b>{v}</b>
      </div>
      {onSet && <button onClick={() => onSet(k, v + 1)} aria-label={`${label} plus 1`}>+</button>}
    </div>
  );
}

// Compteurs PI / PV bien visibles à côté de chaque tapis (seul le propriétaire peut les modifier)
export function ScorePanel({ st, mine, layout, box, onSet, onAim, onUnif, extra, sub, hand, back }) {
  const ph = st?.phase ? PHASE_BY_ID[st.phase] : null;
  const unif = st?.unif || 0;
  return (
    <div
      className={`score ${layout} ${TCG === "sorcery" ? "sorc" : ""} ${mine ? "mine" : "opp"} ${onAim ? "aimable" : ""} ${ph ? "active" : ""}`}
      style={box}
      onClick={onAim || undefined}
    >
      <div className="sname">
        <span className="nm">{st?.name || (mine ? "Moi" : "Adversaire")}</span>
        <span className="srow">
          <span className={`phase-chip ${st?.phase || "off"}`}>
            {ph ? `T${st.turn} · ${ph.label}` : st?.turn ? `T${st.turn} · attend` : "en attente"}
          </span>
          {sub && <span className="ssub">{sub}</span>}
        </span>
        {TCG === "sorcery" && <SorcEls st={st} />}
      </div>
      {TCG === "safir" && (mine || unif > 0) && (
        <button className={`unif u${unif}`} onClick={(e) => { if (onAim) return; e.stopPropagation(); onUnif?.(); }} title={unif ? UNIF_BONUS[unif] : "Unification"}>
          <small>UNIF</small>
          <b>{unif || "–"}</b>
        </button>
      )}
      {hand != null && (
        <div className={`hand-fan ${back ? "has-cb" : ""}`} style={back ? { "--cb": `url("${back}")` } : undefined} title={`${hand} carte${hand > 1 ? "s" : ""} en main`} aria-label={`${hand} cartes en main`}>
          <div className="fan">
            <i /><i /><i />
          </div>
          <b>{hand}</b>
          <small>main</small>
        </div>
      )}
      {TCG === "sorcery" ? (
        <SorcStats st={st} onSet={mine && !onAim ? onSet : null} />
      ) : (
        <>
          <Stat label={counterLabel("pi")} k="pi" v={st?.pi ?? 0} cls="pi" onSet={mine && !onAim ? onSet : null} />
          <Stat label={counterLabel("pv")} k="pv" v={st?.pv ?? 0} cls="pv" onSet={mine && !onAim ? onSet : null} />
        </>
      )}
      {extra}
    </div>
  );
}

// ---------- Joueur filmé et vocal en direct ----------
const camState = (p) =>
  !p ? "téléphone pas encore connecté" : p.state === "connected" ? "en direct" : p.state === "failed" || p.state === "disconnected" ? "connexion perdue, nouvel essai…" : "connexion en cours…";

// Lien et QR code du téléphone qui filme le tapis réel du joueur
function CamSetup({ link, compact }) {
  const [copied, setCopied] = useState(false);
  if (!link) return <div className="cam-setup muted small">Préparation du lien caméra…</div>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  };
  return (
    <div className={`cam-setup ${compact ? "compact" : ""}`}>
      <QrImg text={link} size={compact ? 110 : 170} />
      <div className="cam-steps">
        <b>Filmez votre tapis</b>
        <ol>
          <li>Placez un téléphone au-dessus de votre tapis (support, perche ou pile de livres).</li>
          <li>Scannez ce QR code avec ce téléphone, ou ouvrez-y le lien.</li>
          <li>Cadrez le tapis en entier, téléphone à l'horizontale.</li>
        </ol>
        {!compact && <p className="muted small" style={{ margin: "4px 0" }}>Ce lien est secret : il permet de filmer pour vous. Ne le partagez pas.</p>}
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button className="btn sm" onClick={copy}>{copied ? "Lien copié ✓" : "Copier le lien"}</button>
          <button className="btn sm" onClick={() => window.open(link, "_blank")} title="Filmer avec la webcam de cet ordinateur (nouvel onglet)">💻 Webcam de cet ordinateur</button>
        </div>
      </div>
    </div>
  );
}

// Colonne de droite (ou bas) pour un joueur filmé : pas de main ni de pioche, tout est sur sa table
function FilmedSide({ cam, onQr, onShow, onPv0, pvLabel, wide, journal }) {
  return (
    <div className="filmed-side">
      <p className="small" style={{ marginTop: 0 }}>
        🎥 Vous jouez avec vos cartes réelles : votre adversaire voit votre tapis filmé. Main, pioche et défausses restent sur votre table ;
        gérez ici vos compteurs et vos phases.
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className={`btn sm ${cam?.state === "connected" ? "" : "primary"}`} onClick={onQr}>📷 Caméra : {camState(cam)}</button>
        <button className="btn sm" onClick={onShow}>Montrer une carte</button>
        <button className="btn sm" onClick={onPv0} disabled={!onPv0} title={`Remettre mes ${pvLabel} à 0`}>{pvLabel} à 0</button>
      </div>
      {wide && <div className="side-log" style={{ marginTop: 10 }}>{journal}</div>}
    </div>
  );
}

// Choisir une carte scannée de sa collection pour la montrer en grand à l'adversaire
function ShowPickSheet({ onClose, userId, onPick }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    pb.collection("cards")
      .getFullList({ filter: `owner="${userId}" && ${tcgFilter(TCG)}`, sort: "name", fields: "id,name,image,orient" })
      .then(setList)
      .catch(() => setList([]));
  }, [userId]);
  const fold = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = (list || []).filter((c) => !q.trim() || fold(c.name).includes(fold(q.trim())));
  return (
    <Sheet open onClose={onClose} title="Montrer une carte">
      <p className="muted small" style={{ marginTop: 0 }}>Votre adversaire la voit en grand, comme si vous la lui tendiez. Seules vos cartes scannées sont proposées.</p>
      <input className="input" placeholder="Rechercher par nom" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {list === null && <p className="muted small">Chargement…</p>}
      {list?.length === 0 && <p className="muted small">Aucune carte scannée pour ce jeu.</p>}
      <div className="pile-grid">
        {shown.slice(0, 120).map((c) => (
          <div key={c.id} className="thumb" style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null} onClick={() => onPick(c)}>
            <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
            <div className="cap">{c.name}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// Vocal en direct : micro, son de l'adversaire, écoute des spectateurs
function VoiceSheet({ onClose, rtc, opp, watching, setToast }) {
  const [busy, setBusy] = useState(false);
  // Diagnostic : liaison directe ou par le relais, son reçu et envoyé (mis à jour chaque seconde)
  const [diag, setDiag] = useState(null);
  useEffect(() => {
    let alive = true, last = null;
    const tick = async () => {
      const d = await rtc.linkInfo();
      if (!alive) return;
      setDiag(d ? { ...d, hearing: !!last && d.audioIn > last.audioIn, sending: !!last && d.audioOut > last.audioOut } : null);
      last = d;
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const link = rtc.oppLink?.state;
  const oppTxt = !opp
    ? "pas encore d'adversaire"
    : link === "connected"
      ? rtc.oppMic ? "micro ouvert" : "micro fermé"
      : link === "failed" || link === "disconnected" ? "connexion perdue, nouvel essai…" : "connexion en cours…";
  async function on() {
    setBusy(true);
    try {
      await rtc.micOn();
      setToast("🎧 Micro ouvert : votre adversaire vous entend");
    } catch (_) {
      setToast("Micro inaccessible : autorisez-le pour ce site dans les réglages du navigateur.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open onClose={onClose} title="Vocal en direct">
      <p className="muted small" style={{ marginTop: 0 }}>
        Le son passe directement d'appareil à appareil, sans enregistrement. Avec des haut-parleurs, l'écho est filtré ; un casque reste plus confortable.
      </p>
      <div className="voice-row">
        <span className="grow">Mon micro : <b>{rtc.mic ? "ouvert" : "fermé"}</b></span>
        {rtc.mic ? (
          <button className="btn sm" onClick={rtc.micOff}>Couper mon micro</button>
        ) : (
          <button className="btn sm primary" onClick={on} disabled={busy}>Ouvrir mon micro</button>
        )}
      </div>
      <div className="voice-row">
        <span className="grow">{opp?.name || "Adversaire"} : <b>{oppTxt}</b></span>
        {opp && <button className="btn sm" onClick={() => rtc.muteOpp(!rtc.oppMuted)}>{rtc.oppMuted ? "Rétablir le son" : "Couper le son"}</button>}
      </div>
      <div className="voice-row">
        <span className="grow">
          Spectateurs : <b>{rtc.specHear ? "vous entendent" : "ne vous entendent pas"}</b>
          {rtc.specHear && rtc.listeners > 0 ? <span className="muted small"> · {rtc.listeners} à l'écoute</span> : watching > 0 ? <span className="muted small"> · {watching} connecté{watching > 1 ? "s" : ""}</span> : null}
        </span>
        <button className="btn sm" onClick={() => rtc.setSpecHear(!rtc.specHear)}>{rtc.specHear ? "Ne plus m'entendre" : "M'entendre"}</button>
      </div>
      {opp && (
        <p className="muted small voice-diag">
          Liaison : <b>{!diag ? "pas encore établie" : diag.state !== "connected" ? (diag.state === "failed" ? "impossible pour l'instant" : "en cours…") : diag.type === "relay" ? "par le relais" : "directe"}</b>
          {diag?.state === "connected" && (
            <>
              {" "}· son reçu : <b>{diag.hearing ? "oui" : "rien"}</b> · son envoyé : <b>{diag.sending ? "oui" : "rien"}</b>
            </>
          )}
        </p>
      )}
      <p className="muted small">Les messages 🎤 du talkie-walkie restent disponibles.</p>
    </Sheet>
  );
}
