// Présence à la table : signalée toutes les 45 secondes tant que la table est ouverte et visible,
// retirée en quittant la table. Les parties sans joueur présent ne s'affichent plus dans « En direct ».
import { pb } from "../pb.js";

export function beHere(gameId, userId) {
  let recId = null;
  let beat = 0;
  let stop = false;
  const ping = async () => {
    if (stop || document.visibilityState === "hidden") return;
    try {
      if (recId) return void (await pb.collection("here").update(recId, { beat: ++beat }, { requestKey: null }));
      try {
        recId = (await pb.collection("here").create({ game: gameId, user: userId, beat: 0 }, { requestKey: null })).id;
      } catch (_) {
        // déjà là (rechargement de la page) : on reprend sa ligne
        recId = (await pb.collection("here").getFirstListItem(`game="${gameId}" && user="${userId}"`, { requestKey: null })).id;
      }
    } catch (_) {
      recId = null; // ligne supprimée ou réseau coupé : nouvel essai au prochain battement
    }
  };
  ping();
  const t = setInterval(ping, 45000);
  const vis = () => document.visibilityState === "visible" && ping();
  document.addEventListener("visibilitychange", vis);
  return () => {
    stop = true;
    clearInterval(t);
    document.removeEventListener("visibilitychange", vis);
    if (recId) pb.collection("here").delete(recId, { requestKey: null }).catch(() => {});
  };
}
