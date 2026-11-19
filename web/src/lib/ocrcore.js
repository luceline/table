// Cœur de la lecture des cartes, sans dépendance au navigateur (testable sous Node).
// Images : { data: Uint8ClampedArray RGBA, width, height }.
// Modèles PaddleOCR PP-OCRv3 (Apache 2.0) : détection de lignes (DB) + reconnaissance (CTC).

export function crop(img, x, y, w, h) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.min(img.width - x, Math.round(w))); h = Math.max(1, Math.min(img.height - y, Math.round(h)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) out.set(img.data.subarray(((y + j) * img.width + x) * 4, ((y + j) * img.width + x + w) * 4), j * w * 4);
  return { data: out, width: w, height: h };
}

export function resize(img, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let j = 0; j < h; j++) {
    const fy = Math.min(img.height - 1, Math.max(0, (j + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0;
    for (let i = 0; i < w; i++) {
      const fx = Math.min(img.width - 1, Math.max(0, (i + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
        const d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
        out[(j * w + i) * 4 + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
    }
  }
  return { data: out, width: w, height: h };
}

// Détection des lignes de texte (post-traitement DB simplifié : boîtes droites, l'image est déjà redressée)
export async function detect(ort, sess, img, minSide = 640) {
  const k = minSide / Math.min(img.width, img.height);
  const W = Math.max(32, Math.round((img.width * k) / 32) * 32), H = Math.max(32, Math.round((img.height * k) / 32) * 32);
  const r = resize(img, W, H);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const d = new Float32Array(3 * W * H);
  for (let p = 0; p < W * H; p++)
    for (let c = 0; c < 3; c++) d[c * W * H + p] = (r.data[p * 4 + (2 - c)] / 255 - mean[c]) / std[c]; // BGR
  const out = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", d, [1, 3, H, W]) }))[sess.outputNames[0]];
  const prob = out.data;
  // Masque seuillé puis dilaté (2 x 2)
  const m0 = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) m0[p] = prob[p] > 0.3 ? 1 : 0;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      mask[p] = m0[p] || (x + 1 < W && m0[p + 1]) || (y + 1 < H && m0[p + W]) || (x + 1 < W && y + 1 < H && m0[p + W + 1]) ? 1 : 0;
    }
  // Composantes connexes -> boîtes
  const lab = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const boxes = [];
  let id = 0;
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue;
    id++;
    let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    stack[sp++] = s; lab[s] = id;
    while (sp) {
      const p = stack[--sp]; n++;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (Math.min(bw, bh) < 4) continue;
    let sum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sum += prob[y * W + x];
    if (sum / (bw * bh) < 0.5) continue;
    const dist = (bw * bh * 1.6) / (2 * (bw + bh)); // « unclip » : on regrossit la boîte
    boxes.push({
      x: Math.max(0, (x0 - dist) / (W / img.width)),
      y: Math.max(0, (y0 - dist) / (H / img.height)),
      w: Math.min(img.width, (bw + 2 * dist) / (W / img.width)),
      h: Math.min(img.height, (bh + 2 * dist) / (H / img.height)),
    });
  }
  return boxes;
}

// Reconnaissance d'une ligne (hauteur 48, CTC glouton)
export async function recognize(ort, sess, chars, img) {
  const H = 48;
  const rw = Math.max(1, Math.min(1600, Math.ceil((H * img.width) / img.height)));
  const W = Math.max(320, rw);
  const r = resize(img, rw, H);
  const d = new Float32Array(3 * H * W);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < rw; x++)
      for (let c = 0; c < 3; c++) d[c * H * W + y * W + x] = (r.data[(y * rw + x) * 4 + (2 - c)] / 255 - 0.5) / 0.5; // BGR
  const out = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", d, [1, 3, H, W]) }))[sess.outputNames[0]];
  const [, T, C] = out.dims;
  let s = "", prev = -1;
  const ps = [];
  for (let t = 0; t < T; t++) {
    let bi = 0, bv = -1;
    for (let k = 0; k < C; k++) {
      const v = out.data[t * C + k];
      if (v > bv) { bv = v; bi = k; }
    }
    if (bi !== 0 && bi !== prev) { s += chars[bi] || ""; ps.push(bv); }
    prev = bi;
  }
  return { s, score: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0 };
}

const letters = (s) => s.replace(/[^A-Za-zÀ-ÿ]/g, "").length;
export const cleanName = (s) => s.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "").replace(/\s+/g, " ").trim();

// Nom : dernière ligne centrée du tiers bas de la carte (sous l'effet, au-dessus du numéro de série et de l'artiste).
// Factions : la ligne centrée juste au-dessus du nom (« -Kin/Chaos/Nature- »), si tous ses mots sont des factions.
export async function findName(ort, det, rec, chars, card, parseFactions = null) {
  const y0 = Math.round(card.height * 0.66);
  const bottom = crop(card, 0, y0, card.width, card.height - y0);
  const boxes = (await detect(ort, det, bottom))
    .map((b) => ({ ...b, cx: b.x + b.w / 2 }))
    .filter((b) => Math.abs(b.cx - card.width / 2) < card.width * 0.17 && b.w > card.width * 0.12)
    .sort((a, b) => b.y + b.h - (a.y + a.h));
  let name = "", factions = [];
  for (const b of boxes.slice(0, 4)) {
    const r = await recognize(ort, rec, chars, crop(bottom, b.x, b.y, b.w, b.h));
    if (letters(r.s) < 2 || /\d{3}/.test(r.s)) continue;
    const fl = parseFactions ? parseFactions(cleanName(r.s)) : null;
    if (name && fl) { factions = fl; break; }
    if (!name && !r.s.includes("/") && r.score >= 0.55 && letters(cleanName(r.s)) >= 3) { name = cleanName(r.s); continue; }
    if (!name && fl) { factions = fl; break; }
  }
  return parseFactions ? { name, factions } : name;
}

// Pastille de chiffre : agrandie, contraste étiré puis seuillée
export function statPatch(card, cx, cy, r = 0.06) {
  const p = resize(crop(card, (cx - r) * card.width, (cy - r * 0.72) * card.height, 2 * r * card.width, 2 * r * 0.72 * card.height), 4 * Math.round(2 * r * card.width), 4 * Math.round(2 * r * 0.72 * card.height));
  const g = new Float32Array(p.width * p.height);
  let mn = 255, mx = 0;
  for (let i = 0; i < g.length; i++) {
    g[i] = 0.299 * p.data[i * 4] + 0.587 * p.data[i * 4 + 1] + 0.114 * p.data[i * 4 + 2];
    if (g[i] < mn) mn = g[i];
    if (g[i] > mx) mx = g[i];
  }
  const k = 255 / Math.max(1, mx - mn);
  for (let i = 0; i < g.length; i++) {
    const v = (g[i] - mn) * k >= 128 ? 255 : 0;
    p.data[i * 4] = p.data[i * 4 + 1] = p.data[i * 4 + 2] = v;
    p.data[i * 4 + 3] = 255;
  }
  return p;
}

// ATK / Valeur / DEF : plusieurs décalages verticaux, on garde la lecture la plus sûre (vide si incertaine).
// toInput : convertit une image RGBA en entrée acceptée par Tesseract (canvas dans le navigateur).
// [centre x, centre y, demi-largeur] ; la pastille de la Valeur est plus petite
export const STAT_ZONES = { atk: [0.232, 0.164, 0.06], val: [0.5, 0.118, 0.05], def: [0.762, 0.164, 0.06] };
export async function findStats(tess, card, toInput, minConf = 60) {
  const out = {};
  for (const [k, [cx, cy, r]] of Object.entries(STAT_ZONES)) {
    let best = { t: "", c: 0 };
    for (const dy of [0, -0.015, 0.015, -0.03, 0.03]) {
      const d = (await tess.recognize(await toInput(statPatch(card, cx, Math.max(0.06, cy + dy), r)))).data;
      const t = d.text.replace(/\D/g, "");
      if (t.length >= 1 && t.length <= 2 && d.confidence > best.c) best = { t, c: d.confidence };
      if (best.c >= 90) break;
    }
    out[k] = best.c >= minConf ? best.t : "";
  }
  return out;
}
