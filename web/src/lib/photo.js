// Vraie photo pleine résolution (Android / Chrome : ImageCapture.takePhoto), plus nette qu'une image du flux vidéo.
// La photo peut être tournée et cadrée autrement que le viseur : on la compare à l'image vidéo (vignettes)
// pour trouver le bon sens et vérifier la correspondance. En cas de doute, on renvoie null (repli sur la vidéo).

const MAX_W = 4096; // au-delà, la mémoire du téléphone souffre sans gain visible sur une carte

// Image tournée de rot degrés (0, 90, 180, 270) puis mise à l'échelle k
function rotated(src, sw, sh, rot, k) {
  const swap = rot % 180 !== 0;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((swap ? sh : sw) * k));
  c.height = Math.max(1, Math.round((swap ? sw : sh) * k));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(src, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
  return c;
}

// Zone centrée de l'image au format (aspect) du flux vidéo
function centerCrop(w, h, aspect) {
  if (w / h > aspect) {
    const cw = h * aspect;
    return { x: (w - cw) / 2, y: 0, w: cw, h };
  }
  const ch = w / aspect;
  return { x: 0, y: (h - ch) / 2, w, h: ch };
}

// Vignette en niveaux de gris centrée-réduite (pour une comparaison insensible à l'exposition)
function signature(src, sx, sy, sw, sh, W, H) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  let m = 0;
  for (let i = 0; i < g.length; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    m += g[i];
  }
  m /= g.length;
  let v = 0;
  for (let i = 0; i < g.length; i++) {
    g[i] -= m;
    v += g[i] * g[i];
  }
  const sd = Math.sqrt(v / g.length) || 1;
  for (let i = 0; i < g.length; i++) g[i] /= sd;
  return g;
}

const corr = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / a.length;
};

// Renvoie { src, x, y, k } : la zone (x, y) du canvas src correspond au pixel (0, 0) de la vidéo, k = échelle
export async function takeFullPhoto(track, video) {
  if (typeof ImageCapture === "undefined" || !track || !video?.videoWidth) return null;
  try {
    const ic = new ImageCapture(track);
    const opts = {};
    try {
      const caps = await ic.getPhotoCapabilities();
      const w = caps?.imageWidth;
      if (w?.max) {
        let t = Math.min(w.max, MAX_W);
        if (w.step && w.min != null) t = w.min + Math.floor((t - w.min) / w.step) * w.step;
        opts.imageWidth = t;
      }
    } catch (_) {}
    const blob = await ic.takePhoto(opts);
    const bmp = await createImageBitmap(blob);
    const vw = video.videoWidth, vh = video.videoHeight, aspect = vw / vh;
    const TW = 48, TH = Math.max(8, Math.round((48 * vh) / vw));
    const ref = signature(video, 0, 0, vw, vh, TW, TH);
    let best = { c: -1, rot: 0 };
    for (const rot of [0, 90, 270, 180]) {
      const small = rotated(bmp, bmp.width, bmp.height, rot, 256 / Math.max(bmp.width, bmp.height));
      const z = centerCrop(small.width, small.height, aspect);
      const c = corr(ref, signature(small, z.x, z.y, z.w, z.h, TW, TH));
      if (c > best.c) best = { c, rot };
    }
    if (best.c < 0.55) {
      bmp.close?.();
      return null; // la photo ne ressemble pas assez au viseur : on garde l'image vidéo
    }
    const full = rotated(bmp, bmp.width, bmp.height, best.rot, 1);
    bmp.close?.();
    const z = centerCrop(full.width, full.height, aspect);
    return { src: full, x: z.x, y: z.y, k: z.w / vw };
  } catch (_) {
    return null;
  }
}
