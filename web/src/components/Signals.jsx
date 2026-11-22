// Signaux rapides entre joueurs (« Attendez ! », « Je lis une carte »…) : choisis sur le côté du plateau,
// affichés en grand sur le tapis du joueur, chez lui, chez l'adversaire et chez les spectateurs. Pas dans le tchat.
import { useEffect, useRef, useState } from "react";

export const SIGNALS = [
  { k: "wait", icon: "✋", label: "Attendez !", short: "Attendez", ms: 180000 },
  { k: "read", icon: "📖", label: "Je lis une carte", short: "Je lis", ms: 180000 },
  { k: "think", icon: "🤔", label: "Je réfléchis", short: "Je réfléchis", ms: 180000 },
  { k: "ok", icon: "👌", label: "C'est bon", short: "C'est bon", ms: 5000 },
];
const BY_K = Object.fromEntries(SIGNALS.map((s) => [s.k, s]));

// signal encore valable (les signaux s'effacent d'eux-mêmes : 3 minutes, 5 secondes pour « C'est bon »)
export function liveSignal(st) {
  const sg = st?.sig;
  const def = sg && BY_K[sg.k];
  return def && Date.now() - sg.t < def.ms ? def : null;
}

// Boutons sur le côté du plateau : un toucher affiche le signal, un second toucher l'enlève
export function SignalBar({ st, onSignal }) {
  const cur = liveSignal(st);
  return (
    <div className="signals" role="group" aria-label="Signaux rapides">
      {SIGNALS.map((s) => (
        <button key={s.k} className={`sig-btn ${cur?.k === s.k ? "on" : ""}`} onClick={() => onSignal(cur?.k === s.k ? null : s.k)} title={s.label}>
          {s.icon} {s.short}
        </button>
      ))}
    </div>
  );
}

// Téléphone : un seul bouton au bout des phases, qui ouvre les 4 signaux (un toucher de plus, plateau plus grand)
export function SignalButton({ st, onSignal }) {
  const cur = liveSignal(st);
  const [pos, setPos] = useState(null);
  const btn = useRef();
  const pop = useRef();
  useEffect(() => {
    if (!pos) return;
    const out = (e) => !pop.current?.contains(e.target) && !btn.current?.contains(e.target) && setPos(null);
    window.addEventListener("pointerdown", out, true);
    return () => window.removeEventListener("pointerdown", out, true);
  }, [pos]);
  const open = () => {
    const r = btn.current.getBoundingClientRect();
    setPos(pos ? null : { right: Math.max(6, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 6 });
  };
  return (
    <>
      <button ref={btn} className={`ph sig-one ${cur ? "on" : ""}`} onClick={open} aria-label="Signaux rapides" title="Attendez, je lis une carte…">
        {cur ? cur.icon : "✋"}
      </button>
      {pos && (
        <div ref={pop} className="sig-pop" style={{ right: pos.right, bottom: pos.bottom }} role="menu">
          {SIGNALS.map((s) => (
            <button key={s.k} className={`sig-btn ${cur?.k === s.k ? "on" : ""}`} onClick={() => { onSignal(cur?.k === s.k ? null : s.k); setPos(null); }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Grand bandeau sur le tapis d'un joueur (box : position du tapis sur le plateau, en px)
export function SignalBadge({ st, box, mine, onClear }) {
  const [, tick] = useState(0);
  const cur = liveSignal(st);
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(500, cur.ms - (Date.now() - st.sig.t)));
    return () => clearTimeout(t);
  }, [cur?.k, st?.sig?.t]);
  if (!cur || !box) return null;
  return (
    <div
      key={st.sig.t}
      className={`sig-badge sig-${cur.k} ${mine ? "mine" : ""}`}
      style={{ left: box.left + box.w / 2, top: box.top + box.h * 0.42 }}
      onPointerDown={mine && onClear ? (e) => { e.stopPropagation(); onClear(); } : undefined}
      title={mine ? "Toucher pour retirer" : undefined}
    >
      <span className="sig-ico">{cur.icon}</span>
      <span>
        {!mine && <small>{st.name}</small>}
        <b>{cur.label}</b>
      </span>
    </div>
  );
}
