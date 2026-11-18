import { useCallback, useEffect, useRef, useState } from "react";
import { pb, me, cardUrl, errMsg } from "../pb.js";
import { Mat } from "./Mat.jsx";
import { Sheet, Toast } from "../components/ui.jsx";
import { MAT_W, MAT_H, GAP, BOARD_H, CARD, SLOTS, slotAt, pileAt, placeName, boxAt, inRect, rotPt } from "../lib/mat.js";
import { normalize, detach, addLog, shuffle, resetState, rid, TOKEN_COLORS, TOKEN_HEX } from "../lib/game.js";

const ZOOMS = [1, 1.5, 2.2];
const PILE_NAMES = { d1: "Défausse I", d2: "Défausse II", d3: "Défausse III", deck: "Deck" };
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
  const [fit, setFit] = useState(0.5);
  const [hover, setHover] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [offline, setOffline] = useState(false);
  const [handH, setHandH] = useState(null);
  const [panel, setPanel] = useState("hand");
  const mainRef = useRef();

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

  const s = fit * ZOOMS[zoom];
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
      if (last && lastOppLog.current !== null && last.t > lastOppLog.current) setToast(`${o.name} ${last.m}`);
      lastOppLog.current = last ? last.t : 0;
      // Carte montrée par l'adversaire (ignorée au premier chargement)
      const rv = o.reveal;
      if (rv && lastReveal.current !== null && rv.t > lastReveal.current && o.cards[rv.iid]) {
        setSheet({ kind: "view", c: o.cards[rv.iid], title: `${o.name} vous montre`, hint: o.cards[rv.iid].n });
      }
      lastReveal.current = rv ? rv.t : 0;
    }
    oppRef.current = o;
    setOpp(o);
  }, [user.id]);

  const loadAll = useCallback(async () => {
    const [g, seats, marks] = await Promise.all([
      pb.collection("games").getOne(gameId),
      pb.collection("seats").getFullList({ filter: `game="${gameId}"` }),
      pb.collection("marks").getFullList({ filter: `game="${gameId}"` }),
    ]);
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
  }, [gameId, loadAll, applyGame, applySeat, applyMark]);

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
  const mut = useCallback((fn) => {
    if (!mineRef.current) return;
    const st = structuredClone(mineRef.current);
    const msg = fn(st);
    if (msg === false) return;
    if (typeof msg === "string") {
      const last = st.log?.[st.log.length - 1];
      const key = msg.startsWith("met ses P") ? msg.slice(0, 10) : null;
      if (last && key && last.m.startsWith(key) && Date.now() - last.t < 6000) {
        st.log = [...st.log.slice(0, -1), { t: Date.now(), m: msg }];
      } else addLog(st, msg);
    }
    st.rev = (st.rev || 0) + 1;
    mineRef.current = st;
    setMine(st);
    pushMine();
  }, [pushMine]);

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

  // ---------- Mise à l'échelle ----------
  // Portrait : le plateau prend la largeur, la place restante agrandit la main.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 560px)");
    const compute = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (mq.matches) {
        setHandH(null);
        setFit(Math.max(0.15, Math.min((W - 230 - 12) / MAT_W, (H - 12) / BOARD_H)));
        return;
      }
      const ctrl = 46 + 40;
      const fitW = (W - 12) / MAT_W;
      const boardH = BOARD_H * fitW + 12;
      const hh = clamp(H - ctrl - boardH, 112, 250);
      setHandH(hh);
      setFit(Math.max(0.15, Math.min(fitW, (H - ctrl - hh - 12) / BOARD_H)));
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    mq.addEventListener?.("change", compute);
    return () => {
      ro.disconnect();
      mq.removeEventListener?.("change", compute);
    };
  }, []);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
  }, [zoom]);

  // ---------- Actions de jeu ----------
  const nameOf = (st, iid) => st.cards[iid]?.n || "Carte";

  // Pose (ou déplace) une carte sur mon tapis, avec aimantation sur les emplacements
  function placeIn(st, iid, x, y, from) {
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
    const down = from === "deck" ? true : from === "board" ? !!prev?.down : false;
    detach(st, iid);
    st.board.push({ iid, x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, rot, down });
    const where = placeName(cx, cy);
    const nm = down ? "une carte face cachée" : `« ${c.n} »`;
    if (from === "board") return prev && Math.hypot(prev.x - cx, prev.y - cy) < 1 ? false : `déplace ${nm} vers ${where}`;
    if (from === "reserve") return `crée le jeton « ${c.n} » sur ${where}`;
    if (from === "hand") return `joue ${nm} sur ${where}`;
    if (from === "deck") return `pose ${nm} depuis son deck sur ${where}`;
    return `sort « ${c.n} » de sa ${PILE_NAMES[from]} vers ${where}`;
  }

  const placeOnBoard = (iid, x, y, from) => mut((st) => placeIn(st, iid, x, y, from));

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

  const placeFree = (iid, from) => {
    const st = mineRef.current;
    const taken = (sl) => st.board.some((b) => Math.abs(b.x - (sl.x + sl.w / 2)) < 3 && Math.abs(b.y - (sl.y + sl.h / 2)) < 3);
    const free = SLOTS.find((sl) => sl.kind !== "commandant" && !taken(sl));
    if (free) placeOnBoard(iid, free.x + free.w / 2, free.y + free.h / 2, from);
    else placeOnBoard(iid, 300, 130, from);
  };

  const toHand = useCallback((iid, from) => {
    if (mineRef.current?.cards[iid]?.tok) return removeTokenCard(iid);
    if (from === "board") clearTokensOn(iid);
    mut((st) => {
      const c = st.cards[iid];
      const prev = st.board.find((b) => b.iid === iid);
      detach(st, iid);
      st.hand.push(iid);
      if (from === "deck") return "prend 1 carte de son deck en main";
      if (from === "board") return prev?.down ? "reprend une carte face cachée en main" : `reprend « ${c.n} » en main`;
      return `reprend « ${c.n} » de sa ${PILE_NAMES[from]} en main`;
    });
  }, [mut]);

  const toPile = useCallback((iid, pid, from, bottom = false) => {
    if (mineRef.current?.cards[iid]?.tok) return removeTokenCard(iid);
    if (from === "board") clearTokensOn(iid);
    mut((st) => {
      const c = st.cards[iid];
      const prev = st.board.find((b) => b.iid === iid);
      detach(st, iid);
      if (pid === "deck") {
        bottom ? st.deck.unshift(iid) : st.deck.push(iid);
        const hidden = from === "hand" || from === "deck" || prev?.down;
        return `place ${hidden ? "une carte" : `« ${c.n} »`} ${bottom ? "sous" : "sur"} son deck`;
      }
      st.piles[pid].push(iid);
      return `défausse « ${c.n} » dans sa ${PILE_NAMES[pid]}`;
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
    if (!confirm("Remettre toutes vos cartes dans le deck, le mélanger, retirer vos cartes jetons et revenir à PI 4 / PV 0 ?")) return;
    mut((st) => {
      const r = resetState(st);
      Object.assign(st, r);
      return "remet tout son jeu dans son deck et le mélange";
    });
    tokRef.current.filter((t) => t.side === mySide).forEach((t) => delMark(t.id));
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
    if (inR(or)) return { area: "opp", x: MAT_W - (cx - or.left) / sc, y: MAT_H - (cy - or.top) / sc };
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
      const color = src.type === "palette" ? src.color : tokRef.current.find((t) => t.id === src.id)?.color;
      const d = Math.max(30, 10 * sc);
      g = { tok: true, color, w: d, h: d, v: src.type === "token" ? tokRef.current.find((t) => t.id === src.id)?.v : 1 };
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
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7) return;
      if (!canDrag(d.src)) return;
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
    if (d.started) {
      const loc = locate(e.clientX, e.clientY);
      endDrag();
      drop(d.src, loc);
    } else tap(d.src);
  };
  handlers.current.cancel = () => {
    detachListeners();
    dragRef.current = null;
    endDrag();
  };
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
    dragRef.current = { src, x0: e.clientX, y0: e.clientY, started: false };
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
      return addMark({ side: mySide, color: src.color, v: 1, ...a });
    }
    if (src.type === "token") {
      if (loc?.area === "opp") return setToast("Chacun ne joue que sur son côté du plateau.");
      if (!loc || loc.area === "hand") return delMark(src.id);
      return updMark(src.id, { side: mySide, ...attachAt(mySide, clamp(loc.x, 4, MAT_W - 4), clamp(loc.y, 4, MAT_H - 4), src.id) });
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
    switch (src.type) {
      case "hand":
        return setSheet({ kind: "card", iid: src.iid, zone: "hand" });
      case "board":
        return setSheet({ kind: "card", iid: src.iid, zone: "board" });
      case "oppboard": {
        const b = o?.board.find((x) => x.iid === src.iid);
        if (!b) return;
        if (b.down) return setToast("Carte face cachée");
        return setSheet({ kind: "view", c: o.cards[src.iid] });
      }
      case "pile":
        if (src.side === "mine") return setSheet(src.pile === "deck" ? { kind: "deck" } : { kind: "pile", pile: src.pile, side: "mine" });
        if (src.pile === "deck") return setToast(`Deck adverse : ${o?.deck.length || 0} carte(s)`);
        return setSheet({ kind: "pile", pile: src.pile, side: "opp" });
      case "token":
        return setSheet({ kind: "token", id: src.id });
      case "opptoken": {
        const t = tokRef.current.find((x) => x.id === src.id);
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
  const ticker = opp?.log?.length ? `${opp.name} ${opp.log[opp.log.length - 1].m}` : "";

  return (
    <div className="table" onContextMenu={(e) => e.preventDefault()} style={{ WebkitTouchCallout: "none" }}>
      <div className="tbar">
        <button className="btn sm ghost icon" onClick={() => go("home")} aria-label="Quitter">←</button>
        {opp ? (
          <>
            <div className="who">
              <b>{opp.name}</b>
              <span className="muted" style={{ fontSize: 11 }}>main {opp.hand.length} · deck {opp.deck.length}</span>
            </div>
            <span className="chip pi">PI {opp.pi}</span>
            <span className="chip pv">PV {opp.pv}</span>
          </>
        ) : (
          <span className="muted">En attente d'un adversaire</span>
        )}
        <div className="ticker">{offline ? "⚠ connexion perdue, nouvel essai…" : ticker}</div>
        <div className="zoom">
          <button onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Dézoomer" disabled={zoom === 0}>−</button>
          <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoomer" disabled={zoom === ZOOMS.length - 1}>+</button>
        </div>
        <button className="btn sm" onClick={() => setSheet({ kind: "menu" })} aria-label="Menu">☰</button>
      </div>

      <div className="main-area" ref={mainRef}>
        <div className="viewport" ref={vpRef}>
          <div className="board" style={{ width: MAT_W * s, height: BOARD_H * s, marginTop: 6, marginBottom: 6 }}>
            <Mat
              side="opp"
              st={opp}
              s={s}
              top={0}
              tokens={oppTokens}
              hover={hover}
              dragKey={dragKey}
              onPress={press}
              matRef={oppMatRef}
              waiting={
                !opp && meta ? (
                  <div className="waiting" style={{ top: 0, bottom: 0 }}>
                    <div>Partagez ce code avec votre adversaire</div>
                    <div className="code">{meta.code}</div>
                    <button className="btn sm" style={{ pointerEvents: "auto" }} onClick={share}>Partager le lien</button>
                    <div className="small">Vous pouvez déjà préparer votre jeu.</div>
                  </div>
                ) : null
              }
            />
            <Mat
              side="mine"
              st={mine}
              s={s}
              top={(MAT_H + GAP) * s}
              tokens={myTokens}
              hover={hover}
              dragKey={dragKey}
              onPress={press}
              onTrack={(t) => {
                const [k, v] = t.split(":");
                setTrack(k, Number(v) === mine?.[k] ? Number(v) - 1 : Number(v));
              }}
              matRef={myMatRef}
            />
          </div>
        </div>

        <div className="side">
          <div className="controls">
            <button className="btn sm primary" onClick={() => draw(1)} disabled={!mine}>
              Piocher <span style={{ opacity: 0.7 }}>({mine?.deck.length ?? 0})</span>
            </button>
            <div className="stepper pi">
              <button onClick={() => setTrack("pi", (mine?.pi || 0) - 1)}>−</button>
              <span>PI {mine?.pi ?? 0}</span>
              <button onClick={() => setTrack("pi", (mine?.pi || 0) + 1)}>+</button>
            </div>
            <div className="stepper pv">
              <button onClick={() => setTrack("pv", (mine?.pv || 0) - 1)}>−</button>
              <span>PV {mine?.pv ?? 0}</span>
              <button onClick={() => setTrack("pv", (mine?.pv || 0) + 1)}>+</button>
            </div>
          </div>
          <div className="controls2">
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
            {mine?.reserve?.length > 0 && (
              <div className="hand-tabs">
                <button className={panel === "hand" ? "on" : ""} onClick={() => setPanel("hand")}>Main {mine.hand.length}</button>
                <button className={panel === "reserve" ? "on" : ""} onClick={() => setPanel("reserve")}>Réserve {mine.reserve.length}</button>
              </div>
            )}
          </div>
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
        </div>
      </div>

      {ghost && (
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

      <Toast text={toast} onDone={() => setToast("")} />
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
        actions={{ draw, shuffleDeck, toHand, toPile, placeFree, toggleTap, flipCard, resetMine, share, updMark, delMark, go, removeTokenCard, showCard, hasOpp: !!opp }}
      />
    </div>
  );
}

function TableSheets({ sheet, setSheet, mine, opp, tokens, meta, actions }) {
  const close = () => setSheet(null);
  const A = actions;
  if (!sheet) return null;

  if (sheet.kind === "card" && mine) {
    const { iid, zone } = sheet;
    const c = mine.cards[iid];
    const b = mine.board.find((x) => x.iid === iid);
    const run = (f) => () => { f(); close(); };
    const btns = [];
    if (c?.tok) {
      if (b) {
        btns.push([b.rot ? "Dégager" : "Engager", () => A.toggleTap(iid)]);
        btns.push([b.down ? "Révéler" : "Face cachée", () => A.flipCard(iid)]);
      }
      btns.push(["Retirer le jeton", () => A.removeTokenCard(iid)]);
    } else if (zone === "hand") {
      if (A.hasOpp) btns.push(["Montrer à l'adversaire", () => A.showCard(iid)]);
    } else if (zone === "board" && b) {
      btns.push([b.rot ? "Dégager" : "Engager", () => A.toggleTap(iid)]);
      btns.push([b.down ? "Révéler" : "Face cachée", () => A.flipCard(iid)]);
    }
    if (!c?.tok) {
      if (zone !== "hand") btns.push(["En main", () => A.toHand(iid, zone)]);
      if (zone !== "board") btns.push(["Sur le plateau", () => A.placeFree(iid, zone)]);
      for (const p of ["d1", "d2", "d3"]) if (p !== zone) btns.push([PILE_NAMES[p], () => A.toPile(iid, p, zone)]);
      btns.push(["Dessus du deck", () => A.toPile(iid, "deck", zone)]);
      btns.push(["Dessous du deck", () => A.toPile(iid, "deck", zone, true)]);
    }
    return (
      <Sheet open onClose={close} title={c?.n}>
        <div className="preview"><img src={cardUrl(c, true)} alt={c?.n} /></div>
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
          <button className="btn" onClick={() => setSheet({ kind: "pile", pile: "deck", side: "mine" })}>Chercher dans le deck</button>
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
    const upd = (patch) => A.updMark(sheet.id, patch);
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
            A.delMark(sheet.id);
            close();
          }}
        >
          Retirer le jeton
        </button>
        <p className="muted small">Astuce : faire glisser un jeton hors des tapis le retire aussi.</p>
      </Sheet>
    );
  }

  if (sheet.kind === "menu") {
    const logs = [
      ...(mine?.log || []).map((l) => ({ ...l, who: mine.name, me: true })),
      ...(opp?.log || []).map((l) => ({ ...l, who: opp.name, me: false })),
    ].sort((a, b) => b.t - a.t).slice(0, 60);
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
        <div className="actions" style={{ marginBottom: 14 }}>
          <button className="btn" onClick={() => { A.shuffleDeck(); close(); }}>Mélanger mon deck</button>
          <button className="btn" onClick={() => { close(); A.resetMine(); }}>Tout remettre dans le deck</button>
          <button className="btn" onClick={() => A.go("home")}>Quitter la table</button>
        </div>
        <h3>Journal</h3>
        <div className="log-list">
          {logs.length === 0 && <span className="muted">Rien pour l'instant.</span>}
          {logs.map((l, i) => (
            <div key={i} className={l.me ? "me" : "op"}>
              <span className="muted">{new Date(l.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>{" "}
              <b>{l.who}</b> {l.m}
            </div>
          ))}
        </div>
      </Sheet>
    );
  }
  return null;
}
