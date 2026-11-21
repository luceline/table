import { useEffect, useState } from "react";
import { pushState, mySub, setOpenAlert } from "../lib/push.js";
import { me, errMsg } from "../pb.js";
import { tcgName } from "../lib/tcg.js";

// « Me prévenir quand une table ouverte de ce jeu est proposée » (par appareil, désactivé par défaut)
export default function OpenAlertToggle({ tcg }) {
  const [st, setSt] = useState(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await pushState();
      const rec = s === "on" ? await mySub() : null;
      if (!alive) return;
      setSt(s);
      setOn(!!rec && Array.isArray(rec.open_tcg) && rec.open_tcg.includes(tcg));
    })();
    return () => {
      alive = false;
    };
  }, [tcg]);
  if (!st || st === "unsupported" || st === "ios-install" || st === "denied") return null;
  async function toggle() {
    setErr("");
    setBusy(true);
    try {
      const next = await setOpenAlert(me().id, tcg, !on);
      setOn(next.includes(tcg));
      setSt("on");
    } catch (e) {
      const m = e?.message || errMsg(e);
      setErr(/failed|abort|not supported/i.test(m) && !/réglages/.test(m) ? "Ce navigateur n'a pas pu activer les notifications." : m);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-toggle open-alert">
      <span className="grow small">
        {on ? `🔔 Vous êtes prévenu des nouvelles tables ouvertes de ${tcgName(tcg)} (au plus une notification toutes les 30 minutes).` : `Être prévenu quand quelqu'un ouvre une table de ${tcgName(tcg)} ?`}
      </span>
      <button className={`btn sm ${on ? "ghost" : ""}`} onClick={toggle} disabled={busy}>{on ? "Ne plus prévenir" : "🔔 Me prévenir"}</button>
      {err && <div className="err small" style={{ width: "100%" }}>{err}</div>}
    </div>
  );
}
