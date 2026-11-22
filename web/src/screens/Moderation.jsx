// Modération (admin) : tapis et dos de cartes signalés, à débloquer ou à supprimer
import { useEffect, useState } from "react";
import { pb, errMsg, fileUrl } from "../pb.js";

const KIND = { bg: "Tapis", back: "Dos de cartes" };

export default function Moderation({ go }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => pb.send("/api/table/mod/reports", { requestKey: null }).then((r) => setList(r.reports || [])).catch((e) => { setErr(errMsg(e)); setList([]); });
  useEffect(() => { load(); }, []);

  // un même joueur peut avoir été signalé plusieurs fois pour la même image : une carte par joueur et par type
  const groups = [];
  for (const r of list || []) {
    const g = groups.find((x) => x.target === r.target && x.kind === r.kind);
    if (g) g.reports.push(r);
    else groups.push({ target: r.target, kind: r.kind, name: r.target_name, current: r.current, file: r.file, reports: [r] });
  }

  async function decide(g, action) {
    if (action === "remove" && !window.confirm(`Supprimer définitivement ${g.kind === "bg" ? "le tapis" : "le dos de cartes"} de ${g.name} ?`)) return;
    setBusy(g.target + g.kind);
    try {
      await pb.send("/api/table/mod/decide", { method: "POST", body: { target: g.target, kind: g.kind, action } });
      await load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <div className="brand grow">⚑ Signalements</div>
      </div>
      {err && <div className="err">{err}</div>}
      {list === null && <p className="muted">Chargement…</p>}
      {list?.length === 0 && !err && <div className="card-box"><p className="muted" style={{ margin: 0 }}>Aucun signalement en attente.</p></div>}
      {groups.map((g) => (
        <div className="card-box mod-item" key={g.target + g.kind}>
          <h2 style={{ marginTop: 0 }}>{KIND[g.kind]} de {g.name}</h2>
          {g.current ? (
            <a href={fileUrl("users", g.target, g.current)} target="_blank" rel="noreferrer">
              <img className={`mod-img ${g.kind}`} src={fileUrl("users", g.target, g.current)} alt="" />
            </a>
          ) : (
            <p className="muted small">Le joueur a retiré son image depuis le signalement.</p>
          )}
          {g.current && g.file && g.current !== g.file && <p className="muted small">Image changée depuis le signalement : c'est l'image actuelle qui est affichée (toujours masquée aux autres).</p>}
          <ul className="small">
            {g.reports.map((r) => (
              <li key={r.id}>
                Signalé par <b>{r.reporter_name}</b>, le {new Date(r.created.replace(" ", "T")).toLocaleString("fr-FR")}
                {r.reason && <> : « {r.reason} »</>}
              </li>
            ))}
          </ul>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn primary" disabled={!!busy} onClick={() => decide(g, "unblock")}>✅ Image correcte : débloquer</button>
            {g.current && <button className="btn danger" disabled={!!busy} onClick={() => decide(g, "remove")}>🗑 Supprimer l'image</button>}
          </div>
        </div>
      ))}
      <p className="muted small">Tant que vous n'avez pas décidé, l'image reste masquée pour les adversaires et les spectateurs (le joueur, lui, la voit toujours).</p>
    </div>
  );
}
