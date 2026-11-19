// Scan d'une carte : chargement photo, détection auto des 4 coins, redressement perspective.

export async function loadImage(file, maxSide = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    return cv;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function otsu(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.min(255, v | 0)]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 60;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; th = i; }
  }
  return th;
}

// Retourne [tl, tr, br, bl] en pixels du canvas source, ou un cadre par défaut.
export function detectCorners(canvas) {
  return findCard(canvas)?.q || defaultCorners(canvas.width, canvas.height);
}

// Détection d'une carte : coins + taux de remplissage du contour (null si rien de convaincant)
export function findCard(canvas) {
  const W = canvas.width, H = canvas.height;
  const k = Math.min(1, 320 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * k));
  const h = Math.max(8, Math.round(H * k));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Couleur de fond = médiane du cadre extérieur
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue;
      const i = (y * w + x) * 4;
      rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
    }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = med(rs), bg = med(gs), bb = med(bs);

  const dist = new Uint8Array(w * h);
  const vals = [];
  const borderVals = [];
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const d = (Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb)) / 3;
    dist[j] = Math.min(255, d * 2);
    vals.push(dist[j]);
    const x = j % w, y = (j / w) | 0;
    if (x < band || x >= w - band || y < band || y >= h - band) borderVals.push(dist[j]);
  }
  // Seuil calé sur le bruit du fond (95e centile du cadre), borné par Otsu pour les fonds très bruités
  borderVals.sort((a, b) => a - b);
  const noise = borderVals[Math.floor(borderVals.length * 0.95)] || 0;
  const th = Math.min(Math.max(28, noise * 1.6 + 12), Math.max(40, otsu(vals)));
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < mask.length; j++) mask[j] = dist[j] > th ? 1 : 0;

  // Plus grande composante connexe
  const label = new Int32Array(w * h);
  let bestId = 0, bestSize = 0, id = 0;
  const stack = new Int32Array(w * h);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    id++;
    let sp = 0, size = 0;
    stack[sp++] = s;
    label[s] = id;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[sp++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
  }

  const area = w * h;
  if (bestSize < area * 0.06 || bestSize > area * 0.97) return null;

  let tl, tr, brc, bl;
  let mnS = Infinity, mxS = -Infinity, mnD = Infinity, mxD = -Infinity;
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w, y = (p / w) | 0;
    const s = x + y, d = x - y;
    if (s < mnS) { mnS = s; tl = [x, y]; }
    if (s > mxS) { mxS = s; brc = [x, y]; }
    if (d > mxD) { mxD = d; tr = [x, y]; }
    if (d < mnD) { mnD = d; bl = [x, y]; }
  }
  const up = (p) => ({ x: (p[0] + 0.5) / k, y: (p[1] + 0.5) / k });
  const q = [up(tl), up(tr), up(brc), up(bl)];
  // Garde-fou : quadrilatère trop petit ou dégénéré
  const qa = Math.abs(polyArea(q));
  if (qa < W * H * 0.05) return null;
  // Part du quadrilatère réellement couverte par la forme détectée : ~1 pour une carte bien contrastée
  const fill = Math.min(1, bestSize / (k * k) / qa);
  return { q, fill };
}

// Le quadrilatère a-t-il les proportions d'une carte 63 x 88 (avec une marge pour la perspective) ?
export function cardShape(q) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hz = (d(q[0], q[1]) + d(q[3], q[2])) / 2;
  const vt = (d(q[0], q[3]) + d(q[1], q[2])) / 2;
  if (!hz || !vt) return { ok: false, ratio: 0 };
  const ratio = Math.min(hz, vt) / Math.max(hz, vt);
  // Côtés opposés de longueurs proches : pas de forme trop déformée
  const skew = Math.max(d(q[0], q[1]) / d(q[3], q[2]), d(q[3], q[2]) / d(q[0], q[1]), d(q[0], q[3]) / d(q[1], q[2]), d(q[1], q[2]) / d(q[0], q[3]));
  return { ok: Math.abs(ratio / (63 / 88) - 1) < 0.12 && skew < 1.35, ratio };
}

// Verdict de détection pour l'appareil photo : carte trouvée, aux bonnes proportions, contour net
export function detectCard(canvas) {
  const r = findCard(canvas);
  if (!r) return { ok: false, why: "Aucune carte détectée. Posez la carte sur un fond uni et contrasté, entière dans le cadre." };
  if (!cardShape(r.q).ok) return { ok: false, q: r.q, why: "La forme détectée n'a pas les proportions d'une carte. Cadrez la carte seule, bien à plat." };
  if (r.fill < 0.7) return { ok: false, q: r.q, why: "Contour de carte incomplet. Évitez les reflets et les objets autour de la carte." };
  return { ok: true, q: r.q };
}

export function polyArea(q) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return a / 2;
}

export function defaultCorners(W, H) {
  const ch = H * 0.8;
  let cw = ch * (63 / 88);
  if (cw > W * 0.9) cw = W * 0.9;
  const x = (W - cw) / 2, y = (H - ch) / 2;
  return [
    { x, y },
    { x: x + cw, y },
    { x: x + cw, y: y + ch },
    { x, y: y + ch },
  ];
}

export function quadIsLandscape(q) {
  const top = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
  const left = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
  return top > left * 1.1;
}

// Fait tourner l'attribution des coins : l'image redressée pivote de 90°.
export function rotateCorners(q) {
  return [q[3], q[0], q[1], q[2]];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

// Homographie : (u,v) du rectangle de sortie -> (x,y) dans la source
function homography(dst, src) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dst[i];
    const { x, y } = src[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const h = solve(A, b);
  return [...h, 1];
}

export function warp(srcCanvas, quad, outW, outH) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const sdata = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  const img = octx.createImageData(outW, outH);
  const o = img.data;
  const H = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    quad
  );
  let k = 0;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++, k += 4) {
      const uu = u + 0.5, vv = v + 0.5;
      const z = H[6] * uu + H[7] * vv + 1;
      let x = (H[0] * uu + H[1] * vv + H[2]) / z - 0.5;
      let y = (H[3] * uu + H[4] * vv + H[5]) / z - 0.5;
      if (x < 0) x = 0; else if (x > sw - 1.001) x = sw - 1.001;
      if (y < 0) y = 0; else if (y > sh - 1.001) y = sh - 1.001;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const a = sdata[i00 + c] + (sdata[i10 + c] - sdata[i00 + c]) * fx;
        const bb = sdata[i01 + c] + (sdata[i11 + c] - sdata[i01 + c]) * fx;
        o[k + c] = a + (bb - a) * fy;
      }
      o[k + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function canvasToBlob(cv, quality = 0.88) {
  return new Promise((res) => cv.toBlob(res, "image/jpeg", quality));
}
