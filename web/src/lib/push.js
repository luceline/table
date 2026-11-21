// Notifications « quelqu'un a rejoint votre table » (Web Push), activées par appareil
import { pb } from "../pb.js";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// État pour cet appareil : on | off | denied | ios-install (iPhone : ajouter à l'écran d'accueil) | unsupported
export async function pushState() {
  if (!supported()) return isIOS() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch (_) {
    return "off";
  }
}

const b64 = (s) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function enablePush(userId) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications refusées : autorisez-les pour ce site dans les réglages du navigateur." : "Notifications non autorisées.");
  const { key } = await pb.send("/api/table/push-key", { requestKey: null });
  if (!key) throw new Error("Les notifications ne sont pas encore prêtes sur le serveur.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  const j = sub.toJSON();
  const old = await pb.collection("push_subs").getFirstListItem(`endpoint="${j.endpoint.replace(/"/g, "")}"`).catch(() => null);
  const data = { user: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
  if (old) await pb.collection("push_subs").update(old.id, data);
  else await pb.collection("push_subs").create(data);
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  const old = await pb.collection("push_subs").getFirstListItem(`endpoint="${sub.endpoint.replace(/"/g, "")}"`).catch(() => null);
  if (old) await pb.collection("push_subs").delete(old.id).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Abonnement de cet appareil (enregistrement push_subs), ou null
export async function mySub() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return null;
    return await pb.collection("push_subs").getFirstListItem(`endpoint="${sub.endpoint.replace(/"/g, "")}"`);
  } catch (_) {
    return null;
  }
}

// Annonce des nouvelles tables ouvertes d'un jeu, sur cet appareil (active les notifications si besoin)
export async function setOpenAlert(userId, tcg, on) {
  let rec = await mySub();
  if (!rec && on) {
    await enablePush(userId);
    rec = await mySub();
  }
  if (!rec) return [];
  const cur = Array.isArray(rec.open_tcg) ? rec.open_tcg : [];
  const next = on ? [...new Set([...cur, tcg])] : cur.filter((t) => t !== tcg);
  await pb.collection("push_subs").update(rec.id, { open_tcg: next });
  return next;
}
