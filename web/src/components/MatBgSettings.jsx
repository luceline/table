import { useRef, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { THEMES, applyTheme, storedTheme } from "../lib/theme.js";

// Image idéale : 2400 x 1200 px, au format 2:1 du tapis (60 x 30 cm). Toute image est recadrée au centre
// à ce format puis réduite à 2400 px de large au plus (JPEG), pour rester légère à charger.
export const MAT_BG_W = 2400;
export const MAT_BG_H = 1200;
export const DEFAULT_DIM = 35;

export function matBgOf(user) {
  if (!user?.mat_bg) return null;
  return { url: fileUrl("users", user.id, user.mat_bg), dim: user.mat_dim ?? DEFAULT_DIM }; // enregistré avec l'image
}

// Recadre au centre au rapport largeur/hauteur voulu, réduit à maxW de large au plus, en JPEG
async function toRatioImage(file, ratio, maxW) {
  const img = await new Promise((ok, ko) => {
    const u = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error("Image illisible"));
    i.src = u;
  });
  const sw = img.naturalWidth, sh = img.naturalHeight;
  let cw = sw, ch = sw / ratio;
  if (ch > sh) { ch = sh; cw = sh * ratio; }
  const cx = (sw - cw) / 2, cy = (sh - ch) / 2;
  const ow = Math.min(maxW, Math.round(cw)), oh = Math.round(ow / ratio);
  const cv = document.createElement("canvas");
  cv.width = ow;
  cv.height = oh;
  const g = cv.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, cx, cy, cw, ch, 0, 0, ow, oh);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.86));
  return { blob, w: ow, h: oh, small: cw < maxW / 2 };
}
const toMatImage = (file) => toRatioImage(file, 2, MAT_BG_W);

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
        Une image de votre choix sous votre tapis, vue aussi par vos adversaires et les spectateurs ; les emplacements et les territoires restent au premier plan.
        {user?.bg_blocked && <span className="warn"> Votre tapis a été signalé : il est masqué pour les autres joueurs jusqu'à la vérification de l'administrateur.</span>}
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

// ---------- Dos des cartes ----------
// Image idéale : 630 x 880 px, au format d'une carte (63 x 88 mm). Recadrée au centre, JPEG.
export const BACK_W = 630;
export const BACK_H = 880;

export function cardBackOf(user) {
  return user?.card_back ? fileUrl("users", user.id, user.card_back) : null;
}

export function CardBackSettings() {
  const [user, setUser] = useState(me());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef();
  const url = cardBackOf(user);

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      const { blob, w, h, small } = await toRatioImage(f, BACK_W / BACK_H, BACK_W);
      const fd = new FormData();
      fd.append("card_back", new File([blob], "dos.jpg", { type: "image/jpeg" }));
      const rec = await pb.collection("users").update(user.id, fd);
      setUser(rec);
      setMsg(small ? `Image enregistrée (${w} x ${h} px). Elle est petite : elle risque d'être floue en grand.` : `Image enregistrée (${w} x ${h} px).`);
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const rec = await pb.collection("users").update(user.id, { card_back: null });
      setUser(rec);
      setMsg("Dos d'origine rétabli.");
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-box">
      <h2>Dos des cartes</h2>
      <div className="row" style={{ alignItems: "flex-start", gap: 14, flexWrap: "nowrap" }}>
        <div className="back-preview">
          <div className="back" style={url ? { background: `url("${url}") center / cover` } : null} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Une image pour le dos de vos cartes (deck, cartes face cachée, main), vue aussi par vos adversaires et les spectateurs.
            {user?.back_blocked && <span className="warn"> Votre dos de cartes a été signalé : il est masqué pour les autres joueurs jusqu'à la vérification de l'administrateur.</span>}
            Image idéale : <b>630 x 880 px</b> (format d'une carte, 63 x 88 mm). Une autre taille est recadrée au centre.
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Envoi…" : url ? "Changer l'image" : "Choisir une image"}</button>
            {url && <button className="btn" disabled={busy} onClick={remove}>Retirer</button>}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
          </div>
          {msg && <p className="small muted" style={{ marginBottom: 0 }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- Thème de l'appli ----------
export function ThemeSettings() {
  const [cur, setCur] = useState(storedTheme());
  async function pick(id) {
    setCur(applyTheme(id, true));
    const u = me();
    if (u) pb.collection("users").update(u.id, { theme: id }).catch(() => {});
  }
  return (
    <div className="card-box">
      <h2>Thème de l'appli</h2>
      <p className="muted small" style={{ marginTop: 0 }}>L'apparence de l'appli, pour vous seul. Vos adversaires gardent la leur.</p>
      <div className="theme-pick">
        {THEMES.map((t) => (
          <button key={t.id} className={cur === t.id ? "on" : ""} onClick={() => pick(t.id)} aria-pressed={cur === t.id}>
            <span className={`sw ${t.id}`}><i /><i /></span>
            <span className="nm">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
