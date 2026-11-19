// Talkie-walkie : enregistrement de courts messages vocaux et lecture automatique chez l'adversaire.

export const MAX_SEC = 30;

// Format d'enregistrement : AAC/MP4 si possible (lisible partout, iPhone compris), sinon WebM/Opus
export function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (_) {}
  }
  return "";
}

export const canRecord = () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

// Démarre un enregistrement ; renvoie { stop(send) } où stop(true) résout { blob, dur, mime } (ou null)
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const t0 = performance.now();
  rec.start(250);
  let done = null;
  const finished = new Promise((r) => (done = r));
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    done();
  };
  return {
    t0,
    async stop(send) {
      if (rec.state !== "inactive") rec.stop();
      else stream.getTracks().forEach((t) => t.stop());
      await finished;
      if (!send || !chunks.length) return null;
      const type = rec.mimeType || mime || chunks[0].type || "audio/webm";
      return { blob: new Blob(chunks, { type }), dur: (performance.now() - t0) / 1000, mime: type };
    },
  };
}

export const extFor = (mime) => (/mp4|aac|m4a/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

// Lecteur unique, « débloqué » au premier geste (obligatoire sur iPhone pour jouer un son reçu plus tard)
let player = null;
let current = null; // message en cours de lecture
const queue = [];
let onState = null;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function unlockAudio() {
  if (player) return;
  player = new Audio();
  player.preload = "auto";
  player.src = SILENCE;
  player.play().catch(() => {});
  const done = () => {
    if (!current) return;
    current = null;
    onState?.(null);
    next();
  };
  player.onended = done;
  player.onerror = done;
}

function next() {
  if (current || !player) return;
  const item = queue.shift();
  if (!item) return;
  current = item;
  player.src = item.url;
  onState?.(item);
  player.play().catch(() => {
    current = null;
    onState?.(null);
    next();
  });
}

// Lecture en file d'attente (un message après l'autre)
export function playVoice(url, meta = {}) {
  if (!player) unlockAudio();
  queue.push({ url, ...meta });
  next();
}

export function onVoiceState(fn) {
  onState = fn;
}
