// Vue agrandie plein écran d'une carte (image) ou d'un tapis filmé (vidéo en direct), avec zoom et déplacement :
// pincer à deux doigts ou molette pour zoomer, glisser pour se déplacer, double-touche pour agrandir / revenir.
// Lecture seule : rien de ce qu'on fait ici ne touche à la partie.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ZMAX = 8;

export default function ZoomView({ src, stream, rot = 0, title, onClose }) {
  const stage = useRef();
  const media = useRef();
  const [nat, setNat] = useState(null); // taille naturelle de l'image ou de la vidéo
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [v, setV] = useState({ z: 1, x: 0, y: 0 });
  const vRef = useRef(v);
  vRef.current = v;
  const ptrs = useRef(new Map());
  const pinch = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const moved = useRef(0);

  useLayoutEffect(() => {
    const el = stage.current;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // Échap ferme seulement la vue agrandie (pas le panneau derrière)
    const k = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  useEffect(() => {
    if (!stream || !media.current) return;
    media.current.srcObject = stream;
    media.current.play?.().catch(() => {});
  }, [stream]);

  const turned = rot % 180 !== 0;
  const rw = nat ? (turned ? nat.h : nat.w) : 1;
  const rh = nat ? (turned ? nat.w : nat.h) : 1;
  const base = nat && box.w ? Math.min((box.w * 0.96) / rw, (box.h * 0.96) / rh) : 0;

  // garde l'image à l'écran : pas de déplacement au-delà de ses bords
  const clamp = (z, x, y) => {
    z = Math.min(ZMAX, Math.max(1, z));
    const lx = Math.max(0, (rw * base * z - box.w) / 2 + 30);
    const ly = Math.max(0, (rh * base * z - box.h) / 2 + 30);
    return { z, x: z === 1 ? 0 : Math.min(lx, Math.max(-lx, x)), y: z === 1 ? 0 : Math.min(ly, Math.max(-ly, y)) };
  };
  // zoom autour d'un point de l'écran (coordonnées par rapport au centre de la scène)
  const zoomAt = (z2, px, py, from = vRef.current) => {
    const k = Math.min(ZMAX, Math.max(1, z2)) / from.z;
    setV(clamp(from.z * k, px - (px - from.x) * k, py - (py - from.y) * k));
  };
  const rel = (e) => {
    const r = stage.current.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  function down(e) {
    stage.current.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, rel(e));
    moved.current = 0;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: vRef.current };
    }
  }
  function move(e) {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const p = rel(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size >= 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const st = pinch.current;
      const z2 = Math.min(ZMAX, Math.max(1, (st.v.z * d) / st.d));
      const k = z2 / st.v.z;
      setV(clamp(z2, mx - (st.mx - st.v.x) * k, my - (st.my - st.v.y) * k));
      moved.current += 10;
      return;
    }
    moved.current += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    const c = vRef.current;
    if (c.z > 1) setV(clamp(c.z, c.x + p.x - prev.x, c.y + p.y - prev.y));
  }
  function up(e) {
    const p = ptrs.current.get(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    if (!p || moved.current > 12 || ptrs.current.size) return;
    // double-touche : agrandir à cet endroit, ou revenir à l'image entière
    const now = Date.now();
    const lt = lastTap.current;
    if (now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 40) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      if (vRef.current.z > 1.2) setV({ z: 1, x: 0, y: 0 });
      else zoomAt(2.5, p.x, p.y);
    } else lastTap.current = { t: now, x: p.x, y: p.y };
  }
  function wheel(e) {
    const p = rel(e);
    zoomAt(vRef.current.z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }
  useEffect(() => {
    // molette : écouteur non passif, pour ne pas faire défiler la page derrière
    const el = stage.current;
    const f = (e) => { e.preventDefault(); wheel(e); };
    el.addEventListener("wheel", f, { passive: false });
    return () => el.removeEventListener("wheel", f);
  });

  const style = nat
    ? { width: nat.w, height: nat.h, transform: `translate(-50%, -50%) translate(${v.x}px, ${v.y}px) scale(${base * v.z}) rotate(${rot}deg)` }
    : { opacity: 0 };
  return createPortal(
    <div
      className="zoomview" role="dialog" aria-label={title || "Vue agrandie"}
      // rendu dans document.body, mais les événements React remonteraient jusqu'au plateau de jeu : on les arrête ici
      onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
    >
      <div className="zv-bar">
        <span className="zv-title">{title}</span>
        <button onClick={() => zoomAt(vRef.current.z / 1.5, 0, 0)} aria-label="Dézoomer" disabled={v.z <= 1}>−</button>
        <span className="zv-pct">×{v.z.toFixed(1).replace(".0", "")}</span>
        <button onClick={() => zoomAt(vRef.current.z * 1.5, 0, 0)} aria-label="Zoomer" disabled={v.z >= ZMAX}>+</button>
        <button onClick={onClose} aria-label="Fermer" className="zv-x">✕</button>
      </div>
      <div className="zv-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {stream ? (
          <video
            ref={media} className="zv-media" autoPlay playsInline muted style={style}
            onLoadedMetadata={(e) => setNat({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
            onResize={(e) => setNat({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          />
        ) : (
          <img
            ref={media} className="zv-media" src={src} alt={title || ""} draggable={false} style={style}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        )}
      </div>
      <div className="zv-hint">Pincez ou utilisez la molette pour zoomer · glissez pour vous déplacer · double-touche pour agrandir</div>
    </div>,
    document.body,
  );
}

// Aperçu d'une carte dans un panneau : touché, il s'ouvre en grand
export function ZoomPreview({ src, alt }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="preview zoomable" onClick={() => setOpen(true)} title="Agrandir">
        <img src={src} alt={alt || ""} />
        <span className="zoom-hint">🔍 Agrandir</span>
      </div>
      {open && <ZoomView src={src} title={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
