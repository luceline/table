// Fiche d'un joueur : titre, en ligne, série de la carte du jour, badges (obtenus et à obtenir)
import { useEffect, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { Sheet } from "./ui.jsx";
import { loadProfile, WHERE, goOffline, setWhere } from "../lib/presence.js";
import { cityLabel } from "./PlayerMap.jsx";

export function TitleChip({ t }) {
  if (!t) return null;
  return <span className="title-chip" title={`${t.name} : selon les parties jouées ces 30 derniers jours`}>{t.icon} {t.name}</span>;
}

// Contenu de la fiche (dans une fenêtre, ou dans le menu d'un pseudo avec compact)
export function ProfileBody({ uid, compact }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [hide, setHide] = useState(!!me()?.hide_online);
  const mine = uid === me()?.id;
  useEffect(() => {
    let alive = true;
    setP(null);
    loadProfile(uid).then((r) => alive && setP(r)).catch((e) => alive && setErr(errMsg(e)));
    return () => { alive = false; };
  }, [uid]);
  async function toggleHide(v) {
    setHide(v);
    try {
      await pb.collection("users").update(me().id, { hide_online: v });
      if (v) await goOffline();
      else setWhere("accueil");
    } catch (e) {
      setErr(errMsg(e));
      setHide(!v);
    }
  }
  if (err) return <p className="err small">{err}</p>;
  if (!p) return <p className="muted small">Chargement…</p>;
  const got = p.badges.filter((b) => b.got);
  return (
    <div className={`profile ${compact ? "compact" : ""}`}>
      <div className="profile-head">
        <span className={`on-dot ${p.online ? "on" : ""}`} />
        <span className="grow">
          {p.online ? <>En ligne{p.where && WHERE[p.where] ? ` · ${WHERE[p.where]}` : ""}</> : <span className="muted">Hors ligne</span>}
        </span>
        {p.title && <span className="title-chip">{p.title.icon} {p.title.name}</span>}
      </div>
      {p.city && <div className="small" style={{ marginBottom: 6 }}>📍 {cityLabel(p.city, p.city_tag)}</div>}
      <div className="profile-stats small">
        <span><b>{p.games30}</b> partie{p.games30 > 1 ? "s" : ""} en 30 jours</span>
        <span><b>{p.games}</b> au total</span>
        <span>🔥 série <b>{p.streak}</b>{p.best > p.streak ? ` (record ${p.best})` : ""}</span>
      </div>
      {compact ? (
        got.length > 0 && <div className="badge-row" title={got.map((b) => b.name).join(", ")}>{got.map((b) => <span key={b.id}>{b.icon}</span>)}</div>
      ) : (
        <div className="badge-grid">
          {p.badges.map((b) => (
            <div key={b.id} className={`pbadge ${b.got ? "got" : ""}`}>
              <span className="pbadge-icon">{b.got ? b.icon : "🔒"}</span>
              <span><b>{b.name}</b><br /><span className="muted small">{b.how}</span></span>
            </div>
          ))}
        </div>
      )}
      {mine && !compact && (
        <label className="row small" style={{ gap: 8, marginTop: 12 }}>
          <input type="checkbox" checked={hide} onChange={(e) => toggleHide(e.target.checked)} />
          Apparaître hors ligne (les autres joueurs ne voient pas quand vous êtes connecté)
        </label>
      )}
      {!compact && <p className="muted small">Titre selon les parties jouées ces 30 derniers jours : 🌱 Novice (1), 🎲 Habitué (3), ⚔️ Vétéran (10), 👑 Légende (25).</p>}
    </div>
  );
}

export default function ProfileSheet({ uid, name, onClose }) {
  return (
    <Sheet open={!!uid} onClose={onClose} title={uid === me()?.id ? "Mon profil" : name || "Joueur"}>
      {uid && <ProfileBody uid={uid} />}
    </Sheet>
  );
}
