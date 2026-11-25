import { memo, useEffect, useRef, useState } from "react";
import {
  MAT_W, MAT_H, CARD, SLOTS, PILES, TITLES, DIVIDERS, MAT_KIND, rotPt, mirrorX, mirrorRectX, SORC,
} from "../lib/mat.js";
import { cardUrl } from "../pb.js";
import { TOKEN_HEX, MARKER_ICON, territoryValues, TCG, UNIF_STATS } from "../lib/game.js";
import { playArrival, iceFall, arrivalForCard, fxOn } from "../lib/fx.js";

// ---------- Effets visuels Safir ----------
// Attaque affichée (carte + unification + bonus) ; effet d'arrivée « aura » : le tapis tremble et se fissure autour de la carte
export const effAtk = (b, c) => (typeof c?.a === "number" ? c.a + (UNIF_STATS[b.u]?.a || 0) + (b.bx?.a || 0) : null);
const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
// Fissures (en px) qui partent du point d'impact : 9 branches irrégulières, toujours les mêmes pour une carte
function cracks(seed, x, y, len) {
  let r = seed || 1;
  const rnd = () => ((r = Math.imul(r ^ (r >>> 15), 2246822507) ^ Math.imul(r ^ (r >>> 13), 3266489909)) >>> 0) / 4294967296;
  const paths = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    let px = x, py = y, d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const L = len * (0.45 + rnd() * 0.55);
    const steps = 6 + Math.floor(rnd() * 4);
    for (let k = 0; k < steps; k++) {
      a += (rnd() - 0.5) * 0.9;
      const st = (L / steps) * (0.7 + rnd() * 0.6);
      px += Math.cos(a) * st;
      py += Math.sin(a) * st;
      d += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
      if (k > 1 && rnd() < 0.3) {
        // petite branche
        const b = a + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6);
        const bl = st * (0.8 + rnd());
        paths.push({ d: `M${px.toFixed(1)} ${py.toFixed(1)} L${(px + Math.cos(b) * bl).toFixed(1)} ${(py + Math.sin(b) * bl).toFixed(1)}`, w: 0.6 });
      }
    }
    paths.push({ d, w: 1 });
  }
  return paths;
}
// Marqueurs « Gel » : territoires gelés (Gel+ : aussi les territoires voisins). Les territoires se font face (I contre I) :
// un territoire gelé l'est des deux côtés.
export function frozenTerritories(markers) {
  const out = new Set();
  for (const t of markers || []) {
    if (!t.label || !/^\s*gel/i.test(t.label) || typeof t.x !== "number") continue;
    const k = t.x < 201.5 ? 0 : t.x < 398.5 ? 1 : 2;
    out.add(k);
    if (/^\s*gel\s*\+/i.test(t.label)) {
      if (k > 0) out.add(k - 1);
      if (k < 2) out.add(k + 1);
    }
  }
  return [...out].sort();
}

const GOLD = "rgba(212,176,97,.5)"; // or du thème Jade et laque
const GOLD_TXT = "rgba(222,190,118,.78)";

// Fond du tapis en SVG (coordonnées mm). flip = tapis adverse retourné haut/bas seulement (miroir) :
// ses territoires I, II, III restent face aux miens (I contre I, II contre II, III contre III).
// flipX = mon tapis inversé gauche/droite (III · II · I), face à un joueur filmé dont l'image est vue « assis en face ».
export const MatBackground = memo(function MatBackground({ flip, flipX, layer }) {
  const fr = (x, y, w, h) => (flipX ? mirrorRectX(x, y, w, h) : x);
  const fp = (x, y) => (flipX ? mirrorX(x, y) : x);
  const R = (x, y, w, h) => (flip ? { x: fr(x, y, w, h), y: MAT_H - y - h, w, h } : { x: fr(x, y, w, h), y, w, h });
  const P = (x, y) => (flip ? { x: fp(x, y), y: MAT_H - y } : { x: fp(x, y), y });
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
  if (MAT_KIND === "sorcery") {
    // Royaume partagé : la couche du dessous dessine le cadre et la grille ; chaque couche dessine ses propres piles
    if (layer !== "top") {
      els.push(<rect key="frame" x={3} y={3} width={594} height={MAT_H - 6} rx={5} fill="none" stroke={GOLD} strokeWidth={0.5} />);
      const { x0, y0, cw, ch, cols, rows } = SORC;
      els.push(<rect key="realm" x={x0} y={y0} width={cols * cw} height={rows * ch} fill="rgba(0,0,0,.18)" stroke={GOLD} strokeWidth={0.6} />);
      for (let c = 1; c < cols; c++) els.push(<line key={`gc${c}`} x1={x0 + c * cw} y1={y0} x2={x0 + c * cw} y2={y0 + rows * ch} stroke={GOLD} strokeWidth={0.4} />);
      for (let r = 1; r < rows; r++) els.push(<line key={`gr${r}`} x1={x0} y1={y0 + r * ch} x2={x0 + cols * cw} y2={y0 + r * ch} stroke={GOLD} strokeWidth={r === rows / 2 ? 0.7 : 0.4} strokeDasharray={r === rows / 2 ? "3 2" : undefined} />);
    }
    for (const p of PILES) {
      els.push(rect(R(p.x, p.y, p.w, p.h), `p${p.id}`));
      els.push(text(p.x + p.w / 2, p.y + p.h / 2, p.lines[0], 6, `pl${p.id}`, { fontWeight: 600 }));
    }
    return (
      <svg className="bg" viewBox={`0 0 ${MAT_W} ${MAT_H}`} preserveAspectRatio="none">
        {els}
      </svg>
    );
  }
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

export function Mat({ side, st, vs, bg, back, s, top, left = 0, tokens, hover, dragKey, onPress, matRef, waiting, pings = [], aiming, spectator, flipX, frozen, layer, children }) {
  const mine = side === "mine";
  const flip = !mine;
  const fr = (x, y, w, h) => (flipX ? mirrorRectX(x, y, w, h) : x);
  const fp = (x, y) => (flipX ? mirrorX(x, y) : x);
  const box = (x, y, w, h) => {
    const r = flip ? { x: fr(x, y, w, h), y: MAT_H - y - h } : { x: fr(x, y, w, h), y };
    return { left: r.x * s, top: r.y * s, width: w * s, height: h * s };
  };
  const pt = (x, y) => (flip ? { x: fp(x, y) * s, y: (MAT_H - y) * s } : { x: fp(x, y) * s, y: y * s });

  const hi = hover && hover.side === side && hover.rect ? hover.rect : null;

  // Carte avec un effet d'arrivée (Yan, Lin, Tian d'office ; aura choisie dans l'éditeur de deck) qui arrive face visible sur le terrain
  // (posée, ou retournée face visible) : effet plein écran ; « aura » fait aussi trembler et fissurer le tapis.
  const bigRef = useRef(null);
  const [quakes, setQuakes] = useState([]); // [{ k, iid, x, y }] en mm
  useEffect(() => {
    if (TCG !== "safir" || !st) return;
    const now = new Set();
    const fresh = [];
    for (const b of st.board || []) {
      const c = st.cards?.[b.iid];
      const kind = b.down ? null : arrivalForCard(c);
      if (!kind) continue;
      now.add(b.iid);
      if (bigRef.current && !bigRef.current.has(b.iid)) {
        const dim = c.o === "l" ? CARD.l : CARD.p;
        const swap = (b.rot || 0) % 180 !== 0;
        fresh.push({ k: `${b.iid}-${Date.now()}`, iid: b.iid, x: b.x, y: b.y, w: swap ? dim.h : dim.w, h: swap ? dim.w : dim.h, atk: effAtk(b, c), fx: kind });
      }
    }
    bigRef.current = now; // premier affichage : on mémorise sans effet
    if (!fresh.length) return;
    const one = fresh[0]; // une seule à la fois si plusieurs arrivent ensemble
    if (one.fx === "aura" && fxOn()) {
      setQuakes((q) => [...q, one]);
      setTimeout(() => aliveRef.current && setQuakes((q) => q.filter((x) => x !== one)), 2600);
    }
    const sc = toScreen();
    if (sc) {
      const p = pt(one.x, one.y);
      playArrival(one.fx, { cx: sc.x + p.x * sc.k, cy: sc.y + p.y * sc.k, w: one.w * s * sc.k, h: one.h * s * sc.k, atk: one.atk });
    }
  }, [st?.board, st?.cards]);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // Position du tapis à l'écran (pour les effets plein écran) : coin haut gauche et échelle réelle
  const anchorRef = useRef(null);
  const toScreen = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return { x: r.left, y: r.top, k: r.width / (MAT_W * s) };
  };

  // Marqueur Gel posé : stalactites qui tombent sur le territoire nouvellement gelé
  const frozenKey = TCG !== "safir" ? "" : (frozen || []).join(",");
  const frozenRef = useRef(null);
  useEffect(() => {
    const prev = frozenRef.current;
    frozenRef.current = frozenKey;
    if (prev === null) return; // premier affichage : rien
    const before = new Set(prev ? prev.split(",") : []);
    const added = (frozenKey ? frozenKey.split(",") : []).filter((t) => !before.has(t));
    const sc = added.length ? toScreen() : null;
    if (!sc) return;
    for (const t of added) {
      const x0 = [3, 201.5, 398.5][+t], x1 = [201.5, 398.5, 597][+t];
      if (x0 === undefined) continue;
      const b = box(x0, 3, x1 - x0, MAT_H - 6);
      iceFall({ left: sc.x + b.left * sc.k, top: sc.y + b.top * sc.k, width: b.width * sc.k, height: b.height * sc.k });
    }
  }, [frozenKey]);

  return (
    <div
      ref={matRef}
      className={`mat ${mine ? "mine" : "opp"} ${layer ? `layer-${layer}` : ""} ${aiming ? "aiming" : ""} ${bg ? "has-bg" : ""} ${back ? "has-cb" : ""} ${quakes.length ? "quake" : ""}`}
      style={{ top, left, width: MAT_W * s, height: MAT_H * s, ...(back ? { "--cb": `url("${back}")` } : null) }}
    >
      <div ref={anchorRef} className="fx-anchor" />
      {/* Fond personnel du joueur (vu aussi par l'adversaire et les spectateurs), sous les emplacements du tapis */}
      {bg && <div className="mat-photo" style={{ backgroundImage: `url("${bg.url}")` }} />}
      {bg && <div className="mat-photo dim" style={{ opacity: (bg.dim ?? 35) / 100 }} />}
      <MatBackground flip={flip} flipX={!!flipX} kind={MAT_KIND} layer={layer} />

      {/* Valeur des combattants par territoire, comparée à l'adversaire (indicatif) */}
      {st && TCG === "safir" && (() => {
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
          const showBack = p.id === "deck" || p.id === "atlas";
          const dragging = dragKey === `pile:${side}:${p.id}`;
          const cw = (c?.o === "l" ? CARD.l : CARD.p);
          // Carte portrait couchée pour tenir dans la zone paysage (zones portrait de Flesh and Blood : à l'endroit)
          const rot = TCG !== "safir" ? ((cw.h > cw.w) !== (p.h > p.w) ? 90 : 0) : cw.h > cw.w ? 90 : 0;
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
              data-iid={b.iid}
              data-side={side}
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
              {c.tok && <div className="tok-tag" style={{ fontSize: Math.max(7, 3.6 * s) }}>JETON</div>}
              {b.down && mine && !spectator && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,20,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(9, 4 * s), color: "#d6be8c", textAlign: "center", lineHeight: 1.1 }}>
                  face<br />cachée
                </div>
              )}
            </div>
          );
        })}

      {/* Territoires gelés (marqueur Gel) : givre sur tout le territoire, cartes toujours lisibles */}
      {TCG === "safir" &&
        (frozen || []).map((t) => {
          const x0 = [3, 201.5, 398.5][t], x1 = [201.5, 398.5, 597][t];
          return (
            <div key={`fz${t}`} className="frozen" style={box(x0, 3, x1 - x0, MAT_H - 6)}>
              <span className="fz-flake f1">❄</span>
              <span className="fz-flake f2">❄</span>
              <span className="fz-flake f3">❅</span>
              <span className="fz-flake f4">❆</span>
            </div>
          );
        })}

      {/* Séisme (effet d'arrivée « aura ») : fissures autour de la carte */}
      {quakes.map((q) => {
        const p = pt(q.x, q.y);
        return (
          <svg key={q.k} className="quake-fx" width={MAT_W * s} height={MAT_H * s} viewBox={`0 0 ${MAT_W * s} ${MAT_H * s}`}>
            <circle className="quake-flash" cx={p.x} cy={p.y} r={CARD.p.h * s * 0.9} />
            {cracks(hash(q.iid), p.x, p.y, MAT_W * s * 0.42).map((c, i) => (
              <g key={i}>
                <path d={c.d} className="crack-shadow" strokeWidth={Math.max(2.2, 3.4 * c.w * Math.min(1.4, s))} />
                <path d={c.d} className="crack" strokeWidth={Math.max(1, 1.5 * c.w * Math.min(1.4, s))} />
              </g>
            ))}
          </svg>
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
      {children}
    </div>
  );
}

