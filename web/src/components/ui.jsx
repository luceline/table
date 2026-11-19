import { useEffect, useState } from "react";

// Panneau du bas. Il s'ouvre souvent au relâchement du doigt (toucher une carte) : sur téléphone, le navigateur envoie
// ensuite un « clic fantôme » au même endroit, qui tomberait sur un bouton du panneau (Défausse, Sur le deck…).
// Le panneau ignore donc les touchers pendant ses premières 450 ms.
export function Sheet({ open, onClose, title, children }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    const t = setTimeout(() => setArmed(true), 450);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-back" onPointerDown={(e) => armed && e.target === e.currentTarget && onClose?.()}>
      <div className={`sheet ${armed ? "" : "arming"}`} role="dialog">
        {/* Bouton Fermer toujours visible : sur certains téléphones le panneau couvre tout l'écran visible */}
        <div className="sheet-top">
          <button className="sheet-x" onClick={() => onClose?.()} aria-label="Fermer">✕</button>
        </div>
        <div className="grab" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Face({ src, down, alt }) {
  if (down || !src) return <div className="back" />;
  return <img src={src} alt={alt || ""} draggable={false} loading="lazy" />;
}

export function Toast({ text, onDone, ms = 2600, style }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [text, onDone, ms]);
  if (!text) return null;
  return <div className="toast" style={style}>{text}</div>;
}
