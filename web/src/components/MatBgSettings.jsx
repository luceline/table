import { useRef, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";

// Image idéale : 2400 x 1200 px, au format 2:1 du tapis (60 x 30 cm). Toute image est recadrée au centre
// à ce format puis réduite à 2400 px de large au plus (JPEG), pour rester légère à charger.
export const MAT_BG_W = 2400;
export const MAT_BG_H = 1200;
export const DEFAULT_DIM = 35;

export function matBgOf(user) {
  if (!user?.mat_bg) return null;
  return { url: fileUrl("users", user.id, user.mat_bg), dim: user.mat_dim ?? DEFAULT_DIM }; // enregistré avec l'image
}

async function toMatImage(file) {
  const img = await new Promise((ok, ko) => {
    const u = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error("Image illisible"));
    i.src = u;
  });
  const sw = img.naturalWidth, sh = img.naturalHeight;
  // recadrage centré au format 2:1
  let cw = sw, ch = sw / 2;
  if (ch > sh) { ch = sh; cw = sh * 2; }
  const cx = (sw - cw) / 2, cy = (sh - ch) / 2;
  const ow = Math.min(MAT_BG_W, Math.round(cw)), oh = Math.round(ow / 2);
  const cv = document.createElement("canvas");
  cv.width = ow;
  cv.height = oh;
  const g = cv.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, cx, cy, cw, ch, 0, 0, ow, oh);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.86));
  return { blob, w: ow, h: oh, small: cw < 1200 };
}

export default function MatBgSettings() {
  const [user, setUser] = useState(me());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // champ vide = 0 côté serveur : la valeur par défaut s'applique tant qu'aucune image n'est choisie
  const [dim, setDim] = useState(user?.mat_bg ? user.mat_dim ?? DEFAULT_DIM : DEFAULT_DIM);
  const input = useRef();
  const bg = matBgOf(user);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      const { blob, w, h, small } = await toMatImage(f);
      const fd = new FormData();
      fd.append("mat_bg", new File([blob], "tapis.jpg", { type: "image/jpeg" }));
      fd.append("mat_dim", String(dim));
      const rec = await pb.collection("users").update(user.id, fd);
      setUser(rec);
      setMsg(small ? `Image enregistrée (${w} x ${h} px). Elle est petite : elle risque d'être floue sur grand écran.` : `Image enregistrée (${w} x ${h} px).`);
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDim(v) {
    try {
      const rec = await pb.collection("users").update(user.id, { mat_dim: v });
      setUser(rec);
    } catch (_) {}
  }

  async function remove() {
    setBusy(true);
    try {
      const rec = await pb.collection("users").update(user.id, { mat_bg: null });
      setUser(rec);
      setMsg("Fond retiré : le tapis d'origine est revenu.");
      setDim(DEFAULT_DIM);
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-box">
      <h2>Fond de mon tapis</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Une image de votre choix sous votre tapis. Vous seul la voyez ; les emplacements et les territoires restent au premier plan.
        Image idéale : <b>2400 x 1200 px</b> (format 2:1, comme le tapis de 60 x 30 cm). Une autre taille est recadrée au centre.
      </p>
      <div className="matbg-preview" style={bg ? { backgroundImage: `url("${bg.url}")` } : null}>
        {bg && <div className="matbg-dim" style={{ opacity: dim / 100 }} />}
        <div className="matbg-grid">
          {[0, 1, 2].map((t) => (
            <div key={t} className="matbg-terr">
              <span>TERRITOIRE {["I", "II", "III"][t]}</span>
              <div className="matbg-slots"><i /><i /><i /></div>
              <div className="matbg-slots"><i /><i /><i /></div>
            </div>
          ))}
        </div>
        {!bg && <div className="matbg-none">Tapis d'origine</div>}
      </div>
      {bg && (
        <label className="matbg-range">
          <span className="small">Assombrir l'image : {dim} %</span>
          <input type="range" min={0} max={90} step={5} value={dim} onChange={(e) => setDim(+e.target.value)} onPointerUp={() => saveDim(dim)} onKeyUp={() => saveDim(dim)} onBlur={() => saveDim(dim)} />
        </label>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Envoi…" : bg ? "Changer l'image" : "Choisir une image"}</button>
        {bg && <button className="btn" disabled={busy} onClick={remove}>Retirer</button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>
      {msg && <p className="small muted" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
