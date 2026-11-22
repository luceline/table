// Fenêtre « Nouveautés » : affichée une fois après chaque mise à jour, à la connexion suivante du joueur.
// Un nouveau compte n'a rien à découvrir : il est marqué à jour dès sa première visite.
import { useEffect, useState } from "react";
import { pb } from "../pb.js";
import { Sheet } from "./ui.jsx";
import { NEWS_LATEST, newsFor } from "../lib/news.js";

const LS = "table_news_seen";

export function markNewsSeen(user) {
  try { localStorage.setItem(LS, String(NEWS_LATEST)); } catch (_) {}
  if (user?.id && (user.news_seen || 0) < NEWS_LATEST) pb.collection("users").update(user.id, { news_seen: NEWS_LATEST }).catch(() => {});
}

export default function NewsPopup({ user, tcg, forceOpen, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    if (forceOpen) return setList(newsFor(0, tcg).slice(0, 1));
    let local = 0;
    try { local = +localStorage.getItem(LS) || 0; } catch (_) {}
    const seen = Math.max(user.news_seen || 0, local);
    // compte créé il y a moins d'un jour, jamais passé par ici : rien à annoncer
    const fresh = !seen && Date.now() - new Date(String(user.created || "").replace(" ", "T")).getTime() < 86400000;
    if (fresh || seen >= NEWS_LATEST) {
      if (fresh) markNewsSeen(user);
      return;
    }
    const l = newsFor(seen, tcg);
    if (l.length) setList(l);
    else markNewsSeen(user);
  }, [user?.id, forceOpen]);
  const close = () => {
    if (!forceOpen) markNewsSeen(user);
    setList(null);
    onClose?.();
  };
  return (
    <Sheet open={!!list} onClose={close} title="🎉 Nouveautés">
      {list && (
        <div className="news">
          {list.map((n) => (
            <div key={n.id} className="news-block">
              <div className="muted small">Mise à jour du {n.date}</div>
              <ul>{n.items.map((it, i) => <li key={i}>{it.t}</li>)}</ul>
            </div>
          ))}
          <button className="btn primary" onClick={close}>C'est noté !</button>
        </div>
      )}
    </Sheet>
  );
}
