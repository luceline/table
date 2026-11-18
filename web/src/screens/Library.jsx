import { useEffect, useState } from "react";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { Sheet } from "../components/ui.jsx";

export default function Library({ go }) {
  const user = me();
  const [cards, setCards] = useState(null);
  const [sel, setSel] = useState(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

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

  async function save(patch) {
    try {
      const r = await pb.collection("cards").update(sel.id, patch);
      setSel(r);
      setCards((cs) => cs.map((c) => (c.id === r.id ? r : c)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function remove() {
    if (!confirm("Supprimer ce scan ? Il sera retiré de vos decks. Les parties déjà lancées ne sont pas modifiées.")) return;
    try {
      await pb.collection("cards").delete(sel.id);
      setCards((cs) => cs.filter((c) => c.id !== sel.id));
      setSel(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const shown = (cards || []).filter((c) => !q || (c.name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1>Mes cartes</h1>
        <button className="btn primary sm" onClick={() => go("scan")}>Scanner</button>
      </div>
      {err && <div className="err">{err}</div>}
      <input className="input" placeholder="Rechercher par nom" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="spacer" />
      {cards === null && <p className="muted">Chargement…</p>}
      {cards && cards.length === 0 && <p className="muted">Aucune carte. Commencez par en scanner une.</p>}
      <div className="grid">
        {shown.map((c) => (
          <div className="thumb" key={c.id} onClick={() => open(c)} style={c.orient === "l" ? { aspectRatio: "88 / 63" } : null}>
            <img src={fileUrl("cards", c.id, c.image, "0x300")} alt={c.name} loading="lazy" />
            <div className="cap">{c.name || "Sans nom"}</div>
            {c.kind === "jeton" && <span className="badge">JETON</span>}
          </div>
        ))}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title="Carte">
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
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className={`btn ${sel.kind === "jeton" ? "primary" : ""}`} onClick={() => save({ kind: sel.kind === "jeton" ? "carte" : "jeton" })}>
                Type : {sel.kind === "jeton" ? "carte jeton" : "carte normale"}
              </button>
              <button className="btn" onClick={() => save({ orient: sel.orient === "l" ? "p" : "l" })}>
                Format : {sel.orient === "l" ? "paysage" : "portrait"}
              </button>
              <span className="grow" />
              <button className="btn danger" onClick={remove}>Supprimer</button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
