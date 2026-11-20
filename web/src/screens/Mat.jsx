import { memo } from "react";
import {
  MAT_W, MAT_H, CARD, SLOTS, PILES, TITLES, DIVIDERS, MAT_KIND, rotPt,
} from "../lib/mat.js";
import { cardUrl } from "../pb.js";
import { TOKEN_HEX, MARKER_ICON, territoryValues, TCG } from "../lib/game.js";

const GOLD = "rgba(212,176,97,.5)"; // or du thème Jade et laque
const GOLD_TXT = "rgba(222,190,118,.78)";

// Fond du tapis en SVG (coordonnées mm). flip = tapis adverse retourné haut/bas seulement (miroir) :
// ses territoires I, II, III restent face aux miens (I contre I, II contre II, III contre III).
// flipX = mon tapis inversé gauche/droite (III · II · I), face à un joueur filmé dont l'image est vue « assis en face ».
export const MatBackground = memo(function MatBackground({ flip, flipX }) {
  const fx = (x, w = 0) => (flipX ? MAT_W - x - w : x);
  const R = (x, y, w, h) => (flip ? { x: fx(x, w), y: MAT_H - y - h, w, h } : { x: fx(x, w), y, w, h });
  const P = (x, y) => (flip ? { x: fx(x), y: MAT_H - y } : { x: fx(x), y });
  const rect = (r, key, extra = {}) => (
    <rect key={key} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} fill="rgba(0,0,0,.2)" stroke={GOLD} strokeWidth={0.45} {...extra} />
  );
  const text = (x, y, t, size, key, extra = {}, dy = 0) => {
    const p0 = P(x, y);
    const p = { x: p0.x, y: p0.y + dy };
    return (
      <text key={key} x={p.x} y={p.y} fontSize={size} fill={GOLD_TXT} textAnchor="middle" dominantBaseline="central"
        fontFamily="Zen Antique, Iowan Old Style, Georgia, serif" letterSpacing={size * 0.08} {...extra}>
        {t}
      </text>
    );
  };
  const els = [];
  els.push(<rect key="frame" x={3} y={3} width={594} height={MAT_KIND === "fab" ? MAT_H - 6 : 294} rx={5} fill="none" stroke={GOLD} strokeWidth={0.5} />);
  if (MAT_KIND === "fab") {
    // Flesh and Blood : filet sous la chaîne de combat, avec son titre
    const a = P(6, 99), b = P(597, 99);
    els.push(<line key="chainl" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GOLD} strokeWidth={0.5} />);
    const c = P(300, 99);
    els.push(<rect key="chainbg" x={c.x - 46} y={c.y - 4} width={92} height={8} fill="#0f0c0b" />);
    els.push(text(300, 99, "CHAÎNE DE COMBAT", 6.4, "chaint", { fontWeight: 600 }));
  }
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
    if (p.lines) {
      // Flesh and Blood : libellé sur une ou deux lignes
      p.lines.forEach((ln, i) => els.push(text(p.x + p.w / 2, p.y + p.h / 2, ln, 6, `pl${i}${p.id}`, { fontWeight: 600 }, (i - (p.lines.length - 1) / 2) * 8)));
    } else if (p.id === "deck") els.push(text(p.x + p.w / 2, p.y + p.h / 2, "DECK", 8, `pl${p.id}`, { fontWeight: 600 }));
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

export function Mat({ side, st, vs, bg, s, top, left = 0, tokens, hover, dragKey, onPress, matRef, waiting, pings = [], aiming, spectator, flipX }) {
  const mine = side === "mine";
  const flip = !mine;
  const fx = (x, w = 0) => (flipX ? MAT_W - x - w : x);
  const box = (x, y, w, h) => {
    const r = flip ? { x: fx(x, w), y: MAT_H - y - h } : { x: fx(x, w), y };
    return { left: r.x * s, top: r.y * s, width: w * s, height: h * s };
  };
  const pt = (x, y) => (flip ? { x: fx(x) * s, y: (MAT_H - y) * s } : { x: fx(x) * s, y: y * s });

  const hi = hover && hover.side === side && hover.rect ? hover.rect : null;

  return (
    <div
      ref={matRef}
      className={`mat ${mine ? "mine" : "opp"} ${aiming ? "aiming" : ""} ${bg ? "has-bg" : ""}`}
      style={{ top, left, width: MAT_W * s, height: MAT_H * s }}
    >
      {/* Fond personnel (visible du seul joueur), sous les emplacements du tapis */}
      {bg && <div className="mat-photo" style={{ backgroundImage: `url("${bg.url}")` }} />}
      {bg && <div className="mat-photo dim" style={{ opacity: (bg.dim ?? 35) / 100 }} />}
      <MatBackground flip={flip} flipX={!!flipX} kind={MAT_KIND} />

      {/* Valeur des combattants par territoire, comparée à l'adversaire (indicatif) */}
      {st && TCG !== "fab" && (() => {
        const me = territoryValues(st), other = territoryValues(vs);
        // ancré au bord gauche du territoire, loin du titre
        return (flipX ? [192.5, 389.5, 591] : [10.5, 207.5, 404.5]).map((x, t) => {
          const a = me[t], o = other[t];
          if (!a.n && !o.n) return null;
          const p = pt(x, 24);
          const cls = !vs ? "" : a.sum > o.sum ? "dom" : a.sum < o.sum ? "sub" : "eq";
          return (
            <div
              key={t}
              className={`tval ${cls}`}
              style={{ left: p.x, top: p.y, fontSize: s >= 1 ? Math.round(10.5 * s) : 10, transform: "translate(0, -50%)" }}
              title={`Valeur des combattants du territoire ${t + 1} (indicatif, hors effets des cartes)`}
            >
              {s >= 1 && <small>val</small>}{a.sum}{a.unknown ? <i>?</i> : null}
            </div>
          );
        });
      })()}

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
          // Carte portrait couchée pour tenir dans la zone paysage (zones portrait de Flesh and Blood : à l'endroit)
          const rot = TCG === "fab" ? ((cw.h > cw.w) !== (p.h > p.w) ? 90 : 0) : cw.h > cw.w ? 90 : 0;
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
          const showFace = !b.down || (mine && !spectator); // spectateur : cartes face cachée cachées des deux côtés
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
              {b.down && mine && !spectator && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,20,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(9, 4 * s), color: "#d6be8c", textAlign: "center", lineHeight: 1.1 }}>
                  face<br />cachée
                </div>
              )}
            </div>
          );
        })}

      {/* Jetons */}
      {tokens.map((t) => {
        let p;
        if (t.on) {
          // Jeton posé sur une carte : les cartes adverses s'affichent à l'endroit, donc le décalage
          // du jeton sur la carte n'est pas retourné (même disposition que chez son propriétaire)
          const b = st?.board.find((x) => x.iid === t.on);
          if (!b) return null;
          const [ox, oy] = rotPt(t.dx || 0, t.dy || 0, b.rot || 0);
          const c = pt(b.x, b.y);
          p = { x: c.x + ox * s, y: c.y + oy * s };
        } else p = pt(t.x, t.y);
        if (t.label) {
          // Marqueur de territoire : pastille avec texte et valeur
          const fs = Math.max(11, 5 * s);
          return (
            <div
              key={t.id}
              className={`tmarker ${t.color}`}
              style={{
                left: p.x,
                top: p.y,
                fontSize: fs,
                borderColor: TOKEN_HEX[t.color] || "#ccc",
                opacity: dragKey === `token:${t.id}` ? 0.3 : 1,
              }}
              onPointerDown={(e) => onPress(e, { type: mine ? "token" : "opptoken", id: t.id })}
            >
              {MARKER_ICON[t.label] ? `${MARKER_ICON[t.label]} ` : ""}{t.label}{t.v ? <b>{t.v}</b> : null}
            </div>
          );
        }
        // Taille liée à celle des cartes : petits sur téléphone (zone de toucher élargie en CSS), 20 px max sur ordinateur
        const d = Math.round(Math.min(20, Math.max(13, CARD.p.w * s * 0.3)));
        return (
          <div
            key={t.id}
            className={`token ${t.color} ${d < 18 ? "small" : ""}`}
            style={{
              left: p.x - d / 2,
              top: p.y - d / 2,
              width: d,
              height: d,
              background: `radial-gradient(circle at 35% 30%, #fff8, ${TOKEN_HEX[t.color] || "#ccc"} 55%)`,
              fontSize: d < 18 ? d * 0.66 : d * 0.48,
              opacity: dragKey === `token:${t.id}` ? 0.3 : 1,
            }}
            onPointerDown={(e) => onPress(e, { type: mine ? "token" : "opptoken", id: t.id })}
          >
            {t.v}
          </div>
        );
      })}

      {/* Signalements (appui long) */}
      {st &&
        pings.map((pg) => {
          const b = st.board.find((x) => x.iid === pg.iid);
          const c = b && st.cards[b.iid];
          if (!c) return null;
          const dim = c.o === "l" ? CARD.l : CARD.p;
          const swap = (b.rot || 0) % 180 !== 0;
          const w = (swap ? dim.h : dim.w) * s, h = (swap ? dim.w : dim.h) * s;
          const p = pt(b.x, b.y);
          return <div key={pg.k} className="ping-ring" style={{ left: p.x - w / 2 - 4, top: p.y - h / 2 - 4, width: w + 8, height: h + 8 }} />;
        })}

      {waiting}
    </div>
  );
}

