import { useState } from "react";

const B = import.meta.env.BASE_URL;
const VIDEOS = {
  tel: { label: "Téléphone", src: `${B}videos/tuto-telephone.mp4`, poster: `${B}videos/tuto-telephone.jpg`, dur: "2 min 30" },
  pc: { label: "Ordinateur", src: `${B}videos/tuto-ordinateur.mp4`, poster: `${B}videos/tuto-ordinateur.jpg`, dur: "1 min" },
};

// Tutoriel vidéo : version téléphone ou ordinateur, celle de l'écran choisie par défaut
export default function TutoVideo({ open: open0 = false }) {
  const [open, setOpen] = useState(open0);
  const [which, setWhich] = useState(() => (window.matchMedia?.("(min-width: 1000px)").matches ? "pc" : "tel"));
  const v = VIDEOS[which];
  return (
    <div className="card-box tuto">
      <button className="tuto-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tuto-play">▶</span>
        <span className="grow">
          <b>Tutoriel vidéo</b>
          <span className="muted small"> · comment fonctionne l'appli</span>
        </span>
        <span className="muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div className="hand-tabs" style={{ margin: "10px 0" }}>
            {Object.entries(VIDEOS).map(([k, x]) => (
              <button key={k} className={which === k ? "on" : ""} onClick={() => setWhich(k)}>
                {x.label} ({x.dur})
              </button>
            ))}
          </div>
          <video key={which} className={`tuto-video ${which}`} src={v.src} poster={v.poster} controls playsInline preload="metadata" />
        </>
      )}
    </div>
  );
}
