import { useCallback, useEffect, useRef, useState } from "react";
import { pb, me, cardUrl, errMsg, fileUrl } from "../pb.js";
import { startRecording, canRecord, extFor, playVoice, unlockAudio, onVoiceState, MAX_SEC } from "../lib/voice.js";
import { watchCount, tribuneMuted, setTribuneMuted } from "../lib/tribune.js";
import { matBgOf } from "../components/MatBgSettings.jsx";
import { Mat } from "./Mat.jsx";
import { RulesPanel } from "./Rules.jsx";
import { Sheet, Toast } from "../components/ui.jsx";
import { MAT_W, MAT_H, GAP, BOARD_H, CARD, SLOTS, TITLES, ROMAN, slotAt, pileAt, placeName, boxAt, inRect, rotPt } from "../lib/mat.js";
import {
  normalize, detach, addLog, shuffle, resetState, rid, TOKEN_COLORS, TOKEN_HEX,
  PHASES, PHASE_BY_ID, UNIF_BONUS, MARKER_PRESETS, MARKER_ICON, parseVal,
} from "../lib/game.js";

const ZOOMS = [1, 1.6, 2.4]; // niveaux de zoom de la loupe (vue d'un seul tapis)
export const BAR = 48; // bandeau PI/PV en portrait (px écran)
export const RAIL = 96; // colonne PI/PV en paysage (px écran)
const PILE_NAMES = { d1: "Défausse I", d2: "Défausse II", d3: "Défausse III", deck: "Deck" };
const PHASE_H = 40; // barre des phases au-dessus de la main (portrait)
const WIN_PV = 30;
const QUICK = ["OK", "Attends", "Je réagis", "Riposte ?", "Vol vie ?", "À toi", "Bien joué !"];
const ARROW_HEX = { atk: "#ff3b3b", cib: "#4ba3ff" };
const logLine = (who, m) => (m.startsWith("⚠ ") ? `⚠ ${who} ${m.slice(2)}` : `${who} ${m}`);
const terrOf = (x) => (x < 201.5 ? 0 : x < 398.5 ? 1 : 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Table({ go, gameId }) {
  const user = me();
  const [meta, setMeta] = useState(null);
  const [mine, setMine] = useState(null);
  const [opp, setOpp] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState(null);
  const [zoom, setZoom] = useState(0);
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
  const [winner, setWinner] = useState(null);
  const [aim, setAim] = useState(null); // {iid, k: "atk" | "cib"} : choix de la cible d'une flèche
  const [pings, setPings] = useState([]); // [{owner: "mine"|"opp", iid, k}]
  const [speaking, setSpeaking] = useState(null); // message vocal en cours de lecture
  const mainRef = useRef();
  const sheetRef = useRef(null);
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
    : Math.min((vp.w - 12) / MAT_W, (vp.h - 12 - (focus ? BAR : 2 * BAR)) / (focus ? MAT_H : BOARD_H));
  const s = Math.max(0.15, fitS) * (focus ? ZOOMS[zoom] : 1);
  sRef.current = s;
  const mySide = sideRef.current;
  const oppSide = mySide === "p1" ? "p2" : "p1";

  // ---------- Synchronisation serveur ----------
  // games : métadonnées + jetons partagés ; seats : un enregistrement d'état par joueur
  // (deux enregistrements distincts : les écritures des deux joueurs ne s'écrasent jamais)
  const applyGame = useCallback((r) => {
    sideRef.current = r.p1 === user.id ? "p1" : "p2";
    setMeta({ code: r.code, p1: r.p1, p2: r.p2, status: r.status });
  }, [user.id]);

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
    if (rec.player === user.id) {
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
      if (last && lastOppLog.current !== null && last.t > lastOppLog.current) setToast(logLine(o.name, last.m));
      lastOppLog.current = last ? last.t : 0;
      // Carte montrée par l'adversaire (ignorée au premier chargement)
      const rv = o.reveal;
      if (rv && lastReveal.current !== null && rv.t > lastReveal.current && o.cards[rv.iid]) {
        setSheet({ kind: "view", c: o.cards[rv.iid], title: `${o.name} vous montre`, hint: o.cards[rv.iid].n });
      }
      lastReveal.current = rv ? rv.t : 0;
      // Fin du tour adverse : c'est à moi
      if (lastOppPhase.current && !o.phase) setBanner(`${o.name} a fini son tour : à vous de jouer !`);
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
  }, [user.id, addPing]);

  const applyMsg = useCallback((m) => {
    if (msgIds.current.has(m.id)) return;
    msgIds.current.add(m.id);
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
    const fresh = msgs.items.filter((m) => !msgIds.current.has(m.id)).reverse();
    fresh.forEach((m) => msgIds.current.add(m.id));
    if (fresh.length) setMessages((l) => [...l, ...fresh].sort((a, b) => (a.created < b.created ? -1 : 1)).slice(-200));
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
      unsubs.forEach((u) => u && u());
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [gameId, loadAll, applyGame, applySeat, applyMark, applyMsg]);

  // Victoire : un joueur atteint 30 PV (pas au chargement d'une partie déjà gagnée)
  useEffect(() => {
    for (const [k, st] of [["mine", mine], ["opp", opp]]) {
      if (!st) continue;
      const prev = pvPrev.current[k];
      if (prev !== undefined && prev < WIN_PV && st.pv >= WIN_PV) setWinner({ name: st.name || (k === "mine" ? "Vous" : "L'adversaire"), mine: k === "mine" });
      pvPrev.current[k] = st.pv;
    }
  }, [mine?.pv, opp?.pv]);

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
      unsub?.();
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

  // Mutation de mon état : fn(s) modifie s et renvoie le message du journal, ou false pour annuler.
  // key : les messages successifs de même clé (moins de 8 s d'écart) sont fusionnés en une ligne
  const mut = useCallback((fn, key) => {
    if (!mineRef.current) return;
    const st = structuredClone(mineRef.current);
    const msg = fn(st);
    if (msg === false) return;
    if (typeof msg === "string") {
      const last = st.log?.[st.log.length - 1];
      if (last && key && last.k === key && Date.now() - last.t < 8000) {
        st.log = [...st.log.slice(0, -1), { t: Date.now(), m: msg, k: key }];
      } else addLog(st, msg, key);
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
    const missing = [...new Set(Object.values(mine.cards).filter((c) => !("v" in c)).map((c) => c.c))];
    valsFilled.current = true;
    if (!missing.length) return;
    (async () => {
      const vals = {};
      for (let i = 0; i < missing.length; i += 30) {
        const part = missing.slice(i, i + 30);
        try {
          const recs = await pb.collection("cards").getFullList({ filter: part.map((id) => `id="${id}"`).join(" || "), fields: "id,val" });
          recs.forEach((r) => (vals[r.id] = parseVal(r.val)));
        } catch { /* cartes inaccessibles : valeur inconnue */ }
      }
      mut((st) => {
        for (const c of Object.values(st.cards)) if (!("v" in c)) c.v = vals[c.c] ?? null;
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

  // Description d'un jeton / marqueur pour le journal
  const tokDesc = (t, where = true) => {
    if (!t) return "un jeton";
    const what = t.label ? `le marqueur « ${t.label} »` : `un jeton ${(TOKEN_COLORS.find((c) => c.id === t.color)?.label || "").toLowerCase()}`;
    if (!where) return what;
    const st = mineRef.current;
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
    if ("v" in patch && patch.v !== t.v) mut(() => `met ${tokDesc(nt)} à ${patch.v}`, `tok:${id}`);
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
      const boardH = BOARD_H * fitW + 2 * BAR + 12;
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
    const slot = slotAt(x, y);
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
    const nm = down ? "une carte face cachée" : `« ${c.n} »`;
    if (from === "board") return prev && Math.hypot(prev.x - cx, prev.y - cy) < 1 ? false : `déplace ${nm} vers ${where}`;
    if (from === "reserve") return `crée le jeton « ${c.n} » sur ${where}`;
    if (from === "hand") return `joue ${nm} sur ${where}`;
    if (from === "deck") return searched ? `⚠ prend une carte choisie dans son deck et la pose face cachée sur ${where}` : `pose la carte du dessus de son deck, face cachée, sur ${where}`;
    return `sort « ${c.n} » de sa ${PILE_NAMES[from]} vers ${where}`;
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
    const free =
      (faceDown && SLOTS.find((sl) => sl.kind === "magie" && !taken(sl))) ||
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
      detach(st, iid);
      st.hand.push(iid);
      if (from === "deck") return searched ? `⚠ cherche dans son deck et prend « ${c.n} » en main` : "pioche 1 carte (dessus du deck)";
      if (from === "board") return prev?.down ? "reprend une carte face cachée en main" : `reprend « ${c.n} » en main`;
      return `reprend « ${c.n} » de sa ${PILE_NAMES[from]} en main`;
    });
  }, [mut]);

  const toPile = useCallback((iid, pid, from, bottom = false) => {
    if (from === "board") clearTokensOn(iid);
    mut((st) => {
      const c = st.cards[iid];
      const prev = st.board.find((b) => b.iid === iid);
      const searched = from === "deck" && st.deck[st.deck.length - 1] !== iid;
      detach(st, iid);
      if (pid === "deck") {
        bottom ? st.deck.unshift(iid) : st.deck.push(iid);
        const hidden = from === "hand" || from === "deck" || prev?.down;
        const what = searched ? "⚠ déplace une carte choisie dans son deck" : `place ${hidden ? "une carte" : `« ${c.n} »`}${from === "hand" ? " de sa main" : ""}`;
        return `${what} ${bottom ? "sous" : "sur"} son deck`;
      }
      st.piles[pid].push(iid);
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
      return `pioche ${k} carte${k > 1 ? "s" : ""}`;
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

  const setTrack = (kind, v) =>
    mut((st) => {
      const max = kind === "pi" ? 15 : 30;
      const nv = clamp(v, 0, max);
      if (st[kind] === nv) return false;
      st[kind] = nv;
      return `met ses ${kind.toUpperCase()} à ${nv}`;
    }, kind);

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
    if (!confirm("Remettre toutes vos cartes dans le deck, le mélanger, retirer vos cartes jetons et revenir à PI 4 / PV 0 ?")) return;
    mut((st) => {
      const r = resetState(st);
      Object.assign(st, r);
      return "remet tout son jeu dans son deck et le mélange";
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
      return start ? `commence son tour ${st.turn} : ${lb}` : `passe en phase ${lb}`;
    });

  const endTurn = () =>
    mut((st) => {
      if (!st.phase) return false;
      st.phase = null;
      st.arrows = [];
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
    if (to.t != null) return `${to.s === "opp" ? "le Territoire adverse" : "son Territoire"} ${ROMAN[to.t]}`;
    const st = to.s === "opp" ? o : m;
    const b = st?.board.find((x) => x.iid === to.iid);
    if (!b) return "une carte";
    if (b.down && to.s === "opp") return "une carte face cachée";
    return `« ${st.cards[to.iid]?.n || "carte"} »`;
  };

  const addArrow = (a, to) =>
    mut((st) => {
      if (!st.board.some((b) => b.iid === a.iid)) return false;
      if (!to.p && to.t == null && to.s === "me" && to.iid === a.iid) return false;
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
    setAim({ iid, k });
  };

  function aimAt(to) {
    const a = aim;
    setAim(null);
    if (a) addArrow(a, to);
  }

  // Tap sur une zone vide du plateau pendant le choix d'une cible : vise le territoire
  function boardDown(e) {
    if (!aim || e.target.closest?.(".loupe-btn, .score")) return;
    const loc = locate(e.clientX, e.clientY);
    if (!loc || (loc.area !== "mine" && loc.area !== "opp")) return;
    if (loc.y > 222) return setToast("Touchez une carte, un territoire ou le compteur adverse.");
    aimAt({ s: loc.area === "mine" ? "me" : "opp", t: terrOf(loc.x) });
  }

  // ---------- Tchat ----------
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
    if (inR(mr)) return { area: "mine", x: (cx - mr.left) / sc, y: (cy - mr.top) / sc };
    const or = oppMatRef.current?.getBoundingClientRect();
    if (inR(or)) return { area: "opp", x: (cx - or.left) / sc, y: MAT_H - (cy - or.top) / sc };
    return null;
  }

  const isCard = (src) => src.type === "hand" || src.type === "board" || src.type === "pile" || src.type === "reserve";

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
      let [dx, dy] = rotPt(x - b.x, y - b.y, -(b.rot || 0));
      const others = tokRef.current.filter((t) => t.on === b.iid && t.id !== excludeId);
      // Écart entre jetons d'une même carte, calé sur leur taille à l'écran
      const step = Math.max(9, (Math.max(20, 8 * sRef.current) / sRef.current) * 0.75);
      for (let g = 0; g < 12 && others.some((t) => Math.hypot(t.dx - dx, t.dy - dy) < step * 0.8); g++) {
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
    if (src.type === "hand" || src.type === "board" || src.type === "token" || src.type === "palette" || src.type === "reserve") return true;
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
      setPanel("hand");
      const st = mineRef.current;
      const iid = src.type === "pile" ? topOf(st, src.pile) : src.iid;
      const c = st.cards[iid];
      const dim = CARD[c?.o === "l" ? "l" : "p"];
      const k = Math.max(sc, 64 / dim.w);
      g = { src: src.type === "pile" && src.pile === "deck" ? null : cardUrl(c), w: dim.w * k, h: dim.h * k };
      setDragKey(src.type === "pile" ? `pile:mine:${src.pile}` : src.type === "board" ? `board:${iid}` : `hand:${iid}`);
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
    clearTimeout(d.timer);
    if (d.long) return;
    if (d.started) {
      const loc = locate(e.clientX, e.clientY);
      endDrag();
      drop(d.src, loc);
    } else tap(d.src);
  };
  handlers.current.cancel = () => {
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
    if (e.button > 0) return;
    e.stopPropagation();
    detachListeners();
    const d = { src, x0: e.clientX, y0: e.clientY, started: false };
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

  function drop(src, loc) {
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
    const st = mineRef.current;
    let iid, from;
    if (src.type === "hand") { iid = src.iid; from = "hand"; }
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
        if (src.iid === aim.iid) return setAim(null);
        return aimAt({ s: "me", iid: src.iid });
      }
      if (src.type === "oppboard") return aimAt({ s: "opp", iid: src.iid });
      return setToast("Touchez une carte, un territoire ou le compteur adverse.");
    }
    switch (src.type) {
      case "hand":
        return setSheet({ kind: "card", iid: src.iid, zone: "hand" });
      case "board":
        return setSheet({ kind: "card", iid: src.iid, zone: "board" });
      case "oppboard": {
        const b = o?.board.find((x) => x.iid === src.iid);
        if (!b) return;
        if (b.down) return setToast("Carte face cachée (appui long pour la signaler)");
        return setSheet({ kind: "view", c: o.cards[src.iid], ping: { owner: "opp", iid: src.iid } });
      }
      case "pile":
        if (src.side === "mine") return setSheet(src.pile === "deck" ? { kind: "deck" } : { kind: "pile", pile: src.pile, side: "mine" });
        if (src.pile === "deck") return setToast(`Deck adverse : ${o?.deck.length || 0} carte(s)`);
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
  const oppTokens = tokens.filter((t) => t.side !== mySide);
  const ticker = opp?.log?.length ? logLine(opp.name, opp.log[opp.log.length - 1].m) : "";

  return (
    <div className="table" onContextMenu={(e) => e.preventDefault()} onPointerDownCapture={unlockAudio} style={{ WebkitTouchCallout: "none" }}>
      <div className="tbar">
        <button className="btn sm ghost icon" onClick={() => go("home")} aria-label="Quitter">←</button>
        {opp ? (
          <>
            <div className="who">
              <b>{opp.name}</b>
              <span className="muted" style={{ fontSize: 11 }}>main {opp.hand.length} · deck {opp.deck.length}</span>
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
        {canRecord() && <TalkButton onClip={sendVoice} setToast={setToast} />}
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
                <div className="small">Vous pouvez déjà préparer votre jeu.</div>
              </div>
            ) : null;
            // Loupe : sur mon tapis en haut à droite (titre du territoire III) ; pour l'adversaire, dans sa barre PI/PV,
            // car son coin haut droit est sa zone Commandant
            const loupe = (which, m, inPanel) => (
              <button
                className={`loupe-btn ${inPanel ? "in-panel" : ""}`}
                style={inPanel ? null : { left: m.left + MAT_W * s - 40, top: m.top + 6 }}
                onClick={() => (focus ? setFocus(null) : openFocus(which))}
                aria-label={focus ? "Revenir aux deux tapis" : "Agrandir ce tapis"}
              >
                {focus ? "⤡" : "🔍"}
              </button>
            );
            const aimPanel = (side) => (aim ? () => aimAt({ s: side === "mine" ? "me" : "opp", p: true }) : null);
            return (
              <div className="board" style={{ width: L.w, height: L.h, marginTop: 6, marginBottom: 6 }} onPointerDown={boardDown}>
                {L.opp && (
                  <>
                    <ScorePanel st={opp} hand={opp ? opp.hand.length : null} layout={L.mode} box={L.opp.panel} onAim={aimPanel("opp")} onUnif={() => opp?.unif && setToast(`${opp.name} : Unification ${opp.unif} (${UNIF_BONUS[opp.unif]})`)} extra={loupe("opp", L.opp.mat, true)} />
                    <Mat side="opp" st={opp} vs={mine} s={s} top={L.opp.mat.top} left={L.opp.mat.left} tokens={oppTokens} hover={hover} dragKey={dragKey} onPress={press} matRef={oppMatRef} waiting={waiting} pings={pings.filter((x) => x.owner === "opp")} aiming={!!aim} />
                  </>
                )}
                {L.mine && (
                  <>
                    <Mat side="mine" st={mine} vs={opp} bg={matBgOf(user)} s={s} top={L.mine.mat.top} left={L.mine.mat.left} tokens={myTokens} hover={hover} dragKey={dragKey} onPress={press} matRef={myMatRef} pings={pings.filter((x) => x.owner === "mine")} aiming={!!aim} />
                    <ScorePanel st={mine} mine layout={L.mode} box={L.mine.panel} onSet={setTrack} onAim={aimPanel("mine")} onUnif={cycleUnif} />
                    {loupe("mine", L.mine.mat)}
                  </>
                )}
                <Arrows L={L} s={s} mine={mine} opp={opp} aim={aim} />
              </div>
            );
          })()}
        </div>

        <div className="side">
          <PhaseBar st={mine} opp={opp} onPhase={setPhase} onEnd={endTurn} onClear={() => clearArrows()} />
          <div className="controls">
            <button className="btn sm primary" onClick={() => draw(1)} disabled={!mine}>
              Piocher <span style={{ opacity: 0.7 }}>({mine?.deck.length ?? 0})</span>
            </button>
            <button className="btn sm" onClick={() => setSheet({ kind: "marker" })} title="Marqueur de territoire (Gel, Bloqué…)">＋ Marqueur</button>
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
          </div>
          {(mine?.reserve?.length > 0 || wide) && (
            <div className="controls2">
              <div className="hand-tabs">
                <button className={panel === "hand" ? "on" : ""} onClick={() => setPanel("hand")}>Main {mine?.hand.length ?? 0}</button>
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
            {panel === "reserve" && mine?.reserve?.length > 0 ? (
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
        </div>
      </div>

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
          <span>{aim.k === "atk" ? "⚔ Attaque" : "🎯 Ciblage"} avec « {mine?.cards[aim.iid]?.n} » : touchez la cible (carte, territoire ou compteur adverse)</span>
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
            <p className="muted">{winner.mine ? "Vous atteignez" : `${winner.name} atteint`} {WIN_PV} PV.</p>
            <button className="btn primary">Fermer</button>
          </div>
        </div>
      )}

      {/* Message au milieu du tapis adverse : ne masque ni les compteurs PI/PV ni la main */}
      <Toast
        text={toast}
        onDone={() => setToast("")}
        style={(() => {
          const r = oppMatRef.current?.getBoundingClientRect() || vpRef.current?.getBoundingClientRect();
          return r ? { top: Math.max(r.top + 8, r.top + r.height / 2 - 16), left: r.left + r.width / 2 } : null;
        })()}
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
        actions={{
          draw, shuffleDeck, toHand, toPile, placeFree, toggleTap, flipCard, resetMine, share, updMark, delMark, go, removeTokenCard, showCard,
          startAim, clearArrows, pingCard, mulligan, coin, sendMsg, addMarker, peekDeck, editMark, shareWatch, hasOpp: !!opp,
        }}
      />
    </div>
  );
}

function TableSheets({ sheet, setSheet, mine, opp, tokens, meta, actions, messages, userId, tribune }) {
  const close = () => setSheet(null);
  const A = actions;
  if (!sheet) return null;

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
      </div>
    ) : null;
    if (zone === "hand") {
      if (A.hasOpp) btns.push(["Montrer à l'adversaire", () => A.showCard(iid)]);
    } else if (zone === "board" && b) {
      btns.push([b.rot ? "Dégager" : "Engager", () => A.toggleTap(iid)]);
      btns.push([b.down ? "Révéler" : "Face cachée", () => A.flipCard(iid)]);
    }
    if (zone !== "hand") btns.push(["En main", () => A.toHand(iid, zone)]);
    if (zone !== "board") btns.push(["Sur le plateau", () => A.placeFree(iid, zone)]);
    if (zone !== "board") btns.push(["Poser face cachée", () => A.placeFree(iid, zone, true)]);
    for (const p of ["d1", "d2", "d3"]) if (p !== zone) btns.push([PILE_NAMES[p], () => A.toPile(iid, p, zone)]);
    btns.push(["Dessus du deck", () => A.toPile(iid, "deck", zone)]);
    btns.push(["Dessous du deck", () => A.toPile(iid, "deck", zone, true)]);
    if (c?.tok) btns.push(["Retirer le jeton du jeu", () => A.removeTokenCard(iid)]);
    return (
      <Sheet open onClose={close} title={c?.n}>
        <div className="preview"><img src={cardUrl(c, true)} alt={c?.n} /></div>
        {aimBtns}
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
        <div className="preview"><img src={cardUrl(sheet.c, true)} alt={sheet.c?.n} /></div>
        {sheet.hint && <p className="muted small" style={{ textAlign: "center" }}>{sheet.hint}</p>}
        {sheet.ping && (
          <button className="btn" style={{ width: "100%" }} onClick={() => { A.pingCard(sheet.ping.owner, sheet.ping.iid); close(); }}>
            📍 Signaler cette carte
          </button>
        )}
      </Sheet>
    );
  }

  if (sheet.kind === "deck" && mine) {
    const run = (f) => () => { f(); close(); };
    return (
      <Sheet open onClose={close} title={`Mon deck · ${mine.deck.length} carte(s)`}>
        <div className="actions">
          {[1, 3, 5, 7].map((n) => (
            <button key={n} className="btn" onClick={run(() => A.draw(n))} disabled={!mine.deck.length}>Piocher {n}</button>
          ))}
          <button className="btn" onClick={run(A.shuffleDeck)}>Mélanger</button>
          <button className="btn" onClick={A.peekDeck}>Chercher dans le deck</button>
          <button className="btn" onClick={() => setSheet({ kind: "mull" })} disabled={!mine.hand.length}>Mulligan{mine.mull ? " (déjà fait)" : ""}</button>
        </div>
      </Sheet>
    );
  }

  if (sheet.kind === "pile") {
    const st = sheet.side === "mine" ? mine : opp;
    if (!st) return null;
    const arr = sheet.pile === "deck" ? st.deck : st.piles[sheet.pile] || [];
    const list = [...arr].reverse(); // dessus en premier
    const owner = sheet.side === "mine" ? "Ma" : `${st.name} :`;
    return (
      <Sheet open onClose={close} title={`${sheet.pile === "deck" ? "Mon deck" : `${owner} ${PILE_NAMES[sheet.pile]}`} · ${arr.length}`}>
        {list.length === 0 && <p className="muted">Vide.</p>}
        {sheet.pile === "deck" && list.length > 0 && <p className="muted small" style={{ marginTop: 0 }}>Du dessus vers le dessous.</p>}
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
        <div className="actions" style={{ marginBottom: 14 }}>
          <button className="btn" onClick={() => { A.coin(); close(); }}>Pile ou face</button>
          <button className="btn" onClick={() => setSheet({ kind: "mull" })} disabled={!mine?.hand.length}>Mulligan{mine?.mull ? " (déjà fait)" : ""}</button>
          <button className="btn" onClick={() => { A.shuffleDeck(); close(); }}>Mélanger mon deck</button>
          <button className="btn" onClick={() => { close(); A.resetMine(); }}>Tout remettre dans le deck</button>
          <button className="btn" onClick={() => A.go("home")}>Quitter la table</button>
        </div>
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
function PhaseBar({ st, opp, onPhase, onEnd, onClear }) {
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
      <button className="ph end" onClick={onEnd} disabled={!st.phase}>Fin ⏎</button>
    </div>
  );
}

// Flèches d'attaque (rouges) et de ciblage (bleues), en px du plateau
export function Arrows({ L, s, mine, opp, aim }) {
  const pos = (owner, tgt) => {
    const m = L[owner];
    if (!m) return null;
    if (tgt.p) return { x: m.panel.left + m.panel.width / 2, y: m.panel.top + m.panel.height / 2 };
    const st = owner === "mine" ? mine : opp;
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
    return owner === "mine"
      ? { x: m.mat.left + x * s, y: m.mat.top + y * s }
      : { x: m.mat.left + x * s, y: m.mat.top + (MAT_H - y) * s };
  };
  const list = [];
  const seen = {};
  for (const [owner, st] of [["mine", mine], ["opp", opp]]) {
    for (const a of st?.arrows || []) {
      const p0 = pos(owner, { iid: a.from });
      const tOwner = a.to.s === "me" ? owner : owner === "mine" ? "opp" : "mine";
      const p1 = pos(tOwner, a.to);
      if (!p0 || !p1) continue;
      // Attaque combinée : les flèches vers une même cible s'écartent les unes des autres
      const key = `${tOwner}:${a.to.iid || a.to.t || (a.to.p ? "p" : "")}`;
      seen[key] = (seen[key] || 0) + 1;
      const i = seen[key] - 1;
      const bend = (i % 2 ? -1 : 1) * (0.15 + 0.12 * Math.floor((i + 1) / 2));
      list.push({ id: `${owner}${a.id}`, p0, p1, bend, k: a.k === "atk" ? "atk" : "cib" });
    }
  }
  const src = aim ? pos("mine", { iid: aim.iid }) : null;
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
export function ScorePanel({ st, mine, layout, box, onSet, onAim, onUnif, extra, sub, hand }) {
  const ph = st?.phase ? PHASE_BY_ID[st.phase] : null;
  const unif = st?.unif || 0;
  return (
    <div
      className={`score ${layout} ${mine ? "mine" : "opp"} ${onAim ? "aimable" : ""} ${ph ? "active" : ""}`}
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
      </div>
      {(mine || unif > 0) && (
        <button className={`unif u${unif}`} onClick={(e) => { if (onAim) return; e.stopPropagation(); onUnif?.(); }} title={unif ? UNIF_BONUS[unif] : "Unification"}>
          <small>UNIF</small>
          <b>{unif || "–"}</b>
        </button>
      )}
      {hand != null && (
        <div className="hand-fan" title={`${hand} carte${hand > 1 ? "s" : ""} en main`} aria-label={`${hand} cartes en main`}>
          <div className="fan">
            <i /><i /><i />
          </div>
          <b>{hand}</b>
          <small>main</small>
        </div>
      )}
      <Stat label="PI" k="pi" v={st?.pi ?? 0} cls="pi" onSet={mine && !onAim ? onSet : null} />
      <Stat label="PV" k="pv" v={st?.pv ?? 0} cls="pv" onSet={mine && !onAim ? onSet : null} />
      {extra}
    </div>
  );
}
