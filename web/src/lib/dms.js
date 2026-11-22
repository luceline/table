// Messages privés : conversations (une par joueur), non-lus, blocage
import { useEffect, useState } from "react";
import { pb, safeUn } from "../pb.js";

// Conversations récentes : [{ uid, name, last, unread }], la plus récente d'abord
export async function loadThreads(myId) {
  const r = await pb.collection("dms").getList(1, 400, { filter: `from = "${myId}" || to = "${myId}"`, sort: "-created", requestKey: null });
  const by = new Map();
  for (const m of r.items) {
    const mine = m.from === myId;
    const uid = mine ? m.to : m.from;
    const t = by.get(uid) || { uid, name: mine ? m.to_name : m.from_name, last: m.created, unread: 0 };
    if (!mine && !m.read) t.unread++;
    by.set(uid, t);
  }
  return [...by.values()];
}

export const loadConvo = (myId, uid) =>
  pb.collection("dms").getList(1, 100, { filter: `(from = "${myId}" && to = "${uid}") || (from = "${uid}" && to = "${myId}")`, sort: "-created", requestKey: null }).then((r) => r.items.reverse());

export async function markRead(list, myId) {
  for (const m of list) if (m.to === myId && !m.read) await pb.collection("dms").update(m.id, { read: true }, { requestKey: null }).catch(() => {});
}

export async function loadBlocks(myId) {
  const l = await pb.collection("blocks").getFullList({ filter: `user = "${myId}"`, requestKey: null }).catch(() => []);
  return new Map(l.map((b) => [b.blocked, b.id]));
}
export async function setBlocked(myId, uid, on, blocks) {
  if (on) await pb.collection("blocks").create({ user: myId, blocked: uid });
  else if (blocks.get(uid)) await pb.collection("blocks").delete(blocks.get(uid));
}

// Accueil : nombre de messages privés non lus, en direct
export function useDmUnread(myId) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!myId) return;
    let alive = true, un = null;
    const refresh = () => pb.collection("dms").getList(1, 1, { filter: `to = "${myId}" && read = false`, requestKey: null }).then((r) => alive && setN(r.totalItems)).catch(() => {});
    refresh();
    pb.collection("dms").subscribe("*", refresh, { requestKey: null }).then((u) => (alive ? (un = u) : safeUn(u))).catch(() => {});
    return () => { alive = false; safeUn(un); };
  }, [myId]);
  return n;
}
