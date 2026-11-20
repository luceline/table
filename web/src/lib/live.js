// Parties en direct du jeu choisi (hook pb_hooks/live.pb.js), rafraîchies toutes les 30 s quand l'appli est visible
import { useEffect, useState } from "react";
import { pb } from "../pb.js";

export function useLive(tcg) {
  const [games, setGames] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      pb.send("/api/table/live", { query: { tcg }, requestKey: null })
        .then((j) => alive && setGames(j.games || []))
        .catch(() => alive && setGames((g) => g || []));
    };
    setGames(null);
    load();
    const t = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [tcg]);
  return games;
}

// « à l'instant », « il y a 3 min », « il y a 1 h »
export function ago(pbDateStr) {
  const t = new Date((pbDateStr || "").replace(" ", "T")).getTime();
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (!t || m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
}
