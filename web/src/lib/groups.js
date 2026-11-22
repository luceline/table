// Groupes privés (conversations à plusieurs) : liste, messages, lu / non-lu, sourdine, actions
import { pb } from "../pb.js";

export const GROUP_MAX = 10;
export const gkey = (id) => "g:" + id;
export const isGroupKey = (k) => typeof k === "string" && k.startsWith("g:");
export const groupId = (k) => (isGroupKey(k) ? k.slice(2) : "");

export function groupTitle(g, myId) {
  if (g.name) return g.name;
  const names = g.names || {};
  const others = (g.members || []).filter((u) => u !== myId).map((u) => names[u] || "Joueur");
  return others.length > 3 ? `${others.slice(0, 3).join(", ")} +${others.length - 3}` : others.join(", ") || "Groupe";
}

export const loadGroups = () => pb.collection("dm_groups").getFullList({ sort: "-last", requestKey: null }).catch(() => []);

// Dernier message lu et sourdine, par groupe : Map(groupId -> { id, at, muted })
export async function loadReads(myId) {
  const l = await pb.collection("gm_reads").getFullList({ filter: `user = "${myId}"`, requestKey: null }).catch(() => []);
  return new Map(l.map((r) => [r.group, r]));
}

export async function groupUnread(groups, reads, myId) {
  const out = {};
  await Promise.all(groups.map(async (g) => {
    const at = reads.get(g.id)?.at || "";
    try {
      const r = await pb.collection("gmsgs").getList(1, 1, {
        filter: `group = "${g.id}" && from != "${myId}"${at ? ` && created > "${at}"` : ""}`, fields: "id", requestKey: null,
      });
      out[g.id] = r.totalItems;
    } catch (_) {
      out[g.id] = 0;
    }
  }));
  return out;
}

export const loadGroupMsgs = (gid) =>
  pb.collection("gmsgs").getList(1, 100, { filter: `group = "${gid}"`, sort: "-created", requestKey: null }).then((r) => r.items.reverse());

// Marque le groupe lu jusqu'au message « at » ; renvoie l'enregistrement (créé au besoin)
export async function markGroupRead(gid, myId, at, reads) {
  const cur = reads.get(gid);
  try {
    if (cur) {
      if (cur.at && cur.at >= at) return cur;
      return await pb.collection("gm_reads").update(cur.id, { at }, { requestKey: null });
    }
    return await pb.collection("gm_reads").create({ group: gid, user: myId, at, muted: false }, { requestKey: null });
  } catch (_) {
    return cur || null;
  }
}

export async function setGroupMuted(gid, myId, muted, reads) {
  const cur = reads.get(gid);
  if (cur) return pb.collection("gm_reads").update(cur.id, { muted }, { requestKey: null });
  return pb.collection("gm_reads").create({ group: gid, user: myId, at: "", muted }, { requestKey: null });
}

export const groupAction = (body) => pb.send("/api/table/groups", { method: "POST", body, requestKey: null });

export const searchPlayers = (q) =>
  q.trim().length < 2 ? Promise.resolve([]) : pb.send(`/api/table/players?q=${encodeURIComponent(q.trim())}`, { requestKey: null }).then((r) => r.players || []).catch(() => []);
