import { useEffect, useState } from "react";
import { pushState, mySub, setOpenAlert, enablePush } from "../lib/push.js";
import { pb, me, errMsg } from "../pb.js";
import { tcgName } from "../lib/tcg.js";

// « Je cherche un partenaire » : alerte quand un joueur ouvre une table de ce jeu.
// Avec au moins un deck de ce jeu : prévenu par défaut (dès que les notifications sont activées), on peut couper.
// Sans deck : abonnement de cet appareil à la demande (comme avant).
const offList = () => (Array.isArray(me()?.partner_off) ? me().partner_off : []);

export default function OpenAlertToggle({ tcg, hasDeck, onlyWhenOn }) {
  const [st, setSt] = useState(null);
  const [devOn, setDevOn] = useState(false);
  const [off, setOff] = useState(() => offList().includes(tcg));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    setOff(offList().includes(tcg));
    (async () => {
      const s = await pushState();
      const rec = s === "on" ? await mySub() : null;
      if (!alive) return;
      setSt(s);
      setDevOn(!!rec && Array.isArray(rec.open_tcg) && rec.open_tcg.includes(tcg));
    })();
    return () => {
      alive = false;
    };
  }, [tcg]);
  if (!st || st === "unsupported") return null;
  // bloquées ou iPhone hors écran d'accueil : PushToggle explique déjà quoi faire
  if (st === "denied" || st === "ios-install") return null;
  if (onlyWhenOn && st !== "on") return null;
  const on = st === "on" && !off && (hasDeck || devOn);

  async function setPartnerOff(v) {
    const cur = offList();
    const next = v ? [...new Set([...cur, tcg])] : cur.filter((t) => t !== tcg);
    if (next.length !== cur.length || next.some((t, i) => t !== cur[i])) await pb.collection("users").update(me().id, { partner_off: next });
    setOff(v);
  }

  async function toggle() {
    setErr("");
    setBusy(true);
    try {
      if (on) {
        await setPartnerOff(true);
        if (devOn) setDevOn((await setOpenAlert(me().id, tcg, false)).includes(tcg));
      } else {
        if (st !== "on") await enablePush(me().id);
        setSt("on");
        await setPartnerOff(false);
        if (!hasDeck) setDevOn((await setOpenAlert(me().id, tcg, true)).includes(tcg));
      }
    } catch (e) {
      const m = e?.message || errMsg(e);
      setErr(/failed|abort|not supported/i.test(m) && !/réglages/.test(m) ? "Ce navigateur n'a pas pu activer les notifications." : m);
      setSt(await pushState());
    } finally {
      setBusy(false);
    }
  }

  let text;
  if (on) text = `🔔 Prévenu quand un joueur cherche un partenaire de ${tcgName(tcg)} (au plus une notification toutes les 30 minutes${hasDeck ? ", pas la nuit" : ""}).`;
  else if (st !== "on") text = hasDeck ? `Activez les notifications pour être prévenu quand un joueur cherche un partenaire de ${tcgName(tcg)}.` : `Être prévenu quand un joueur cherche un partenaire de ${tcgName(tcg)} ?`;
  else text = `🔕 Alertes « partenaire recherché » de ${tcgName(tcg)} coupées.`;
  return (
    <div className="push-toggle open-alert">
      <span className="grow small">{text}</span>
      <button className={`btn sm ${on ? "ghost" : ""}`} onClick={toggle} disabled={busy}>{on ? "Ne plus prévenir" : st !== "on" ? "🔔 Activer" : "🔔 Me prévenir"}</button>
      {err && <div className="err small" style={{ width: "100%" }}>{err}</div>}
    </div>
  );
}
