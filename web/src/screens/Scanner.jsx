import { useCallback, useEffect, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { detectCard, cardShape, warp, canvasToBlob, quadIsLandscape, rotateCorners } from "../lib/scan.js";
import { nameKey } from "../lib/deckrules.js";

const OUT = { p: [630, 880], l: [880, 630] };

// Ajout de cartes uniquement par l'appareil photo, dans l'appli (pas d'import de fichiers) :
// la carte doit être détectée (forme et proportions d'une carte), puis redressée au format 63 x 88.
export default function Scanner({ go }) {
  const user = me();
  const [step, setStep] = useState("intro"); // intro | camera | edit | result
  const [src, setSrc] = useState(null); // photo capturée (canvas)
  const [quad, setQuad] = useState(null);
  const [orient, setOrient] = useState("p");
  const [result, setResult] = useState(null); // { url, blob }
  const [name, setName] = useState("");
  const [isToken, setIsToken] = useState(false); // reste actif pour toute une série
  const [names, setNames] = useState(null); // noms déjà dans la collection
  const [saved, setSaved] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.collection("cards").getFullList({ filter: `owner="${user.id}"`, fields: "id,name" })
      .then((r) => setNames(r.map((c) => c.name || "")))
      .catch(() => setNames([]));
  }, []);

  const dupOf = (n) => (names || []).find((x) => nameKey(x) === nameKey(n));

  function onCapture(cv, q) {
    setSrc(cv);
    setQuad(q);
    setOrient(quadIsLandscape(q) ? "l" : "p");
    setResult(null);
    setErr("");
    setStep("edit");
  }

  async function validate() {
    if (!cardShape(quad).ok) return setErr("Les coins ne dessinent pas une carte (proportions 63 x 88). Replacez-les sur les coins de la carte.");
    setErr("");
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const [w, h] = OUT[orient];
    const blob = await canvasToBlob(warp(src, quad, w, h));
    setResult({ url: URL.createObjectURL(blob), blob });
    setBusy(false);
    setStep("result");
  }

  async function save() {
    const nm = name.trim();
    if (!nm) return setErr("Donnez le nom de la carte.");
    const dup = dupOf(nm);
    if (dup) return setErr(`« ${dup} » est déjà dans votre collection : inutile de la scanner à nouveau, le deck permet d'en mettre 2 exemplaires. Pour une autre version de la carte, ajoutez un repère au nom (ex. « ${nm} UR »).`);
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("owner", user.id);
      fd.append("name", nm);
      fd.append("orient", orient);
      fd.append("kind", isToken ? "jeton" : "carte");
      fd.append("image", new File([result.blob], "scan.jpg", { type: "image/jpeg" }));
      await pb.collection("cards").create(fd);
      URL.revokeObjectURL(result.url);
      setNames((l) => [...(l || []), nm]);
      setSaved((n) => n + 1);
      setResult(null);
      setSrc(null);
      setName("");
      setStep("camera");
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
      {err && <div className="err">{err}</div>}

      {step === "intro" && (
        <div className="card-box">
          <h2>Ajouter des cartes</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Les cartes s'ajoutent en les photographiant avec l'appareil photo, depuis l'appli. Posez la carte à plat sur un fond uni
            et contrasté (table sombre pour une carte claire), sans reflet : son contour est détecté automatiquement, puis la carte est redressée au format de jeu.
            Chaque carte ne s'ajoute qu'une fois (par son nom) : le deck permet ensuite d'en mettre 2 exemplaires.
          </p>
          {tokenToggle}
          <button className="btn primary" onClick={() => { setErr(""); setStep("camera"); }}>Ouvrir l'appareil photo</button>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => go("library")}>Voir mes cartes ({names?.length ?? "…"})</button>
        </div>
      )}

      {step === "camera" && <Camera onCapture={onCapture} onClose={() => setStep("intro")} setErr={setErr} />}

      {step === "edit" && src && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Carte détectée. Ajustez les coins si besoin (le trait bleu marque le haut : « Pivoter » si besoin), puis redressez.
          </p>
          <CornerEditor src={src} quad={quad} setQuad={setQuad} />
          <div className="spacer" />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setQuad(rotateCorners(quad))}>↻ Pivoter</button>
            <button className="btn" onClick={() => setOrient(orient === "p" ? "l" : "p")}>
              {orient === "p" ? "Portrait" : "Paysage"}
            </button>
            <span className="grow" />
            <button className="btn ghost" onClick={() => { setErr(""); setStep("camera"); }}>Reprendre la photo</button>
            <button className="btn primary" onClick={validate} disabled={busy}>Redresser</button>
          </div>
        </>
      )}

      {step === "result" && result && (
        <>
          <div className="scan-result">
            <img src={result.url} alt="Carte redressée" />
          </div>
          <div className="spacer" />
          <div className="field">
            <label>Nom de la carte (obligatoire)</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              placeholder="Ex. Potion rouge"
              maxLength={120}
              autoFocus
            />
            {name.trim() && dupOf(name) && <div className="warn small">Déjà dans votre collection.</div>}
          </div>
          {tokenToggle}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => setStep("edit")}>← Ajuster</button>
            <span className="grow" />
            <button className="btn primary" onClick={save} disabled={busy || !name.trim() || !!dupOf(name)}>Enregistrer et scanner la suivante</button>
          </div>
        </>
      )}
    </div>
  );
}

// Viseur : flux vidéo de l'appareil photo, détection de la carte en direct, capture en pleine résolution
function Camera({ onCapture, onClose, setErr }) {
  const videoRef = useRef();
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(null); // { q, ok, vw, vh } détection en direct
  const [fail, setFail] = useState("");
  const [msg, setMsg] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFail("Cet appareil ou ce navigateur ne donne pas accès à l'appareil photo. Utilisez votre téléphone (Chrome ou Safari).");
        return;
      }
      try {
        const st = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (!alive) return st.getTracks().forEach((t) => t.stop());
        streamRef.current = st;
        const v = videoRef.current;
        v.srcObject = st;
        await v.play().catch(() => {});
        setReady(true);
      } catch (e) {
        setFail(
          e?.name === "NotAllowedError"
            ? "Accès à l'appareil photo refusé. Autorisez-le dans les réglages du navigateur pour ce site, puis réessayez."
            : "Impossible d'ouvrir l'appareil photo. Aucun appareil photo trouvé, ou il est utilisé par une autre application."
        );
      }
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [stop]);

  // Détection en direct, sur une image réduite, environ 3 fois par seconde
  useEffect(() => {
    if (!ready) return;
    const small = document.createElement("canvas");
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const k = 480 / Math.max(v.videoWidth, v.videoHeight);
      small.width = Math.round(v.videoWidth * k);
      small.height = Math.round(v.videoHeight * k);
      small.getContext("2d").drawImage(v, 0, 0, small.width, small.height);
      const r = detectCard(small);
      setLive(r.q ? { q: r.q, ok: r.ok, vw: small.width, vh: small.height } : null);
    }, 330);
    return () => clearInterval(t);
  }, [ready]);

  function capture() {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const cv = document.createElement("canvas");
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext("2d").drawImage(v, 0, 0);
    const r = detectCard(cv);
    if (!r.ok) {
      setMsg(r.why);
      return;
    }
    setErr("");
    stop();
    onCapture(cv, r.q);
  }

  if (fail) {
    return (
      <div className="card-box">
        <p className="err" style={{ marginTop: 0 }}>{fail}</p>
        <button className="btn" onClick={onClose}>Retour</button>
      </div>
    );
  }

  const pts = live ? live.q.map((p) => `${p.x},${p.y}`).join(" ") : "";
  return (
    <>
      <div className="cam">
        <video ref={videoRef} playsInline muted />
        {live && (
          <svg viewBox={`0 0 ${live.vw} ${live.vh}`} preserveAspectRatio="none">
            <polygon points={pts} fill={live.ok ? "rgba(79,191,127,.18)" : "rgba(255,179,92,.12)"} stroke={live.ok ? "#4fbf7f" : "#ffb35c"} strokeWidth={live.vw / 160} />
          </svg>
        )}
        <div className={`cam-hint ${live?.ok ? "ok" : ""}`}>
          {!ready ? "Ouverture de l'appareil photo…" : live?.ok ? "Carte détectée ✓" : "Cadrez une carte sur un fond uni"}
        </div>
      </div>
      {msg && <div className="err">{msg}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost" onClick={onClose}>Fermer</button>
        <span className="grow" />
        <button className="btn primary cam-shot" onClick={() => { setMsg(""); capture(); }} disabled={!ready}>Capturer</button>
      </div>
    </>
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
