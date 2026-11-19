// Lecture automatique d'une carte redressée (portrait), entièrement dans le navigateur :
// - nom : PaddleOCR PP-OCRv3 (détection des lignes + reconnaissance) via onnxruntime-web ;
// - ATK / Valeur / DEF : Tesseract (chiffres seuls) dans les 3 pastilles du haut.
// Fichiers servis depuis /ocr/ (voir scripts/ocr-assets.mjs), chargés au premier scan seulement.
// Résultats indicatifs : le joueur valide ou corrige ; une valeur incertaine est laissée vide.
import { findName, findStats } from "./ocrcore.js";
import { parseFactionLine } from "./factions.js";

const BASE = `${import.meta.env.BASE_URL}ocr/`;

let paddleP = null;
function loadPaddle() {
  if (!paddleP) {
    paddleP = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1; // moteur .wasm empaqueté par Vite avec l'appli
      const [det, rec, keys] = await Promise.all([
        ort.InferenceSession.create(`${BASE}det.onnx`),
        ort.InferenceSession.create(`${BASE}rec.onnx`),
        fetch(`${BASE}keys.txt`).then((r) => r.text()),
      ]);
      return { ort, det, rec, chars: ["blank", ...keys.split("\n"), " "] };
    })().catch((e) => {
      paddleP = null;
      throw e;
    });
  }
  return paddleP;
}

let tessP = null;
function loadTess() {
  if (!tessP) {
    tessP = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const w = await createWorker("eng", 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: BASE,
        langPath: BASE,
        gzip: true,
        workerBlobURL: false,
      });
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR, tessedit_char_whitelist: "0123456789" });
      return w;
    })().catch((e) => {
      tessP = null;
      throw e;
    });
  }
  return tessP;
}

// Précharge les modèles pendant que le joueur cadre sa carte
export function preloadOcr() {
  loadPaddle().catch(() => {});
  loadTess().catch(() => {});
}

const toImg = (cv) => {
  const d = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
  return { data: d.data, width: d.width, height: d.height };
};
const toCanvas = (img) => {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
};

// Lecture complète d'une carte portrait ; une erreur de chargement ne bloque jamais le scan
export async function readCard(cv) {
  // Ramenée à 630 x 880 : les zones sont calibrées sur ce format
  const c = document.createElement("canvas");
  c.width = 630;
  c.height = 880;
  c.getContext("2d").drawImage(cv, 0, 0, 630, 880);
  const card = toImg(c);
  const [found, stats] = await Promise.all([
    loadPaddle().then((m) => findName(m.ort, m.det, m.rec, m.chars, card, parseFactionLine)).catch(() => ({ name: "", factions: [] })),
    loadTess().then((w) => findStats(w, card, async (img) => toCanvas(img))).catch(() => ({ atk: "", val: "", def: "" })),
  ]);
  return { name: found.name, factions: found.factions, ...stats };
}
