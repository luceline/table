// Agenda des disponibilités, par jeu : ma semaine type, les joueurs disponibles en même temps que moi
// (30 minutes en commun au moins), et les propositions de partie reçues, envoyées et acceptées.
import { useEffect, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { Sheet } from "../components/ui.jsx";
import PushToggle from "../components/PushToggle.jsx";
import { currentTcg, tcgName } from "../lib/tcg.js";
import {
  DAYS, STEPS, hm, loadAvail, saveAvail, isPaused, nextMonday, loadMatches, loadInvites, sendInvite,
  slotText, occurrences, dayText, whenText, PREFS, PREF_BY_ID,
} from "../lib/agenda.js";

const STATUS = { pending: "en attente de réponse", accepted: "acceptée", declined: "refusée" };

export default function Agenda({ go }) {
  const user = me();
  const tcg = currentTcg();
  const [rec, setRec] = useState(undefined); // mon agenda (null : pas encore créé)
  const [slots, setSlots] = useState([]);
  const [note, setNote] = useState(""); // petit mot montré aux autres joueurs
  const [adding, setAdding] = useState(null); // { d, s, e } créneau en cours d'ajout
  const [players, setPlayers] = useState(null);
  const [invites, setInvites] = useState([]);
  const [propose, setPropose] = useState(null); // { player, slot, day, start, note }
  const [answer, setAnswer] = useState(null); // { inv, reply }
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const r = await loadAvail(user.id, tcg);
    setRec(r);
    setSlots(r?.slots || []);
    setNote(r?.note || "");
    setPlayers(await loadMatches(tcg));
    setInvites(await loadInvites(user.id, tcg));
  };
  useEffect(() => {
    refresh();
    let un = null;
    let alive = true;
    pb.collection("invites").subscribe("*", () => loadInvites(user.id, tcg).then((l) => alive && setInvites(l)), { requestKey: null })
      .then((u) => (alive ? (un = u) : Promise.resolve(u?.()).catch(() => {})))
      .catch(() => {});
    return () => { alive = false; Promise.resolve(un?.()).catch(() => {}); };
  }, []);

  async function store(next, patch = {}) {
    setErr("");
    try {
      const r = await saveAvail(rec, user.id, tcg, { slots: next, ...patch });
      setRec(r);
      setSlots(r.slots || []);
      setPlayers(await loadMatches(tcg));
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  function addSlot() {
    const { d, s, e } = adding;
    if (e <= s) return setErr("L'heure de fin doit être après l'heure de début.");
    // créneaux qui se chevauchent le même jour : fusionnés
    let list = [...slots, { d, s, e }].sort((a, b) => a.d - b.d || a.s - b.s);
    const out = [];
    for (const x of list) {
      const last = out[out.length - 1];
      if (last && last.d === x.d && x.s <= last.e) last.e = Math.max(last.e, x.e);
      else out.push({ ...x });
    }
    setAdding(null);
    store(out);
  }
  const removeSlot = (i) => store(slots.filter((_, k) => k !== i));
  const prefs = rec?.prefs || [];
  function togglePref(id) {
    const p = PREF_BY_ID[id];
    const next = prefs.includes(id) ? prefs.filter((x) => x !== id) : [...prefs.filter((x) => x !== p.not), id];
    store(slots, { prefs: next });
  }
  const saveNote = () => (note.trim() !== (rec?.note || "") ? store(slots, { note: note.trim().slice(0, 120) }) : null);
  const paused = isPaused(rec);
  const togglePause = () => store(slots, { paused_until: paused ? "" : nextMonday().toISOString().replace("T", " ") });

  function openPropose(player, slot) {
    const days = occurrences(slot);
    if (!days.length) return setErr("Ce créneau est déjà passé pour cette semaine et la suivante.");
    setPropose({ player, slot, days, day: 0, start: firstStart(slot, days[0]), note: "" });
  }
  // heures de début possibles : toutes les 30 minutes du créneau, encore à venir, 30 minutes de jeu au moins
  function starts(slot, day) {
    const out = [];
    for (let m = Math.ceil(slot.s / 30) * 30; m <= slot.e - 30; m += 30) {
      if (day.getTime() + m * 60000 > Date.now()) out.push(m);
    }
    return out;
  }
  const firstStart = (slot, day) => starts(slot, day)[0] ?? slot.s;

  async function submitPropose() {
    const { player, slot, days, day, start, note } = propose;
    const d = days[day];
    const at = new Date(d.getTime() + start * 60000);
    const end = new Date(d.getTime() + slot.e * 60000);
    setBusy(true);
    try {
      await sendInvite({ me: user, to: player.id, toName: player.name, tcg, at, end, note });
      setPropose(null);
      setInfo(`Proposition envoyée à ${player.name}. Vous serez prévenu de sa réponse.`);
      setInvites(await loadInvites(user.id, tcg));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function respond(inv, status, reply = "") {
    setErr("");
    try {
      await pb.collection("invites").update(inv.id, { status, ...(reply.trim() ? { reply: reply.trim().slice(0, 200) } : null) });
      setAnswer(null);
      setInvites(await loadInvites(user.id, tcg));
      if (status === "accepted") setInfo("Partie prévue. Le jour venu, la table se lance depuis l'accueil, rubrique « Parties prévues ».");
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const received = invites.filter((i) => i.status === "pending" && i.to === user.id);
  const sent = invites.filter((i) => i.from === user.id && i.status !== "accepted");
  const planned = invites.filter((i) => i.status === "accepted");
  const other = (i) => (i.from === user.id ? i.to_name : i.from_name);

  return (
    <div className="page agenda">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <div className="brand grow">📅 Disponibilités</div>
      </div>
      {err && <div className="err">{err}</div>}
      {info && <div className="info-msg">{info}</div>}

      {(received.length > 0 || planned.length > 0) && (
        <div className="card-box">
          {received.length > 0 && (
            <>
              <h2>Propositions reçues</h2>
              <div className="list">
                {received.map((i) => (
                  <div className="list-item inv" key={i.id}>
                    <span className="grow">
                      <b>{i.from_name}</b> vous propose {whenText(i.at, i.end)}
                      {i.note && <span className="muted small inv-note">« {i.note} »</span>}
                    </span>
                    <button className="btn sm primary" onClick={() => respond(i, "accepted")}>Accepter</button>
                    <button className="btn sm ghost" onClick={() => setAnswer({ inv: i, reply: "" })}>Refuser</button>
                  </div>
                ))}
              </div>
            </>
          )}
          {planned.length > 0 && (
            <>
              <h2 style={{ marginTop: received.length ? 16 : 0 }}>Parties prévues</h2>
              <div className="list">
                {planned.map((i) => (
                  <div className="list-item inv" key={i.id}>
                    <span className="grow">
                      Avec <b>{other(i)}</b>, {whenText(i.at, i.end)}
                      {i.reply && <span className="muted small inv-note">« {i.reply} »</span>}
                    </span>
                    <button className="btn sm ghost danger" onClick={() => confirm("Annuler cette partie ? Votre adversaire sera prévenu.") && respond(i, "cancelled")}>Annuler</button>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ margin: "8px 0 0" }}>Le jour venu, lancez ou rejoignez la table depuis l'accueil (« Parties prévues »), à partir de 30 minutes avant l'heure.</p>
            </>
          )}
        </div>
      )}

      <div className="card-box">
        <h2>Ma semaine type · {tcgName(tcg)}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Indiquez quand vous êtes disponible pour jouer à {tcgName(tcg)}, chaque semaine. Personne ne voit votre agenda : les autres joueurs
          voient seulement les créneaux que vous avez en commun avec eux (30 minutes au moins).
        </p>
        {rec === undefined ? (
          <p className="muted">Chargement…</p>
        ) : (
          <div className="week">
            {DAYS.map((name, d) => (
              <div className="week-day" key={d}>
                <span className="week-name">{name}</span>
                <span className="week-slots">
                  {slots.map((sl, i) => sl.d === d && (
                    <span className="week-slot" key={i}>
                      {hm(sl.s)} à {hm(sl.e)}
                      <button aria-label="Retirer ce créneau" onClick={() => removeSlot(i)}>✕</button>
                    </span>
                  ))}
                  <button className="btn sm ghost" onClick={() => setAdding({ d, s: 20 * 60, e: 23 * 60 })}>＋</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {slots.length > 0 && (
          <label className="init-toggle" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={paused} onChange={togglePause} />
            <span>
              <b>Pas disponible cette semaine</b>
              <span className="muted small"> : vos créneaux reviennent d'eux-mêmes lundi prochain.</span>
            </span>
          </label>
        )}
      </div>

      <div className="card-box">
        <h2>Mes préférences de jeu</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Montrées aux joueurs qui ont des créneaux en commun avec vous.</p>
        <div className="pref-chips">
          {PREFS.map((p) => (
            <button key={p.id} className={`pref-chip ${prefs.includes(p.id) ? "on" : ""}`} onClick={() => togglePref(p.id)} aria-pressed={prefs.includes(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
          <label>Un mot (facultatif)</label>
          <div className="row">
            <input
              className="input grow" maxLength={120} value={note} placeholder="Ex. : je joue surtout Kin, je cherche à progresser"
              onChange={(e) => setNote(e.target.value)} onBlur={saveNote} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            {note.trim() !== (rec?.note || "") && <button className="btn" onClick={saveNote}>OK</button>}
          </div>
        </div>
      </div>

      <div className="card-box">
        <h2>Joueurs disponibles en même temps que vous</h2>
        {!slots.length ? (
          <p className="muted small">Ajoutez d'abord vos créneaux ci-dessus.</p>
        ) : paused ? (
          <p className="muted small">Vous êtes en pause cette semaine : décochez « Pas disponible cette semaine » pour voir les joueurs.</p>
        ) : players === null ? (
          <p className="muted">Recherche…</p>
        ) : !players.length ? (
          <p className="muted small">Personne pour l'instant sur vos créneaux. Ils apparaîtront ici dès qu'un joueur ajoutera des horaires en commun avec vous.</p>
        ) : (
          <div className="list">
            {players.map((p) => (
              <div className="match" key={p.id}>
                <b>{p.name}</b>
                {(p.prefs?.length > 0 || p.note) && (
                  <div className="match-prefs">
                    {(p.prefs || []).filter((id) => PREF_BY_ID[id]).map((id) => <span key={id} className="pref-chip small on">{PREF_BY_ID[id].label}</span>)}
                    {p.note && <span className="muted small match-note">« {p.note} »</span>}
                  </div>
                )}
                {p.slots.map((sl, k) => (
                  <div className="list-item" key={k}>
                    <span className="grow small">{slotText(sl)}</span>
                    <button className="btn sm primary" onClick={() => openPropose(p, sl)}>Proposer</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <PushToggle
            onText="Vous serez prévenu sur cet appareil des propositions, des réponses, et 10 minutes avant une partie prévue."
            offText="Soyez prévenu des propositions de partie, des réponses, et 10 minutes avant une partie prévue."
          />
        </div>
      </div>

      {sent.length > 0 && (
        <div className="card-box">
          <h2>Mes propositions</h2>
          <div className="list">
            {sent.map((i) => (
              <div className="list-item inv" key={i.id}>
                <span className="grow small">
                  À <b>{i.to_name}</b>, {whenText(i.at, i.end)} : {STATUS[i.status] || i.status}
                  {i.reply && <span className="muted inv-note">« {i.reply} »</span>}
                </span>
                {i.status === "pending" && <button className="btn sm ghost" onClick={() => respond(i, "cancelled")}>Retirer</button>}
                {i.status === "declined" && <button className="btn sm ghost" aria-label="Effacer" onClick={() => pb.collection("invites").delete(i.id).then(refresh)}>✕</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title={adding ? `Créneau du ${DAYS[adding.d].toLowerCase()}` : ""}>
        {adding && (
          <>
            <div className="row">
              <div className="field grow">
                <label>De</label>
                <select className="input" value={adding.s} onChange={(e) => setAdding({ ...adding, s: +e.target.value, e: Math.max(adding.e, +e.target.value + 30) })}>
                  {STEPS.slice(0, -1).map((m) => <option key={m} value={m}>{hm(m)}</option>)}
                </select>
              </div>
              <div className="field grow">
                <label>À</label>
                <select className="input" value={adding.e} onChange={(e) => setAdding({ ...adding, e: +e.target.value })}>
                  {STEPS.filter((m) => m > adding.s).map((m) => <option key={m} value={m}>{hm(m)}</option>)}
                </select>
              </div>
            </div>
            <button className="btn primary" onClick={addSlot}>Ajouter</button>
          </>
        )}
      </Sheet>

      <Sheet open={!!propose} onClose={() => setPropose(null)} title={propose ? `Proposer une partie à ${propose.player.name}` : ""}>
        {propose && (() => {
          const day = propose.days[propose.day];
          const st = starts(propose.slot, day);
          return (
            <>
              <div className="field">
                <label>Jour</label>
                <select className="input" value={propose.day} onChange={(e) => {
                  const k = +e.target.value;
                  setPropose({ ...propose, day: k, start: firstStart(propose.slot, propose.days[k]) });
                }}>
                  {propose.days.map((d, k) => <option key={k} value={k}>{dayText(d)}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Heure de début (créneau commun jusqu'à {hm(propose.slot.e)})</label>
                <select className="input" value={propose.start} onChange={(e) => setPropose({ ...propose, start: +e.target.value })}>
                  {st.map((m) => <option key={m} value={m}>{hm(m)}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Petit mot (facultatif)</label>
                <input className="input" maxLength={200} value={propose.note} placeholder="Ex. : je viens avec mon deck Lin" onChange={(e) => setPropose({ ...propose, note: e.target.value })} />
              </div>
              <button className="btn primary" disabled={busy || !st.length} onClick={submitPropose}>Envoyer la proposition</button>
            </>
          );
        })()}
      </Sheet>

      <Sheet open={!!answer} onClose={() => setAnswer(null)} title="Refuser la proposition">
        {answer && (
          <>
            <div className="field">
              <label>Un mot pour {answer.inv.from_name} (facultatif)</label>
              <input className="input" maxLength={200} value={answer.reply} placeholder="Ex. : pas ce soir, plutôt jeudi ?" onChange={(e) => setAnswer({ ...answer, reply: e.target.value })} />
            </div>
            <button className="btn primary" onClick={() => respond(answer.inv, "declined", answer.reply)}>Refuser</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
