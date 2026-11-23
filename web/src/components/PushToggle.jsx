import { useEffect, useState } from "react";
import { pushState, enablePush, disablePush } from "../lib/push.js";
import { me, errMsg } from "../pb.js";

// « Me prévenir quand quelqu'un rejoint ma table » : notification sur cet appareil, même appli fermée
export default function PushToggle({ compact, onText, offText, onChange }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    pushState().then(setSt);
  }, []);
  if (!st || st === "unsupported") return null;
  async function on() {
    setErr("");
    setBusy(true);
    try {
      await enablePush(me().id);
      setSt("on");
      onChange?.("on");
    } catch (e) {
      const m = e?.message || errMsg(e);
      setErr(/^[A-Z][a-z]+ failed|denied|abort|not supported/i.test(m) && !/réglages/.test(m) ? "Ce navigateur n'a pas pu activer les notifications. Essayez Chrome à jour (Android) ou l'appli ajoutée à l'écran d'accueil (iPhone)." : m);
      setSt(await pushState());
    } finally {
      setBusy(false);
    }
  }
  async function off() {
    setBusy(true);
    await disablePush().catch(() => {});
    setSt("off");
    setBusy(false);
    onChange?.("off");
  }
  return (
    <div className={`push-toggle ${compact ? "compact" : ""}`}>
      {compact && st === "on" && (
        <>
          <span className="small">🔔 Vous serez prévenu quand quelqu'un arrive.</span>
          <button className="btn sm ghost" onClick={off} disabled={busy}>Désactiver</button>
        </>
      )}
      {compact && st === "off" && <button className="btn sm" onClick={on} disabled={busy}>🔔 Me prévenir quand quelqu'un arrive</button>}
      {!compact && st === "on" && (
        <>
          <span className="grow small">🔔 {onText || "Vous serez prévenu sur cet appareil quand quelqu'un rejoint votre table."}</span>
          <button className="btn sm ghost" onClick={off} disabled={busy}>Désactiver</button>
        </>
      )}
      {!compact && st === "off" && (
        <>
          <span className="grow small muted">{offText || "Faites autre chose en attendant : une notification vous prévient quand quelqu'un s'assoit."}</span>
          <button className="btn sm" onClick={on} disabled={busy}>🔔 Me prévenir</button>
        </>
      )}
      {st === "denied" && <span className="small muted">🔕 Notifications bloquées pour ce site : autorisez-les dans les réglages du navigateur pour être prévenu.</span>}
      {st === "ios-install" && (
        <span className="small muted">
          🔔 Sur iPhone, pour être prévenu quand quelqu'un rejoint votre table : touchez Partager puis « Sur l'écran d'accueil », et ouvrez l'appli depuis cette icône.
        </span>
      )}
      {err && <div className="err small" style={{ width: "100%" }}>{err}</div>}
    </div>
  );
}
