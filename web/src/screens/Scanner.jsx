import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import {
  loadImage, detectCorners, defaultCorners, warp, canvasToBlob, quadIsLandscape, rotateCorners,
} from "../lib/scan.js";

const OUT = { p: [630, 880], l: [880, 630] };

// Photo déjà détourée au format carte (63 x 88, portrait ou paysage) ?
// Tolérance de 3 % : une photo standard 3:4 (écart de 4,8 %) n'est pas prise pour une carte.
function croppedOrient(cv) {
  const r = cv.width / cv.height;
  if (Math.abs(r / (63 / 88) - 1) < 0.03) return "p";
  if (Math.abs(r / (88 / 63) - 1) < 0.03) return "l";
  return null;
}

// Nom de carte tiré du nom de fichier : « 3 - Potion rouge.jpg » -> « Potion rouge ».
// Les noms génériques d'appareil photo (IMG_1234, image, PXL_…) sont ignorés.
export function nameFromFile(filename) {
  let n = (filename || "").replace(/\.[^.]+$/, "");
  n = n.replace(/^\s*\d+\s*[-_.)]\s*/, "");
  n = n.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!n || /^\d[\d\s-]*$/.test(n)) return "";
  if (/^(img|image|pxl|dsc|dcim|photo|scan|capture|screenshot|signal|whatsapp|wa\d|mvimg|burst|cimg|p\d{6,})/i.test(n)) return "";
  return n.slice(0, 120);
}

function resizeTo(cv, w, h) {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cv, 0, 0, w, h);
  return out;
}

export default function Scanner({ go }) {
  const user = me();
  const [queue, setQueue] = useState([]); // photos à ajuster à la main
  const [src, setSrc] = useState(null);
  const [quad, setQuad] = useState(null);
  const [orient, setOrient] = useState("p");
  const [result, setResult] = useState(null); // { url, blob }
  const [name, setName] = useState("");
  const [isToken, setIsToken] = useState(false); // reste actif pour toute une série
  const [saved, setSaved] = useState(0);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(null); // { done, n, auto }
  const [report, setReport] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const camRef = useRef();
  const galRef = useRef();
  const totalRef = useRef(0);

  useEffect(() => {
    pb.collection("cards").getList(1, 1, { filter: `owner="${user.id}"` }).then((r) => {
      totalRef.current = r.totalItems;
      setTotal(r.totalItems);
    }).catch(() => {});
  }, []);

  async function upload(blob, o, nm) {
    const fd = new FormData();
    fd.append("owner", user.id);
    fd.append("name", nm || `Carte ${totalRef.current + 1}`);
    fd.append("orient", o);
    fd.append("kind", isToken ? "jeton" : "carte");
    fd.append("image", new File([blob], "scan.jpg", { type: "image/jpeg" }));
    await pb.collection("cards").create(fd);
    totalRef.current += 1;
    setTotal(totalRef.current);
    setSaved((n) => n + 1);
  }

  function showEditor(item) {
    const cv = item.cv;
    const q = detectCorners(cv);
    setSrc(cv);
    setQuad(q);
    setOrient(quadIsLandscape(q) ? "l" : "p");
    setResult(null);
    setName(item.nm || "");
  }

  // Photos déjà détourées : enregistrées directement. Les autres passent par l'ajustement des coins.
  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setErr("");
    setReport("");
    setBusy(true);
    const manual = [];
    let auto = 0, failed = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, n: files.length, auto });
      try {
        const cv = await loadImage(files[i]);
        const nm = nameFromFile(files[i].name);
        const o = croppedOrient(cv);
        if (o) {
          const [w, h] = OUT[o];
          await upload(await canvasToBlob(resizeTo(cv, w, h)), o, nm);
          auto++;
        } else manual.push({ cv, nm });
      } catch (e2) {
        failed++;
      }
    }
    setProgress(null);
    setBusy(false);
    const parts = [];
    if (auto) parts.push(`${auto} carte${auto > 1 ? "s" : ""} déjà détourée${auto > 1 ? "s" : ""} ajoutée${auto > 1 ? "s" : ""} directement`);
    if (manual.length) parts.push(`${manual.length} photo${manual.length > 1 ? "s" : ""} à recadrer`);
    if (failed) parts.push(`${failed} illisible${failed > 1 ? "s" : ""}`);
    setReport(parts.join(", ") + ".");
    if (manual.length) {
      setQueue(manual.slice(1));
      showEditor(manual[0]);
    }
  }

  function next() {
    setResult(null);
    setSrc(null);
    setQuad(null);
    if (queue.length) {
      const [item, ...rest] = queue;
      setQueue(rest);
      showEditor(item);
    }
  }

  async function validate() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const [w, h] = OUT[orient];
    const blob = await canvasToBlob(warp(src, quad, w, h));
    setResult({ url: URL.createObjectURL(blob), blob });
    setBusy(false);
  }

  async function save(thenCamera) {
    setBusy(true);
    setErr("");
    try {
      await upload(result.blob, orient, name.trim());
      URL.revokeObjectURL(result.url);
      const hadQueue = queue.length > 0;
      next();
      if (thenCamera && !hadQueue) setTimeout(() => camRef.current?.click(), 50);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const tokenToggle = (
    <div className="row" style={{ marginBottom: 12 }}>
      <button className={`btn sm ${isToken ? "primary" : ""}`} onClick={() => setIsToken(!isToken)}>
        {isToken ? "✓ Cartes jetons" : "Cartes jetons ?"}
      </button>
      <span className="muted small grow">
        {isToken ? "Iront dans la réserve à côté du tapis, copies illimitées." : "Cartes normales, pour le deck."}
      </span>
    </div>
  );

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1>Scanner</h1>
        {saved > 0 && <span className="chip">{saved} enregistrée{saved > 1 ? "s" : ""}</span>}
      </div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      {err && <div className="err">{err}</div>}
      {report && <div className="card-box small" style={{ padding: "10px 14px" }}>{report}</div>}

      {!src && (
        <div className="card-box">
          <h2>Ajouter des cartes</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Photos déjà détourées au format carte (par l'appli photo ou un scanner de documents) : elles sont ajoutées directement, sans validation.
            Le nom du fichier devient le nom de la carte (« 3 - Potion rouge.jpg » donne « Potion rouge »).
            Pour une photo de la carte posée sur la table : fond uni et contrasté, sans reflet, carte entière. Les coins sont détectés et vous pourrez les ajuster.
          </p>
          {tokenToggle}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => camRef.current?.click()} disabled={busy}>Prendre une photo</button>
            <button className="btn" onClick={() => galRef.current?.click()} disabled={busy}>Importer des photos</button>
          </div>
          {progress && <p className="muted">Import {progress.done + 1} / {progress.n}…</p>}
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => go("library")}>Voir mes cartes ({total})</button>
        </div>
      )}

      {src && !result && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Faites glisser les 4 coins sur les coins de la carte. Le trait bleu marque le haut : « Pivoter » si besoin.{queue.length ? ` ${queue.length} autre(s) photo(s) à recadrer ensuite.` : ""}
          </p>
          <CornerEditor src={src} quad={quad} setQuad={setQuad} />
          <div className="spacer" />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setQuad(rotateCorners(quad))}>↻ Pivoter</button>
            <button className="btn" onClick={() => setOrient(orient === "p" ? "l" : "p")}>
              {orient === "p" ? "Portrait" : "Paysage"}
            </button>
            <button className="btn ghost" onClick={() => setQuad(detectCorners(src))}>Détecter</button>
            <button className="btn ghost" onClick={() => setQuad(defaultCorners(src.width, src.height))}>Cadre</button>
            <span className="grow" />
            <button className="btn ghost" onClick={next}>Passer</button>
            <button className="btn primary" onClick={validate} disabled={busy}>Redresser</button>
          </div>
        </>
      )}

      {result && (
        <>
          <div className="scan-result">
            <img src={result.url} alt="Carte redressée" />
          </div>
          <div className="spacer" />
          <div className="field">
            <label>Nom de la carte (facultatif, utile pour le journal de partie)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Carte ${total + 1}`} maxLength={120} />
          </div>
          {tokenToggle}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => setResult(null)}>← Ajuster</button>
            <span className="grow" />
            <button className="btn" onClick={() => save(false)} disabled={busy}>Enregistrer</button>
            <button className="btn primary" onClick={() => save(true)} disabled={busy}>
              {queue.length ? "Enregistrer et suivante" : "Enregistrer et scanner"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CornerEditor({ src, quad, setQuad }) {
  const wrapRef = useRef();
  const cvRef = useRef();
  const loupeRef = useRef();
  const [drag, setDrag] = useState(null); // { i, cx, cy }

  useEffect(() => {
    const cv = cvRef.current;
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext("2d").drawImage(src, 0, 0);
  }, [src]);

  const r = Math.max(src.width, src.height) * 0.028;

  function toImg(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * src.width;
    const y = ((e.clientY - rect.top) / rect.height) * src.height;
    return {
      x: Math.max(0, Math.min(src.width, x)),
      y: Math.max(0, Math.min(src.height, y)),
      lx: e.clientX - rect.left,
      ly: e.clientY - rect.top,
      rw: rect.width,
    };
  }

  function down(i, e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toImg(e);
    setDrag({ i, lx: p.lx, ly: p.ly });
  }

  function move(e) {
    if (!drag) return;
    const p = toImg(e);
    const q = quad.map((c, j) => (j === drag.i ? { x: p.x, y: p.y } : c));
    setQuad(q);
    setDrag({ ...drag, lx: p.lx, ly: p.ly });
    drawLoupe(p.x, p.y);
  }

  function drawLoupe(x, y) {
    const lc = loupeRef.current;
    if (!lc) return;
    const size = 220;
    lc.width = size;
    lc.height = size;
    const ctx = lc.getContext("2d");
    const zoom = 3 * (src.width / wrapRef.current.getBoundingClientRect().width) / 2;
    const s = size / zoom / 2;
    ctx.drawImage(src, x - s / 2, y - s / 2, s, s, 0, 0, size, size);
    ctx.strokeStyle = "#d6be8c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
  }

  useEffect(() => {
    if (drag) drawLoupe(quad[drag.i].x, quad[drag.i].y);
  }, [drag?.i]);

  const pts = quad.map((p) => `${p.x},${p.y}`).join(" ");
  const loupeLeft = drag ? (drag.lx > 140 ? drag.lx - 130 : drag.lx + 20) : 0;
  const loupeTop = drag ? Math.max(0, drag.ly - 140) : 0;

  return (
    <div className="scan-stage" ref={wrapRef} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      <canvas ref={cvRef} />
      <svg viewBox={`0 0 ${src.width} ${src.height}`} preserveAspectRatio="none">
        <polygon points={pts} fill="rgba(214,190,140,.12)" stroke="#d6be8c" strokeWidth={r * 0.18} />
        <line x1={quad[0].x} y1={quad[0].y} x2={quad[1].x} y2={quad[1].y} stroke="#6aa3ff" strokeWidth={r * 0.3} />
        {quad.map((p, i) => (
          <circle key={i} className="handle" cx={p.x} cy={p.y} r={r} strokeWidth={r * 0.15} onPointerDown={(e) => down(i, e)} style={{ touchAction: "none" }} />
        ))}
      </svg>
      {drag && (
        <div className="loupe" style={{ left: loupeLeft, top: loupeTop }}>
          <canvas ref={loupeRef} />
        </div>
      )}
    </div>
  );
}
