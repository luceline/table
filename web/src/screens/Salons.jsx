import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg, fileUrl } from "../pb.js";
import ZoomView from "../components/ZoomView.jsx";
import { Sheet } from "../components/ui.jsx";
import { currentTcg, tcgName } from "../lib/tcg.js";
import { loadChannels, unreadCounts, markSeen, useIsAdmin, postsOfTcg } from "../lib/salons.js";

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
export default function Salons({ go, channelId }) {
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
  }, [posts]);
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

  // Administration des salons
  async function saveChannel() {
    const name = (edit.name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!name) return;
    try {
      if (edit.id) await pb.collection("channels").update(edit.id, { name, topic: (edit.topic || "").trim().slice(0, 200) });
      else {
        const max = Math.max(0, ...(channels || []).map((c) => c.sort || 0));
        const c = await pb.collection("channels").create({ tcg, name, topic: (edit.topic || "").trim().slice(0, 200), sort: max + 1 });
        setCur(c.id);
      }
      setEdit(null);
      reloadChannels();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function moveChannel(c, dir) {
    const list = [...channels];
    const i = list.findIndex((x) => x.id === c.id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((x, k) => (x.sort !== k ? pb.collection("channels").update(x.id, { sort: k }) : null)));
    reloadChannels();
  }
  async function deleteChannel(c) {
    if (!window.confirm(`Supprimer le salon « ${c.name} » et tous ses messages ?`)) return;
    await pb.collection("channels").delete(c.id).catch((e) => setErr(errMsg(e)));
    setEdit(null);
    reloadChannels("");
  }

  const ch = (channels || []).find((c) => c.id === cur);
  return (
    <div className="salons">
      <div className="salons-top">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1 className="grow">Salons · {tcgName(tcg)}</h1>
        {admin && <button className="btn sm" onClick={() => setEdit({ name: "", topic: "" })}>＋ Salon</button>}
      </div>
      <div className="salons-body">
        <nav className="salons-list">
          {channels === null && <span className="muted small">Chargement…</span>}
          {channels?.length === 0 && <span className="muted small">Aucun salon pour l'instant.</span>}
          {(channels || []).map((c) => (
            <button key={c.id} className={`salon-chip ${c.id === cur ? "on" : ""}`} onClick={() => setCur(c.id)}>
              <span className="hash">#</span>
              {c.name}
              {unread[c.id] > 0 && c.id !== cur && <span className="salon-n">{unread[c.id] > 99 ? "99+" : unread[c.id]}</span>}
            </button>
          ))}
        </nav>
        <section className="salon-main">
          {ch && (
            <div className="salon-head">
              <div className="grow">
                <b># {ch.name}</b>
                {ch.topic && <span className="muted small"> · {ch.topic}</span>}
              </div>
              {admin && <button className="btn sm ghost" onClick={() => setEdit({ id: ch.id, name: ch.name, topic: ch.topic || "" })}>✎</button>}
            </div>
          )}
          <div className="salon-posts" ref={listRef} onScroll={onScroll}>
            {more && <button className="btn sm ghost salon-more" onClick={older}>Messages plus anciens</button>}
            {ch && !posts.length && <p className="muted small salon-empty">Aucun message dans # {ch.name}. Lancez la conversation !</p>}
            {posts.map((p, i) => {
              const prev = posts[i - 1];
              const grouped = prev && prev.author === p.author && new Date(p.created.replace(" ", "T")) - new Date(prev.created.replace(" ", "T")) < 5 * 60000;
              const mine = p.author === user.id;
              return (
                <div key={p.id} className={`salon-post ${grouped ? "grouped" : ""} ${mine ? "mine" : ""}`}>
                  {!grouped && (
                    <div className="salon-meta">
                      <b>{p.name || "Joueur"}</b> <span className="muted small">{when(p.created)}</span>
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
          {ch && (
            <form className="salon-input" onSubmit={send}>
              {pic && (
                <div className="salon-pic">
                  <img src={pic.url} alt="" />
                  <button type="button" onClick={clearPic} aria-label="Retirer l'image">✕</button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
              <button type="button" className="btn icon ghost" onClick={() => fileRef.current?.click()} aria-label="Joindre une image" title="Joindre une image">📎</button>
              <button type="button" className={`btn sm ${spoil ? "warn-on" : "ghost"}`} onClick={() => setSpoil((v) => !v)} aria-pressed={spoil} title="Cacher le message derrière un avertissement « spoiler »">⚠<span className="hide-xs"> Spoiler</span></button>
              <textarea
                className="input"
                rows={1}
                maxLength={1000}
                value={text}
                placeholder={`Écrire dans # ${ch.name}`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
                }}
              />
              <button className="btn primary" disabled={!text.trim() && !pic}>Envoyer</button>
            </form>
          )}
          {big && <ZoomView src={big} title="Image" onClose={() => setBig(null)} />}
          {err && <div className="err small" style={{ padding: "0 12px 8px" }}>{err}</div>}
        </section>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Modifier le salon" : "Nouveau salon"}>
        {edit && (
          <>
            <div className="field">
              <label>Nom (sans espaces, ex. decks-et-strategie)</label>
              <input className="input" value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="nouveautes" />
            </div>
            <div className="field">
              <label>Sujet (facultatif)</label>
              <input className="input" value={edit.topic} maxLength={200} onChange={(e) => setEdit({ ...edit, topic: e.target.value })} placeholder="De quoi parle ce salon ?" />
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn primary" onClick={saveChannel} disabled={!edit.name.trim()}>{edit.id ? "Enregistrer" : "Créer le salon"}</button>
              {edit.id && (
                <>
                  <button className="btn sm" onClick={() => moveChannel(channels.find((c) => c.id === edit.id), -1)}>↑ Monter</button>
                  <button className="btn sm" onClick={() => moveChannel(channels.find((c) => c.id === edit.id), 1)}>↓ Descendre</button>
                  <button className="btn sm danger" onClick={() => deleteChannel(channels.find((c) => c.id === edit.id))}>Supprimer</button>
                </>
              )}
            </div>
            <p className="muted small">Salons de {tcgName(tcg)}. Vous pouvez aussi supprimer n'importe quel message (✕).</p>
          </>
        )}
      </Sheet>
    </div>
  );
}
