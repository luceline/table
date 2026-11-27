// Carte du jour : retrouver une carte à partir d'un morceau de son illustration (5 essais, l'image se dévoile un peu
// plus à chaque erreur). Points du mois, série de jours avec un joker par semaine, partage sans dévoiler la réponse.
import { useEffect, useMemo, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { PUBLIC_TCGS as TCG_LIST, currentTcg, tcgName, tcgExternal } from "../lib/tcg.js";

const CROP = [0.16, 0.26, 0.4, 0.6, 0.85]; // part de la largeur visible selon le nombre d'essais déjà faits
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ").trim();

export const loadDaily = (tcg) => pb.send(`/api/table/daily?tcg=${tcg}`, { requestKey: null });

// Morceau de l'image dessiné dans un canevas (l'image entière n'apparaît qu'à la fin)
function Reveal({ img, fx, fy, level, full }) {
  const ref = useRef(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (full) return;
    const im = new Image();
    im.onload = () => {
      const cv = ref.current;
      if (!cv) return;
      const S = 640;
      cv.width = S;
      cv.height = S;
      const side = Math.min(im.width, im.height) * (CROP[level] || 1);
      const x = Math.max(0, Math.min(im.width - side, im.width * fx - side / 2));
      const y = Math.max(0, Math.min(im.height - side, im.height * fy - side / 2));
      const g = cv.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(im, x, y, side, side, 0, 0, S, S);
      setOk(true);
    };
    im.src = img;
  }, [img, fx, fy, level, full]);
  if (full) return <img className="daily-full" src={img} alt="Carte du jour" />;
  return (
    <div className="daily-crop">
      <canvas ref={ref} onContextMenu={(e) => e.preventDefault()} />
      {!ok && <span className="muted small">Chargement…</span>}
    </div>
  );
}

export default function Daily({ go }) {
  const [tcg, setTcg] = useState(tcgExternal(currentTcg()) || !TCG_LIST.some((g) => g.id === currentTcg()) ? "safir" : currentTcg());
  const [st, setSt] = useState(null);
  const [board, setBoard] = useState(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const user = me();

  useEffect(() => {
    let alive = true;
    setSt(null);
    setBoard(null);
    setErr("");
    loadDaily(tcg).then((r) => alive && setSt(r)).catch((e) => alive && setErr(errMsg(e)));
    pb.send(`/api/table/daily/board?tcg=${tcg}`, { requestKey: null }).then((r) => alive && setBoard(r)).catch(() => {});
    return () => { alive = false; };
  }, [tcg]);

  const sugg = useMemo(() => {
    const q = norm(text);
    if (!st?.names || q.length < 2) return [];
    const tried = new Set((st.tries || []).map((t) => norm(t.g)));
    return st.names.filter((n) => norm(n).includes(q) && !tried.has(norm(n))).slice(0, 6);
  }, [text, st]);

  async function send(g) {
    const guess = (g ?? text).trim();
    if (!guess || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await pb.send("/api/table/daily/guess", { method: "POST", body: { tcg, guess }, requestKey: null });
      setSt(r);
      setText("");
      if (r.done) pb.send(`/api/table/daily/board?tcg=${tcg}`, { requestKey: null }).then(setBoard).catch(() => {});
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const n = st?.tries?.length || 0;
  const shareText = st?.done
    ? `🃏 Carte du jour ${tcgName(tcg)} n°${st.num} : ${st.found ? `trouvée en ${n} essai${n > 1 ? "s" : ""}` : "pas trouvée"} ${st.tries.map((t) => (t.ok ? "🟩" : "🟥")).join("")} · 🔥 ${st.streak.current} jour${st.streak.current > 1 ? "s" : ""}`
    : "";

  async function share() {
    const full = `${shareText}\n${location.origin}/?daily`;
    try {
      if (navigator.share) await navigator.share({ text: full });
      else {
        await navigator.clipboard.writeText(full);
        setMsg("Copié : collez-le où vous voulez.");
      }
    } catch (_) {}
  }
  async function postToSalon() {
    setErr("");
    try {
      const r = await pb.send("/api/table/daily/share", { method: "POST", body: { tcg }, requestKey: null });
      setMsg(`Partagé dans # ${r.name}.`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="page daily">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1 className="grow">🃏 Carte du jour</h1>
      </div>
      {TCG_LIST.length > 1 && (
        <div className="row daily-tcg">
          {TCG_LIST.map((g) => (
            <button key={g.id} className={`btn sm ${tcg === g.id ? "primary" : ""}`} onClick={() => setTcg(g.id)}>{g.name}</button>
          ))}
        </div>
      )}
      {!st && !err && <p className="muted">Chargement…</p>}
      {st?.empty && <div className="card-box"><p>Pas encore de carte du jour pour {tcgName(tcg)} : il faut d'abord des cartes scannées avec leur nom.</p></div>}
      {st && !st.empty && (
        <div className="card-box">
          <div className="row" style={{ alignItems: "baseline" }}>
            <h2 className="grow" style={{ margin: 0 }}>n°{st.num} · {tcgName(tcg)}</h2>
            <span className="daily-streak" title="Jours de suite à la carte du jour (un jour manqué par semaine est pardonné)">🔥 {st.streak.current}</span>
          </div>
          <Reveal img={st.img} fx={st.fx} fy={st.fy} level={Math.min(n, 4)} full={st.done} />
          {st.done ? (
            <div className="daily-end">
              <p className="daily-answer">{st.found ? "🎉 Bravo ! " : "Raté… "}C'était <b>{st.answer}</b>.</p>
              <p className="small">{st.found ? `Trouvée en ${n} essai${n > 1 ? "s" : ""} : +${st.score} point${st.score > 1 ? "s" : ""} ce mois-ci.` : "0 point aujourd'hui, mais votre série continue."} Nouvelle carte demain à minuit.</p>
              <div className="daily-share">{shareText}</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn primary" onClick={postToSalon}>💬 Partager dans le salon</button>
                <button className="btn" onClick={share}>📤 Partager ailleurs</button>
              </div>
              {msg && <p className="small ok-text">{msg}</p>}
            </div>
          ) : (
            <>
              <p className="small">Quelle est cette carte ? Essai <b>{n + 1}</b> sur {st.max} : à chaque erreur, l'image se dévoile un peu plus.</p>
              {(st.hint || st.shape?.length > 0) && (
                <p className="small daily-hint">
                  Indice : {st.hint && <>commence par <b>{st.hint}</b></>}
                  {st.shape?.length > 0 && <> · {st.shape.map((w) => "_".repeat(w).split("").join(" ")).join("   ")} ({st.shape.join(" + ")} lettres)</>}
                </p>
              )}
              <form className="daily-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nom de la carte" autoComplete="off" maxLength={120} />
                <button className="btn primary" disabled={!text.trim() || busy}>Valider</button>
              </form>
              {sugg.length > 0 && (
                <div className="daily-sugg">
                  {sugg.map((s) => <button key={s} className="salon-chip" onClick={() => send(s)}>{s}</button>)}
                </div>
              )}
            </>
          )}
          {n > 0 && (
            <div className="daily-tries small">
              {st.tries.map((t, i) => <span key={i} className={t.ok ? "ok" : "ko"}>{t.ok ? "✓" : "✗"} {t.g}</span>)}
            </div>
          )}
          {err && <p className="err small">{err}</p>}
        </div>
      )}
      {err && !st && <p className="err">{err}</p>}

      {board && board.top.length > 0 && (
        <div className="card-box">
          <h2>Classement du mois</h2>
          <ol className="daily-board">
            {board.top.map((r) => (
              <li key={r.id} className={r.id === user.id ? "me" : ""}>
                <span className="rk">{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}</span>
                <span className="grow">{r.name}</span>
                <span className="muted small">{r.found}/{r.n} trouvées</span>
                <b>{r.pts} pt{r.pts > 1 ? "s" : ""}</b>
              </li>
            ))}
          </ol>
          {board.me && board.me.rank > 10 && <p className="small">Vous : {board.me.rank}e avec {board.me.pts} point{board.me.pts > 1 ? "s" : ""}.</p>}
        </div>
      )}
      <div className="card-box">
        <h2>Règles</h2>
        <p className="small">
          Une carte par jour et par jeu, la même pour tout le monde, tirée parmi les cartes scannées par les joueurs. 5 essais.
          Points : trouvée au 1er essai 5 points, au 2e 4… au 5e 1 point. Classement remis à zéro chaque mois ; le podium gagne le badge 🥇.
          La série 🔥 compte les jours de suite où vous avez joué (trouvée ou non) ; un jour manqué par semaine est pardonné.
        </p>
      </div>
    </div>
  );
}
