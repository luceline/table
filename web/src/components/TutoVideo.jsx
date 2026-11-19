import { useState } from "react";

const B = import.meta.env.BASE_URL;
// Une paire de vidéos par jeu (téléphone, ordinateur)
const SETS = {
  safir: {
    tel: { label: "Téléphone", src: `${B}videos/tuto-telephone.mp4`, poster: `${B}videos/tuto-telephone.jpg` },
    pc: { label: "Ordinateur", src: `${B}videos/tuto-ordinateur.mp4`, poster: `${B}videos/tuto-ordinateur.jpg` },
  },
  fab: {
    tel: { label: "Téléphone", src: `${B}videos/fab-telephone.mp4`, poster: `${B}videos/fab-telephone.jpg` },
    pc: { label: "Ordinateur", src: `${B}videos/fab-ordinateur.mp4`, poster: `${B}videos/fab-ordinateur.jpg` },
  },
};
const DUR = { safir: { tel: "1 min 55", pc: "1 min" }, fab: { tel: "1 min 40", pc: "1 min" } };

// Tutoriel vidéo du jeu sélectionné : version téléphone ou ordinateur, celle de l'écran choisie par défaut
export default function TutoVideo({ open: open0 = false, tcg: tcg0 }) {
  const [open, setOpen] = useState(open0);
  const [picked, setPicked] = useState("safir"); // page de connexion : choix du jeu dans le tutoriel
  const tcg = tcg0 || picked;
  const [which, setWhich] = useState(() => (window.matchMedia?.("(min-width: 1000px)").matches ? "pc" : "tel"));
  const VIDEOS = SETS[tcg] || SETS.safir;
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
          {!tcg0 && (
            <div className="hand-tabs" style={{ marginTop: 10 }}>
              <button className={tcg === "safir" ? "on" : ""} onClick={() => setPicked("safir")}>Safir Cards</button>
              <button className={tcg === "fab" ? "on" : ""} onClick={() => setPicked("fab")}>Flesh and Blood</button>
            </div>
          )}
          <div className="hand-tabs" style={{ margin: "10px 0" }}>
            {Object.entries(VIDEOS).map(([k, x]) => (
              <button key={k} className={which === k ? "on" : ""} onClick={() => setWhich(k)}>
                {x.label} ({(DUR[tcg] || DUR.safir)[k]})
              </button>
            ))}
          </div>
          <video key={`${tcg}-${which}`} className={`tuto-video ${which}`} src={v.src} poster={v.poster} controls playsInline preload="metadata" />
        </>
      )}
    </div>
  );
}
