// Salons de discussion par jeu : salons, non-lus (mémorisés sur l'appareil), statut d'administrateur
import { useEffect, useState } from "react";
import { pb } from "../pb.js";

const tcgCh = (tcg) => (tcg === "fab" ? 'tcg = "fab"' : '(tcg = "" || tcg = "safir")');
// mêmes conditions vues depuis un message (son salon)
export const postsOfTcg = (tcg) => (tcg === "fab" ? 'channel.tcg = "fab"' : '(channel.tcg = "" || channel.tcg = "safir")');

export const loadChannels = (tcg) => pb.collection("channels").getFullList({ filter: tcgCh(tcg), sort: "sort,created", requestKey: null });

// Dernier message vu par salon (date du message), sur cet appareil
const KEY = "table_salons_vus";
export function seenMap() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}
export function markSeen(channelId, created) {
  if (!channelId || !created) return;
  const m = seenMap();
  if (m[channelId] && m[channelId] >= created) return;
  m[channelId] = created;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch (_) {}
}

// Nombre de messages non lus par salon (les miens ne comptent pas). Un salon jamais ouvert : tous ses messages des 7 derniers jours.
export async function unreadCounts(channels, myId) {
  const seen = seenMap();
  const week = new Date(Date.now() - 7 * 86400000).toISOString().replace("T", " ");
  const out = {};
  await Promise.all(
    channels.map(async (c) => {
      const since = seen[c.id] || week;
      try {
        const r = await pb.collection("posts").getList(1, 1, {
          filter: `channel = "${c.id}" && created > "${since}" && author != "${myId}"`,
          fields: "id",
          requestKey: null,
        });
        out[c.id] = r.totalItems;
      } catch (_) {
        out[c.id] = 0;
      }
    }),
  );
  return out;
}

export function useIsAdmin(userId) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!userId) return;
    pb.collection("admins")
      .getList(1, 1, { filter: `user = "${userId}"`, requestKey: null })
      .then((r) => setAdmin(r.totalItems > 0))
      .catch(() => setAdmin(false));
  }, [userId]);
  return admin;
}

// Pour l'accueil : salons du jeu et non-lus, mis à jour en direct
export function useSalonsSummary(tcg, myId) {
  const [state, setState] = useState({ channels: [], unread: {} });
  useEffect(() => {
    let alive = true, un = null;
    const refresh = async () => {
      try {
        const channels = await loadChannels(tcg);
        const unread = await unreadCounts(channels, myId);
        if (alive) setState({ channels, unread });
      } catch (_) {}
    };
    refresh();
    pb.collection("posts")
      .subscribe("*", () => refresh(), { filter: postsOfTcg(tcg) })
      .then((u) => (alive ? (un = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      un?.();
    };
  }, [tcg, myId]);
  return state;
}
