// Effets spéciaux plein écran (Safir) : un canvas posé sur la page le temps de l'animation, puis retiré.
// Effets d'arrivée, choisis dans l'éditeur de deck (2 cartes différentes au plus par deck) :
// - aura : façon DBZ (flash, lignes de vitesse, aura de flammes dorées, éclairs, ondes de choc, débris, « ATK 11 »)
// - yan  : une vague de flammes balaie l'écran et embrase la carte
// - lin  : une bourrasque de feuilles traverse l'écran et tourbillonne autour de la carte
// - tian : tempête de neige, explosion de flocons à l'arrivée, neige déposée sur la carte
// iceFall : marqueur Gel posé, des stalactites se forment en haut de l'écran, tombent et se brisent sur le territoire
// Réglage par appareil (Personnalisation) : effets complets ou coupés. Respecte « réduire les animations » du système.

const KEY = "table_fx";
export function fxOn() {
  try {
    if (localStorage.getItem(KEY) === "off") return false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (_) {}
  return true;
}
export function fxSetting() {
  try { return localStorage.getItem(KEY) === "off" ? "off" : "full"; } catch (_) { return "full"; }
}
export function setFxSetting(v) {
  try { localStorage.setItem(KEY, v === "off" ? "off" : "full"); } catch (_) {}
}

export const ARRIVAL_MAX = 2;
export const ARRIVALS = [
  { id: "aura", icon: "💥", label: "Aura de puissance", desc: "Flash, aura de flammes dorées, éclairs, onde de choc, le terrain se fissure" },
  { id: "yan", icon: "🔥", label: "Vague de flammes (Yan)", desc: "Un mur de feu balaie l'écran et embrase la carte" },
  { id: "lin", icon: "🍃", label: "Volée de feuilles (Lin)", desc: "Une bourrasque de feuilles tourbillonne autour de la carte" },
  { id: "tian", icon: "❄", label: "Arrivée enneigée (Tian)", desc: "Tempête de neige, explosion de flocons, la carte se couvre de neige" },
];
export const arrivalOf = (id) => ARRIVALS.find((a) => a.id === id) || null;
// opts : { cx, cy, w, h } position et taille de la carte à l'écran, atk (aura : affiché si connu)
export function playArrival(kind, opts) {
  if (opts?.demo && fxOn()) demoCard(opts);
  if (kind === "aura") return powerBurst(opts);
  if (kind === "yan") return flameWave(opts);
  if (kind === "lin") return leafGust(opts);
  if (kind === "tian") return snowArrival(opts);
}

// Carte factice pour les aperçus (Personnalisation, éditeur de deck)
function demoCard({ cx, cy, w, h }) {
  const d = document.createElement("div");
  d.className = "fx-demo-card";
  Object.assign(d.style, { left: cx - w / 2 + "px", top: cy - h / 2 + "px", width: w + "px", height: h + "px" });
  d.textContent = "✨";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

let active = 0;
const R = Math.random;
const rr = (a, b) => a + R() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

// Canvas plein écran ; draw(ctx, t, dt, W, H) appelé à chaque image jusqu'à dur secondes
function overlay(dur, draw) {
  if (active >= 3 || document.hidden) return;
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement("canvas");
  cv.className = "fx-canvas";
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = W + "px";
  cv.style.height = H + "px";
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  document.body.appendChild(cv);
  active++;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    active--;
    cv.remove();
  };
  setTimeout(end, (dur + 1.5) * 1000); // sécurité (onglet en arrière-plan : plus d'images)
  const t0 = performance.now();
  let last = t0;
  const frame = (now) => {
    if (done) return;
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    try { draw(ctx, t, dt, W, H); } catch (_) { return end(); }
    if (t < dur) requestAnimationFrame(frame);
    else end();
  };
  requestAnimationFrame(frame);
}

// Secousse de toute la page (l'appli, pas le canvas d'effet)
function shake(px, ms) {
  const el = document.getElementById("root");
  if (!el?.animate) return;
  const k = [];
  for (let i = 0; i <= 10; i++) {
    const f = (1 - i / 10) * px;
    k.push({ transform: i === 10 ? "none" : `translate(${rr(-f, f).toFixed(1)}px, ${rr(-f, f).toFixed(1)}px) rotate(${rr(-f, f) * 0.06}deg)` });
  }
  try { el.animate(k, { duration: ms, easing: "linear" }); } catch (_) {}
}

// Sprites dégradés (lumière additive)
const sprites = {};
function sprite(name, stops) {
  if (sprites[name]) return sprites[name];
  const n = 64;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
  return (sprites[name] = c);
}
const GOLD = () => sprite("gold", [[0, "rgba(255,255,235,1)"], [0.22, "rgba(255,228,110,.95)"], [0.55, "rgba(255,150,30,.4)"], [1, "rgba(255,90,0,0)"]]);
const WHITE = () => sprite("white", [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,250,220,.7)"], [1, "rgba(255,240,200,0)"]]);
const DUST = () => sprite("dust", [[0, "rgba(140,118,96,.55)"], [0.6, "rgba(110,92,74,.25)"], [1, "rgba(100,85,70,0)"]]);
const FIRE = () => sprite("fire", [[0, "rgba(255,255,210,1)"], [0.18, "rgba(255,210,70,.95)"], [0.45, "rgba(255,100,15,.55)"], [0.75, "rgba(200,30,0,.18)"], [1, "rgba(150,10,0,0)"]]);
const SMOKE = () => sprite("smoke", [[0, "rgba(45,30,28,.5)"], [0.6, "rgba(35,25,25,.22)"], [1, "rgba(30,20,20,0)"]]);
const GREEN = () => sprite("green", [[0, "rgba(240,255,210,1)"], [0.3, "rgba(150,230,110,.6)"], [1, "rgba(60,160,60,0)"]]);
const SNOW = () => sprite("snow", [[0, "rgba(255,255,255,1)"], [0.4, "rgba(240,248,255,.75)"], [1, "rgba(220,235,255,0)"]]);
const FROST = () => sprite("frost", [[0, "rgba(255,255,255,1)"], [0.3, "rgba(210,240,255,.75)"], [1, "rgba(150,210,255,0)"]]);

function bolt(ctx, x1, y1, x2, y2, spread) {
  const pts = [[x1, y1]];
  const n = 7;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    pts.push([x1 + (x2 - x1) * f + rr(-spread, spread), y1 + (y2 - y1) * f + rr(-spread, spread)]);
  }
  pts.push([x2, y2]);
  return pts;
}
function strokePts(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------------------------
// Grosse carte : cx, cy centre de la carte à l'écran, w, h sa taille à l'écran, atk l'attaque affichée
export function powerBurst({ cx, cy, w, h, atk }) {
  if (!fxOn()) return;
  const m = clamp(Math.max(w, h) / 110, 0.55, 1.7); // échelle des particules
  const diag = Math.hypot(window.innerWidth, window.innerHeight);
  const DUR = 2.3;
  const flames = [];
  const sparks = [];
  const rocks = [];
  const dust = [];
  const bolts = [];
  let speedLines = [];
  let nextLines = 0;
  let nextBolt = 0.18;
  let spawnAcc = 0;
  for (let i = 0; i < 30; i++) {
    const a = rr(0, Math.PI * 2), v = rr(320, 980) * m;
    rocks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rr(80, 260), r: rr(2.5, 8) * m, rot: rr(0, 6), vr: rr(-14, 14),
      shape: Array.from({ length: 6 }, () => rr(0.6, 1.15)), col: `hsl(${rr(18, 34)},${rr(18, 32)}%,${rr(22, 42)}%)`, delay: rr(0, 0.08) });
  }
  for (let i = 0; i < 16; i++) {
    const a = rr(0, Math.PI * 2), v = rr(60, 200) * m;
    dust.push({ x: cx + Math.cos(a) * w * 0.4, y: cy + Math.sin(a) * h * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rr(30, 60) * m, life: rr(0.9, 1.5) });
  }
  const rings = [0, 0.11, 0.28].map((d, i) => ({ d, max: diag * (0.55 - i * 0.12), wid: (22 - i * 6) * m }));
  const label = typeof atk === "number" ? `ATK ${atk}` : "";
  const fs = clamp(h * 0.5, 30, 70);

  shake(14, 650);
  try { if (document.visibilityState === "visible") navigator.vibrate?.([80, 30, 60, 30, 160]); } catch (_) {}

  overlay(DUR, (ctx, t, dt, W, H) => {
    const env = t < 0.15 ? t / 0.15 : t > 1.7 ? clamp(1 - (t - 1.7) / 0.6, 0, 1) : 1;

    // 1) assombrissement + halo doré centré sur la carte
    ctx.globalAlpha = 0.5 * env;
    const vg = ctx.createRadialGradient(cx, cy, Math.max(w, h) * 0.4, cx, cy, diag * 0.75);
    vg.addColorStop(0, "rgba(255,200,60,.28)");
    vg.addColorStop(0.35, "rgba(40,20,0,.25)");
    vg.addColorStop(1, "rgba(0,0,0,.75)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // 2) lignes de vitesse (manga) qui convergent vers la carte, renouvelées toutes les 60 ms
    if (t < 1.25) {
      if (t >= nextLines) {
        nextLines = t + 0.06;
        speedLines = Array.from({ length: 70 }, () => ({ a: rr(0, Math.PI * 2), r0: rr(0.28, 0.55) * diag * 0.5, wd: rr(0.004, 0.016) }));
      }
      const la = (t < 0.1 ? t / 0.1 : 1 - clamp((t - 0.7) / 0.55, 0, 1)) * 0.75;
      ctx.globalAlpha = la;
      ctx.fillStyle = "rgba(255,248,225,1)";
      ctx.beginPath();
      for (const L of speedLines) {
        const R1 = diag;
        ctx.moveTo(cx + Math.cos(L.a) * L.r0, cy + Math.sin(L.a) * L.r0);
        ctx.lineTo(cx + Math.cos(L.a - L.wd) * R1, cy + Math.sin(L.a - L.wd) * R1);
        ctx.lineTo(cx + Math.cos(L.a + L.wd) * R1, cy + Math.sin(L.a + L.wd) * R1);
        ctx.closePath();
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = "lighter";

    // 3) aura en flammes (silhouette pointue qui monte, trois couches)
    const rx = w / 2 + 12 * m, ry = h / 2 + 12 * m;
    for (const [k, alpha, top, mid, tall] of [
      [1.55, 0.38, "rgba(255,210,60,0)", "rgba(255,170,20,1)", 1.9],
      [1.28, 0.5, "rgba(255,240,140,0)", "rgba(255,215,70,1)", 1.45],
      [1.08, 0.55, "rgba(255,255,255,0)", "rgba(255,250,215,1)", 1.0],
    ]) {
      const N = 72;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const up = Math.max(0, -Math.sin(th));
        const tip = i % 2 ? (0.1 + up * up * tall) * (0.5 + 0.5 * Math.abs(Math.sin(i * 2.7 + t * 17 + k * 5))) : 0;
        const r = (1 + 0.06 * Math.sin(i * 1.3 + t * 23) + tip) * k;
        const x = cx + Math.cos(th) * rx * r + (i % 2 ? Math.sin(t * 13 + i) * 5 * m : 0);
        const y = cy + Math.sin(th) * ry * r - up * ry * 0.3 * k;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      const gr = ctx.createLinearGradient(0, cy - ry * (1.6 + tall * 1.4), 0, cy + ry * k);
      gr.addColorStop(0, top);
      gr.addColorStop(0.5, mid);
      gr.addColorStop(1, mid);
      ctx.globalAlpha = alpha * env * (0.82 + 0.18 * Math.sin(t * 38 + k * 7));
      ctx.fillStyle = gr;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 4) flammes qui montent depuis le contour de la carte
    if (t < 1.9) {
      spawnAcc += dt * 300;
      while (spawnAcc >= 1) {
        spawnAcc--;
        let x, y;
        if (R() < 0.55) { x = cx + rr(-1, 1) * rx; y = cy + (R() < 0.7 ? -ry : ry) * rr(0.85, 1.05); }
        else { x = cx + (R() < 0.5 ? -rx : rx) * rr(0.9, 1.1); y = cy + rr(-1, 1) * ry; }
        flames.push({ x, y, vx: (x - cx) * rr(0.4, 1.1), vy: -rr(160, 360) * m, life: rr(0.35, 0.75), age: 0, s: rr(12, 26) * m });
      }
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i];
      f.age += dt;
      if (f.age > f.life) { flames.splice(i, 1); continue; }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy -= 220 * dt * m;
      const k = 1 - f.age / f.life;
      const s = f.s * (0.4 + k * 0.8);
      ctx.globalAlpha = k * env;
      ctx.drawImage(GOLD(), f.x - s / 2, f.y - s * 1.1, s, s * 2.2);
    }

    // 5) étincelles qui s'élèvent
    if (t < 1.8 && R() < 0.8) sparks.push({ x: cx + rr(-rx, rx) * 1.3, y: cy + rr(-ry, ry), vy: -rr(240, 560) * m, life: rr(0.5, 1), age: 0 });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age > p.life) { sparks.splice(i, 1); continue; }
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k;
      ctx.drawImage(WHITE(), p.x - 4 * m, p.y - 9 * m, 8 * m, 18 * m);
    }

    // la carte elle-même reste visible : on « perce » l'aura à sa place, puis un liseré lumineux qui pulse
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = env * (0.65 + 0.35 * Math.sin(t * 30));
    ctx.strokeStyle = "rgba(255,225,120,1)";
    ctx.lineWidth = 6 * m;
    ctx.strokeRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
    ctx.strokeStyle = "rgba(255,255,240,1)";
    ctx.lineWidth = 2 * m;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = 1;

    // 6) éclairs autour de la carte
    if (t >= nextBolt && t < 1.9) {
      nextBolt = t + rr(0.05, 0.16);
      const a = rr(0, Math.PI * 2), b2 = a + rr(0.6, 1.6);
      bolts.push({ pts: bolt(ctx, cx + Math.cos(a) * rx * 1.15, cy + Math.sin(a) * ry * 1.15, cx + Math.cos(b2) * rx * 1.3, cy + Math.sin(b2) * ry * 1.3, 12 * m), age: 0 });
    }
    ctx.lineJoin = "round";
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.age += dt;
      if (b.age > 0.14) { bolts.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - b.age / 0.14;
      ctx.strokeStyle = "rgba(120,200,255,.55)";
      ctx.lineWidth = 7 * m;
      strokePts(ctx, b.pts);
      ctx.strokeStyle = "rgba(240,250,255,1)";
      ctx.lineWidth = 2 * m;
      strokePts(ctx, b.pts);
    }

    // 7) ondes de choc
    for (const g of rings) {
      const u = (t - g.d) / 0.75;
      if (u < 0 || u > 1) continue;
      const r = Math.max(w, h) * 0.6 + easeOut(u) * g.max;
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = "rgba(255,235,170,1)";
      ctx.lineWidth = g.wid * (1 - u) + 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";

    // 8) poussière et débris projetés
    for (const d of dust) {
      if (t > d.life) continue;
      const k = t / d.life;
      ctx.globalAlpha = (1 - k) * 0.8;
      const s = d.s * (0.6 + k * 1.6);
      ctx.drawImage(DUST(), d.x + d.vx * t - s / 2, d.y + d.vy * t - s / 2, s, s);
    }
    for (const r of rocks) {
      const tt = t - r.delay;
      if (tt < 0 || tt > 1.3) continue;
      r.vy += 900 * dt * m;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vx *= 0.985;
      r.rot += r.vr * dt;
      ctx.globalAlpha = clamp(1.3 - tt, 0, 1);
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      ctx.beginPath();
      r.shape.forEach((q, i) => {
        const a = (i / r.shape.length) * Math.PI * 2;
        if (i) ctx.lineTo(Math.cos(a) * r.r * q, Math.sin(a) * r.r * q);
        else ctx.moveTo(Math.cos(a) * r.r * q, Math.sin(a) * r.r * q);
      });
      ctx.closePath();
      ctx.fillStyle = r.col;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,200,120,.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // 9) flash blanc d'impact
    if (t < 0.32) {
      ctx.globalAlpha = (1 - t / 0.32) * 0.9;
      ctx.fillStyle = "#fff8e6";
      ctx.fillRect(0, 0, W, H);
    }

    // 10) « ATK 11 » façon bande dessinée
    if (label && t > 0.08 && t < 2.2) {
      const u = clamp((t - 0.08) / 0.22, 0, 1);
      const sc = 2.6 - 1.6 * easeOut(u) + (u >= 1 ? Math.sin(t * 30) * 0.02 : 0);
      const ty = clamp(cy - ry - fs * 0.9, fs * 0.8, H - fs);
      const tx = clamp(cx, fs * 2.2, W - fs * 2.2);
      ctx.globalAlpha = clamp(Math.min(u * 2, (2.2 - t) / 0.4), 0, 1);
      ctx.save();
      ctx.translate(tx + rr(-1.5, 1.5) * (1 - u), ty);
      ctx.rotate(-0.08);
      ctx.scale(sc, sc);
      ctx.font = `italic 900 ${fs}px system-ui, "Arial Black", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = fs * 0.2;
      ctx.strokeStyle = "#1a0b00";
      ctx.strokeText(label, 0, 0);
      const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
      tg.addColorStop(0, "#fffbe0");
      tg.addColorStop(0.45, "#ffd23a");
      tg.addColorStop(1, "#ff6a00");
      ctx.fillStyle = tg;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Gel : rects = zones gelées à l'écran ({ left, top, width, height }). Les appels rapprochés (les deux tapis) sont regroupés.
let iceQueue = [];
let iceTimer = 0;
export function iceFall(rect) {
  if (!fxOn() || !rect || rect.width < 4) return;
  iceQueue.push(rect);
  if (iceTimer) return;
  iceTimer = setTimeout(() => {
    const rects = iceQueue;
    iceQueue = [];
    iceTimer = 0;
    runIce(rects);
  }, 40);
}

function frostBranches(W, H) {
  // cristaux de givre qui poussent depuis les bords de l'écran
  const out = [];
  const n = Math.round(clamp((W + H) / 55, 14, 44));
  for (let i = 0; i < n; i++) {
    const e = Math.floor(R() * 4);
    const p = R();
    let x = e === 0 ? p * W : e === 1 ? W : e === 2 ? p * W : 0;
    let y = e === 0 ? 0 : e === 1 ? p * H : e === 2 ? H : p * H;
    let a = e === 0 ? Math.PI / 2 : e === 1 ? Math.PI : e === 2 ? -Math.PI / 2 : 0;
    a += rr(-0.6, 0.6);
    const segs = [];
    const len = rr(28, 80) * clamp(Math.min(W, H) / 700, 0.6, 1.2);
    const steps = 5;
    for (let k = 0; k < steps; k++) {
      const st = len / steps;
      const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st;
      segs.push([x, y, nx, ny, k / steps]);
      for (const s of [-1, 1]) {
        if (R() < 0.75) {
          const b = a + s * rr(0.7, 1.1), bl = st * rr(0.5, 1.1);
          segs.push([nx, ny, nx + Math.cos(b) * bl, ny + Math.sin(b) * bl, (k + 0.5) / steps]);
        }
      }
      x = nx; y = ny;
      a += rr(-0.25, 0.25);
    }
    out.push(segs);
  }
  return out;
}

function snowflake(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    for (const f of [0.45, 0.7]) {
      ctx.moveTo(0, -r * f);
      ctx.lineTo(-r * 0.22, -r * (f + 0.18));
      ctx.moveTo(0, -r * f);
      ctx.lineTo(r * 0.22, -r * (f + 0.18));
    }
  }
  ctx.stroke();
  ctx.restore();
}

function runIce(rects) {
  const W = window.innerWidth, H = window.innerHeight;
  const minX = Math.max(0, Math.min(...rects.map((r) => r.left)));
  const maxX = Math.min(W, Math.max(...rects.map((r) => r.left + r.width)));
  const span = Math.max(60, maxX - minX);
  const sc = clamp(span / 260, 0.6, 1.5);
  const DUR = 2.9;
  const n = Math.round(clamp(span / 26, 7, 22));
  const icicles = [];
  for (let i = 0; i < n; i++) {
    const tr = rects[Math.floor(R() * rects.length)];
    icicles.push({
      x: minX + ((i + rr(0.15, 0.85)) / n) * span,
      len: rr(55, 150) * sc,
      bw: rr(10, 22) * sc,
      grow: rr(0.05, 0.3),
      fall: rr(0.55, 1.15),
      ty: tr.top + rr(0.1, 0.95) * tr.height,
      tilt: rr(-0.06, 0.06),
      y: 0, vy: 0, broken: false, bend: [rr(0.85, 1.1), rr(0.85, 1.1)],
    });
  }
  const shards = [];
  const puffs = [];
  const flakes = Array.from({ length: Math.round(30 * sc) }, () => ({ x: rr(minX - 20, maxX + 20), y: rr(-H * 0.2, H), vy: rr(30, 90), vx: rr(-15, 15), s: rr(1.5, 3.5), ph: rr(0, 6) }));
  const stars = rects.flatMap((r) => Array.from({ length: 2 }, () => ({ x: r.left + rr(0.15, 0.85) * r.width, y: r.top + rr(0.15, 0.85) * r.height, r: rr(18, 34) * sc, d: rr(0.9, 1.6), rot: rr(0, 1) })));
  const frost = frostBranches(W, H);

  shake(5, 400);
  try { if (document.visibilityState === "visible") navigator.vibrate?.([30, 60, 30]); } catch (_) {}

  overlay(DUR, (ctx, t, dt) => {
    const env = t > DUR - 0.5 ? clamp((DUR - t) / 0.5, 0, 1) : 1;

    // 1) froid sur l'écran : voile bleuté et bords givrés
    ctx.globalAlpha = (t < 0.25 ? t / 0.25 : 1) * env;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, "rgba(160,215,255,0.06)");
    vg.addColorStop(0.7, "rgba(170,220,255,0.22)");
    vg.addColorStop(1, "rgba(225,245,255,0.6)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    // colonne gelée plus marquée
    const feather = Math.min(60, span * 0.25);
    const cg = ctx.createLinearGradient(minX - feather, 0, maxX + feather, 0);
    const fe = feather / (span + 2 * feather);
    cg.addColorStop(0, "rgba(200,235,255,0)");
    cg.addColorStop(fe, "rgba(200,235,255,.26)");
    cg.addColorStop(1 - fe, "rgba(200,235,255,.26)");
    cg.addColorStop(1, "rgba(200,235,255,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(minX - feather, 0, span + 2 * feather, H);
    // cristaux de givre depuis les bords
    const g = easeOut(t / 0.9);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const br of frost) {
      for (const [x1, y1, x2, y2, at] of br) {
        if (at > g) continue;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
    }
    ctx.strokeStyle = "rgba(170,220,255,.35)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(245,252,255,.9)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 2) flash glacé au début
    if (t < 0.35) {
      ctx.globalAlpha = (1 - t / 0.35) * 0.55;
      ctx.fillStyle = "#e6f6ff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // 3) flocons qui tombent dans la colonne
    ctx.fillStyle = "rgba(245,252,255,.9)";
    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(t * 2 + f.ph) * 20) * dt;
      ctx.globalAlpha = 0.85 * env;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4) grands cristaux de neige qui apparaissent sur le territoire en tournant
    ctx.strokeStyle = "rgba(240,250,255,.95)";
    ctx.lineWidth = 2;
    for (const s of stars) {
      const u = (t - s.d) / 1.3;
      if (u < 0 || u > 1) continue;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9;
      snowflake(ctx, s.x, s.y, s.r * (0.5 + easeOut(u * 2) * 0.5), s.rot + u * 1.2);
    }
    ctx.globalAlpha = 1;

    // 5) stalactites : elles se forment en haut de l'écran, tremblent, se détachent et tombent
    for (const c of icicles) {
      if (c.broken) continue;
      const gu = easeOut((t - c.grow) / 0.4);
      if (gu <= 0) continue;
      let ox = 0;
      if (t >= c.fall) {
        c.vy += 3200 * dt;
        c.y += c.vy * dt;
      } else if (t > c.fall - 0.18) ox = Math.sin(t * 90) * 1.6;
      const L = c.len * gu;
      const tipY = c.y + L;
      if (tipY >= c.ty && t >= c.fall) {
        c.broken = true;
        for (let k = 0; k < 14; k++) {
          const a = rr(-Math.PI, 0) + rr(-0.3, 0.3), v = rr(120, 420) * sc;
          shards.push({ x: c.x, y: c.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rr(2.5, 7) * sc, rot: rr(0, 6), vr: rr(-16, 16), age: 0, life: rr(0.5, 0.9) });
        }
        puffs.push({ x: c.x, y: c.ty, age: 0 });
        continue;
      }
      const x = c.x + ox, y = c.y, hw = c.bw / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.tilt);
      // halo
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(170,225,255,1)";
      ctx.beginPath();
      ctx.moveTo(-hw - 3, 0);
      ctx.lineTo(hw + 3, 0);
      ctx.lineTo(0, L + 5);
      ctx.closePath();
      ctx.fill();
      // glace
      ctx.globalAlpha = 1;
      const gr = ctx.createLinearGradient(-hw, 0, hw, 0);
      gr.addColorStop(0, "rgba(215,242,255,.95)");
      gr.addColorStop(0.35, "rgba(255,255,255,.98)");
      gr.addColorStop(0.6, "rgba(160,212,250,.85)");
      gr.addColorStop(1, "rgba(110,170,230,.9)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.quadraticCurveTo(-hw * c.bend[0], L * 0.35, -hw * 0.35, L * 0.62);
      ctx.lineTo(0, L);
      ctx.lineTo(hw * 0.32, L * 0.6);
      ctx.quadraticCurveTo(hw * c.bend[1], L * 0.3, hw, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // reflet
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = Math.max(1, hw * 0.18);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.45, 2);
      ctx.lineTo(-hw * 0.12, L * 0.7);
      ctx.stroke();
      ctx.restore();
    }

    // 6) impacts : poudre de givre et éclats
    ctx.globalCompositeOperation = "lighter";
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > 0.6) { puffs.splice(i, 1); continue; }
      const k = p.age / 0.6;
      const s = (30 + 90 * easeOut(k)) * sc;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(FROST(), p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
    for (let i = shards.length - 1; i >= 0; i--) {
      const p = shards[i];
      p.age += dt;
      if (p.age > p.life) { shards.splice(i, 1); continue; }
      p.vy += 1500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = "rgba(225,245,255,.95)";
      ctx.strokeStyle = "rgba(140,200,250,.9)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.lineTo(p.r * 0.45, p.r * 0.7);
      ctx.lineTo(-p.r * 0.5, p.r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Yan : vague de flammes qui balaie l'écran de gauche à droite et embrase la carte
export function flameWave({ cx, cy, w, h }) {
  if (!fxOn()) return;
  const W0 = window.innerWidth, H0 = window.innerHeight;
  const m = clamp(Math.max(w, h) / 110, 0.6, 1.6);
  const DUR = 2.6;
  const SWEEP = 1.0;
  const front = (t) => -0.3 * W0 + easeInOut(t / SWEEP) * 1.65 * W0;
  const hitT = (() => { let a = 0, b = SWEEP; for (let i = 0; i < 20; i++) { const c = (a + b) / 2; if (front(c) < cx) a = c; else b = c; } return (a + b) / 2; })();
  const fire = [];
  const smoke = [];
  const embers = [];
  let acc = 0, accC = 0, hit = false;
  const rate = clamp((W0 * H0) / 1500, 400, 1000); // particules par seconde pendant le balayage
  overlay(DUR, (ctx, t, dt, W, H) => {
    const env = t > DUR - 0.6 ? clamp((DUR - t) / 0.6, 0, 1) : 1;
    const fx0 = front(Math.min(t, SWEEP));
    // teinte chaude derrière la vague
    if (t < SWEEP + 0.2) {
      const g = ctx.createLinearGradient(fx0 - W * 0.6, 0, fx0 + 40, 0);
      g.addColorStop(0, "rgba(60,10,0,0)");
      g.addColorStop(0.75, "rgba(120,25,0,.35)");
      g.addColorStop(0.97, "rgba(255,120,20,.45)");
      g.addColorStop(1, "rgba(255,160,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(Math.max(0, fx0 - W * 0.6), 0, Math.min(W, W * 0.6 + 40), H);
    }
    ctx.globalAlpha = 0.35 * env * clamp((t - 0.2) / 0.4, 0, 1);
    ctx.fillStyle = "#3a0e00";
    ctx.fillRect(0, 0, Math.max(0, Math.min(W, fx0 - W * 0.2)), H);
    ctx.globalAlpha = 1;
    // mur de feu sur le front
    if (t < SWEEP) {
      acc += dt * rate;
      while (acc >= 1) {
        acc--;
        const y = rr(-0.05, 1.05) * H;
        fire.push({ x: fx0 - rr(0, 90), y, vx: rr(500, 1100), vy: -rr(120, 420), life: rr(0.25, 0.55), age: 0, s: rr(70, 170) * clamp(H / 800, 0.7, 1.3) });
        if (R() < 0.08) smoke.push({ x: fx0 - rr(40, 160), y, vx: rr(60, 200), vy: -rr(40, 140), life: rr(0.8, 1.4), age: 0, s: rr(60, 140) });
      }
    }
    // la carte s'embrase au passage du front
    if (!hit && t >= hitT) {
      hit = true;
      shake(10, 500);
      try { if (document.visibilityState === "visible") navigator.vibrate?.([50, 30, 120]); } catch (_) {}
      for (let i = 0; i < 70; i++) {
        const a = rr(0, Math.PI * 2), v = rr(200, 700) * m;
        fire.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rr(0.3, 0.6), age: 0, s: rr(30, 70) * m });
      }
    }
    if (hit && t < 2.1) {
      accC += dt * 160;
      while (accC >= 1) {
        accC--;
        const e = R();
        const x = e < 0.5 ? cx + rr(-0.5, 0.5) * w : cx + (R() < 0.5 ? -0.5 : 0.5) * w;
        const y = e < 0.5 ? cy + (R() < 0.6 ? -0.5 : 0.5) * h : cy + rr(-0.5, 0.5) * h;
        fire.push({ x, y, vx: rr(-30, 30), vy: -rr(120, 300) * m, life: rr(0.3, 0.6), age: 0, s: rr(16, 34) * m });
      }
      if (R() < 0.6) embers.push({ x: cx + rr(-w, w), y: cy + rr(-h / 2, h / 2), vx: rr(-40, 40), vy: -rr(80, 240), life: rr(0.8, 1.6), age: 0, ph: rr(0, 6) });
    }
    if (t < SWEEP && R() < 0.9) embers.push({ x: fx0 - rr(0, 200), y: rr(0, H), vx: rr(150, 400), vy: -rr(60, 200), life: rr(0.8, 1.5), age: 0, ph: rr(0, 6) });

    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.age += dt;
      if (p.age > p.life) { smoke.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.age / p.life, s = p.s * (0.7 + k);
      ctx.globalAlpha = (1 - k) * env;
      ctx.drawImage(SMOKE(), p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "lighter";
    // bande de feu continue sur le front (comble les trous entre les flammes)
    if (t < SWEEP) {
      const band = ctx.createLinearGradient(fx0 - 220, 0, fx0 + 30, 0);
      band.addColorStop(0, "rgba(255,60,0,0)");
      band.addColorStop(0.55, "rgba(255,90,10,.45)");
      band.addColorStop(0.88, "rgba(255,200,90,.75)");
      band.addColorStop(1, "rgba(255,240,180,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = band;
      ctx.fillRect(fx0 - 220, 0, 250, H);
    }
    for (let i = fire.length - 1; i >= 0; i--) {
      const p = fire[i];
      p.age += dt;
      if (p.age > p.life) { fire.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy -= 260 * dt;
      const k = 1 - p.age / p.life, s = p.s * (0.45 + 0.75 * k);
      ctx.globalAlpha = k * env;
      ctx.drawImage(FIRE(), p.x - s * 0.4, p.y - s, s * 0.8, s * 2);
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const p = embers[i];
      p.age += dt;
      if (p.age > p.life) { embers.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(t * 5 + p.ph) * 40) * dt; p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k * env * (0.6 + 0.4 * Math.sin(t * 30 + p.ph));
      ctx.drawImage(FIRE(), p.x - 5, p.y - 5, 10, 10);
    }
    // liseré incandescent autour de la carte
    if (hit) {
      ctx.globalAlpha = env * (0.6 + 0.4 * Math.sin(t * 25));
      ctx.strokeStyle = "rgba(255,140,30,1)";
      ctx.lineWidth = 5 * m;
      ctx.strokeRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
      // la carte reste lisible
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  });
}
function easeInOut(x) {
  const u = clamp(x, 0, 1);
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

// ---------------------------------------------------------------------------------------------------------------
// Lin : bourrasque de feuilles qui traverse l'écran, tourbillonne autour de la carte puis se disperse
export function leafGust({ cx, cy, w, h }) {
  if (!fxOn()) return;
  const W0 = window.innerWidth, H0 = window.innerHeight;
  const m = clamp(Math.max(w, h) / 110, 0.6, 1.5);
  const DUR = 2.8;
  const BURST = 1.75;
  const n = Math.round(clamp((W0 + H0) / 18, 50, 110));
  const R0 = Math.max(w, h) * 0.95 + 20 * m;
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const swirl = i < n * 0.45;
    leaves.push({
      swirl, mode: "fly", d: rr(0, swirl ? 0.45 : 0.9),
      x: -rr(20, 260), y: swirl ? cy + rr(-H0 * 0.35, H0 * 0.35) : rr(0, H0),
      vx: rr(650, 1150), wob: rr(20, 70), ph: rr(0, 6), ang: 0, r: 0, om: rr(5, 8) * (R() < 0.85 ? 1 : -1),
      rot: rr(0, 6), vr: rr(-9, 9), flip: rr(0, 6), vf: rr(5, 12), L: rr(9, 18) * m,
      col: `hsl(${rr(78, 130).toFixed(0)},${rr(45, 75).toFixed(0)}%,${rr(28, 52).toFixed(0)}%)`, bvx: 0, bvy: 0, fade: 1,
    });
  }
  const streaks = Array.from({ length: 16 }, () => ({ y: rr(0, H0), d: rr(0, 0.7), len: rr(0.25, 0.6) * W0, amp: rr(10, 40), sp: rr(1400, 2200) }));
  const sparkle = [];
  let burst = false;
  shake(4, 500);
  overlay(DUR, (ctx, t, dt, W, H) => {
    const env = t > DUR - 0.5 ? clamp((DUR - t) / 0.5, 0, 1) : 1;
    // lumière de sous-bois
    ctx.globalAlpha = 0.5 * env * clamp(t / 0.3, 0, 1);
    const vg = ctx.createRadialGradient(cx, cy, Math.max(w, h) * 0.3, cx, cy, Math.hypot(W, H) * 0.7);
    vg.addColorStop(0, "rgba(190,255,150,.22)");
    vg.addColorStop(0.4, "rgba(20,50,20,.2)");
    vg.addColorStop(1, "rgba(5,25,10,.6)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // traits de vent
    ctx.lineCap = "round";
    for (const s of streaks) {
      const tt = t - s.d;
      if (tt < 0 || tt > 0.9) continue;
      const x1 = -s.len + tt * s.sp, k = Math.sin((tt / 0.9) * Math.PI);
      ctx.globalAlpha = 0.45 * k;
      ctx.strokeStyle = "rgba(235,255,225,1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = x1 + (i / 12) * s.len;
        const y = s.y + Math.sin(x / 120 + s.d * 9) * s.amp;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // halo vert autour de la carte pendant le tourbillon
    ctx.globalCompositeOperation = "lighter";
    const gk = clamp((t - 0.45) / 0.3, 0, 1) * clamp((BURST + 0.4 - t) / 0.4, 0, 1);
    if (gk > 0) {
      ctx.globalAlpha = gk * 0.8;
      const s = R0 * 2.6;
      ctx.drawImage(GREEN(), cx - s / 2, cy - s / 2, s, s);
    }
    if (!burst && t >= BURST) {
      burst = true;
      shake(6, 350);
      for (let i = 0; i < 40; i++) {
        const a = rr(0, Math.PI * 2), v = rr(80, 380) * m;
        sparkle.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rr(0.4, 0.9), age: 0 });
      }
    }
    if (t > 0.5 && t < BURST && R() < 0.7) sparkle.push({ x: cx + rr(-R0, R0), y: cy + rr(-R0, R0), vx: 0, vy: -rr(20, 80), life: rr(0.4, 0.8), age: 0 });
    for (let i = sparkle.length - 1; i >= 0; i--) {
      const p = sparkle[i];
      p.age += dt;
      if (p.age > p.life) { sparkle.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.drawImage(GREEN(), p.x - 6, p.y - 6, 12, 12);
    }
    ctx.globalCompositeOperation = "source-over";
    // feuilles
    for (const L of leaves) {
      const tt = t - L.d;
      if (tt < 0) continue;
      if (L.mode === "fly") {
        L.x += L.vx * dt;
        L.y += Math.cos(tt * 6 + L.ph) * L.wob * dt * 3;
        if (L.swirl && Math.hypot(L.x - cx, L.y - cy) < R0 * 1.7 && t < BURST - 0.2) {
          L.mode = "orbit";
          L.ang = Math.atan2(L.y - cy, L.x - cx);
          L.r = Math.hypot(L.x - cx, L.y - cy);
        }
      } else if (L.mode === "orbit") {
        L.ang += L.om * dt;
        L.r += (R0 * rr(0.75, 1.05) - L.r) * Math.min(1, dt * 4);
        L.x = cx + Math.cos(L.ang) * L.r;
        L.y = cy + Math.sin(L.ang) * L.r * 0.85 - Math.sin(t * 3 + L.ph) * 6;
        if (t >= BURST) {
          L.mode = "out";
          const v = rr(500, 1000);
          L.bvx = Math.cos(L.ang) * v + -Math.sin(L.ang) * L.om * L.r * 0.4;
          L.bvy = Math.sin(L.ang) * v + Math.cos(L.ang) * L.om * L.r * 0.4;
        }
      } else {
        L.x += L.bvx * dt; L.y += L.bvy * dt;
        L.bvx *= 0.97; L.bvy = L.bvy * 0.97 + 120 * dt;
      }
      L.rot += L.vr * dt;
      L.flip += L.vf * dt;
      if (L.x > W + 40 && L.mode === "fly") continue;
      ctx.globalAlpha = env;
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(L.rot);
      ctx.scale(Math.cos(L.flip) * 0.85 + (Math.cos(L.flip) >= 0 ? 0.15 : -0.15), 1);
      const l = L.L;
      ctx.beginPath();
      ctx.moveTo(0, -l);
      ctx.quadraticCurveTo(l * 0.75, -l * 0.1, 0, l);
      ctx.quadraticCurveTo(-l * 0.75, -l * 0.1, 0, -l);
      ctx.fillStyle = L.col;
      ctx.fill();
      ctx.strokeStyle = "rgba(20,40,10,.55)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -l * 0.85);
      ctx.lineTo(0, l * 1.25);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Tian : tempête de neige, explosion de flocons à l'arrivée de la carte, neige déposée sur son bord supérieur
export function snowArrival({ cx, cy, w, h }) {
  if (!fxOn()) return;
  const W0 = window.innerWidth, H0 = window.innerHeight;
  const m = clamp(Math.max(w, h) / 110, 0.6, 1.5);
  const DUR = 2.9;
  const HIT = 0.45;
  const flakes = Array.from({ length: Math.round(clamp((W0 * H0) / 3500, 150, 380)) }, () => ({
    x: rr(-0.3, 1) * W0, y: rr(-1, 1) * H0, z: rr(0.4, 1.4), ph: rr(0, 6),
  }));
  const puffs = [];
  const glints = [];
  const stars = Array.from({ length: 5 }, (_, i) => ({ a: (i / 5) * Math.PI * 2, r: Math.max(w, h) * rr(0.8, 1.1), s: rr(12, 22) * m, d: HIT + rr(0, 0.3) }));
  const cap = Array.from({ length: 9 }, () => rr(0.5, 1)); // relief de la neige sur la carte
  let hit = false;
  overlay(DUR, (ctx, t, dt, W, H) => {
    const env = t > DUR - 0.6 ? clamp((DUR - t) / 0.6, 0, 1) : 1;
    // ciel froid
    ctx.globalAlpha = env * clamp(t / 0.25, 0, 1);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "rgba(170,195,230,.42)");
    sky.addColorStop(1, "rgba(60,80,120,.3)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // rais de lumière venus d'en haut, vers la carte
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const sx = cx + (i - 2) * w * 0.9;
      ctx.globalAlpha = env * 0.12 * (0.7 + 0.3 * Math.sin(t * 3 + i));
      const g = ctx.createLinearGradient(0, 0, 0, cy);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(230,245,255,1)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 20, 0);
      ctx.lineTo(sx + 50, 0);
      ctx.lineTo(cx + w * 0.3, cy);
      ctx.lineTo(cx - w * 0.3, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // explosion de neige quand la carte se pose
    if (!hit && t >= HIT) {
      hit = true;
      shake(7, 400);
      try { if (document.visibilityState === "visible") navigator.vibrate?.([40, 40, 80]); } catch (_) {}
      for (let i = 0; i < 46; i++) {
        const a = rr(0, Math.PI * 2), v = rr(150, 620) * m;
        puffs.push({ x: cx + Math.cos(a) * w * 0.3, y: cy + Math.sin(a) * h * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, life: rr(0.6, 1.2), age: 0, s: rr(26, 70) * m });
      }
      for (let i = 0; i < 30; i++) glints.push({ x: cx + rr(-w, w) * 1.2, y: cy + rr(-h, h) * 0.9, life: rr(0.5, 1.4), age: -rr(0, 0.6) });
    }
    // flocons : blizzard en diagonale qui ralentit en chute douce
    const storm = clamp(1 - (t - 0.3) / 1.0, 0, 1);
    for (const f of flakes) {
      const vx = (90 + 900 * storm) * f.z, vy = (70 + 520 * storm) * f.z;
      f.x += (vx + Math.sin(t * 2 + f.ph) * 25) * dt;
      f.y += vy * dt;
      if (f.y > H + 10) { f.y = -10; f.x = rr(-0.3, 1) * W; }
      if (f.x > W + 20) f.x = -20;
      ctx.globalAlpha = env * (0.55 + 0.4 * (f.z - 0.4));
      if (storm > 0.35) {
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.lineWidth = 1.6 * f.z;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - vx * 0.03, f.y - vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(f.x, f.y, 1.4 * f.z + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // poudre de neige
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > p.life) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 60 * dt;
      const k = p.age / p.life, s = p.s * (0.6 + k * 1.4);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.drawImage(SNOW(), p.x - s / 2, p.y - s / 2, s, s);
    }
    // onde de froid
    if (hit && t - HIT < 0.7) {
      const u = (t - HIT) / 0.7;
      ctx.globalAlpha = (1 - u) * 0.8;
      ctx.strokeStyle = "rgba(235,248,255,1)";
      ctx.lineWidth = 10 * (1 - u) * m + 1;
      ctx.beginPath();
      const r = Math.max(w, h) * 0.6 + easeOut(u) * Math.max(w, h) * 2.2;
      ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // la carte reste lisible
    if (hit) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
      ctx.globalCompositeOperation = "source-over";
    }
    // neige déposée sur le haut de la carte
    if (hit) {
      const k = easeOut((t - HIT) / 0.5);
      ctx.globalAlpha = env;
      const top = cy - h / 2, x0 = cx - w / 2 - 3 * m, x1 = cx + w / 2 + 3 * m;
      ctx.fillStyle = "#f6fbff";
      ctx.beginPath();
      ctx.moveTo(x0, top + 4 * m);
      cap.forEach((c, i) => {
        const x = x0 + ((i + 0.5) / cap.length) * (x1 - x0);
        ctx.quadraticCurveTo(x - (x1 - x0) / cap.length / 2, top - c * 11 * m * k, x, top - c * 9 * m * k);
      });
      ctx.lineTo(x1, top + 4 * m);
      // petites coulures
      ctx.quadraticCurveTo(x1 - 4 * m, top + 10 * m * k, x1 - 10 * m, top + 4 * m);
      ctx.lineTo(x0 + 12 * m, top + 4 * m);
      ctx.quadraticCurveTo(x0 + 5 * m, top + 12 * m * k, x0, top + 4 * m);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(160,200,240,.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // cristaux et scintillements
    ctx.strokeStyle = "rgba(240,250,255,.95)";
    ctx.lineWidth = 1.6;
    for (const s of stars) {
      const u = (t - s.d) / 1.4;
      if (u < 0 || u > 1) continue;
      ctx.globalAlpha = Math.sin(u * Math.PI);
      const a = s.a + u * 1.6;
      snowflake(ctx, cx + Math.cos(a) * s.r, cy + Math.sin(a) * s.r * 0.8, s.s, u * 2);
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = glints.length - 1; i >= 0; i--) {
      const g = glints[i];
      g.age += dt;
      if (g.age < 0) continue;
      if (g.age > g.life) { glints.splice(i, 1); continue; }
      const k = Math.sin((g.age / g.life) * Math.PI);
      ctx.globalAlpha = k;
      ctx.fillStyle = "#fff";
      ctx.fillRect(g.x - 0.75, g.y - 6 * k, 1.5, 12 * k);
      ctx.fillRect(g.x - 6 * k, g.y - 0.75, 12 * k, 1.5);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  });
}
