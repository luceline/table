import { memo } from "react";
import {
  MAT_W, MAT_H, CARD, SLOTS, PILES, TITLES, DIVIDERS, rotPt,
} from "../lib/mat.js";
import { cardUrl } from "../pb.js";
import { TOKEN_HEX } from "../lib/game.js";

const GOLD = "rgba(214,190,140,.55)";
const GOLD_TXT = "rgba(214,190,140,.72)";

// Fond du tapis en SVG (coordonnées mm). flip = tapis adverse vu en rotation 180°, textes gardés à l'endroit.
export const MatBackground = memo(function MatBackground({ flip }) {
  const R = (x, y, w, h) => (flip ? { x: MAT_W - x - w, y: MAT_H - y - h, w, h } : { x, y, w, h });
  const P = (x, y) => (flip ? { x: MAT_W - x, y: MAT_H - y } : { x, y });
  const rect = (r, key, extra = {}) => (
    <rect key={key} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill="rgba(0,0,0,.18)" stroke={GOLD} strokeWidth={0.45} {...extra} />
  );
  const text = (x, y, t, size, key, extra = {}, dy = 0) => {
    const p0 = P(x, y);
    const p = { x: p0.x, y: p0.y + dy };
    return (
      <text key={key} x={p.x} y={p.y} fontSize={size} fill={GOLD_TXT} textAnchor="middle" dominantBaseline="central"
        fontFamily="Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif" letterSpacing={size * 0.08} {...extra}>
        {t}
      </text>
    );
  };
  const els = [];
  els.push(<rect key="frame" x={3} y={3} width={594} height={294} rx={5} fill="none" stroke={GOLD} strokeWidth={0.5} />);
  for (const x of DIVIDERS) {
    const a = P(x, 12), b = P(x, 289);
    els.push(<line key={`dv${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GOLD} strokeWidth={0.4} strokeDasharray="2 2" />);
  }
  TITLES.forEach((t, i) => els.push(text(t.x, t.y - 4, t.text, 12, `ti${i}`, { fontWeight: 600 })));
  for (const s of SLOTS) {
    els.push(rect(R(s.x, s.y, s.w, s.h), `s${s.id}`));
    els.push(text(s.x + s.w / 2, s.y + s.h / 2, s.label, s.kind === "commandant" ? 6 : 5.4, `sl${s.id}`));
  }
  for (const p of PILES) {
    els.push(rect(R(p.x, p.y, p.w, p.h), `p${p.id}`));
    if (p.id === "deck") els.push(text(p.x + p.w / 2, p.y + p.h / 2, "DECK", 8, `pl${p.id}`, { fontWeight: 600 }));
    else {
      els.push(text(p.x + p.w / 2, p.y + p.h / 2, "DÉFAUSSE DU", 4.6, `pl1${p.id}`, {}, -3.5));
      els.push(text(p.x + p.w / 2, p.y + p.h / 2, "TERRITOIRE", 4.6, `pl2${p.id}`, {}, 3.5));
    }
  }
  return (
    <svg className="bg" viewBox={`0 0 ${MAT_W} ${MAT_H}`} preserveAspectRatio="none">
      {els}
    </svg>
  );
});

export function Mat({ side, st, s, top, left = 0, tokens, hover, dragKey, onPress, matRef, waiting }) {
  const mine = side === "mine";
  const flip = !mine;
  const box = (x, y, w, h) => {
    const r = flip ? { x: MAT_W - x - w, y: MAT_H - y - h } : { x, y };
    return { left: r.x * s, top: r.y * s, width: w * s, height: h * s };
  };
  const pt = (x, y) => (flip ? { x: (MAT_W - x) * s, y: (MAT_H - y) * s } : { x: x * s, y: y * s });

  const hi = hover && hover.side === side && hover.rect ? hover.rect : null;

  return (
    <div
      ref={matRef}
      className={`mat ${mine ? "mine" : "opp"}`}
      style={{ top, left, width: MAT_W * s, height: MAT_H * s }}
    >
      <MatBackground flip={flip} />

      {hi && <div className="slot-hi" style={box(hi.x, hi.y, hi.w, hi.h)} />}

      {/* Piles */}
      {st &&
        PILES.map((p) => {
          const arr = p.id === "deck" ? st.deck : st.piles[p.id] || [];
          const topId = arr[arr.length - 1];
          const c = topId ? st.cards[topId] : null;
          const showBack = p.id === "deck";
          const dragging = dragKey === `pile:${side}:${p.id}`;
          const cw = (c?.o === "l" ? CARD.l : CARD.p);
          // Carte portrait couchée pour tenir dans la zone paysage
          const rot = cw.h > cw.w ? 90 : 0;
          return (
            <div
              key={p.id}
              className="pile"
              style={box(p.x, p.y, p.w, p.h)}
              onPointerDown={(e) => onPress(e, { type: "pile", side, pile: p.id })}
            >
              {arr.length > 0 && (
                <div
                  className="stack"
                  style={{
                    width: cw.w * s,
                    height: cw.h * s,
                    transform: `rotate(${rot}deg)`,
                    opacity: dragging && arr.length === 1 ? 0.3 : 1,
                  }}
                >
                  {showBack || !c ? <div className="back" /> : <img src={cardUrl(c)} alt="" draggable={false} />}
                </div>
              )}
              {arr.length > 0 && (
                <span className="count" style={{ fontSize: Math.max(10, 4.2 * s) }}>{arr.length}</span>
              )}
            </div>
          );
        })}

      {/* Cartes en jeu */}
      {st &&
        st.board.map((b) => {
          const c = st.cards[b.iid];
          if (!c) return null;
          const dim = c.o === "l" ? CARD.l : CARD.p;
          const p = pt(b.x, b.y);
          const showFace = !b.down || mine;
          return (
            <div
              key={b.iid}
              className={`bcard ${dragKey === `board:${b.iid}` ? "dragging" : ""}`}
              style={{
                left: p.x - (dim.w * s) / 2,
                top: p.y - (dim.h * s) / 2,
                width: dim.w * s,
                height: dim.h * s,
                transform: `rotate(${b.rot || 0}deg)`,
              }}
              onPointerDown={(e) => onPress(e, { type: mine ? "board" : "oppboard", side, iid: b.iid })}
            >
              {showFace ? <img src={cardUrl(c)} alt="" draggable={false} /> : <div className="back" />}
              {c.tok && <div className="tok-frame" />}
              {b.down && mine && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,20,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(9, 4 * s), color: "#d6be8c", textAlign: "center", lineHeight: 1.1 }}>
                  face<br />cachée
                </div>
              )}
            </div>
          );
        })}

      {/* Jetons */}
      {tokens.map((t) => {
        let tx = t.x, ty = t.y;
        if (t.on) {
          const b = st?.board.find((x) => x.iid === t.on);
          if (!b) return null;
          const [ox, oy] = rotPt(t.dx || 0, t.dy || 0, b.rot || 0);
          tx = b.x + ox;
          ty = b.y + oy;
        }
        const p = pt(tx, ty);
        const d = Math.max(20, 8 * s);
        return (
          <div
            key={t.id}
            className={`token ${t.color}`}
            style={{
              left: p.x - d / 2,
              top: p.y - d / 2,
              width: d,
              height: d,
              background: `radial-gradient(circle at 35% 30%, #fff8, ${TOKEN_HEX[t.color] || "#ccc"} 55%)`,
              fontSize: d * 0.48,
              opacity: dragKey === `token:${t.id}` ? 0.3 : 1,
            }}
            onPointerDown={(e) => onPress(e, { type: mine ? "token" : "opptoken", id: t.id })}
          >
            {t.v}
          </div>
        );
      })}

      {waiting}
    </div>
  );
}

