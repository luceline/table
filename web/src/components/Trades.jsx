// Échanges : cartes en double et cartes recherchées (sans image), correspondances entre joueurs, message privé en un toucher.
import { useEffect, useMemo, useState } from "react";
import { pb, me, errMsg, safeUn } from "../pb.js";

const MODES_HAVE = { trade: "Échange", sell: "Vente", both: "Échange ou vente" };
const MODES_WANT = { trade: "Échange", sell: "Achat", both: "Échange ou achat" };
export const modeText = (t) => (t.kind === "have" ? MODES_HAVE : MODES_WANT)[t.mode] || "";
const euros = (n) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
const priceText = (t) => (t.mode !== "trade" && t.price > 0 ? (t.kind === "want" ? ` · jusqu'à ${euros(t.price)}` : ` · ${euros(t.price)}`) : "");
// Raretés officielles (Safir : safircards.com ; Flesh and Blood : symbole en bas à gauche de la carte), de la plus courante
// à la plus rare : le rang sert à repérer les échanges de valeur équivalente. Promo : pas comparable.
export const RARITIES = {
  safir: ["Commune", "Rare", "Ultra rare", "SP", "Secrète", "Légendaire", "Gold signée", "Promo"],
  fab: ["Token", "Basic", "Commune", "Rare", "Super Rare", "Majestic", "Legendary", "Fabled", "Marvel", "Promo"],
  sorcery: ["Ordinaire", "Exceptionnelle", "Élite", "Unique", "Promo"],
};
const RANK = {
  safir: { Commune: 1, Rare: 2, "Ultra rare": 3, SP: 4, "Secrète": 5, "Légendaire": 6, "Gold signée": 7 },
  fab: { Token: 0, Basic: 0, Commune: 1, Rare: 2, "Super Rare": 3, Majestic: 4, Legendary: 5, Fabled: 6, Marvel: 6 },
  sorcery: { Ordinaire: 1, Exceptionnelle: 2, "Élite": 3, Unique: 4 },
};
export const FINISHES = ["Rainbow Foil", "Cold Foil"]; // Flesh and Blood ; vide = normale
// Finitions par jeu (Sorcery : version foil)
const FINISHES_OF = { fab: FINISHES, sorcery: ["Foil"] };
const extra = (t) => [t.rarity, t.finish].filter(Boolean).join(" ");
export const cardText = (t) => `${t.series} n°${t.num}${t.name ? ` · ${t.name}` : ""}${extra(t) ? ` · ${extra(t)}` : ""}${t.qty > 1 ? ` ×${t.qty}` : ""}`;
const cardSay = (t) => `${t.series} n°${t.num}${t.name ? ` (${t.name})` : ""}${extra(t) ? `, ${extra(t)}` : ""}${t.qty > 1 ? `, ${t.qty} exemplaires` : ""}`;
const fits = (a, b, k) => !a[k] || !b[k] || a[k] === b[k];
const sameCard = (a, b) => a.series === b.series && String(a.num) === String(b.num) && fits(a, b, "rarity") && fits(a, b, "finish");
const rankOf = (tcg, t) => (t.rarity && RANK[tcg]?.[t.rarity] != null ? RANK[tcg][t.rarity] : null);
const tcgId = (t) => (t === "fab" || t === "sorcery" ? t : "safir");

// Ouvre une conversation privée avec un brouillon : dans la colonne Salons de l'accueil si elle est affichée, sinon en plein écran
export function messageTo(go, uid, name, text) {
  if (document.querySelector(".salons.embed")) {
    window.dispatchEvent(new CustomEvent("table-open-dm", { detail: { uid, name, text } }));
    document.querySelector(".salons.embed textarea")?.focus();
  } else go("salons", { dm: uid, draft: text });
}

// Lignes de tous les joueurs pour un jeu (rafraîchies en direct)
export function useTrades(tcg) {
  const [all, setAll] = useState(null);
  const [series, setSeries] = useState([]);
  useEffect(() => {
    let alive = true, un = null, un2 = null;
    const t = tcgId(tcg);
    const load = () => pb.collection("trades").getFullList({ filter: `tcg = "${t}"`, sort: "series,num", requestKey: null }).then((l) => alive && setAll(l)).catch(() => alive && setAll([]));
    const loadS = () => pb.collection("series").getFullList({ filter: `tcg = "${t}"`, sort: "sort,code", requestKey: null }).then((l) => alive && setSeries(l)).catch(() => {});
    load();
    loadS();
    pb.collection("trades").subscribe("*", load, { requestKey: null }).then((u) => (alive ? (un = u) : safeUn(u))).catch(() => {});
    pb.collection("series").subscribe("*", loadS, { requestKey: null }).then((u) => (alive ? (un2 = u) : safeUn(u))).catch(() => {});
    return () => { alive = false; safeUn(un); safeUn(un2); };
  }, [tcg]);
  const uid = me()?.id;
  const mine = (all || []).filter((x) => x.user === uid);
  const others = (all || []).filter((x) => x.user !== uid);
  // Correspondances : mes recherches proposées par d'autres, et mes doubles recherchés par d'autres
  const matches = [];
  for (const m of mine) for (const o of others) if (o.kind !== m.kind && sameCard(m, o)) matches.push({ mine: m, other: o });
  // Échanges croisés : un joueur a une carte que je cherche ET cherche une de mes cartes en double
  const byUser = {};
  for (const m of matches) {
    const u = (byUser[m.other.user] ||= { user: m.other.user, name: m.other.uname, get: [], give: [] });
    if (m.mine.kind === "want") u.get.push(m);
    else u.give.push(m);
  }
  const t = tcgId(tcg);
  const cross = Object.values(byUser)
    .filter((u) => u.get.length && u.give.length)
    .map((u) => {
      // valeur : rangs de rareté (répétés selon les quantités) de ce que je reçois et de ce que je donne
      const ranks = (l, side) => l.flatMap((m) => Array(Math.max(1, Math.min(m[side].qty || 1, m.other.qty || 1, m.mine.qty || 1))).fill(rankOf(t, m.other.rarity ? m.other : m.mine)));
      const a = ranks(u.get, "other").sort(), b = ranks(u.give, "mine").sort();
      const known = [...a, ...b].every((x) => x !== null);
      const same = known && a.length === b.length && a.every((x, i) => x === b[i]);
      const sum = (l) => l.reduce((n, x) => n + (x || 0), 0);
      const oneRank = known && new Set([...a, ...b]).size === 1;
      return { ...u, known, same, oneRank, nGet: a.length, nGive: b.length, diff: known ? sum(a) - sum(b) : 0 };
    });
  return { all, mine, others, matches, cross, series };
}

export default function Trades({ tcg, go, admin, data }) {
  const { all, mine, others, matches, cross, series } = data;
  const [view, setView] = useState("mine"); // mine | matches | all
  const [f, setF] = useState({ kind: "want", series: "", num: "", name: "", mode: "both", price: "", qty: 1, rarity: "", finish: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [newS, setNewS] = useState("");
  const user = me();
  const t = tcgId(tcg);
  useEffect(() => {
    if (!f.series && series[0]) setF((x) => ({ ...x, series: series[0].code }));
  }, [series]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    if (!f.series) return setErr("Choisissez une saison.");
    if (!f.num.trim()) return setErr("Indiquez le numéro de la carte.");
    setBusy(true);
    try {
      await pb.collection("trades").create({
        user: user.id, tcg: t, kind: f.kind, series: f.series, num: f.num.trim(), name: f.name.trim().slice(0, 80),
        mode: f.mode, price: f.mode !== "trade" && f.price !== "" ? Math.max(0, Number(String(f.price).replace(",", "."))) || 0 : 0,
        qty: Math.max(1, Math.min(99, parseInt(f.qty, 10) || 1)), rarity: f.rarity, finish: FINISHES_OF[t] ? f.finish : "",
      });
      setF((x) => ({ ...x, num: "", name: "", qty: 1 }));
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  }
  const del = (r) => pb.collection("trades").delete(r.id).catch((e) => setErr(errMsg(e)));

  const draft = (m) =>
    m.mine.kind === "want"
      ? `Bonjour ! Je cherche ${cardSay(m.other)}, que tu as en double (${modeText(m.other).toLowerCase()}${priceText(m.other).replace(" · ", ", ")}). Ça t'intéresse ?`
      : `Bonjour ! J'ai ${cardSay(m.mine)} en double et tu la cherches (${modeText(m.other).toLowerCase()}). Ça t'intéresse ?`;
  const draftAll = (o) =>
    o.kind === "have"
      ? `Bonjour ! Je suis intéressé par ${cardSay(o)} que tu as en double (${modeText(o).toLowerCase()}${priceText(o).replace(" · ", ", ")}).`
      : `Bonjour ! Tu cherches ${cardSay(o)} : je l'ai peut-être, on en parle ?`;

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return others.filter((o) => (!qs || o.series === qs) && (!n || `${o.series} ${o.num} ${o.name} ${o.uname}`.toLowerCase().includes(n)));
  }, [others, q, qs]);

  const row = (r, extra) => (
    <div key={r.id} className="trade-row">
      <span className="grow">
        <b>{cardText(r)}</b>
        <span className="muted small"> · {modeText(r)}{priceText(r)}</span>
      </span>
      {extra}
    </div>
  );

  async function addSeries() {
    const code = newS.trim().slice(0, 12);
    if (!code) return;
    try {
      await pb.collection("series").create({ tcg: t, code, name: "", sort: series.length });
      setNewS("");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="card-box trades">
      <h2 style={{ marginTop: 0 }}>🤝 Échanges</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Indiquez les cartes que vous avez en double et celles que vous cherchez. Quand un autre joueur a ce qu'il vous faut (ou cherche une de vos cartes), il apparaît dans « Correspondances » avec un bouton pour lui écrire.
      </p>
      <div className="lobby-tabs">
        <button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>Mes listes <span className="lobby-n">{mine.length}</span></button>
        <button className={view === "matches" ? "on" : ""} onClick={() => setView("matches")}>
          <span className="lbl-long">Correspondances</span><span className="lbl-short">Trouvées</span>{matches.length ? <span className="lobby-n live">{matches.length}</span> : null}
        </button>
        <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}><span className="lbl-long">Tous les joueurs</span><span className="lbl-short">Tous</span> <span className="lobby-n">{others.length}</span></button>
      </div>

      {all === null && <p className="muted small">Chargement…</p>}

      {view === "mine" && all !== null && (
        <>
          <form className="trade-form" onSubmit={add}>
            <div className="row trade-kind">
              <button type="button" className={`btn sm ${f.kind === "want" ? "primary" : ""}`} onClick={() => setF({ ...f, kind: "want" })}>🔎 Je cherche</button>
              <button type="button" className={`btn sm ${f.kind === "have" ? "primary" : ""}`} onClick={() => setF({ ...f, kind: "have" })}>📦 J'ai en double</button>
            </div>
            <div className="trade-fields">
              <label>Saison
                <select className="input" value={f.series} onChange={(e) => setF({ ...f, series: e.target.value })}>
                  {series.map((s) => <option key={s.id} value={s.code}>{s.code}</option>)}
                </select>
              </label>
              <label>N°
                <input className="input" value={f.num} onChange={(e) => setF({ ...f, num: e.target.value })} placeholder="ex. 3" maxLength={12} inputMode="text" />
              </label>
              <label className="grow">Nom (facultatif)
                <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Episte" maxLength={80} />
              </label>
              <label>Rareté
                <select className="input" value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })}>
                  <option value="">Non précisée</option>
                  {RARITIES[t].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              {FINISHES_OF[t] && (
                <label>Finition
                  <select className="input" value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })}>
                    <option value="">Normale</option>
                    {FINISHES_OF[t].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              )}
              <label className="qty">Nombre
                <input className="input" type="number" min={1} max={99} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
              </label>
              <label>{f.kind === "want" ? "Je veux" : "Je propose"}
                <select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  {Object.entries(f.kind === "have" ? MODES_HAVE : MODES_WANT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {f.mode !== "trade" && (
                <label>{f.kind === "want" ? "Prix max (€)" : "Prix (€)"}
                  <input className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="facultatif" inputMode="decimal" maxLength={8} />
                </label>
              )}
              <button className="btn primary" disabled={busy || !series.length}>Ajouter</button>
            </div>
          </form>
          {!series.length && <p className="muted small">Aucune saison pour ce jeu : l'administrateur doit en ajouter.</p>}
          <div className="trade-lists">
            <div>
              <h3>🔎 Je cherche <span className="muted small">({mine.filter((x) => x.kind === "want").length})</span></h3>
              {!mine.some((x) => x.kind === "want") && <p className="muted small">Rien pour l'instant.</p>}
              {mine.filter((x) => x.kind === "want").map((r) => row(r, <button className="btn sm ghost" onClick={() => del(r)} aria-label="Retirer" title="Retirer">✕</button>))}
            </div>
            <div>
              <h3>📦 En double <span className="muted small">({mine.filter((x) => x.kind === "have").length})</span></h3>
              {!mine.some((x) => x.kind === "have") && <p className="muted small">Rien pour l'instant.</p>}
              {mine.filter((x) => x.kind === "have").map((r) => row(r, <button className="btn sm ghost" onClick={() => del(r)} aria-label="Retirer" title="Retirer">✕</button>))}
            </div>
          </div>
          <p className="muted small">Vous êtes prévenu (si les notifications sont activées) quand quelqu'un ajoute une carte que vous cherchez, ou cherche une de vos cartes en double.</p>
        </>
      )}

      {view === "matches" && all !== null && (
        <>
          {cross.length > 0 && (
            <div className="trade-cross">
              <h3>🔁 Échanges croisés possibles</h3>
              <p className="muted small" style={{ marginTop: -2 }}>Ces joueurs ont une carte que vous cherchez et cherchent une de vos cartes en double.</p>
              {cross.map((u) => (
                <div key={u.user} className="trade-cross-item">
                  <div className="row" style={{ alignItems: "center" }}>
                    <b className="grow">{u.name}</b>
                    <span className={`trade-fair ${u.same ? "eq" : u.known ? "neq" : ""}`} title="Comparaison des raretés (et du nombre de cartes) de ce que vous recevez et de ce que vous donnez">
                      {u.same
                        ? "≈ valeur équivalente (même rareté)"
                        : !u.known
                          ? "rareté non précisée"
                          : u.oneRank
                            ? `même rareté, ${u.nGet} carte${u.nGet > 1 ? "s" : ""} contre ${u.nGive}`
                            : u.diff > 0
                              ? "vous recevez plus de valeur"
                              : "vous donnez plus de valeur"}
                    </span>
                  </div>
                  <div className="small">Vous recevez : {u.get.map((m) => cardText(m.other)).join(" ; ")}</div>
                  <div className="small">Vous donnez : {u.give.map((m) => cardText(m.mine)).join(" ; ")}</div>
                  <button
                    className="btn sm primary"
                    style={{ marginTop: 6 }}
                    onClick={() => messageTo(go, u.user, u.name, `Bonjour ! Échange possible : tu as ${u.get.map((m) => cardSay(m.other)).join(", ")} que je cherche, et je peux te donner ${u.give.map((m) => cardSay(m.mine)).join(", ")} que tu cherches. Ça te dit ?`)}
                  >
                    ✉ Proposer l'échange
                  </button>
                </div>
              ))}
            </div>
          )}
          {!matches.length && <p className="muted small">Aucune correspondance pour l'instant. Ajoutez des cartes à vos listes : dès qu'un joueur a ce que vous cherchez (ou cherche vos doubles), il apparaît ici.</p>}
          {matches.map((m) => (
            <div key={m.mine.id + m.other.id} className="trade-row">
              <span className="grow">
                {m.mine.kind === "want" ? (
                  <><b>{m.other.uname}</b> a <b>{cardText(m.other)}</b> en double<span className="muted small"> · {modeText(m.other)}{priceText(m.other)}</span></>
                ) : (
                  <><b>{m.other.uname}</b> cherche <b>{cardText(m.mine)}</b>, que vous avez en double<span className="muted small"> · {modeText(m.other)}{priceText(m.other)}</span></>
                )}
              </span>
              <button className="btn sm primary" onClick={() => messageTo(go, m.other.user, m.other.uname, draft(m))}>✉ Message</button>
            </div>
          ))}
        </>
      )}

      {view === "all" && all !== null && (
        <>
          <div className="row" style={{ gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
            <select className="input" style={{ width: "auto" }} value={qs} onChange={(e) => setQs(e.target.value)}>
              <option value="">Toutes les saisons</option>
              {series.map((s) => <option key={s.id} value={s.code}>{s.code}</option>)}
            </select>
            <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un numéro, un nom, un joueur" style={{ minWidth: 160 }} />
          </div>
          {!filtered.length && <p className="muted small">Aucune carte.</p>}
          {filtered.slice(0, 300).map((o) => (
            <div key={o.id} className="trade-row">
              <span className={`trade-k ${o.kind}`}>{o.kind === "have" ? "📦" : "🔎"}</span>
              <span className="grow">
                <b>{cardText(o)}</b>
                <span className="muted small"> · {o.uname} {o.kind === "have" ? "l'a en double" : "la cherche"} · {modeText(o)}{priceText(o)}</span>
              </span>
              <button className="btn sm ghost" onClick={() => messageTo(go, o.user, o.uname, draftAll(o))} title={`Écrire à ${o.uname}`}>✉</button>
            </div>
          ))}
        </>
      )}
      {err && <p className="err small">{err}</p>}

      {admin && (
        <details className="trade-admin">
          <summary className="small">Saisons (administrateur)</summary>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
            {series.map((s) => (
              <span key={s.id} className="salon-chip">
                {s.code}
                <button className="linkish" style={{ marginLeft: 6 }} onClick={() => window.confirm(`Retirer la saison ${s.code} ? Les lignes déjà saisies restent.`) && pb.collection("series").delete(s.id).catch((e) => setErr(errMsg(e)))} aria-label={`Retirer ${s.code}`}>✕</button>
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" value={newS} onChange={(e) => setNewS(e.target.value)} placeholder="ex. S4" maxLength={12} style={{ maxWidth: 140 }} />
            <button className="btn sm" onClick={addSeries} disabled={!newS.trim()}>＋ Ajouter une saison</button>
          </div>
        </details>
      )}
    </div>
  );
}
