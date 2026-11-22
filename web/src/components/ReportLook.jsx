// Signaler le tapis ou le dos de cartes d'un joueur : l'image est masquée tout de suite, l'admin vérifie
import { useState } from "react";
import { Sheet } from "./ui.jsx";
import { errMsg } from "../pb.js";
import { reportLook } from "../lib/looks.js";

export function ReportButton({ onClick, style, inline }) {
  return (
    <button className={`report-btn ${inline ? "inline" : ""}`} style={style} onClick={(e) => { e.stopPropagation(); onClick(); }} onPointerDown={(e) => e.stopPropagation()} title="Signaler son tapis ou son dos de cartes" aria-label="Signaler son tapis ou son dos de cartes">⚑</button>
  );
}

export default function ReportSheet({ open, onClose, me, target, name, look, game, onDone }) {
  const [kinds, setKinds] = useState({ bg: true, back: true });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const avail = [look?.bg && ["bg", "Son tapis"], look?.back && ["back", "Son dos de cartes"]].filter(Boolean);
  async function send() {
    const list = avail.map(([k]) => k).filter((k) => kinds[k]);
    if (!list.length) return;
    setBusy(true);
    setErr("");
    try {
      await reportLook({ reporter: me, target, kinds: list, reason, game });
      onDone(list);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Signaler l'apparence de ${name || "ce joueur"}`}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Image choquante ou déplacée ? Elle sera masquée tout de suite pour vous, ses adversaires et les spectateurs, puis vérifiée par l'administrateur.
      </p>
      {avail.map(([k, label]) => (
        <label key={k} className="init-toggle" style={{ marginBottom: 6 }}>
          <input type="checkbox" checked={!!kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
          <span>{label}</span>
        </label>
      ))}
      <div className="field">
        <label>Motif (facultatif)</label>
        <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : image violente" />
      </div>
      {err && <div className="err small">{err}</div>}
      <button className="btn primary" disabled={busy || !avail.some(([k]) => kinds[k])} onClick={send}>Signaler</button>
    </Sheet>
  );
}
