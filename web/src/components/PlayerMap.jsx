// Carte des joueurs (France, Belgique, Suisse, Luxembourg, Monaco) : ville facultative, pour se retrouver en vrai.
// Villes : GeoNames (CC BY 4.0), plus de 1 000 habitants ; contours : Natural Earth (domaine public).
import { useEffect, useMemo, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { messageTo } from "./Trades.jsx";

const COUNTRY = { BE: "Belgique", CH: "Suisse", LU: "Luxembourg", MC: "Monaco" };
export const cityLabel = (city, tag) => (!city ? "" : COUNTRY[tag] ? `${city} (${COUNTRY[tag]})` : tag && tag !== "FR" ? `${city} (${tag})` : city);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ").trim();

let citiesP = null;
const loadCities = () =>
  (citiesP ||= fetch("/geo/villes.json").then((r) => r.json()).then((l) => l.map((c) => ({ name: c[0], tag: c[1], lat: c[2], lon: c[3], pop: c[4], k: norm(c[0]) }))));

export function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Joueurs qui ont indiqué leur ville ; reload() après un changement de ma ville
export function usePlayersMap() {
  const [players, setPlayers] = useState(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    pb.send("/api/table/map", { requestKey: null }).then((r) => alive && setPlayers(r.players || [])).catch(() => alive && setPlayers([]));
    return () => { alive = false; };
  }, [n]);
  return { players, reload: () => setN((x) => x + 1) };
}

// Réglage « Ma ville » (onglet Personnalisation)
export function CitySettings({ onOpenMap, onSaved }) {
  const u = me();
  const [cur, setCur] = useState(u?.city ? { city: u.city, tag: u.city_tag } : null);
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const n = norm(q);
    if (n.length < 2) return setList([]);
    let alive = true;
    loadCities().then((all) => {
      if (!alive) return;
      const starts = all.filter((c) => c.k.startsWith(n));
      const inside = n.length >= 3 ? all.filter((c) => !c.k.startsWith(n) && c.k.includes(n)) : [];
      setList([...starts, ...inside].slice(0, 8));
    });
    return () => { alive = false; };
  }, [q]);
  async function save(c) {
    setBusy(true);
    setErr("");
    try {
      const data = c ? { city: c.name, city_tag: c.tag, city_lat: c.lat, city_lon: c.lon } : { city: "", city_tag: "", city_lat: 0, city_lon: 0 };
      await pb.collection("users").update(u.id, data);
      setCur(c ? { city: c.name, tag: c.tag } : null);
      onSaved?.();
      setQ("");
      setList([]);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card-box">
      <h2 style={{ marginTop: 0 }}>📍 Ma ville <span className="muted small">(facultatif)</span></h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Indiquer votre ville peut aider à vous retrouver en vrai pour des parties en physique : elle apparaît sur la carte des joueurs
        avec votre pseudo, visible seulement des joueurs connectés. Seule la ville est montrée, jamais d'adresse.
      </p>
      {cur ? (
        <div className="row" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <span className="grow">📍 <b>{cityLabel(cur.city, cur.tag)}</b></span>
          {onOpenMap && <button className="btn sm" onClick={onOpenMap}>🗺 Voir la carte</button>}
          <button className="btn sm ghost" disabled={busy} onClick={() => save(null)}>Retirer ma ville</button>
        </div>
      ) : (
        <>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tapez le nom de votre ville" maxLength={60} />
          {list.length > 0 && (
            <div className="daily-sugg">
              {list.map((c) => (
                <button key={`${c.name}-${c.tag}-${c.lat}`} className="salon-chip" disabled={busy} onClick={() => save(c)}>
                  {cityLabel(c.name, c.tag)}
                </button>
              ))}
            </div>
          )}
          {norm(q).length >= 2 && !list.length && <p className="muted small">Aucune ville trouvée : essayez la ville la plus proche (villes de plus de 1 000 habitants).</p>}
          {onOpenMap && <button className="btn sm linkish" style={{ marginTop: 8 }} onClick={onOpenMap}>🗺 Voir la carte des joueurs</button>}
        </>
      )}
      {err && <p className="err small">{err}</p>}
    </div>
  );
}

// Carte : points par ville, noms des joueurs ; toucher une ville pour voir qui y est et lui écrire
export function PlayersMap({ go, players }) {
  const [shapes, setShapes] = useState(null);
  const [sel, setSel] = useState(null); // ville touchée
  const [view, setView] = useState({ k: 1, x: 0, y: 0 }); // zoom et décalage (unités de la carte)
  const drag = useRef(null);
  const svgRef = useRef(null);
  const [wpx, setWpx] = useState(500); // largeur affichée de la carte (px), pour garder un texte lisible
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(() => svgRef.current && setWpx(svgRef.current.getBoundingClientRect().width || 500));
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [!!shapes, !!players]);
  const user = me();
  useEffect(() => {
    import("../lib/mapShapes.js").then(setShapes);
  }, []);
  const mine = user?.city ? { lat: user.city_lat, lon: user.city_lon } : null;
  const groups = useMemo(() => {
    const g = {};
    for (const p of players || []) {
      const k = `${p.lat},${p.lon}`;
      (g[k] ||= { k, lat: p.lat, lon: p.lon, city: p.city, tag: p.tag, list: [] }).list.push(p);
    }
    return Object.values(g);
  }, [players]);
  const near = useMemo(
    () =>
      mine
        ? (players || []).filter((p) => p.id !== user.id).map((p) => ({ ...p, d: km(mine, p) })).sort((a, b) => a.d - b.d)
        : (players || []).filter((p) => p.id !== user.id),
    [players],
  );
  if (!shapes || !players) return <p className="muted small">Chargement de la carte…</p>;
  const { MAP_W, MAP_H, SHAPES, project } = shapes;
  const vw = MAP_W / view.k, vh = MAP_H / view.k;
  const vx = Math.max(0, Math.min(MAP_W - vw, view.x)), vy = Math.max(0, Math.min(MAP_H - vh, view.y));
  const zoom = (f, cx = vx + vw / 2, cy = vy + vh / 2) => {
    const k = Math.max(1, Math.min(8, view.k * f));
    setView({ k, x: cx - MAP_W / k / 2, y: cy - MAP_H / k / 2 });
  };
  const toMap = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: vx + ((e.clientX - r.left) / r.width) * vw, y: vy + ((e.clientY - r.top) / r.height) * vh };
  };
  const msg = (p) =>
    messageTo(go, p.id, p.name, `Bonjour ! J'ai vu sur la carte des joueurs que tu es à ${cityLabel(p.city, p.tag)}${user?.city ? ` et moi à ${cityLabel(user.city, user.city_tag)}` : ""}. Une partie en vrai un de ces jours ?`);
  const u1 = vw / wpx; // unités de la carte par pixel affiché
  const fs = 12 * u1;
  // villes trop proches à ce zoom (moins de 18 px) : regroupées en un seul point
  const clusters = [];
  for (const g of [...groups].sort((a, b) => b.list.length - a.list.length)) {
    const [x, y] = project(g.lon, g.lat);
    const c = clusters.find((k) => Math.hypot(k.x - x, k.y - y) < 18 * u1);
    if (c) { c.groups.push(g); c.list.push(...g.list); }
    else clusters.push({ k: g.k, x, y, groups: [g], list: [...g.list] });
  }
  return (
    <div className="pmap">
      <div className="pmap-box">
        <svg
          ref={svgRef}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="pmap-svg"
          onPointerDown={(e) => { drag.current = { sx: e.clientX, sy: e.clientY, x: vx, y: vy, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const r = svgRef.current.getBoundingClientRect();
            const dx = ((e.clientX - d.sx) / r.width) * vw, dy = ((e.clientY - d.sy) / r.height) * vh;
            if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
            if (d.moved) setView((v) => ({ ...v, x: d.x - dx, y: d.y - dy }));
          }}
          onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
          onWheel={(e) => { const p = toMap(e); zoom(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y); }}
          onDoubleClick={(e) => { const p = toMap(e); zoom(2, p.x, p.y); }}
        >
          <rect x={0} y={0} width={MAP_W} height={MAP_H} className="pmap-sea" />
          {SHAPES.filter((s) => !s.main).map((s) => <path key={s.id} d={s.d} className="pmap-near" />)}
          {SHAPES.filter((s) => s.main).map((s) => <path key={s.id} d={s.d} className="pmap-land" />)}
          {clusters.map((g) => {
            const me_ = g.list.some((p) => p.id === user?.id);
            const label = g.list.length <= 2 ? g.list.map((p) => (p.id === user?.id ? "Vous" : p.name)).join(", ") : `${g.list.length} joueurs`;
            return (
              <g key={g.k} className={`pmap-pt ${me_ ? "me" : ""} ${sel?.k === g.k ? "on" : ""}`} onClick={() => !drag.current?.moved && setSel(g)}>
                <circle cx={g.x} cy={g.y} r={(4 + Math.min(4, g.list.length)) * u1} />
                <text x={g.x + 9 * u1} y={g.y + 4 * u1} fontSize={fs}>{label}</text>
              </g>
            );
          })}
        </svg>
        <div className="pmap-zoom">
          <button className="btn icon sm" onClick={() => zoom(1.6)} aria-label="Zoomer">+</button>
          <button className="btn icon sm" onClick={() => zoom(1 / 1.6)} aria-label="Dézoomer">−</button>
          {mine && <button className="btn icon sm" onClick={() => { const [x, y] = project(mine.lon, mine.lat); setView({ k: 4, x: x - MAP_W / 8, y: y - MAP_H / 8 }); }} aria-label="Autour de chez moi" title="Autour de chez moi">📍</button>}
        </div>
      </div>
      {sel && (
        <div className="pmap-sel">
          <b>📍 {sel.groups.map((g) => cityLabel(g.city, g.tag)).join(" · ")}</b>
          {sel.list.map((p) => (
            <div key={p.id} className="trade-row">
              <span className="grow">{p.id === user?.id ? "Vous" : p.name}{sel.groups.length > 1 && <span className="muted small"> · {cityLabel(p.city, p.tag)}</span>}</span>
              {p.id !== user?.id && <button className="btn sm ghost" onClick={() => msg(p)}>✉ Message</button>}
            </div>
          ))}
        </div>
      )}
      <h3>{mine ? "Les plus proches de chez vous" : "Joueurs sur la carte"} <span className="muted small">({near.length})</span></h3>
      {!near.length && <p className="muted small">Aucun autre joueur n'a encore indiqué sa ville.</p>}
      {near.slice(0, 30).map((p) => (
        <div key={p.id} className="trade-row">
          <span className="grow"><b>{p.name}</b> <span className="muted small">· {cityLabel(p.city, p.tag)}{p.d != null ? ` · ${p.d} km` : ""}</span></span>
          <button className="btn sm ghost" onClick={() => msg(p)} title={`Écrire à ${p.name}`}>✉</button>
        </div>
      ))}
      {!mine && <p className="muted small">Indiquez votre ville (onglet Personnalisation) pour voir les joueurs les plus proches de chez vous.</p>}
      <p className="muted small pmap-credit">Villes : GeoNames (CC BY 4.0) · contours : Natural Earth.</p>
    </div>
  );
}
