// Tapis et dos de cartes personnels des joueurs d'une partie (vus par l'adversaire et les spectateurs),
// rechargés toutes les 25 secondes (une image signalée disparaît alors chez tout le monde).
import { useEffect, useState } from "react";
import { pb, fileUrl } from "../pb.js";

export function useLooks(gameId, enabled = true) {
  const [players, setPlayers] = useState({});
  const [hidden, setHidden] = useState({}); // signalé depuis cet appareil : masqué tout de suite
  useEffect(() => {
    if (!gameId || !enabled) return;
    let alive = true;
    const load = () => pb.send(`/api/table/looks?game=${gameId}`, { requestKey: null }).then((r) => alive && setPlayers(r.players || {})).catch(() => {});
    load();
    const t = setInterval(load, 25000);
    return () => { alive = false; clearInterval(t); };
  }, [gameId, enabled]);
  const look = (uid) => {
    const p = players[uid];
    if (!uid || !p) return { bg: null, back: null };
    return {
      bg: p.bg && !hidden[uid + ":bg"] ? { url: fileUrl("users", uid, p.bg), dim: p.dim ?? 35 } : null,
      back: p.back && !hidden[uid + ":back"] ? fileUrl("users", uid, p.back) : null,
    };
  };
  const hide = (uid, kind) => setHidden((h) => ({ ...h, [uid + ":" + kind]: true }));
  return { look, hide };
}

export async function reportLook({ reporter, target, kinds, reason, game, grp }) {
  for (const kind of kinds) {
    await pb.collection("reports").create({ reporter, target, kind, reason: (reason || "").trim().slice(0, 300), game: game || "", grp: grp || "", status: "open" }, { requestKey: null });
  }
}
