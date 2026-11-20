import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { TOKEN_HEX, MARKER_ICON } from "../lib/game.js";
import { CARD } from "../lib/mat.js";

// Vidéo d'un flux reçu (ou local), sans son : le son passe par des lecteurs séparés (lib/rtc.js audioOut)
export function CamVideo({ stream, rot = 0, mirror, className, style, onSize }) {
  const ref = useRef();
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    if (stream) v.play().catch(() => {});
  }, [stream]);
  const size = () => {
    const v = ref.current;
    if (v?.videoWidth && onSize) onSize(v.videoWidth / v.videoHeight);
  };
  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted
      onLoadedMetadata={size}
      onResize={size}
      style={{ transform: `rotate(${rot}deg)${mirror ? " scaleX(-1)" : ""}`, ...style }}
    />
  );
}

const hasVideo = (st) => !!st?.getVideoTracks().some((t) => t.readyState === "live");

// ---------- Points sur la vidéo (flèches vers ou depuis un tapis filmé) ----------
// Un point est enregistré en coordonnées de l'image filmée (u, v entre 0 et 1, avant retournement) :
// chacun le retrouve au même endroit du tapis réel, quels que soient son écran et son sens d'affichage.
const contain = (w, h, ar) => (w / h > ar ? { dw: h * ar, dh: h } : { dw: w, dh: w / ar });
export function videoToBoard(box, geo, [u, v]) {
  const ar = geo?.ar || 16 / 9;
  const { dw, dh } = contain(box.w, box.h, ar);
  const r = geo?.rot === 180;
  const uu = r ? 1 - u : u, vv = r ? 1 - v : v;
  return { x: box.left + (box.w - dw) / 2 + uu * dw, y: box.top + (box.h - dh) / 2 + vv * dh };
}
// Point touché sur une superposition vidéo (élément .cam-overlay) -> [u, v], ou null si la vidéo n'est pas là
export function videoPointAt(ov, clientX, clientY) {
  const vid = ov?.querySelector("video");
  if (!vid || !vid.videoWidth) return null;
  const r = ov.getBoundingClientRect();
  const { dw, dh } = contain(r.width, r.height, vid.videoWidth / vid.videoHeight);
  let u = (clientX - r.left - (r.width - dw) / 2) / dw;
  let v = (clientY - r.top - (r.height - dh) / 2) / dh;
  if (Number(ov.dataset.rot) === 180) {
    u = 1 - u;
    v = 1 - v;
  }
  const c = (x) => Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000;
  return [c(u), c(v)];
}

// Tapis filmé : la vidéo prend la place du tapis numérique d'un joueur qui joue avec ses cartes réelles.
// rot : sens de l'image, réglé par le joueur filmé et le même pour tous (enregistré dans son état de partie).
// Si son image est à l'endroit pour lui, elle l'est pour tous : territoires I face à I, cartes lisibles.
// Seul le joueur filmé a le bouton ↻ (onRot) : un réglage par spectateur ou par adversaire croiserait les territoires.
export function CamOverlay({ left, top, w, h, stream, state, rot = 0, onRot, name, waitText, children, side, onGeom }) {
  const live = hasVideo(stream) && state === "connected";
  const [ar, setAr] = useState(0);
  useEffect(() => {
    onGeom?.(live && ar ? { ar, rot } : null);
  }, [live, ar, rot]);
  return (
    <div className={`cam-overlay ${live ? "live" : ""}`} style={{ left, top, width: w, height: h }} data-side={side} data-rot={rot}>
      {live ? (
        <CamVideo stream={stream} rot={rot} className="cam-video" onSize={setAr} />
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
          {onRot && <button className="cam-rot" onClick={onRot} aria-label="Retourner l'image pour tous" title="Retourner l'image (pour tous)">↻</button>}
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

// Jetons et marqueurs posés sur un tapis filmé (jeton.on === "v", x et y = point de l'image en millièmes)
// Affichés par-dessus la vidéo, au même endroit de l'image chez chacun.
export function VideoTokens({ tokens, box, geo, s, dragKey, onPress, type }) {
  if (!geo || !tokens.length) return null;
  const d = Math.round(Math.min(20, Math.max(13, CARD.p.w * s * 0.3)));
  return tokens.map((t) => {
    const p = videoToBoard(box, geo, [(t.x || 0) / 1000, (t.y || 0) / 1000]);
    const dim = dragKey === `token:${t.id}` ? 0.3 : 1;
    if (t.label) {
      return (
        <div
          key={t.id}
          className={`tmarker vtok ${t.color}`}
          style={{ left: p.x, top: p.y, fontSize: Math.max(11, 5 * s), borderColor: TOKEN_HEX[t.color] || "#ccc", opacity: dim }}
          onPointerDown={(e) => onPress?.(e, { type, id: t.id })}
        >
          {MARKER_ICON[t.label] ? `${MARKER_ICON[t.label]} ` : ""}{t.label}{t.v ? <b>{t.v}</b> : null}
        </div>
      );
    }
    return (
      <div
        key={t.id}
        className={`token vtok ${t.color} ${d < 18 ? "small" : ""}`}
        style={{
          left: p.x - d / 2, top: p.y - d / 2, width: d, height: d,
          background: `radial-gradient(circle at 35% 30%, #fff8, ${TOKEN_HEX[t.color] || "#ccc"} 55%)`,
          fontSize: d < 18 ? d * 0.66 : d * 0.48, opacity: dim,
        }}
        onPointerDown={(e) => onPress?.(e, { type, id: t.id })}
      >
        {t.v}
      </div>
    );
  });
}
