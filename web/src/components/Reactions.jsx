// Réactions : choix rapide (petite bulle) et affichage en grand, qui monte puis s'efface
import { useEffect, useRef, useState } from "react";
import { REACTIONS } from "../lib/reactions.js";

export function ReactionPicker({ onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const out = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener("pointerdown", out, true);
    return () => window.removeEventListener("pointerdown", out, true);
  }, [open]);
  return (
    <span className="react-wrap" ref={ref}>
      <button className={`btn sm react-btn ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="Réactions" title="Réaction rapide" disabled={disabled}>😀</button>
      {open && (
        <div className="react-pop" role="menu">
          {REACTIONS.map((r) => (
            <button key={r} className={r.length > 2 ? "txt" : ""} onClick={() => { onPick(r); setOpen(false); }}>{r}</button>
          ))}
        </div>
      )}
    </span>
  );
}

// items : [{ k, r, name, mine }]
export function ReactionLayer({ items }) {
  return (
    <div className="react-layer" aria-live="polite">
      {items.map((it, i) => (
        <div key={it.k} className={`react-float ${it.mine ? "mine" : ""}`} style={{ left: `${it.mine ? 22 : 64 + ((i * 7) % 14)}%` }}>
          <b className={it.r.length > 2 ? "txt" : ""}>{it.r}</b>
          <small>{it.mine ? "vous" : it.name}</small>
        </div>
      ))}
    </div>
  );
}

// File des réactions affichées (2,6 s chacune)
export function useReactionQueue() {
  const [items, setItems] = useState([]);
  const push = (it) => {
    const k = `${Date.now()}-${Math.random()}`;
    setItems((l) => [...l.slice(-5), { ...it, k }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.k !== k)), 2600);
  };
  return [items, push];
}
