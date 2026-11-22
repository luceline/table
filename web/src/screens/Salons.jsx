import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg, fileUrl } from "../pb.js";
import ZoomView from "../components/ZoomView.jsx";
import { loadThreads, loadConvo, markRead, loadBlocks, setBlocked } from "../lib/dms.js";
import { reportLook } from "../lib/looks.js";
import { Sheet } from "../components/ui.jsx";
import { currentTcg, tcgName } from "../lib/tcg.js";
import { loadChannels, unreadCounts, markSeen, useIsAdmin, postsOfTcg } from "../lib/salons.js";
import { GROUP_MAX, gkey, isGroupKey, groupId, groupTitle, loadGroups, loadReads, groupUnread, loadGroupMsgs, markGroupRead, setGroupMuted, groupAction, searchPlayers } from "../lib/groups.js";
import { useVoice, useVoiceRooms } from "../lib/voicechan.js";
import { VoiceBar, VoiceStage } from "../components/VoiceRoom.jsx";

const PAGE = 60;
// Réactions aux messages (mêmes émojis que la règle du serveur)
export const POST_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🤔"];

// Image jointe : réduite dans le navigateur (1600 px au plus, JPEG), les GIF restent tels quels (animés)
async function shrinkImage(file) {
  if (file.type === "image/gif") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    return new File([blob], (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
const hhmm = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function when(s) {
  const d = new Date((s || "").replace(" ", "T"));
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hhmm(d);
  const y = new Date(today.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `hier ${hhmm(d)}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${hhmm(d)}`;
}

// Salons de discussion du jeu choisi, comme sur Discord : salons à gauche (ou en haut sur téléphone), messages en direct
export default function Salons({ go, channelId, dm: dmStart, voice: voiceStart }) {
  const user = me();
  const tcg = currentTcg();
  const admin = useIsAdmin(user.id);
  const [channels, setChannels] = useState(null);
  const [cur, setCur] = useState(channelId || "");
  const [posts, setPosts] = useState([]);
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState({});
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null); // salon créé ou modifié par l'admin : { id?, name, topic }
  const [pic, setPic] = useState(null); // image à envoyer : { file, url }
  const [spoil, setSpoil] = useState(false); // message marqué « spoiler »
  const [shown, setShown] = useState(() => new Set()); // spoilers dévoilés
  const [big, setBig] = useState(null); // image ouverte en grand
  const [reacts, setReacts] = useState({}); // postId -> [{ id, user, emoji }]
  const [picker, setPicker] = useState(null); // message dont on choisit la réaction
  const fileRef = useRef();
  // Messages privés
  const [threads, setThreads] = useState([]);
  const [dm, setDm] = useState(dmStart ?? null); // joueur de la conversation privée ouverte (sinon : salon)
  const [dmName, setDmName] = useState("");
  const [dmMsgs, setDmMsgs] = useState([]);
  const [blocks, setBlocks] = useState(new Map());
  const [nameMenu, setNameMenu] = useState(null); // { uid, name, x, y, grp? } : clic sur un pseudo
  // Groupes privés (dm = "g:<id>" quand un groupe est ouvert)
  const [groups, setGroups] = useState([]);
  const [reads, setReads] = useState(new Map());
  const [gunread, setGunread] = useState({});
  const [gMsgs, setGMsgs] = useState([]);
  const [grpSheet, setGrpSheet] = useState(false); // fiche du groupe ouvert (membres, nom, sourdine, quitter)
  const [grpName, setGrpName] = useState("");
  const [invite, setInvite] = useState(null); // { gid?, base: [{ id, name }], picked: Map, q, found: [] }
  const [showBlocked, setShowBlocked] = useState(() => new Set());
  const readsRef = useRef(reads);
  readsRef.current = reads;
  // Salons vocaux
  const voice = useVoice();
  const { rooms: vrooms, byRoom } = useVoiceRooms(tcg);
  const [vview, setVview] = useState(voiceStart || null); // salon vocal affiché dans la zone principale
  const grp = isGroupKey(dm) ? groups.find((g) => g.id === groupId(dm)) : null;
  const dmRef = useRef(dm);
  dmRef.current = dm;
  const curRef = useRef(cur);
  curRef.current = cur;
  const listRef = useRef();
  const atBottom = useRef(true);
  const lastSend = useRef(0);

  async function reloadChannels(keep) {
    const list = await loadChannels(tcg).catch(() => []);
    setChannels(list);
    if (!list.some((c) => c.id === (keep ?? curRef.current))) setCur(list[0]?.id || "");
    setUnread(await unreadCounts(list, user.id));
    return list;
  }
  useEffect(() => {
    reloadChannels();
  }, [tcg]);

  // Messages du salon ouvert (les plus récents), puis en direct
  useEffect(() => {
    if (!cur) return;
    let alive = true;
    setPosts([]);
    setErr("");
    pb.collection("posts")
      .getList(1, PAGE, { filter: `channel = "${cur}"`, sort: "-created", requestKey: null })
      .then((r) => {
        if (!alive) return;
        const list = r.items.reverse();
        setPosts(list);
        setMore(r.totalPages > 1);
        atBottom.current = true;
        if (list.length) markSeen(cur, list[list.length - 1].created);
        setUnread((u) => ({ ...u, [cur]: 0 }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cur]);

  useEffect(() => {
    let un = null, alive = true;
    pb.collection("posts")
      .subscribe(
        "*",
        (e) => {
          const p = e.record;
          if (e.action === "delete") return setPosts((l) => l.filter((x) => x.id !== p.id));
          if (e.action !== "create") return;
          if (p.channel === curRef.current) {
            setPosts((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
            if (document.visibilityState === "visible") markSeen(p.channel, p.created);
          } else if (p.author !== user.id) {
            setUnread((u) => ({ ...u, [p.channel]: (u[p.channel] || 0) + 1 }));
          }
        },
        { filter: postsOfTcg(tcg) },
      )
      .then((u) => (alive ? (un = u) : Promise.resolve(u()).catch(() => {})))
      .catch(() => {});
    pb.collection("channels")
      .subscribe("*", () => reloadChannels(), {})
      .catch(() => {});
    return () => {
      alive = false;
      Promise.resolve(un?.()).catch(() => {});
      pb.collection("channels").unsubscribe("*").catch(() => {});
    };
  }, [tcg]);

  // Conversations privées : liste, conversation ouverte, direct
  const refreshThreads = () => loadThreads(user.id).then((l) => {
    setThreads(l);
    return l;
  }).catch(() => []);
  const refreshGroups = async () => {
    const [gl, rd] = await Promise.all([loadGroups(), loadReads(user.id)]);
    setGroups(gl);
    setReads(rd);
    setGunread(await groupUnread(gl, rd, user.id));
    return gl;
  };
  // arrivée par « Messages privés » sans conversation précise : la plus récente (à deux ou en groupe)
  useEffect(() => {
    if (dmStart !== "") return;
    Promise.all([refreshThreads(), refreshGroups()]).then(([tl, gl]) => {
      if (dmRef.current !== "") return;
      const all = [...tl.map((t) => ({ key: t.uid, last: t.last, unread: t.unread })), ...gl.map((g) => ({ key: gkey(g.id), last: g.last, unread: 0 }))];
      all.sort((a, b) => (b.unread > 0) - (a.unread > 0) || (b.last || "").localeCompare(a.last || ""));
      setDm(all[0]?.key || null);
    });
  }, []);
  useEffect(() => {
    refreshThreads();
    loadBlocks(user.id).then(setBlocks);
    let un = null, alive = true;
    pb.collection("dms")
      .subscribe("*", (e) => {
        const m = e.record;
        const other = m.from === user.id ? m.to : m.from;
        if (other === dmRef.current) {
          if (e.action === "delete") setDmMsgs((l) => l.filter((x) => x.id !== m.id));
          else if (e.action === "create") {
            setDmMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
            if (m.to === user.id && document.visibilityState === "visible") markRead([m], user.id);
          }
        }
        refreshThreads();
      }, { requestKey: null })
      .then((u) => (alive ? (un = u) : Promise.resolve(u()).catch(() => {})))
      .catch(() => {});
    return () => { alive = false; Promise.resolve(un?.()).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!dm || isGroupKey(dm)) return;
    let alive = true;
    setDmMsgs([]);
    atBottom.current = true;
    loadConvo(user.id, dm).then(async (l) => {
      if (!alive) return;
      setDmMsgs(l);
      await markRead(l, user.id);
      refreshThreads();
    }).catch(() => {});
    const t = threads.find((x) => x.uid === dm);
    setVview(null);
    if (t) setDmName(t.name);
    else if (!dmName) pb.collection("dms").getFirstListItem(`from = "${dm}" || to = "${dm}"`, { requestKey: null }).then((m) => setDmName(m.from === dm ? m.from_name : m.to_name)).catch(() => {});
    return () => { alive = false; };
  }, [dm]);
  function openDm(uid, name) {
    setNameMenu(null);
    setVview(null);
    if (name) setDmName(name);
    setDm(uid);
  }

  // Groupes : liste, non-lus, groupe ouvert, direct
  useEffect(() => {
    refreshGroups();
    let un1 = null, un2 = null, alive = true, t = null;
    pb.collection("gmsgs")
      .subscribe("*", (e) => {
        const m = e.record;
        if (gkey(m.group) === dmRef.current) {
          if (e.action === "delete") setGMsgs((l) => l.filter((x) => x.id !== m.id));
          else if (e.action === "create") {
            setGMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
            if (document.visibilityState === "visible") markGroupRead(m.group, user.id, m.created, readsRef.current).then((r) => r && setReads((rd) => new Map(rd).set(m.group, r)));
          }
        }
        clearTimeout(t);
        t = setTimeout(refreshGroups, 300);
      }, { requestKey: null })
      .then((u) => (alive ? (un1 = u) : Promise.resolve(u()).catch(() => {})))
      .catch(() => {});
    pb.collection("dm_groups")
      .subscribe("*", () => { clearTimeout(t); t = setTimeout(refreshGroups, 300); }, { requestKey: null })
      .then((u) => (alive ? (un2 = u) : Promise.resolve(u()).catch(() => {})))
      .catch(() => {});
    return () => { alive = false; clearTimeout(t); Promise.resolve(un1?.()).catch(() => {}); Promise.resolve(un2?.()).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!isGroupKey(dm)) return;
    const gid = groupId(dm);
    let alive = true;
    setGMsgs([]);
    setVview(null);
    atBottom.current = true;
    loadGroupMsgs(gid).then(async (l) => {
      if (!alive) return;
      setGMsgs(l);
      if (l.length) {
        const r = await markGroupRead(gid, user.id, l[l.length - 1].created, readsRef.current);
        if (r) setReads((rd) => new Map(rd).set(gid, r));
        setGunread((u) => ({ ...u, [gid]: 0 }));
      }
    }).catch((e) => setErr(errMsg(e)));
    return () => { alive = false; };
  }, [dm]);
  async function runGroup(body, then) {
    setErr("");
    try {
      const r = await groupAction(body);
      await refreshGroups();
      then?.(r);
      return r;
    } catch (e) {
      setErr(errMsg(e));
      return null;
    }
  }
  async function leaveGroup() {
    if (!grp || !window.confirm("Quitter ce groupe ? Vous ne verrez plus ses messages.")) return;
    setGrpSheet(false);
    await runGroup({ action: "remove", id: grp.id, uid: user.id }, () => setDm(null));
  }
  async function removeFromGroup(uid, name) {
    if (!grp || !window.confirm(`Retirer ${name} du groupe ?`)) return;
    await runGroup({ action: "remove", id: grp.id, uid });
  }
  async function toggleGroupMute() {
    if (!grp) return;
    try {
      await setGroupMuted(grp.id, user.id, !reads.get(grp.id)?.muted, reads);
      setReads(await loadReads(user.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function reportInGroup(uid, name) {
    setNameMenu(null);
    if (!grp || !window.confirm(`Signaler ${name} à l'administrateur ? Il pourra lire les derniers messages de ce groupe.`)) return;
    try {
      await reportLook({ reporter: user.id, target: uid, kinds: ["grp"], reason: "", grp: grp.id });
      window.alert("Merci : l'administrateur a été prévenu.");
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  // Fenêtre d'invitation : nouveau groupe (depuis une conversation à deux, ou vide) ou ajout à un groupe
  function openInvite({ gid, base = [] }) {
    setNameMenu(null);
    setGrpSheet(false);
    setInvite({ gid, base, picked: new Map(), q: "", found: [] });
  }
  useEffect(() => {
    if (!invite) return;
    const q = invite.q;
    const t = setTimeout(() => searchPlayers(q).then((found) => setInvite((v) => (v && v.q === q ? { ...v, found } : v))), 300);
    return () => clearTimeout(t);
  }, [invite?.q]);
  async function confirmInvite() {
    const ids = [...invite.picked.keys()];
    if (!ids.length) return;
    if (invite.gid) {
      await runGroup({ action: "add", id: invite.gid, uids: ids }, () => setInvite(null));
    } else {
      await runGroup({ action: "create", members: [...invite.base.map((b) => b.id), ...ids], name: "" }, (r) => {
        setInvite(null);
        if (r?.id) setDm(gkey(r.id));
      });
    }
  }
  async function toggleBlock(uid, name) {
    setNameMenu(null);
    const on = !blocks.has(uid);
    if (on && !window.confirm(`Bloquer ${name || "ce joueur"} ? Il ne pourra plus vous envoyer de messages privés.`)) return;
    try {
      await setBlocked(user.id, uid, on, blocks);
      setBlocks(await loadBlocks(user.id));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function reportDm() {
    if (!window.confirm(`Signaler la conversation avec ${dmName || "ce joueur"} à l'administrateur ? Il pourra lire vos derniers messages échangés.`)) return;
    try {
      await reportLook({ reporter: user.id, target: dm, kinds: ["dm"], reason: "" });
      setErr("");
      window.alert("Merci : l'administrateur a été prévenu.");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  // Réactions des messages affichés, puis en direct
  const postIds = posts.map((p) => p.id).join(",");
  useEffect(() => {
    if (!posts.length) return;
    const ids = posts.map((p) => p.id);
    const missing = ids.filter((id) => !(id in reacts));
    if (!missing.length) return;
    pb.collection("post_reacts")
      .getFullList({ filter: missing.map((id) => `post="${id}"`).join(" || "), requestKey: null })
      .then((list) => setReacts((r) => {
        const n = { ...r };
        for (const id of missing) n[id] = [];
        for (const x of list) n[x.post] = [...n[x.post], x];
        return n;
      }))
      .catch(() => {});
  }, [postIds]);
  useEffect(() => {
    if (!cur) return;
    let un = null, alive = true;
    pb.collection("post_reacts")
      .subscribe("*", (e) => {
        const x = e.record;
        setReacts((r) => {
          if (!(x.post in r)) return r;
          const l = r[x.post].filter((y) => y.id !== x.id);
          return { ...r, [x.post]: e.action === "delete" ? l : [...l, x] };
        });
      }, { filter: `post.channel = "${cur}"` })
      .then((u) => (alive ? (un = u) : Promise.resolve(u()).catch(() => {})))
      .catch(() => {});
    return () => { alive = false; Promise.resolve(un?.()).catch(() => {}); };
  }, [cur]);
  async function toggleReact(p, emoji) {
    setPicker(null);
    const mineR = (reacts[p.id] || []).find((x) => x.user === user.id && x.emoji === emoji);
    try {
      if (mineR) {
        setReacts((r) => ({ ...r, [p.id]: r[p.id].filter((x) => x.id !== mineR.id) }));
        await pb.collection("post_reacts").delete(mineR.id);
      } else {
        const x = await pb.collection("post_reacts").create({ post: p.id, user: user.id, emoji });
        setReacts((r) => ({ ...r, [p.id]: [...(r[p.id] || []).filter((y) => y.id !== x.id), x] }));
      }
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  // Défilement : rester en bas si on y était
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [posts, dmMsgs, gMsgs, dm]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  async function older() {
    if (!posts.length) return;
    const el = listRef.current;
    const h = el?.scrollHeight || 0;
    const r = await pb.collection("posts").getList(1, PAGE, { filter: `channel = "${cur}" && created < "${posts[0].created}"`, sort: "-created", requestKey: null }).catch(() => null);
    if (!r) return;
    atBottom.current = false;
    setPosts((l) => [...r.items.reverse(), ...l]);
    setMore(r.totalPages > 1);
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - h));
  }

  async function send(e) {
    e?.preventDefault();
    const t = text.trim().slice(0, 1000);
    if (isGroupKey(dm)) {
      if (!t) return;
      if (Date.now() - lastSend.current < 1500) return setErr("Doucement : un message toutes les deux secondes au plus.");
      lastSend.current = Date.now();
      setErr("");
      try {
        const m = await pb.collection("gmsgs").create({ group: groupId(dm), from: user.id, text: t, sys: false });
        setText("");
        atBottom.current = true;
        setGMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
        markGroupRead(m.group, user.id, m.created, readsRef.current).then((r) => r && setReads((rd) => new Map(rd).set(m.group, r)));
      } catch (e2) {
        setErr(errMsg(e2));
      }
      return;
    }
    if (dm) {
      if (!t) return;
      if (Date.now() - lastSend.current < 1500) return setErr("Doucement : un message toutes les deux secondes au plus.");
      lastSend.current = Date.now();
      setErr("");
      try {
        const m = await pb.collection("dms").create({ from: user.id, to: dm, text: t, read: false });
        setText("");
        atBottom.current = true;
        setDmMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
        refreshThreads();
      } catch (e2) {
        setErr(errMsg(e2));
      }
      return;
    }
    if ((!t && !pic) || !cur) return;
    if (Date.now() - lastSend.current < 1500) return setErr("Doucement : un message toutes les deux secondes au plus.");
    lastSend.current = Date.now();
    setErr("");
    try {
      const fd = new FormData();
      fd.append("channel", cur);
      fd.append("author", user.id);
      fd.append("name", (user.name || "Joueur").slice(0, 40));
      fd.append("text", t);
      fd.append("spoiler", spoil ? "true" : "false");
      if (pic) fd.append("image", pic.file);
      const p = await pb.collection("posts").create(fd);
      setText("");
      clearPic();
      setSpoil(false);
      atBottom.current = true;
      setPosts((l) => (l.some((x) => x.id === p.id) ? l : [...l, p]));
      markSeen(cur, p.created);
    } catch (e2) {
      setErr(errMsg(e2));
    }
  }

  function clearPic() {
    setPic((x) => { if (x) URL.revokeObjectURL(x.url); return null; });
    if (fileRef.current) fileRef.current.value = "";
  }
  async function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("Seules les images sont acceptées.");
    try {
      const file = await shrinkImage(f);
      if (file.size > 4 * 1024 * 1024) return setErr("Image trop lourde (4 Mo au plus).");
      clearPic();
      setPic({ file, url: URL.createObjectURL(file) });
      setErr("");
    } catch (_) {
      setErr("Image illisible.");
    }
  }

  async function del(p) {
    if (!window.confirm("Supprimer ce message ?")) return;
    await pb.collection("posts").delete(p.id).catch((e) => setErr(errMsg(e)));
    setPosts((l) => l.filter((x) => x.id !== p.id));
  }

  // Administration des salons (texte et vocaux)
  async function saveChannel() {
    const name = (edit.name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!name) return;
    const voiceKind = edit.kind === "voice";
    const coll = voiceKind ? "voice_rooms" : "channels";
    try {
      if (edit.id) {
        await pb.collection(coll).update(edit.id, voiceKind ? { name, max: edit.max || 6 } : { name, topic: (edit.topic || "").trim().slice(0, 200) });
      } else {
        const list = voiceKind ? vrooms : channels || [];
        const max = Math.max(0, ...list.map((c) => c.sort || 0));
        const c = await pb.collection(coll).create(voiceKind ? { tcg, name, sort: max + 1, max: edit.max || 6 } : { tcg, name, topic: (edit.topic || "").trim().slice(0, 200), sort: max + 1 });
        if (voiceKind) setVview(c.id);
        else setCur(c.id);
      }
      setEdit(null);
      if (!voiceKind) reloadChannels();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function moveChannel(c, dir, voiceKind) {
    const list = [...(voiceKind ? vrooms : channels)];
    const i = list.findIndex((x) => x.id === c.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const coll = voiceKind ? "voice_rooms" : "channels";
    await Promise.all(list.map((x, k) => (x.sort !== k ? pb.collection(coll).update(x.id, { sort: k }) : null)));
    if (!voiceKind) reloadChannels();
  }
  async function deleteChannel(c, voiceKind) {
    if (!window.confirm(voiceKind ? `Supprimer le salon vocal « ${c.name} » ?` : `Supprimer le salon « ${c.name} » et tous ses messages ?`)) return;
    await pb.collection(voiceKind ? "voice_rooms" : "channels").delete(c.id).catch((e) => setErr(errMsg(e)));
    setEdit(null);
    if (voiceKind) setVview(null);
    else reloadChannels("");
  }

  // Conversations privées à gauche : à deux et en groupe, la plus récente d'abord
  const convos = [
    ...threads.map((t) => ({ key: t.uid, name: t.name, last: t.last, unread: t.unread, group: false })),
    ...groups.map((g) => ({ key: gkey(g.id), name: groupTitle(g, user.id), last: g.last, unread: gunread[g.id] || 0, group: true, n: (g.members || []).length, muted: !!reads.get(g.id)?.muted })),
  ].sort((a, b) => (b.last || "").localeCompare(a.last || ""));
  const vroom = vview ? vrooms.find((r) => r.id === vview) : null;
  const showText = !vroom;
  const ch = (channels || []).find((c) => c.id === cur);
  const gNames = grp?.names || {};
  const iOwn = grp && grp.owner === user.id;
  const openName = (e, uid, name, inGroup) => {
    const r = e.currentTarget.getBoundingClientRect();
    setNameMenu({ uid, name, x: r.left, y: r.bottom, grp: inGroup });
  };
  const pickChannel = (id) => { setDm(null); setVview(null); setCur(id); };
  const msgTime = (m) => new Date(m.created.replace(" ", "T"));

  return (
    <div className="salons">
      <div className="salons-top">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1 className="grow">Salons · {tcgName(tcg)}</h1>
        {admin && <button className="btn sm" onClick={() => setEdit({ name: "", topic: "", kind: "text", max: 6 })}>＋ Salon</button>}
      </div>
      <div className="salons-body">
        <nav className="salons-list">
          {channels === null && <span className="muted small">Chargement…</span>}
          {channels?.length === 0 && <span className="muted small">Aucun salon pour l'instant.</span>}
          {(channels || []).map((c) => (
            <button key={c.id} className={`salon-chip ${c.id === cur && !dm && !vroom ? "on" : ""}`} onClick={() => pickChannel(c.id)}>
              <span className="hash">#</span>
              {c.name}
              {unread[c.id] > 0 && (c.id !== cur || dm || vroom) && <span className="salon-n">{unread[c.id] > 99 ? "99+" : unread[c.id]}</span>}
            </button>
          ))}
          {vrooms.length > 0 && <div className="dm-head">Salons vocaux</div>}
          {vrooms.map((r) => {
            const ppl = voice.room?.id === r.id ? voice.here : byRoom[r.id] || [];
            return (
              <div key={r.id} className="vroom-item">
                <button className={`salon-chip vroom ${vview === r.id ? "on" : ""} ${voice.room?.id === r.id ? "in" : ""}`} onClick={() => { setDm(null); setVview(r.id); }}>
                  <span className="hash">🔊</span>
                  {r.name}
                  {ppl.length > 0 && <span className="vroom-n">{ppl.length}</span>}
                </button>
                {ppl.length > 0 && (
                  <div className="vroom-ppl">
                    {ppl.map((h) => (
                      <span key={h.user} className={voice.room?.id === r.id && voice.speaking[h.user] && h.mic ? "talk" : ""}>
                        {h.name}{!h.mic && " 🔇"}{h.share === "screen" && " 🖥"}{h.share === "cam" && " 📷"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="dm-head dm-head-row">
            <span className="grow">Messages privés</span>
            <button className="dm-new" onClick={() => openInvite({ base: [] })} title="Nouveau groupe privé" aria-label="Nouveau groupe privé">＋</button>
          </div>
          {convos.map((t) => (
            <button key={t.key} className={`salon-chip dm ${dm === t.key ? "on" : ""}`} onClick={() => (t.group ? (setNameMenu(null), setDm(t.key)) : openDm(t.key, t.name))}>
              <span className="hash">{t.group ? "👥" : "@"}</span>
              <span className="dm-name">{t.name}</span>
              {t.muted && <span className="muted small" title="Sourdine">🔕</span>}
              {t.unread > 0 && dm !== t.key && <span className="salon-n">{t.unread > 99 ? "99+" : t.unread}</span>}
            </button>
          ))}
          <VoiceBar className="in-nav" onOpen={() => { setDm(null); setVview(voice.room.id); }} />
        </nav>
        <section className="salon-main">
          {voice.room && vview !== voice.room.id && <VoiceBar className="in-main" onOpen={() => { setDm(null); setVview(voice.room.id); }} />}
          {vroom && (
            <>
              <div className="salon-head">
                <div className="grow">
                  <b>🔊 {vroom.name}</b>
                  <span className="muted small"> · salon vocal · {vroom.max || 6} personnes au plus</span>
                </div>
                {admin && <button className="btn sm ghost" onClick={() => setEdit({ id: vroom.id, name: vroom.name, kind: "voice", max: vroom.max || 6 })}>✎</button>}
              </div>
              <VoiceStage room={vroom} people={byRoom[vroom.id] || []} admin={admin} />
            </>
          )}
          {showText && grp && (
            <div className="salon-head">
              <div className="grow">
                <b>👥 {groupTitle(grp, user.id)}</b>
                <span className="muted small"> · groupe privé · {(grp.members || []).length} membres</span>
              </div>
              <button className="btn sm ghost" onClick={() => { setGrpName(grp.name || ""); setGrpSheet(true); }}>👥 Membres</button>
            </div>
          )}
          {showText && dm && !isGroupKey(dm) && (
            <div className="salon-head">
              <div className="grow">
                <b>@ {dmName || "Joueur"}</b>
                <span className="muted small"> · conversation privée</span>
              </div>
              <button className="btn sm ghost" onClick={() => openInvite({ base: [{ id: dm, name: dmName || "Joueur" }] })} title="Créer un groupe avec d'autres joueurs">➕<span className="hide-xs"> Inviter</span></button>
              <button className="btn sm ghost" onClick={() => toggleBlock(dm, dmName)}>{blocks.has(dm) ? "Débloquer" : "🚫 Bloquer"}</button>
              <button className="btn sm ghost" onClick={reportDm} title="Signaler à l'administrateur">⚑</button>
            </div>
          )}
          {showText && ch && !dm && (
            <div className="salon-head">
              <div className="grow">
                <b># {ch.name}</b>
                {ch.topic && <span className="muted small"> · {ch.topic}</span>}
              </div>
              {admin && <button className="btn sm ghost" onClick={() => setEdit({ id: ch.id, name: ch.name, topic: ch.topic || "", kind: "text" })}>✎</button>}
            </div>
          )}
          {showText && (
          <div className="salon-posts" ref={listRef} onScroll={onScroll}>
            {isGroupKey(dm) && !grp && <p className="muted small salon-empty">Groupe introuvable (vous l'avez peut-être quitté).</p>}
            {grp && gMsgs.map((m, i) => {
              if (m.sys) return <div key={m.id} className="salon-sys small muted">{m.text} · {when(m.created)}</div>;
              const prev = gMsgs[i - 1];
              const grouped = prev && !prev.sys && prev.from === m.from && msgTime(m) - msgTime(prev) < 5 * 60000;
              const mine = m.from === user.id;
              const hidden = blocks.has(m.from) && !showBlocked.has(m.id);
              return (
                <div key={m.id} className={`salon-post ${grouped ? "grouped" : ""} ${mine ? "mine" : ""}`}>
                  {!grouped && (
                    <div className="salon-meta">
                      {mine ? <b>Vous</b> : <button className="salon-name" onClick={(e) => openName(e, m.from, m.from_name, true)}>{m.from_name}</button>}{" "}
                      <span className="muted small">{when(m.created)}</span>
                    </div>
                  )}
                  {hidden ? (
                    <button className="salon-blocked small muted" onClick={() => setShowBlocked((x) => new Set(x).add(m.id))}>Message d'un joueur bloqué · afficher</button>
                  ) : (
                    <div className="salon-text">{m.text}</div>
                  )}
                  {mine && <button className="salon-del" onClick={() => window.confirm("Supprimer ce message ?") && pb.collection("gmsgs").delete(m.id).then(() => setGMsgs((l) => l.filter((x) => x.id !== m.id))).catch((e) => setErr(errMsg(e)))} aria-label="Supprimer le message" title="Supprimer">✕</button>}
                </div>
              );
            })}
            {dm && !isGroupKey(dm) && !dmMsgs.length && <p className="muted small salon-empty">Aucun message avec {dmName || "ce joueur"} pour l'instant. Écrivez-lui !</p>}
            {dm && !isGroupKey(dm) && dmMsgs.map((m, i) => {
              const prev = dmMsgs[i - 1];
              const grouped = prev && prev.from === m.from && msgTime(m) - msgTime(prev) < 5 * 60000;
              const mine = m.from === user.id;
              return (
                <div key={m.id} className={`salon-post ${grouped ? "grouped" : ""} ${mine ? "mine" : ""}`}>
                  {!grouped && <div className="salon-meta"><b>{mine ? "Vous" : m.from_name}</b> <span className="muted small">{when(m.created)}</span></div>}
                  <div className="salon-text">{m.text}</div>
                  {mine && <button className="salon-del" onClick={() => window.confirm("Supprimer ce message ?") && pb.collection("dms").delete(m.id).then(() => setDmMsgs((l) => l.filter((x) => x.id !== m.id))).catch((e) => setErr(errMsg(e)))} aria-label="Supprimer le message" title="Supprimer">✕</button>}
                </div>
              );
            })}
            {!dm && more && <button className="btn sm ghost salon-more" onClick={older}>Messages plus anciens</button>}
            {!dm && ch && !posts.length && <p className="muted small salon-empty">Aucun message dans # {ch.name}. Lancez la conversation !</p>}
            {!dm && posts.map((p, i) => {
              const prev = posts[i - 1];
              const grouped = prev && prev.author === p.author && msgTime(p) - msgTime(prev) < 5 * 60000;
              const mine = p.author === user.id;
              return (
                <div key={p.id} className={`salon-post ${grouped ? "grouped" : ""} ${mine ? "mine" : ""}`}>
                  {!grouped && (
                    <div className="salon-meta">
                      {mine ? <b>{p.name || "Joueur"}</b> : (
                        <button className="salon-name" onClick={(e) => openName(e, p.author, p.name, false)}>{p.name || "Joueur"}</button>
                      )}{" "}
                      <span className="muted small">{when(p.created)}</span>
                    </div>
                  )}
                  {(() => {
                    const hidden = p.spoiler && !shown.has(p.id);
                    const body = (
                      <>
                        {p.text && <div className="salon-text">{p.text}</div>}
                        {p.image && (
                          <img
                            className="salon-img" src={fileUrl("posts", p.id, p.image, "0x480")} alt="" loading="lazy"
                            onClick={() => !hidden && setBig(fileUrl("posts", p.id, p.image))}
                          />
                        )}
                      </>
                    );
                    return hidden ? (
                      <div className="spoiler" onClick={() => setShown((s) => new Set(s).add(p.id))} role="button" title="Afficher">
                        <div className="spoiler-in" aria-hidden="true">{body}</div>
                        <span className="spoiler-tag">⚠ Spoiler · toucher pour afficher</span>
                      </div>
                    ) : body;
                  })()}
                  {(() => {
                    const list = reacts[p.id] || [];
                    const by = {};
                    for (const x of list) (by[x.emoji] ||= []).push(x);
                    return (
                      <div className="post-reacts">
                        {POST_EMOJIS.filter((e) => by[e]).map((e) => (
                          <button key={e} className={`post-react ${by[e].some((x) => x.user === user.id) ? "on" : ""}`} onClick={() => toggleReact(p, e)}>
                            {e} {by[e].length}
                          </button>
                        ))}
                        <span className="post-react-add">
                          <button onClick={() => setPicker(picker === p.id ? null : p.id)} aria-label="Réagir" title="Réagir">😀+</button>
                          {picker === p.id && (
                            <span className="post-react-pop">
                              {POST_EMOJIS.map((e) => <button key={e} onClick={() => toggleReact(p, e)}>{e}</button>)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()}
                  {(mine || admin) && <button className="salon-del" onClick={() => del(p)} aria-label="Supprimer le message" title="Supprimer">✕</button>}
                </div>
              );
            })}
          </div>
          )}
          {showText && (ch || dm) && (!isGroupKey(dm) || grp) && (
            <form className="salon-input" onSubmit={send}>
              {pic && (
                <div className="salon-pic">
                  <img src={pic.url} alt="" />
                  <button type="button" onClick={clearPic} aria-label="Retirer l'image">✕</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
              {!dm && <><button type="button" className="btn icon ghost" onClick={() => fileRef.current?.click()} aria-label="Joindre une image" title="Joindre une image">📎</button>
              <button type="button" className={`btn sm ${spoil ? "warn-on" : "ghost"}`} onClick={() => setSpoil((v) => !v)} aria-pressed={spoil} title="Cacher le message derrière un avertissement « spoiler »">⚠<span className="hide-xs"> Spoiler</span></button></>}
              <textarea
                className="input"
                rows={1}
                maxLength={1000}
                value={text}
                placeholder={grp ? `Message à ${groupTitle(grp, user.id)}` : dm ? `Message privé à ${dmName || "ce joueur"}` : `Écrire dans # ${ch.name}`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
                }}
              />
              <button className="btn primary" disabled={!text.trim() && (!pic || dm)}>Envoyer</button>
            </form>
          )}
          {big && <ZoomView src={big} title="Image" onClose={() => setBig(null)} />}
          {nameMenu && (
            <>
              <div className="name-menu-back" onClick={() => setNameMenu(null)} />
              <div className="name-menu" style={{ left: Math.min(nameMenu.x, window.innerWidth - 230), top: Math.min(nameMenu.y + 4, window.innerHeight - 220) }}>
                <b>{nameMenu.name}</b>
                <button onClick={() => openDm(nameMenu.uid, nameMenu.name)}>✉ Message privé</button>
                {nameMenu.grp && iOwn && (grp.members || []).includes(nameMenu.uid) && <button onClick={() => { setNameMenu(null); removeFromGroup(nameMenu.uid, nameMenu.name); }}>Retirer du groupe</button>}
                <button onClick={() => toggleBlock(nameMenu.uid, nameMenu.name)}>{blocks.has(nameMenu.uid) ? "Débloquer" : "🚫 Bloquer"}</button>
                {nameMenu.grp && <button onClick={() => reportInGroup(nameMenu.uid, nameMenu.name)}>⚑ Signaler à l'administrateur</button>}
              </div>
            </>
          )}
          {err && <div className="err small" style={{ padding: "0 12px 8px" }}>{err}</div>}
        </section>
      </div>

      <Sheet open={grpSheet && !!grp} onClose={() => setGrpSheet(false)} title="Groupe privé">
        {grp && (
          <>
            <div className="field">
              <label>Nom du groupe (facultatif)</label>
              <div className="row">
                <input className="input grow" value={grpName} maxLength={40} onChange={(e) => setGrpName(e.target.value)} placeholder={groupTitle({ ...grp, name: "" }, user.id)} />
                <button className="btn sm" disabled={grpName.trim() === (grp.name || "")} onClick={() => runGroup({ action: "rename", id: grp.id, name: grpName.trim() })}>Renommer</button>
              </div>
            </div>
            <div className="grp-members">
              {(grp.members || []).map((uid) => {
                const name = uid === user.id ? "Vous" : gNames[uid] || "Joueur";
                return (
                  <div key={uid} className="grp-member">
                    <span className="grow">{name}{uid === grp.owner && <span className="muted small"> · créateur</span>}</span>
                    {uid !== user.id && <button className="btn sm ghost" onClick={() => { setGrpSheet(false); openDm(uid, gNames[uid]); }} title="Message privé">✉</button>}
                    {uid !== user.id && iOwn && <button className="btn sm ghost" onClick={() => removeFromGroup(uid, name)}>Retirer</button>}
                    {uid !== user.id && <button className="btn sm ghost" onClick={() => { setGrpSheet(false); reportInGroup(uid, name); }} title="Signaler à l'administrateur">⚑</button>}
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
              {(grp.members || []).length < GROUP_MAX && <button className="btn primary" onClick={() => openInvite({ gid: grp.id })}>➕ Ajouter des joueurs</button>}
              <button className="btn" onClick={toggleGroupMute}>{reads.get(grp.id)?.muted ? "🔔 Réactiver les notifications" : "🔕 Sourdine (pas de notification)"}</button>
              <button className="btn danger" onClick={leaveGroup}>Quitter le groupe</button>
            </div>
            <p className="muted small">{GROUP_MAX} joueurs au plus. Tout membre peut ajouter des joueurs ; seul le créateur peut en retirer. Seuls les membres lisent les messages.</p>
          </>
        )}
      </Sheet>

      <Sheet open={!!invite} onClose={() => setInvite(null)} title={invite?.gid ? "Ajouter au groupe" : "Nouveau groupe privé"}>
        {invite && (() => {
          const inGroup = invite.gid ? groups.find((g) => g.id === invite.gid)?.members || [] : [];
          const taken = new Set([user.id, ...inGroup, ...invite.base.map((b) => b.id)]);
          const room = GROUP_MAX - (invite.gid ? inGroup.length : invite.base.length + 1);
          const sugg = new Map();
          for (const t of threads) if (!taken.has(t.uid)) sugg.set(t.uid, t.name);
          for (const p of posts) if (!taken.has(p.author)) sugg.set(p.author, p.name || "Joueur");
          const list = invite.q.trim().length >= 2 ? invite.found.filter((f) => !taken.has(f.id)).map((f) => [f.id, f.name]) : [...sugg].slice(0, 12);
          const toggle = (id, name) => setInvite((v) => {
            const picked = new Map(v.picked);
            if (picked.has(id)) picked.delete(id);
            else if (picked.size < room) picked.set(id, name);
            return { ...v, picked };
          });
          const need = invite.gid ? 1 : Math.max(1, 2 - invite.base.length);
          return (
            <>
              {invite.base.length > 0 && <p className="small">Avec <b>{invite.base.map((b) => b.name).join(", ")}</b>, et :</p>}
              <input className="input" autoFocus value={invite.q} maxLength={30} placeholder="Chercher un joueur par son pseudo" onChange={(e) => setInvite({ ...invite, q: e.target.value })} />
              {invite.picked.size > 0 && (
                <div className="grp-picked">
                  {[...invite.picked].map(([id, name]) => <button key={id} className="salon-chip on" onClick={() => toggle(id, name)}>{name} ✕</button>)}
                </div>
              )}
              <div className="grp-found">
                {!list.length && <p className="muted small">{invite.q.trim().length >= 2 ? "Aucun joueur trouvé." : "Tapez au moins deux lettres d'un pseudo."}</p>}
                {list.map(([id, name]) => (
                  <label key={id} className="grp-member">
                    <input type="checkbox" checked={invite.picked.has(id)} disabled={!invite.picked.has(id) && invite.picked.size >= room} onChange={() => toggle(id, name)} />
                    <span className="grow">{name}</span>
                  </label>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={invite.picked.size < need} onClick={confirmInvite}>
                  {invite.gid ? `Ajouter (${invite.picked.size})` : `Créer le groupe (${invite.picked.size + invite.base.length + 1})`}
                </button>
              </div>
              <p className="muted small">{room - invite.picked.size} place{room - invite.picked.size > 1 ? "s" : ""} restante{room - invite.picked.size > 1 ? "s" : ""} ({GROUP_MAX} joueurs au plus). Chaque joueur ajouté reçoit une notification.</p>
            </>
          );
        })()}
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? (edit.kind === "voice" ? "Modifier le salon vocal" : "Modifier le salon") : "Nouveau salon"}>
        {edit && (
          <>
            {!edit.id && (
              <div className="row" style={{ marginBottom: 8 }}>
                <button className={`btn sm ${edit.kind !== "voice" ? "primary" : ""}`} onClick={() => setEdit({ ...edit, kind: "text" })}># Texte</button>
                <button className={`btn sm ${edit.kind === "voice" ? "primary" : ""}`} onClick={() => setEdit({ ...edit, kind: "voice" })}>🔊 Vocal</button>
              </div>
            )}
            <div className="field">
              <label>Nom (sans espaces, ex. {edit.kind === "voice" ? "vocal-tournoi" : "decks-et-strategie"})</label>
              <input className="input" value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={edit.kind === "voice" ? "vocal" : "nouveautes"} />
            </div>
            {edit.kind === "voice" ? (
              <div className="field">
                <label>Personnes au plus : {edit.max || 6}</label>
                <input type="range" min={2} max={8} value={edit.max || 6} onChange={(e) => setEdit({ ...edit, max: +e.target.value })} />
                <p className="muted small">Au-delà de 6, la voix et surtout le partage d'écran demandent une bonne connexion à chacun.</p>
              </div>
            ) : (
              <div className="field">
                <label>Sujet (facultatif)</label>
                <input className="input" value={edit.topic} maxLength={200} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} placeholder="De quoi parle ce salon ?" />
              </div>
            )}
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn primary" onClick={saveChannel} disabled={!edit.name.trim()}>{edit.id ? "Enregistrer" : edit.kind === "voice" ? "Créer le salon vocal" : "Créer le salon"}</button>
              {edit.id && (() => {
                const v = edit.kind === "voice";
                const c = (v ? vrooms : channels).find((x) => x.id === edit.id);
                return c && (
                  <>
                    <button className="btn sm" onClick={() => moveChannel(c, -1, v)}>↑ Monter</button>
                    <button className="btn sm" onClick={() => moveChannel(c, 1, v)}>↓ Descendre</button>
                    <button className="btn sm danger" onClick={() => deleteChannel(c, v)}>Supprimer</button>
                  </>
                );
              })()}
            </div>
            <p className="muted small">Salons de {tcgName(tcg)}. {edit.kind === "voice" ? "Dans un salon vocal, touchez un participant pour le retirer (10 minutes)." : "Vous pouvez aussi supprimer n'importe quel message (✕)."}</p>
          </>
        )}
      </Sheet>
    </div>
  );
}
