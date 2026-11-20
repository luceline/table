import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

// Vidéo d'un flux reçu (ou local), sans son : le son passe par des lecteurs séparés (lib/rtc.js audioOut)
export function CamVideo({ stream, rot = 0, mirror, className, style }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    if (stream) v.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted
      style={{ transform: `rotate(${rot}deg)${mirror ? " scaleX(-1)" : ""}`, ...style }}
    />
  );
}

const hasVideo = (st) => !!st?.getVideoTracks().some((t) => t.readyState === "live");

// Tapis filmé : la vidéo prend la place du tapis numérique d'un joueur qui joue avec ses cartes réelles.
// rot : 180 pour le tapis du haut (le joueur filmé est en face), 0 pour le sien.
export function CamOverlay({ left, top, w, h, stream, state, rotKey, defRot = 0, name, waitText, children }) {
  const [rot, setRot] = useState(() => {
    try {
      const v = localStorage.getItem(rotKey);
      return v === null ? defRot : Number(v) || 0;
    } catch (_) {
      return defRot;
    }
  });
  const flip = () => {
    const r = rot === 180 ? 0 : 180;
    setRot(r);
    try {
      localStorage.setItem(rotKey, String(r));
    } catch (_) {}
  };
  const live = hasVideo(stream) && state === "connected";
  return (
    <div className="cam-overlay" style={{ left, top, width: w, height: h }}>
      {live ? (
        <CamVideo stream={stream} rot={rot} className="cam-video" />
      ) : (
        <div className="cam-wait">
          {children || (
            <>
              <div className="cam-wait-ico">🎥</div>
              <div>{waitText || `En attente de la caméra de ${name || "l'adversaire"}…`}</div>
              {state === "busy" && <div className="small muted">Trop de spectateurs regardent cette caméra.</div>}
              {(state === "failed" || state === "disconnected") && <div className="small muted">Connexion perdue, nouvel essai…</div>}
            </>
          )}
        </div>
      )}
      {live && (
        <>
          <span className="cam-live">● direct{name ? ` · ${name}` : ""}</span>
          <button className="cam-rot" onClick={flip} aria-label="Retourner l'image" title="Retourner l'image">↻</button>
        </>
      )}
    </div>
  );
}

// QR code d'un lien, en image
export function QrImg({ text, size = 200 }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((u) => alive && setSrc(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? <img className="qr-img" src={src} width={size} height={size} alt="QR code du lien caméra" /> : <div className="qr-img" style={{ width: size, height: size }} />;
}
