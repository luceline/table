// Éléments communs aux éditeurs de deck (Safir, Flesh and Blood, Sorcery) :
// - DeckLayout : écran large, cartes sur 2/3 et liste du deck sur 1/3 (toujours visible) ; téléphone, liste dans un panneau
// - DeckList  : la liste du deck par groupes (nom, ×N, − / +), pour voir d'un coup d'œil ce qu'il contient
// - CardZoom  : toucher une carte l'ouvre en grand pour lire son effet ; seuls − et + ajoutent ou retirent
import { useState } from "react";
import { Sheet } from "./ui.jsx";
import { ZoomPreview } from "./ZoomView.jsx";
import { fileUrl } from "../pb.js";

export function DeckLayout({ list, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="deck-split">
        <div className="deck-main">{children}</div>
        <aside className="deck-side">{list}</aside>
      </div>
      <button className="btn primary deck-list-fab" onClick={() => setOpen(true)}>📋 Liste du deck{count != null ? ` (${count})` : ""}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Liste du deck">
        {list}
      </Sheet>
    </>
  );
}

// groups : [{ key, title, count, rows: [{ c, n, max, meta, fixed, toggle, set }] , empty }] (set : remplace onSet pour cette ligne)
// fixed : ligne sans − / + (commandant, héros, avatar) ; toggle : jeton (− retire, pas de +)
export function DeckList({ groups, onOpen, onSet, title = "Liste du deck", summary }) {
  return (
    <div className="deck-list">
      <h2>{title}</h2>
      {summary && <p className="muted small" style={{ margin: "0 0 8px" }}>{summary}</p>}
      {groups.map((g) => (
        <div key={g.key} className="dl-group">
          <div className="dl-head">
            <b>{g.title}</b>
            {g.count != null && <span className="muted small">{g.count}</span>}
          </div>
          {g.rows.length === 0 && <p className="muted small dl-empty">{g.empty || "Aucune carte."}</p>}
          {g.rows.map((r) => (
            <div key={r.c.id} className="dl-row">
              <button className="dl-name" onClick={() => onOpen(r.c)} title="Voir la carte en grand">
                <b className="dl-n">{r.fixed ? "" : r.toggle ? "✓" : `×${r.n}`}</b>
                <span className="dl-txt">{r.c.name || "Sans nom"}</span>
                {r.meta && <span className="dl-meta">{r.meta}</span>}
              </button>
              {!r.fixed && (
                <>
                  <button className="btn sm icon" onClick={() => (r.set || onSet)(r.c.id, r.toggle ? 0 : r.n - 1)} aria-label={`Retirer ${r.c.name}`}>−</button>
                  {!r.toggle && (
                    <button className="btn sm icon" onClick={() => (r.set || onSet)(r.c.id, r.n + 1)} disabled={r.n >= r.max} aria-label={`Ajouter ${r.c.name}`}>+</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Carte en grand (touchée dans la grille ou la liste) : image agrandissable, infos, − / + ou ajout à la réserve
export function CardZoom({ card, n = 0, max = 0, toggle, fixed, onSet, onClose, info, extra }) {
  if (!card) return null;
  const src = fileUrl("cards", card.id, card.image);
  return (
    <Sheet open onClose={onClose} title={card.name || "Carte"}>
      <div className={`deck-zoom ${card.orient === "l" ? "l" : "p"}`}>
        <ZoomPreview src={src} alt={card.name} />
      </div>
      {info && <p className="small" style={{ margin: "8px 0" }}>{info}</p>}
      {fixed ? null : toggle ? (
        <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
          <button className={`btn ${n ? "" : "primary"}`} onClick={() => onSet(card.id, n ? 0 : 1)}>
            {n ? "Retirer de la réserve" : "Ajouter à la réserve"}
          </button>
        </div>
      ) : (
        <div className="qty deck-zoom-qty">
          <button className="btn icon" onClick={() => onSet(card.id, n - 1)} disabled={!n} aria-label="Retirer un exemplaire">−</button>
          <b>{n} dans le deck</b>
          <button className="btn icon" onClick={() => onSet(card.id, n + 1)} disabled={n >= max} aria-label="Ajouter un exemplaire">+</button>
        </div>
      )}
      {extra}
    </Sheet>
  );
}
