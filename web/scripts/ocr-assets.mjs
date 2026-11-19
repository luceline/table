// Copie dans public/ocr/ les fichiers de lecture automatique des cartes (servis par l'appli, rien de chargé depuis Internet).
// det.onnx, rec.onnx (modèles PaddleOCR PP-OCRv3, Apache 2.0) et keys.txt sont versionnés directement dans public/ocr/.
import { copyFileSync, mkdirSync, existsSync } from "fs";
const out = "public/ocr/";
mkdirSync(out, { recursive: true });
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];
for (const [src, dst] of files) {
  if (!existsSync(src)) throw new Error(`Fichier manquant : ${src} (lancer npm install)`);
  copyFileSync(src, out + dst);
}
for (const f of ["det.onnx", "rec.onnx", "keys.txt"]) if (!existsSync(out + f)) throw new Error(`Fichier manquant : ${out}${f}`);
console.log("Fichiers OCR copiés dans public/ocr/");
