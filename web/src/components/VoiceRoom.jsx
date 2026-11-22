// Salons vocaux : barre de contrôle (micro, sourdine, quitter) et scène (participants, écrans partagés)
import { useState } from "react";
import { me, errMsg } from "../pb.js";
import { CamVideo } from "./CamView.jsx";
import ZoomView from "./ZoomView.jsx";
import { useVoice, joinVoice, leaveVoice, setMic, setDeaf, startShare, stopShare, mutePeer, kickVoice, canShareScreen, clearVoiceErr } from "../lib/voicechan.js";

const initial = (n) => (n || "?").trim().charAt(0).toUpperCase();

// Petite barre « connecté au vocal » : dans la liste des salons, ou flottante sur les autres écrans
export function VoiceBar({ onOpen, className = "" }) {
  const v = useVoice();
  if (!v.room) return null;
  return (
    <div className={`voice-bar ${className}`}>
      <button className="voice-bar-name" onClick={onOpen} title="Ouvrir le salon vocal">
        <span className="voice-dot" />
        <span className="grow">
          <b>Vocal connecté</b>
          <span className="small muted"> · {v.room.name} · {v.here.length}</span>
        </span>
      </button>
      <button className={`btn icon sm ${v.mic ? "" : "off"}`} onClick={() => setMic(!v.mic)} aria-pressed={v.mic} title={v.mic ? "Couper mon micro" : "Activer mon micro"}>{v.mic ? "🎙" : "🔇"}</button>
      <button className={`btn icon sm ${v.deaf ? "off" : ""}`} onClick={() => setDeaf(!v.deaf)} aria-pressed={v.deaf} title={v.deaf ? "Réentendre les autres" : "Sourdine : ne plus entendre personne"}>{v.deaf ? "🔕" : "🎧"}</button>
      <button className="btn icon sm danger" onClick={() => leaveVoice()} title="Quitter le vocal" aria-label="Quitter le vocal">☎</button>
    </div>
  );
}

// Scène d'un salon vocal (zone principale des salons)
export function VoiceStage({ room, people: outside = [], admin }) {
  const v = useVoice();
  const user = me();
  const joined = v.room?.id === room.id;
  const people = joined ? v.here : outside;
  const [menu, setMenu] = useState(null); // participant touché : { uid, name }
  const [big, setBig] = useState(null); // écran agrandi : { stream, title }
  const [err, setErr] = useState("");
  const max = room.max || 6;
  const full = !joined && people.length >= max;

  const streamOf = (uid) => (uid === user.id ? v.local : v.peers[uid]?.stream || null);
  const shares = joined ? people.filter((h) => h.share && streamOf(h.user)) : [];
  const shareLabel = (h) => `${h.share === "screen" ? "🖥 Écran" : "📷 Caméra"} de ${h.user === user.id ? "vous" : h.name}`;

  async function kick(uid, name) {
    setMenu(null);
    if (!window.confirm(`Retirer ${name} du salon vocal ? Il ne pourra pas revenir pendant 10 minutes.`)) return;
    try {
      await kickVoice(uid);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="voice-stage">
      {shares.length > 0 && (
        <div className={`voice-screens n${Math.min(shares.length, 3)}`}>
          {shares.map((h) => (
            <button key={h.user} className="voice-screen" onClick={() => setBig({ stream: streamOf(h.user), title: shareLabel(h) })} title="Agrandir">
              <CamVideo stream={streamOf(h.user)} />
              <span className="voice-screen-tag">{shareLabel(h)} · 🔍</span>
            </button>
          ))}
        </div>
      )}
      <div className="voice-people">
        {!people.length && <p className="muted small">Personne pour l'instant.</p>}
        {people.map((h) => {
          const mine = h.user === user.id;
          const peer = v.peers[h.user];
          const linking = joined && !mine && peer?.state !== "connected";
          return (
            <button
              key={h.user}
              className={`voice-person ${joined && v.speaking[h.user] && (mine ? v.mic : h.mic) ? "talk" : ""}`}
              onClick={() => !mine && joined && setMenu({ uid: h.user, name: h.name })}
              disabled={mine || !joined}
            >
              <span className="voice-avatar">{initial(h.name)}</span>
              <span className="voice-pname">{mine ? "Vous" : h.name}</span>
              <span className="voice-icons small">
                {!h.mic && <span title="Micro coupé">🔇</span>}
                {h.share === "screen" && <span title="Partage son écran">🖥</span>}
                {h.share === "cam" && <span title="Partage sa caméra">📷</span>}
                {joined && v.muted[h.user] && <span title="Coupé pour vous">🔈✕</span>}
                {linking && <span className="muted">{peer?.state === "failed" ? "connexion impossible" : "connexion…"}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {!joined ? (
        <div className="voice-join">
          <button className="btn primary" disabled={full || v.joining} onClick={() => { clearVoiceErr(); joinVoice(room); }}>
            {v.joining ? "Connexion…" : full ? `Salon plein (${max})` : v.room ? "🔊 Changer de salon vocal" : "🔊 Rejoindre le vocal"}
          </button>
          <p className="muted small">Voix d'appareil à appareil, {max} personnes au plus. Partage d'écran depuis un ordinateur ; caméra depuis un téléphone (pour montrer vos cartes).</p>
        </div>
      ) : (
        <div className="voice-controls">
          <button className={`btn ${v.mic ? "" : "off"}`} onClick={() => setMic(!v.mic)}>{v.mic ? "🎙 Micro ouvert" : "🔇 Micro coupé"}</button>
          <button className={`btn ${v.deaf ? "off" : ""}`} onClick={() => setDeaf(!v.deaf)}>{v.deaf ? "🔕 Sourdine" : "🎧 J'entends"}</button>
          {v.share ? (
            <button className="btn warn-on" onClick={stopShare}>⏹ Arrêter le partage</button>
          ) : (
            <>
              {canShareScreen() && <button className="btn" onClick={() => startShare("screen")}>🖥 Partager l'écran</button>}
              <button className="btn" onClick={() => startShare("cam")}>📷 Caméra</button>
            </>
          )}
          <button className="btn danger" onClick={() => leaveVoice()}>☎ Quitter</button>
        </div>
      )}
      {(err || v.err) && <div className="err small">{err || v.err}</div>}

      {menu && (
        <>
          <div className="name-menu-back" onClick={() => setMenu(null)} />
          <div className="name-menu voice-menu">
            <b>{menu.name}</b>
            <button onClick={() => { mutePeer(menu.uid, !v.muted[menu.uid]); setMenu(null); }}>{v.muted[menu.uid] ? "🔈 Le réentendre" : "🔇 Le couper pour moi"}</button>
            {admin && <button onClick={() => kick(menu.uid, menu.name)}>⛔ Retirer du salon vocal</button>}
          </div>
        </>
      )}
      {big && <ZoomView stream={big.stream} title={big.title} onClose={() => setBig(null)} />}
    </div>
  );
}
