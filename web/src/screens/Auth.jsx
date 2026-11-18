import { useState } from "react";
import { pb, errMsg } from "../pb.js";

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
    </div>
  );
}
