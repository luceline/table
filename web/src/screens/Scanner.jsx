import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import {
  loadImage, detectCorners, defaultCorners, warp, canvasToBlob, quadIsLandscape, rotateCorners,
} from "../lib/scan.js";

const OUT = { p: [630, 880], l: [880, 630] };

export default function Scanner({ go }) {
  const user = me();
  const [queue, setQueue] = useState([]);
  const [src, setSrc] = useState(null); // canvas source
  const [quad, setQuad] = useState(null);
  const [orient, setOrient] = useState("p");
  const [result, setResult] = useState(null); // { url, blob }
  const [name, setName] = useState("");
  const [isToken, setIsToken] = useState(false); // reste actif pour scanner une série de cartes jetons
  const [saved, setSaved] = useState(0);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const camRef = useRef();
  const galRef = useRef();

  useEffect(() => {
    pb.collection("cards").getList(1, 1, { filter: `owner="${user.id}"` }).then((r) => setTotal(r.totalItems)).catch(() => {});
  }, []);

  async function openFile(file) {
    setErr("");
    setBusy(true);
    try {
      const cv = await loadImage(file);
      const q = detectCorners(cv);
      setSrc(cv);
      setQuad(q);
      setOrient(quadIsLandscape(q) ? "l" : "p");
      setResult(null);
      setName("");
    } catch (e) {
      setErr("Impossible de lire cette image.");
    } finally {
      setBusy(false);
    }
  }

  function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setQueue(files.slice(1));
    openFile(files[0]);
  }

  function next() {
    setResult(null);
    setSrc(null);
    setQuad(null);
    if (queue.length) {
      const [f, ...rest] = queue;
      setQueue(rest);
      openFile(f);
    }
  }

  async function validate() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const [w, h] = OUT[orient];
    const out = warp(src, quad, w, h);
    const blob = await canvasToBlob(out);
    setResult({ url: URL.createObjectURL(blob), blob });
    setBusy(false);
  }

  async function save(thenCamera) {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("owner", user.id);
      fd.append("name", name.trim() || `Carte ${total + 1}`);
      fd.append("orient", orient);
      fd.append("kind", isToken ? "jeton" : "carte");
      fd.append("image", new File([result.blob], "scan.jpg", { type: "image/jpeg" }));
      await pb.collection("cards").create(fd);
      setSaved((n) => n + 1);
      setTotal((n) => n + 1);
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

      {!src && (
        <div className="card-box">
          <h2>Ajouter une carte</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Posez la carte à plat sur un fond uni et contrasté (table sombre pour une carte claire), sans reflet, et cadrez-la en entier. Les coins sont détectés automatiquement, vous pourrez les ajuster.
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => camRef.current?.click()} disabled={busy}>Prendre une photo</button>
            <button className="btn" onClick={() => galRef.current?.click()} disabled={busy}>Importer des photos</button>
          </div>
          {busy && <p className="muted">Analyse…</p>}
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => go("library")}>Voir mes cartes ({total})</button>
        </div>
      )}

      {src && !result && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Faites glisser les 4 coins sur les coins de la carte. Le trait bleu marque le haut : « Pivoter » si besoin.{queue.length ? ` ${queue.length} photo(s) en attente.` : ""}
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
            <button className="btn ghost" onClick={next}>Annuler</button>
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
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Carte ${total + 1}`} maxLength={120} autoFocus />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn sm ${isToken ? "primary" : ""}`} onClick={() => setIsToken(!isToken)}>
              {isToken ? "✓ Carte jeton" : "Carte jeton ?"}
            </button>
            <span className="muted small grow">
              {isToken ? "Ira dans la réserve à côté du tapis, copies illimitées." : "Carte normale, va dans le deck."}
            </span>
          </div>
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
