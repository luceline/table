import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { Sheet } from "../components/ui.jsx";
import { nameKey } from "../lib/deckrules.js";
import { StatsFields } from "./Scanner.jsx";

export default function Library({ go }) {
  const user = me();
  const [cards, setCards] = useState(null);
  const [sel, setSel] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false); // mode sélection multiple
  const [picked, setPicked] = useState(() => new Set());
  const [deleting, setDeleting] = useState(null); // { done, n }

  async function load() {
    try {
      setCards(await pb.collection("cards").getFullList({ filter: `owner="${user.id}"`, sort: "name,-created" }));
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  useEffect(() => { load(); }, []);

  function open(c) {
    setSel(c);
    setName(c.name || "");
  }

  function toggle(id) {
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function startPicking() {
    setPicking(true);
    setPicked(new Set());
  }

  function stopPicking() {
    setPicking(false);
    setPicked(new Set());
  }

  async function save(patch) {
    if ("name" in patch) {
      if (!patch.name) return setErr("Le nom est obligatoire.");
      const dup = cards.find((c) => c.id !== sel.id && nameKey(c.name) === nameKey(patch.name));
      if (dup) return setErr(`« ${dup.name} » existe déjà dans votre collection. Pour une autre version de la même carte, ajoutez un repère (ex. « ${patch.name} UR »).`);
    }
    setErr("");
    try {
      const r = await pb.collection("cards").update(sel.id, patch);
      setSel(r);
      setCards((cs) => cs.map((c) => (c.id === r.id ? r : c)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function removeIds(ids) {
    setErr("");
    setDeleting({ done: 0, n: ids.length });
    const gone = new Set();
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await pb.collection("cards").delete(ids[i]);
        gone.add(ids[i]);
      } catch (e) {
        failed++;
      }
      setDeleting({ done: i + 1, n: ids.length });
    }
    setCards((cs) => cs.filter((c) => !gone.has(c.id)));
    setDeleting(null);
    if (failed) setErr(`${failed} carte(s) n'ont pas pu être supprimées. Réessayez.`);
    return failed === 0;
  }

  async function removeOne() {
    if (!confirm("Supprimer ce scan ? Il sera retiré de vos decks. Les parties déjà lancées ne sont pas modifiées.")) return;
    if (await removeIds([sel.id])) setSel(null);
  }

  async function removePicked() {
    const ids = [...picked];
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} carte${ids.length > 1 ? "s" : ""} ? Elles seront retirées de vos decks. Les parties déjà lancées ne sont pas modifiées.`)) return;
    if (await removeIds(ids)) stopPicking();
  }

  const fold = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const shown = (cards || []).filter((c) => !q.trim() || fold(c.name).includes(fold(q.trim())));
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.has(c.id));

  function toggleAll() {
    setPicked((p) => {
      const n = new Set(p);
      if (allShownPicked) shown.forEach((c) => n.delete(c.id));
      else shown.forEach((c) => n.add(c.id));
      return n;
    });
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1>Mes cartes</h1>
        {cards?.length > 0 && !picking && <button className="btn sm" onClick={startPicking}>Sélectionner</button>}
        {!picking && <button className="btn primary sm" onClick={() => go("scan")}>Scanner</button>}
        {picking && <button className="btn sm" onClick={stopPicking}>Terminer</button>}
      </div>
      {err && <div className="err">{err}</div>}

      {picking && (
        <div className="card-box row" style={{ padding: "10px 12px", flexWrap: "wrap", position: "sticky", top: 8, zIndex: 10 }}>
          <span className="small grow">
            {picked.size} sélectionnée{picked.size > 1 ? "s" : ""}
          </span>
          <button className="btn sm" onClick={toggleAll} disabled={!shown.length}>
            {allShownPicked ? "Tout désélectionner" : q ? "Tout sélectionner (filtre)" : "Tout sélectionner"}
          </button>
          <button className="btn sm danger" onClick={removePicked} disabled={!picked.size || !!deleting}>
            {deleting ? `Suppression ${deleting.done}/${deleting.n}…` : `Supprimer (${picked.size})`}
          </button>
        </div>
      )}

      <input className="input" placeholder="Rechercher par nom" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="spacer" />
      {cards === null && <p className="muted">Chargement…</p>}
      {cards && cards.length === 0 && <p className="muted">Aucune carte. Commencez par en scanner une.</p>}
      <div className="grid">
        {shown.map((c) => {
          const on = picked.has(c.id);
          return (
            <div
              className="thumb"
              key={c.id}
              onClick={() => (picking ? toggle(c.id) : open(c))}
              style={{
                ...(c.orient === "l" ? { aspectRatio: "88 / 63" } : null),
                ...(picking ? { outline: on ? "3px solid var(--danger)" : "none", outlineOffset: -3, opacity: on ? 1 : 0.7 } : null),
              }}
            >
              <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
              <div className="cap">{c.name || "Sans nom"}</div>
              {c.kind === "jeton" && <span className="badge">JETON</span>}
              {picking && (
                <span
                  style={{
                    position: "absolute", top: 4, left: 4, width: 24, height: 24, borderRadius: "50%",
                    border: "2px solid #fff", background: on ? "var(--danger)" : "rgba(0,0,0,.45)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <Sheet open={!!sel} onClose={() => { setSel(null); setErr(""); }} title="Carte">
        {sel && (
          <>
            <div className="preview">
              <img src={fileUrl("cards", sel.id, sel.image)} alt={sel.name} />
            </div>
            <div className="field">
              <label>Nom</label>
              <div className="row">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <button className="btn" onClick={() => save({ name: name.trim() })}>OK</button>
              </div>
              {err && <div className="err">{err}</div>}
            </div>
            <StatsFields
              stats={{ atk: sel.atk || "", val: sel.val || "", def: sel.def || "" }}
              setStats={(st) => {
                const patch = { atk: (st.atk || "").slice(0, 6), val: (st.val || "").slice(0, 6), def: (st.def || "").slice(0, 6) };
                setSel({ ...sel, ...patch });
                clearTimeout(window.__statT);
                window.__statT = setTimeout(() => save(patch), 600);
              }}
            />
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className={`btn ${sel.kind === "jeton" ? "primary" : ""}`} onClick={() => save({ kind: sel.kind === "jeton" ? "carte" : "jeton" })}>
                Type : {sel.kind === "jeton" ? "carte jeton" : "carte normale"}
              </button>
              <button className="btn" onClick={() => save({ orient: sel.orient === "l" ? "p" : "l" })}>
                Format : {sel.orient === "l" ? "paysage" : "portrait"}
              </button>
              <span className="grow" />
              <button className="btn danger" onClick={removeOne} disabled={!!deleting}>Supprimer</button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
