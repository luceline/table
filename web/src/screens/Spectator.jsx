import { useCallback, useEffect, useRef, useState } from "react";
import { pb, cardUrl, fileUrl } from "../pb.js";
import { Mat } from "./Mat.jsx";
import { ScorePanel, Arrows, Journal, boardLayout, BAR, RAIL } from "./Table.jsx";
import { Sheet, Toast } from "../components/ui.jsx";
import { MAT_W, MAT_H, GAP } from "../lib/mat.js";
import { normalize, rid } from "../lib/game.js";
import { playVoice, unlockAudio, onVoiceState } from "../lib/voice.js";

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
  const [view, setView] = useState(null); // carte agrandie
  const [pings, setPings] = useState([]);
  const [sound, setSound] = useState(false);
  const [speaking, setSpeaking] = useState(null);
  const [tab, setTab] = useState("log");
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
    const who = rec.player === g.p1 ? "p1" : rec.player === g.p2 ? "p2" : null;
    if (!who) return;
    const st = normalize(rec.state);
    const prev = last.current[who];
    if (prev) {
      const lg = st.log?.[st.log.length - 1];
      if (lg && lg.t > prev.log) setToast(logLine(st.name, lg.m));
      if (st.ping && st.ping.t > prev.ping) addPing(st.ping.s === "me" ? who : who === "p1" ? "p2" : "p1", st.ping.iid);
      if (st.reveal && st.reveal.t > prev.reveal && st.cards[st.reveal.iid]) {
        setView({ c: st.cards[st.reveal.iid], title: `${st.name} montre une carte de sa main` });
      }
    }
    last.current[who] = { log: st.log?.[st.log.length - 1]?.t || 0, ping: st.ping?.t || 0, reveal: st.reveal?.t || 0 };
    (who === "p1" ? setP1 : setP2)(st);
  }, [addPing]);

  const applyMsg = useCallback((m, live) => {
    if (msgIds.current.has(m.id)) return;
    msgIds.current.add(m.id);
    setMessages((l) => [...l, m].slice(-200));
    if (!live) return;
    if (m.audio) {
      if (soundRef.current) playVoice(fileUrl("messages", m.id, m.audio), { name: m.name, dur: m.dur, id: m.id });
      else setToast(`🎤 ${m.name} a envoyé un message vocal (activez le son pour l'entendre)`);
    } else setToast(`💬 ${m.name} : ${m.text}`);
  }, []);

  useEffect(() => {
    let unsubs = [];
    let alive = true;
    (async () => {
      try {
        const g = await pb.collection("games").getFirstListItem(`code="${code}"`, { query: q });
        if (!alive) return;
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
      } catch (_) {
        if (alive) setErr("Partie introuvable. Vérifiez le lien ou le code de la partie.");
      }
    })();
    return () => {
      alive = false;
      unsubs.forEach((u) => u?.());
    };
  }, [code]);

  useEffect(() => {
    onVoiceState(setSpeaking);
    return () => onVoiceState(null);
  }, []);

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
    setToast("Son activé : les messages vocaux seront lus");
  }

  // Toucher une carte visible : agrandissement
  function press(e, src) {
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
  const count = (st) => (st ? `main ${st.hand.length} · deck ${st.deck.length}` : "");
  const lastLog = [p1, p2]
    .filter(Boolean)
    .map((st) => ({ st, l: st.log?.[st.log.length - 1] }))
    .filter((x) => x.l)
    .sort((a, b) => b.l.t - a.l.t)[0];

  const panelBody = (
    <>
      <div className="hand-tabs" style={{ margin: "8px 10px" }}>
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>📜 Journal</button>
        <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>💬 Tchat ({messages.length})</button>
      </div>
      <div className="spec-panel-body">
        {tab === "log" ? (
          <Journal mine={p1} opp={p2} noFilter />
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
        <div className="ticker" style={{ flex: 1 }}>{lastLog ? logLine(lastLog.st.name, lastLog.l.m) : game ? `${game.n1 || "Joueur 1"} contre ${game.n2 || "…"}` : "Chargement…"}</div>
        {!sound && <button className="btn sm" onClick={enableSound} title="Entendre les messages vocaux">🔊 Son</button>}
      </div>
      <div className="spec-main">
        <div className="viewport" ref={vpRef}>
          {game && vp.w > 0 && (
            <div className="board" style={{ width: L.w, height: L.h, marginTop: 6, marginBottom: 6 }}>
              <ScorePanel st={p2 || { name: game.n2 || "En attente d'un adversaire" }} layout={L.mode} box={L.opp.panel} />
              <Mat side="opp" st={p2} s={s} top={L.opp.mat.top} left={L.opp.mat.left} tokens={tokens("p2")} onPress={press} pings={pings.filter((x) => x.owner === "p2")} spectator />
              <Mat side="mine" st={p1} s={s} top={L.mine.mat.top} left={L.mine.mat.left} tokens={tokens("p1")} onPress={press} pings={pings.filter((x) => x.owner === "p1")} spectator />
              <ScorePanel st={p1 || { name: game.n1 }} layout={L.mode} box={L.mine.panel} />
              <Arrows L={L} s={s} mine={p1} opp={p2} />
              <div className="spec-count top" style={{ left: L.opp.mat.left + 6, top: L.opp.mat.top + 4 }}>{count(p2)}</div>
              <div className="spec-count" style={{ left: L.mine.mat.left + 6, top: L.mine.mat.top + MAT_H * s - 24 }}>{count(p1)}</div>
            </div>
          )}
        </div>
        <div className="spec-panel">{panelBody}</div>
      </div>

      {speaking && <div className="bubble voice spec-bubble">🔊 <b>{speaking.name}</b> parle…</div>}
      <Toast text={toast} onDone={() => setToast("")} ms={3500} />
      <Sheet open={!!view} onClose={() => setView(null)} title={view?.title || view?.c?.n || "Carte"}>
        {view && (
          <div className="preview">
            <img src={cardUrl(view.c, true)} alt={view.c.n} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
