import { useEffect, useState } from "react";
import { ZoomPreview } from "../components/ZoomView.jsx";
import { pb, me, fileUrl, errMsg } from "../pb.js";
import { Sheet } from "../components/ui.jsx";
import { nameKey } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { StatsFields } from "./Scanner.jsx";
import FactionPicker from "../components/FactionPicker.jsx";
import { factionsOf } from "../lib/factions.js";
import { TCG } from "../lib/game.js";
import { fabKey, PITCH } from "../lib/deckrules.js";
import { KindPicker, PitchPicker, FabStats, FAB_CLASSES, FAB_TALENTS, FAB_KIND_LABEL } from "../components/FabFields.jsx";
import { SorcKindPicker, RarityPicker, ElementPicker, SorcStats, sorcRarityLabel } from "../components/SorceryFields.jsx";

export default function Library({ go }) {
  const user = me();
  const fab = TCG === "fab"; // Flesh and Blood : type, couleur de pitch, coût / attaque / défense, classes
  const sorc = TCG === "sorcery"; // Sorcery : type, rareté, éléments, valeurs
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
      setCards(await pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${tcgFilter(currentTcg())}`, sort: "name,-created" }));
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
    if (fab && ("name" in patch || "pitch" in patch)) {
      const nx = { name: patch.name ?? sel.name, pitch: patch.pitch ?? sel.pitch };
      if (!nx.name) return setErr("Le nom est obligatoire.");
      const dup = cards.find((c) => c.id !== sel.id && fabKey(c) === fabKey(nx));
      if (dup) return setErr(`« ${dup.name} »${dup.pitch ? ` (${PITCH[dup.pitch]})` : ""} existe déjà dans votre collection.`);
    } else if ("name" in patch) {
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
              {!fab && !sorc && c.kind !== "jeton" && c.token_too && <span className="badge">+ JETON</span>}
              {sorc && c.kind === "avatar" && <span className="badge">AVATAR</span>}
              {sorc && c.kind === "site" && <span className="badge">SITE</span>}
              {fab && c.kind === "heros" && <span className="badge">HÉROS</span>}
              {fab && c.kind === "arene" && <span className="badge">ÉQUIP.</span>}
              {fab && c.pitch && <span className="pitch-tag" style={{ background: { r: "#c83a32", y: "#d6b13b", b: "#3b78c8" }[c.pitch] }} />}
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
            <ZoomPreview src={fileUrl("cards", sel.id, sel.image)} alt={sel.name} />
            <div className="field">
              <label>Nom</label>
              <div className="row">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <button className="btn" onClick={() => save({ name: name.trim() })}>OK</button>
              </div>
              {err && <div className="err">{err}</div>}
            </div>
            {fab && (
              <>
                <KindPicker value={sel.kind || "carte"} onChange={(k) => save(k === "carte" ? { kind: k } : { kind: k, pitch: "" })} />
                {(sel.kind || "carte") === "carte" && <PitchPicker value={sel.pitch || ""} onChange={(p) => save({ pitch: p })} />}
              </>
            )}
            {sorc ? (
              <>
                <SorcKindPicker value={sel.kind || "sort"} onChange={(k) => save({ kind: k, ...(k === "site" && sel.orient !== "l" ? { orient: "l" } : null) })} />
                {sel.kind !== "jeton" && <RarityPicker value={sel.rarity || ""} onChange={(r) => save({ rarity: r })} />}
                <ElementPicker value={factionsOf(sel)} kind={sel.kind || "sort"} onChange={(f) => { setSel({ ...sel, factions: f }); save({ factions: f }); }} />
              </>
            ) : (
            <FactionPicker
              value={factionsOf(sel)}
              onChange={(f) => {
                setSel({ ...sel, factions: f });
                save({ factions: f });
              }}
              {...(fab ? { list: FAB_CLASSES, extra: FAB_TALENTS, label: "Classes et talents" } : null)}
            />
            )}
            {sorc ? (
              <SorcStats
                kind={sel.kind || "sort"}
                stats={{ atk: sel.atk || "", val: sel.val || "", def: sel.def || "" }}
                setStats={(st) => {
                  const patch = { atk: (st.atk || "").slice(0, 6), val: (st.val || "").slice(0, 6), def: (st.def || "").slice(0, 6) };
                  setSel({ ...sel, ...patch });
                  clearTimeout(window.__statT);
                  window.__statT = setTimeout(() => save(patch), 600);
                }}
              />
            ) : fab ? (
              <FabStats
                stats={{ atk: sel.atk || "", val: sel.val || "", def: sel.def || "" }}
                setStats={(st) => {
                  const patch = { atk: (st.atk || "").slice(0, 6), val: (st.val || "").slice(0, 6), def: (st.def || "").slice(0, 6) };
                  setSel({ ...sel, ...patch });
                  clearTimeout(window.__statT);
                  window.__statT = setTimeout(() => save(patch), 600);
                }}
              />
            ) : (
            <StatsFields
              stats={{ atk: sel.atk || "", val: sel.val || "", def: sel.def || "" }}
              setStats={(st) => {
                const patch = { atk: (st.atk || "").slice(0, 6), val: (st.val || "").slice(0, 6), def: (st.def || "").slice(0, 6) };
                setSel({ ...sel, ...patch });
                clearTimeout(window.__statT);
                window.__statT = setTimeout(() => save(patch), 600);
              }}
            />
            )}
            {!fab && !sorc && (
              <div className="field">
                <label>Type</label>
                <div className="hand-tabs type-tabs">
                  {[
                    ["carte", "Carte normale", { kind: "carte", token_too: false }],
                    ["jeton", "Carte jeton", { kind: "jeton", token_too: false }],
                    ["les2", "Les deux", { kind: "carte", token_too: true }],
                  ].map(([k, label, patch]) => {
                    const cur = sel.kind === "jeton" ? "jeton" : sel.token_too ? "les2" : "carte";
                    return <button key={k} className={cur === k ? "on" : ""} onClick={() => cur !== k && save(patch)}>{label}</button>;
                  })}
                </div>
                {sel.kind !== "jeton" && sel.token_too && (
                  <p className="muted small" style={{ margin: "6px 0 0" }}>Se met dans le deck comme une carte normale, et peut aussi être ajoutée à la réserve de jetons du deck.</p>
                )}
              </div>
            )}
            <div className="row" style={{ flexWrap: "wrap" }}>
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
