import { useEffect } from "react";

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-back" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog">
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
