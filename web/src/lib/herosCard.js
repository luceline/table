// Prototype Héros : dessin des cartes dans le navigateur (canvas 504 x 704, JPEG), à partir de leur texte.
// Sert à l'installation des cartes de démo et à l'import d'un deck (.md) : une carte modifiée est redessinée.
// Données d'une carte : { kind: "action" | "reaction" | "quete" | "equipement", code, name, ... }
//   action / reaction : lvl (niveau requis), cost (mana), fam ("Feu", "Garde" ou ""), text, chain ("Facile : ...")
//   quete : tier ("simple" | "intermediaire" | "complexe"), cost, goal, reward, tag ("⚔" | "⏳" | "")
//   equipement : slot ("Gants"...), cost (points), mode ("Activé" | "Passif"), text

const W = 504, H = 704;
const SERIF = 'Georgia, "Palatino Linotype", "Times New Roman", serif';
const SANS = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PAL = {
  Feu: [[122, 30, 14], [36, 10, 6], [240, 120, 50]],
  Garde: [[26, 56, 98], [8, 16, 32], [120, 170, 230]],
  "": [[70, 52, 92], [20, 14, 28], [190, 160, 230]],
  quete: [[96, 76, 36], [30, 22, 10], [236, 196, 110]],
  equipement: [[60, 64, 70], [16, 18, 20], [200, 170, 120]],
};
// familles inconnues : une teinte stable tirée du nom
function palOf(fam) {
  if (PAL[fam]) return PAL[fam];
  let h = 0;
  for (const ch of fam) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const rgb = (l, s) => hsl(h, s, l);
  return [rgb(0.3, 0.6), rgb(0.08, 0.6), rgb(0.65, 0.7)];
}
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
export const HEROS_TIER = {
  simple: ["SIMPLE", "rgb(86,170,96)", 1],
  intermediaire: ["INTERMÉDIAIRE", "rgb(220,160,60)", 2],
  complexe: ["COMPLEXE", "rgb(210,70,70)", 3],
};
const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.round(v * k)).join(",")})`;

function background(g, pal) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(pal[0]));
  grad.addColorStop(1, rgb(pal[1]));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function frame(g, acc) {
  g.lineWidth = 5;
  g.strokeStyle = rgb(acc);
  rrect(g, 6, 6, W - 13, H - 13, 26);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = rgb(acc, 0.55);
  rrect(g, 16, 16, W - 33, H - 33, 20);
  g.stroke();
}
function emblem(g, kind, fam, cx, cy, r, acc) {
  const col = rgb(acc, 0.9), dim = rgb(acc, 0.35);
  g.fillStyle = dim;
  g.strokeStyle = col;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = col;
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  if (fam === "Feu") {
    const drop = (sc, dy, fill) => {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * 2 * Math.PI;
        pts.push([cx + r * 0.5 * sc * Math.sin(t) * Math.abs(Math.sin(t / 2)) ** 1.3, cy + dy - r * 0.62 * sc * Math.cos(t)]);
      }
      g.fillStyle = fill;
      poly(pts);
    };
    drop(1, 4, col);
    drop(0.55, 22, "rgb(255,214,120)");
  } else if (fam === "Garde" || kind === "reaction") {
    const w = r * 0.62, h = r * 0.75;
    poly([[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]]);
    g.strokeStyle = dim;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, cy - h + 8);
    g.lineTo(cx, cy + h - 12);
    g.stroke();
  } else if (kind === "quete") {
    rrect(g, cx - r * 0.55, cy - r * 0.6, r * 1.1, r * 1.2, 10);
    g.fill();
    g.strokeStyle = dim;
    g.lineWidth = 5;
    for (let k = 0; k < 4; k++) {
      const y = cy - r * 0.35 + k * r * 0.22;
      g.beginPath();
      g.moveTo(cx - r * 0.38, y);
      g.lineTo(cx + r * 0.38, y);
      g.stroke();
    }
  } else if (kind === "equipement") {
    poly([[cx, cy - r * 0.75], [cx + r * 0.1, cy + r * 0.2], [cx - r * 0.1, cy + r * 0.2]]);
    g.fillRect(cx - r * 0.36, cy + r * 0.2, r * 0.72, r * 0.1);
    g.fillRect(cx - r * 0.07, cy + r * 0.3, r * 0.14, r * 0.32);
  } else {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2, rr = r * (i % 2 === 0 ? 0.62 : 0.26);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    poly(pts);
  }
}
function badge(g, cx, cy, r, txt, fill, outline, fg = "#fff") {
  g.fillStyle = fill;
  g.strokeStyle = outline;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = fg;
  g.font = `900 ${txt.length > 1 ? 32 : 40}px ${SANS}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(txt, cx, cy + 2);
}
function label(g, x, y, txt, color, size = 14, weight = 700) {
  g.fillStyle = color;
  g.font = `${weight} ${size}px ${SANS}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(txt, x, y);
}
function title(g, name, y) {
  let s = 44;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (; s > 22; s -= 2) {
    g.font = `700 ${s}px ${SERIF}`;
    if (g.measureText(name).width <= W - 80) break;
  }
  g.lineWidth = 4;
  g.strokeStyle = "#000";
  g.strokeText(name, W / 2, y);
  g.fillStyle = "rgb(250,244,230)";
  g.fillText(name, W / 2, y);
}
function wrap(g, text, maxw) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width <= maxw) line = t;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}
// blocks : [[texte, gras ?]] dans un cadre clair ; police la plus grande qui tient
function textbox(g, blocks, top, bottom, acc) {
  g.fillStyle = "rgba(250,245,232,.93)";
  g.strokeStyle = rgb(acc);
  g.lineWidth = 3;
  rrect(g, 30, top, W - 60, bottom - top, 16);
  g.fill();
  g.stroke();
  const bw = W - 96, bh = bottom - top - 36;
  let s = 30;
  const fontOf = (bold, sz) => `${bold ? 700 : 500} ${sz}px ${SANS}`;
  for (; s > 15; s--) {
    let h = 0;
    for (const [t, b] of blocks) {
      g.font = fontOf(b, s);
      h += wrap(g, t, bw).length * Math.round(s * 1.28) + Math.round(s * 0.5);
    }
    if (h <= bh) break;
  }
  let y = top + 18;
  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillStyle = "rgb(28,22,18)";
  for (const [t, b] of blocks) {
    g.font = fontOf(b, s);
    for (const ln of wrap(g, t, bw)) {
      g.fillText(ln, 48, y);
      y += Math.round(s * 1.28);
    }
    y += Math.round(s * 0.5);
  }
}
function footer(g, txt, acc) {
  label(g, W / 2, H - 34, `${txt} · Prototype`, rgb(acc, 0.9), 16, 500);
}

export function drawHerosCard(g, c) {
  if (c.kind === "quete") {
    const pal = PAL.quete, acc = pal[2];
    const [lbl, tcol] = HEROS_TIER[c.tier] || HEROS_TIER.simple;
    background(g, pal);
    frame(g, acc);
    emblem(g, "quete", "", W / 2, 200, 74, acc);
    badge(g, 64, 64, 38, String(c.cost ?? ""), "rgb(30,80,170)", "rgb(170,210,255)");
    label(g, 64, 112, "MANA", "rgb(200,220,255)");
    g.fillStyle = tcol;
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    rrect(g, W - 210, 40, 176, 48, 12);
    g.fill();
    g.stroke();
    label(g, W - 122, 65, lbl, "#fff", lbl.length < 10 ? 20 : 17, 900);
    label(g, W / 2, 300, "QUÊTE", rgb(acc), 20);
    title(g, c.name, 342);
    textbox(g, [["Objectif", true], [c.goal || "", false], ["Récompense", true], [c.reward || "", false],
      ["À la validation : +1 niveau, la récompense, +3 points d'équipement, +1 mana.", false]], 384, H - 62, acc);
    const tag = { "⚔": "Situationnelle", "⏳": "Pas en ouverture" }[c.tag] || "";
    footer(g, (c.code || "") + (tag ? ` · ${tag}` : ""), acc);
    return;
  }
  if (c.kind === "equipement") {
    const pal = PAL.equipement, acc = pal[2];
    background(g, pal);
    frame(g, acc);
    emblem(g, "equipement", "", W / 2, 205, 80, acc);
    badge(g, 64, 64, 38, String(c.cost ?? ""), "rgb(120,90,20)", "rgb(250,210,120)");
    label(g, 64, 112, "POINTS", "rgb(250,220,150)");
    g.fillStyle = "rgb(40,44,50)";
    g.strokeStyle = rgb(acc);
    g.lineWidth = 2;
    rrect(g, W - 196, 40, 162, 48, 12);
    g.fill();
    g.stroke();
    label(g, W - 115, 65, (c.slot || "").toUpperCase(), "rgb(240,220,180)", 19, 900);
    label(g, W / 2, 306, "ÉQUIPEMENT", rgb(acc), 20);
    title(g, c.name, 346);
    const mode = c.mode === "Passif" ? "Passif" : "Activé (une fois par tour, sans mana)";
    textbox(g, [[mode, true], [c.text || "", false], ["Inactif tant qu'il n'est pas débloqué : tournez la pièce de côté.", false]], 388, H - 62, acc);
    footer(g, c.code || "", acc);
    return;
  }
  const fam = c.fam || "";
  const pal = palOf(fam), acc = pal[2];
  background(g, pal);
  frame(g, acc);
  emblem(g, c.kind, fam, W / 2, 215, 86, acc);
  badge(g, 64, 64, 38, String(c.cost ?? ""), "rgb(30,80,170)", "rgb(170,210,255)");
  label(g, 64, 112, "MANA", "rgb(200,220,255)");
  badge(g, W - 64, 64, 38, String(c.lvl ?? ""), "rgb(60,40,20)", "rgb(240,200,120)", "rgb(255,230,170)");
  label(g, W - 64, 112, "NIVEAU", "rgb(255,225,160)");
  title(g, c.name, 340);
  label(g, W / 2, 384, (c.kind === "reaction" ? "RÉACTION" : "ACTION") + (fam ? `  ·  [${fam}]` : ""), rgb(acc), 20);
  const blocks = [[c.text || "", false]];
  if (c.chain) {
    const i = c.chain.indexOf(" : ");
    const diff = i > 0 ? c.chain.slice(0, i) : "";
    const rest = i > 0 ? c.chain.slice(i + 3) : c.chain;
    blocks.push([`Enchaînement${diff ? ` (${diff.toLowerCase()})` : ""} : ${rest}`, true]);
  }
  textbox(g, blocks, 410, H - 62, acc);
  footer(g, c.code || "", acc);
}

// Image JPEG (Blob) d'une carte
export function renderHerosCard(c) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  drawHerosCard(cv.getContext("2d"), c);
  return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.86));
}
