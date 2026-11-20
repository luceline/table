// Nombre de joueurs inscrits (et par jeu), servi par le hook pb_hooks/stats.pb.js
import { useEffect, useState } from "react";
import { PB_URL } from "../pb.js";

let cache = null;
export function useStats() {
  const [s, setS] = useState(cache);
  useEffect(() => {
    let alive = true;
    fetch(`${PB_URL}/api/table/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && alive) { cache = j; setS(j); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return s;
}

export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
