import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomPreview } from "../components/ZoomView.jsx";
import { pb, cardUrl, fileUrl, safeUn } from "../pb.js";
import { Mat } from "./Mat.jsx";
import { ScorePanel, Arrows, Journal, boardLayout, BAR, RAIL } from "./Table.jsx";
import { Sheet, Toast, PhaseFlash } from "../components/ui.jsx";
import { ReactionLayer, useReactionQueue } from "../components/Reactions.jsx";
import { reactionOf } from "../lib/reactions.js";
import { SignalBadge } from "../components/Signals.jsx";
import { MAT_W, MAT_H, GAP } from "../lib/mat.js";
import { normalize, rid, TCG, PHASE_BY_ID } from "../lib/game.js";
import { activateTcg, tcgOf } from "../lib/tcg.js";
import { PILE_BY_ID } from "../lib/mat.js";
import { playVoice, unlockAudio, onVoiceState } from "../lib/voice.js";
import { beWatcher, watchCount, specName, setSpecName } from "../lib/tribune.js";
import { Mesh, rtcOk, audioOut, camId, specPeerId } from "../lib/rtc.js";
import { CamOverlay, VideoTokens } from "../components/CamView.jsx";

const logLine = (who, m) => (m.startsWith("⚠ ") ? `⚠ ${who} ${m.slice(2)}` : `${who} ${m}`);

// Mode spectateur : lecture seule d'une partie par son code (lien ?voir=CODE), sans compte.
// Joueur 1 en bas, joueur 2 en haut. Mains, decks et cartes face cachée ne sont pas affichés.
export default function Spectator({ code }) {
  const q = { spectate: code };
  const [game, setGame] = useState(null);
  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);
  const [marks, setMarks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [phaseFlash, setPhaseFlash] = useState(null); // nouvelle phase d'un joueur, annoncée en grand
  const [reacts, pushReact] = useReactionQueue(); // réactions des joueurs
  const [view, setView] = useState(null); // carte agrandie
  const [pileView, setPileView] = useState(null); // défausse ouverte : { who, pile }
  const [pings, setPings] = useState([]);
  const [sound, setSound] = useState(false);
  const [speaking, setSpeaking] = useState(null);
  const [tab, setTab] = useState("log");
  const [tribune, setTribune] = useState([]); // tchat des spectateurs
  const [trUnread, setTrUnread] = useState(0);
  const [watching, setWatching] = useState(0);
  const tabRef = useRef("log");
  const trIds = useRef(new Set());
  tabRef.current = tab;
  const [wide, setWide] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const vpRef = useRef();
  const gameRef = useRef(null);
  const last = useRef({}); // dernières valeurs vues par joueur (journal, signalement, carte montrée)
  const msgIds = useRef(new Set());
  const soundRef = useRef(false);

  const addPing = useCallback((owner, iid) => {
    const k = rid(6);
    setPings((l) => [...l, { owner, iid, k }]);
    setTimeout(() => setPings((l) => l.filter((x) => x.k !== k)), 2800);
  }, []);

  const applySeat = useCallback((rec) => {
    const g = gameRef.current;
    if (!g || !rec?.state?.cards) return;
    const who = g.solo ? ((rec.slot || "") === "b" ? "p2" : "p1") : rec.player === g.p1 ? "p1" : rec.player === g.p2 ? "p2" : null;
    if (!who) return;
    const st = normalize(rec.state);
    const prev = last.current[who];
    if (prev) {
      // Nouvelle phase d'un joueur : annoncée en grand
      const lg = st.log?.[st.log.length - 1];
      const newPhase = st.phase && st.phase !== prev.phase && PHASE_BY_ID[st.phase];
      if (newPhase) setPhaseFlash({ key: Date.now(), id: st.phase, who: `${st.name}${lg?.m?.startsWith("commence") ? ` · tour ${st.turn}` : ""}`, label: PHASE_BY_ID[st.phase].label });
      if (lg && lg.t > prev.log && !(newPhase && /^(commence son tour|passe en phase)/.test(lg.m))) setToast(logLine(st.name, lg.m));
      if (st.ping && st.ping.t > prev.ping) addPing(st.ping.s === "me" ? who : who === "p1" ? "p2" : "p1", st.ping.iid);
      const rvc = st.reveal && (st.reveal.card || st.cards[st.reveal.iid]);
      if (st.reveal && st.reveal.t > prev.reveal && rvc) {
        setView({ c: rvc, title: st.reveal.card ? `${st.name} montre une carte` : `${st.name} montre une carte de sa main` });
      }
    }
    last.current[who] = { log: st.log?.[st.log.length - 1]?.t || 0, ping: st.ping?.t || 0, reveal: st.reveal?.t || 0, phase: st.phase || "" };
    (who === "p1" ? setP1 : setP2)(st);
  }, [addPing]);

  const applyMsg = useCallback((m, live) => {
    if (msgIds.current.has(m.id)) return;
    msgIds.current.add(m.id);
    const r = reactionOf(m);
    if (r) return live && pushReact({ r, name: m.name });
    setMessages((l) => [...l, m].slice(-200));
    if (!live) return;
    if (m.audio) {
      if (soundRef.current) playVoice(fileUrl("messages", m.id, m.audio), { name: m.name, dur: m.dur, id: m.id });
      else setToast(`🎤 ${m.name} a envoyé un message vocal (activez le son pour l'entendre)`);
    } else setToast(`💬 ${m.name} : ${m.text}`);
  }, []);

  const applyTrib = useCallback((m, live) => {
    if (trIds.current.has(m.id)) return;
    trIds.current.add(m.id);
    setTribune((l) => [...l, m].slice(-200));
    if (live && tabRef.current !== "trib") setTrUnread((n) => n + 1);
  }, []);

  useEffect(() => {
    let unsubs = [];
    let alive = true;
    (async () => {
      try {
        const g = await pb.collection("games").getFirstListItem(`code="${code}"`, { query: q });
        if (!alive) return;
        activateTcg(tcgOf(g)); // tapis et règles du jeu de cette partie
        gameRef.current = g;
        setGame(g);
        const [seats, mk, msgs] = await Promise.all([
          pb.collection("seats").getFullList({ filter: `game="${g.id}"`, query: q }),
          pb.collection("marks").getFullList({ filter: `game="${g.id}"`, query: q }),
          pb.collection("messages").getList(1, 100, { filter: `game="${g.id}"`, sort: "-created", query: q }).catch(() => ({ items: [] })),
        ]);
        seats.forEach(applySeat);
        setMarks(mk);
        msgs.items.reverse().forEach((m) => applyMsg(m, false));
        const trib = await pb.collection("tribune").getList(1, 100, { filter: `game="${g.id}"`, sort: "-created", query: q }).catch(() => ({ items: [] }));
        trib.items.reverse().forEach((m) => applyTrib(m, false));
        // présence : je compte parmi les spectateurs, et je vois combien nous sommes
        unsubs.push(beWatcher(g.id, code));
        unsubs.push(watchCount(g.id, setWatching, q));
        const opt = { filter: `game="${g.id}"`, query: q };
        unsubs.push(await pb.collection("games").subscribe(g.id, (e) => { gameRef.current = e.record; setGame(e.record); }, { query: q }));
        unsubs.push(await pb.collection("seats").subscribe("*", (e) => e.record.game === g.id && applySeat(e.record), opt));
        unsubs.push(await pb.collection("marks").subscribe("*", (e) => {
          if (e.record.game !== g.id) return;
          setMarks((cur) => {
            if (e.action === "delete") return cur.filter((t) => t.id !== e.record.id);
            const i = cur.findIndex((t) => t.id === e.record.id);
            return i < 0 ? [...cur, e.record] : cur.map((t) => (t.id === e.record.id ? e.record : t));
          });
        }, opt));
        unsubs.push(await pb.collection("messages").subscribe("*", (e) => e.action === "create" && e.record.game === g.id && applyMsg(e.record, true), opt).catch(() => () => {}));
        unsubs.push(await pb.collection("tribune").subscribe("*", (e) => e.action === "create" && e.record.game === g.id && applyTrib(e.record, true), opt).catch(() => () => {}));
      } catch (_) {
        if (alive) setErr("Partie introuvable. Vérifiez le lien ou le code de la partie.");
      }
    })();
    return () => {
      alive = false;
      unsubs.forEach(safeUn);
    };
  }, [code]);

  useEffect(() => {
    onVoiceState(setSpeaking);
    return () => onVoiceState(null);
  }, []);

  // Son en direct des joueurs et caméra d'un joueur filmé (pair à pair), reçus seulement
  const [peers, setPeers] = useState({});
  const [camGeo, setCamGeo] = useState({}); // tapis filmés affichés (placement des flèches)
  const meshRef = useRef(null);
  const touched = useRef(new Set());
  const seatFilmed = useRef({});
  useEffect(() => {
    if (!game?.id || !rtcOk()) return;
    const m = new Mesh({
      gameId: game.id,
      self: specPeerId(),
      query: q,
      plan: (peer) => {
        const g = gameRef.current;
        if (!g) return null;
        if (peer === g.p1 || (g.p2 && peer === g.p2)) return { offer: false, audio: "recv" };
        if (peer.startsWith("cam-") && seatFilmed.current[peer.slice(4)]) return { offer: false, video: "recv" };
        return null;
      },
      onPeer: (id, info) => {
        setPeers((cur) => {
          const n = { ...cur };
          if (info) n[id] = { ...info, v: (cur[id]?.v || 0) + 1 };
          else delete n[id];
          return n;
        });
        if (!id.startsWith("cam-")) audioOut.set(id, info?.stream || null);
      },
    });
    audioOut.mute(!soundRef.current);
    meshRef.current = m;
    m.start([]);
    return () => {
      m.stop();
      audioOut.clear();
      meshRef.current = null;
      touched.current = new Set();
    };
  }, [game?.id]);
  useEffect(() => {
    const m = meshRef.current;
    if (!m || !game) return;
    seatFilmed.current = { [game.p1]: !!p1?.filmed, ...(game.p2 ? { [game.p2]: !!p2?.filmed } : null) };
    const want = [game.p1, game.p2, p1?.filmed && camId(game.p1), p2?.filmed && game.p2 && camId(game.p2)].filter(Boolean);
    for (const t of want) {
      if (touched.current.has(t)) continue;
      touched.current.add(t);
      m.touch(t);
    }
  }, [game?.id, game?.p2, !!p1?.filmed, !!p2?.filmed, !!meshRef.current]);

  // Taille de la zone de jeu
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px) and (min-aspect-ratio: 5/4)");
    const upd = () => {
      setWide(mq.matches);
      const r = vpRef.current?.getBoundingClientRect();
      if (r) setVp({ w: r.width, h: r.height });
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (vpRef.current) ro.observe(vpRef.current);
    mq.addEventListener?.("change", upd);
    window.addEventListener("resize", upd);
    return () => {
      ro.disconnect();
      mq.removeEventListener?.("change", upd);
      window.removeEventListener("resize", upd);
    };
  }, [game]);

  function enableSound() {
    unlockAudio();
    soundRef.current = true;
    setSound(true);
    audioOut.mute(false);
    setToast("Son activé : vous entendez les joueurs (vocal en direct et messages vocaux)");
  }

  // Toucher une carte visible : agrandissement
  function press(e, src) {
    if (src.type === "pile") {
      if (src.pile === "deck") return setToast("Le deck est caché");
      return setPileView({ who: src.side === "mine" ? "p1" : "p2", pile: src.pile });
    }
    if (src.type !== "board" && src.type !== "oppboard") return;
    const st = src.side === "mine" ? p1 : p2;
    const b = st?.board.find((x) => x.iid === src.iid);
    if (!b || b.down) return setToast("Carte face cachée");
    setView({ c: st.cards[src.iid] });
  }

  if (err) {
    return (
      <div className="page">
        <div className="card-box">
          <h2>Mode spectateur</h2>
          <p className="err">{err}</p>
          <a className="btn" href={window.location.pathname}>Aller à l'accueil</a>
        </div>
      </div>
    );
  }

  const side = wide;
  const avW = Math.max(0, vp.w - 12), avH = Math.max(0, vp.h - 12);
  const s = side
    ? Math.max(0.2, Math.min((avW - RAIL) / MAT_W, avH / (2 * MAT_H + GAP)))
    : Math.max(0.2, Math.min(avW / MAT_W, (avH - 2 * BAR) / (2 * MAT_H + GAP)));
  const L = boardLayout(side, null, s);
  const tokens = (who) => marks.filter((t) => t.side === who);
  // Joueur du haut filmé (Safir) : même présentation que chez son adversaire (image retournée, territoires du bas inversés)
  const mirrorP1 = TCG !== "fab" && !!p2?.filmed && !p1?.filmed;
  // mains et decks : dans la barre de chaque joueur (sur le tapis, l'étiquette cachait commandant et défausse)
  const count = (st) => (st ? (st.filmed ? "cartes réelles, filmées" : `deck ${st.deck.length}`) : "");
  const lastLog = [p1, p2]
    .filter(Boolean)
    .map((st) => ({ st, l: st.log?.[st.log.length - 1] }))
    .filter((x) => x.l)
    .sort((a, b) => b.l.t - a.l.t)[0];

  const panelBody = (
    <>
      <div className="hand-tabs" style={{ margin: "8px 10px" }}>
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>📜 Journal</button>
        <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>💬 Joueurs ({messages.length})</button>
        <button className={tab === "trib" ? "on" : ""} onClick={() => { setTab("trib"); setTrUnread(0); }}>
          📣 Tribune{trUnread > 0 ? <span className="unread in-tab">{trUnread}</span> : ` (${tribune.length})`}
        </button>
      </div>
      <div className="spec-panel-body">
        {tab === "log" ? (
          <Journal mine={p1} opp={p2} noFilter />
        ) : tab === "trib" ? (
          <TribunePanel list={tribune} gameId={game?.id} code={code} setToast={setToast} />
        ) : (
          <div className="chat-list" style={{ maxHeight: "none" }}>
            {messages.length === 0 && <span className="muted small">Aucun message.</span>}
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.author === game?.p1 ? "me" : "op"}`}>
                <b>{m.name} </b>
                {m.audio ? (
                  <button className="voice-msg" onClick={() => { unlockAudio(); playVoice(fileUrl("messages", m.id, m.audio), { name: m.name, dur: m.dur, id: m.id }); }}>
                    ▶ 🎤 message vocal{m.dur ? ` · ${Math.round(m.dur)} s` : ""}
                  </button>
                ) : (
                  m.text
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className={`table spectator ${wide ? "wide" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <div className="tbar">
        <a className="btn sm" href={window.location.pathname} aria-label="Accueil">←</a>
        <span className="spec-badge">👁 SPECTATEUR</span>
        {watching > 0 && <span className="watch-chip" title="Spectateurs connectés">👁 {watching}</span>}
        <div className="ticker" style={{ flex: 1 }}>{lastLog ? logLine(lastLog.st.name, lastLog.l.m) : game ? `${game.n1 || "Joueur 1"} contre ${game.n2 || "…"}` : "Chargement…"}</div>
        {!sound && <button className="btn sm" onClick={enableSound} title="Entendre les joueurs">🔊 Son</button>}
      </div>
      <div className="spec-main">
        <div className="viewport" ref={vpRef}>
          {game && vp.w > 0 && (
            <div className="board" key={TCG} style={{ width: L.w, height: L.h, marginTop: 6, marginBottom: 6 }}>
              <ScorePanel st={p2 || { name: game.n2 || "En attente d'un adversaire" }} layout={L.mode} box={L.opp.panel} sub={count(p2)} hand={p2 && !p2.filmed ? p2.hand.length : null} />
              <Mat side="opp" st={p2} vs={p1} s={s} top={L.opp.mat.top} left={L.opp.mat.left} tokens={tokens("p2")} onPress={press} pings={pings.filter((x) => x.owner === "p2")} spectator />
              {p2?.filmed && (
                <CamOverlay left={L.opp.mat.left} top={L.opp.mat.top} w={MAT_W * s} h={MAT_H * s} stream={peers[camId(game.p2)]?.stream} state={peers[camId(game.p2)]?.state} rot={((p2.camRot || 0) + (mirrorP1 ? 180 : 0)) % 360} name={p2.name} side="opp" tapZoom onGeom={(g) => setCamGeo((c) => ({ ...c, opp: g }))} />
              )}
              {p2?.filmed && <VideoTokens tokens={tokens("p2").filter((t) => t.on === "v")} box={{ left: L.opp.mat.left, top: L.opp.mat.top, w: MAT_W * s, h: MAT_H * s }} geo={camGeo.opp} s={s} />}
              <Mat side="mine" flipX={mirrorP1} st={p1} vs={p2} s={s} top={L.mine.mat.top} left={L.mine.mat.left} tokens={tokens("p1")} onPress={press} pings={pings.filter((x) => x.owner === "p1")} spectator />
              {p1?.filmed && (
                <CamOverlay left={L.mine.mat.left} top={L.mine.mat.top} w={MAT_W * s} h={MAT_H * s} stream={peers[camId(game.p1)]?.stream} state={peers[camId(game.p1)]?.state} rot={p1.camRot || 0} name={p1.name} side="mine" tapZoom onGeom={(g) => setCamGeo((c) => ({ ...c, mine: g }))} />
              )}
              {p1?.filmed && <VideoTokens tokens={tokens("p1").filter((t) => t.on === "v")} box={{ left: L.mine.mat.left, top: L.mine.mat.top, w: MAT_W * s, h: MAT_H * s }} geo={camGeo.mine} s={s} />}
              <ScorePanel st={p1 || { name: game.n1 }} mine layout={L.mode} box={L.mine.panel} sub={count(p1)} hand={p1 && !p1.filmed ? p1.hand.length : null} />
              <Arrows L={L} s={s} mine={p1} opp={p2} cams={camGeo} flipMine={mirrorP1} />
              <SignalBadge st={p2} box={{ left: L.opp.mat.left, top: L.opp.mat.top, w: MAT_W * s, h: MAT_H * s }} />
              <SignalBadge st={p1} box={{ left: L.mine.mat.left, top: L.mine.mat.top, w: MAT_W * s, h: MAT_H * s }} />
            </div>
          )}
        </div>
        <div className="spec-panel">{panelBody}</div>
      </div>

      {speaking && <div className="bubble voice spec-bubble">🔊 <b>{speaking.name}</b> parle…</div>}
      <Toast text={toast} onDone={() => setToast("")} ms={3500} className="act" />
      <PhaseFlash flash={phaseFlash} onDone={() => setPhaseFlash(null)} />
      <ReactionLayer items={reacts} />
      {(() => {
        const st = pileView ? (pileView.who === "p1" ? p1 : p2) : null;
        const arr = st ? [...(st.piles?.[pileView.pile] || [])].reverse() : []; // dessus en premier
        return (
          <Sheet open={!!pileView} onClose={() => setPileView(null)} title={st ? (TCG === "fab" ? `${st.name} : ${PILE_BY_ID[pileView.pile]?.short || ""} · ${arr.length}` : `${st.name} : Défausse ${{ d1: "I", d2: "II", d3: "III" }[pileView.pile]} · ${arr.length}`) : ""}>
            {arr.length === 0 && <p className="muted">Vide.</p>}
            <div className="pile-grid">
              {arr.map((iid) => {
                const c = st.cards[iid];
                return (
                  <div key={iid} className="thumb" style={c?.o === "l" ? { aspectRatio: "88 / 63" } : null} onClick={() => { setView({ c, back: pileView }); setPileView(null); }}>
                    <img src={cardUrl(c)} alt={c?.n} />
                    <div className="cap">{c?.n}</div>
                  </div>
                );
              })}
            </div>
          </Sheet>
        );
      })()}
      <Sheet open={!!view} onClose={() => { if (view?.back) setPileView(view.back); setView(null); }} title={view?.title || view?.c?.n || "Carte"}>
        {view && (
          <ZoomPreview src={cardUrl(view.c, true)} alt={view.c.n} />
        )}
      </Sheet>
    </div>
  );
}

// Tribune : les spectateurs discutent entre eux ; les joueurs la voient (et peuvent la couper)
function TribunePanel({ list, gameId, code, setToast }) {
  const [name, setName] = useState(specName());
  const [nameDraft, setNameDraft] = useState("");
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const lastSent = useRef(0);
  const listRef = useRef();
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  async function send(e) {
    e.preventDefault();
    const t = txt.trim();
    if (!t || !gameId || busy) return;
    if (Date.now() - lastSent.current < 3000) return setToast("Doucement : un message toutes les 3 secondes");
    setBusy(true);
    try {
      await pb.collection("tribune").create({ game: gameId, name, text: t.slice(0, 200) }, { query: { spectate: code } });
      lastSent.current = Date.now();
      setTxt("");
    } catch (_) {
      setToast("Message non envoyé, réessayez");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="trib-panel">
      <div className="chat-list" ref={listRef} style={{ maxHeight: "none", flex: 1 }}>
        {list.length === 0 && <span className="muted small">Aucun message. Les joueurs voient la tribune (ils peuvent la couper).</span>}
        {list.map((m) => (
          <div key={m.id} className={`msg trib ${m.name === name ? "me" : ""}`}>
            <b>{m.name} </b>{m.text}
          </div>
        ))}
      </div>
      {name ? (
        <form className="row" onSubmit={send}>
          <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={`${name}, votre message`} maxLength={200} />
          <button className="btn primary" disabled={!txt.trim() || busy}>Envoyer</button>
        </form>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim().slice(0, 24);
            if (!n) return;
            setSpecName(n);
            setName(n);
          }}
        >
          <input className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Votre pseudo pour écrire" maxLength={24} />
          <button className="btn primary" disabled={!nameDraft.trim()}>OK</button>
        </form>
      )}
    </div>
  );
}
