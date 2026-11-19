import { useState } from "react";
import { pb, errMsg } from "../pb.js";
import TutoVideo from "../components/TutoVideo.jsx";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "register") {
        await pb.collection("users").create({
          email: email.trim(),
          password,
          passwordConfirm: password,
          name: name.trim() || email.split("@")[0],
        });
      }
      await pb.collection("users").authWithPassword(email.trim(), password);
    } catch (e2) {
      setErr(mode === "login" ? "E-mail ou mot de passe incorrect." : errMsg(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="brand">Table de jeu</div>
      <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
        Scannez vos cartes, construisez votre deck, jouez à deux.
      </p>
      <div className="tabs">
        <button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Connexion</button>
        <button className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>Créer un compte</button>
      </div>
      <form onSubmit={submit}>
        {mode === "register" && (
          <div className="field">
            <label>Pseudo affiché en partie</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
          </div>
        )}
        <div className="field">
          <label>E-mail</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label>Mot de passe {mode === "register" && <span>(8 caractères minimum)</span>}</label>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>
      </form>
      <div style={{ marginTop: 22 }}><TutoVideo /></div>
      <InstallHelp />
    </div>
  );
}

// Rappel : installer l'appli sur l'écran d'accueil (masqué si elle est déjà installée)
function InstallHelp() {
  const [copied, setCopied] = useState(false);
  const ua = navigator.userAgent || "";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return null;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const iosNotSafari = ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const url = window.location.origin;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (_) {}
  };
  return (
    <div className="install card-box">
      <h2>Installer l'appli sur son téléphone</h2>
      {iosNotSafari && (
        <div className="install-warn">
          <span>Sur iPhone, l'installation ne fonctionne qu'avec <b>Safari</b>. Copiez le lien, puis collez-le dans Safari.</span>
          <button className="btn sm" onClick={copy}>{copied ? "Lien copié ✓" : `Copier ${url.replace(/^https?:\/\//, "")}`}</button>
        </div>
      )}
      <div className={`install-os ${android ? "here" : ""}`}>
        <b>Android</b> (Chrome)
        <ol>
          <li>Touchez les 3 points <b>⋮</b> en haut à droite.</li>
          <li>Choisissez <b>Ajouter à l'écran d'accueil</b> (ou <b>Installer l'application</b>).</li>
        </ol>
      </div>
      <div className={`install-os ${ios ? "here" : ""}`}>
        <b>iPhone</b> (uniquement avec <b>Safari</b>, pas Chrome)
        <ol>
          <li>Ouvrez la page dans Safari.</li>
          <li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li>
          <li>Choisissez <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</li>
        </ol>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        L'appli s'ouvre ensuite en plein écran depuis son icône. Reconnectez-vous une fois depuis l'icône.
      </p>
    </div>
  );
}
