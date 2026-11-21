import { useEffect, useRef, useState } from "react";
import { pb, me, errMsg } from "../pb.js";
import { nameKey } from "../lib/deckrules.js";
import { currentTcg, tcgFilter } from "../lib/tcg.js";
import { TCG } from "../lib/game.js";
import { fabKey } from "../lib/deckrules.js";
import { KindPicker, PitchPicker, FabStats, FAB_CLASSES, FAB_TALENTS } from "../components/FabFields.jsx";
import { readCard, preloadOcr } from "../lib/ocr.js";
import FactionPicker from "../components/FactionPicker.jsx";
import { takeFullPhoto } from "../lib/photo.js";

// Taille d'enregistrement des cartes (assez grand pour lire l'effet en jeu)
const OUT = { p: [900, 1257], l: [1257, 900] };
const RATIO = { p: 63 / 88, l: 88 / 63 };

const toBlob = (cv, q = 0.9) => new Promise((r) => cv.toBlob(r, "image/jpeg", q));

// Ajout de cartes uniquement par l'appareil photo, dans l'appli (pas d'import de fichiers) :
// le joueur place sa carte dans un cadre au format carte et valide ; on découpe exactement le cadre.
export default function Scanner({ go }) {
  const user = me();
  const [step, setStep] = useState("intro"); // intro | camera | result
  const [orient, setOrient] = useState("p");
  const [shot, setShot] = useState(null); // canvas de la carte découpée
  const [result, setResult] = useState(null); // { url, blob }
  const [name, setName] = useState("");
  const [stats, setStats] = useState({ atk: "", val: "", def: "" });
  const [factions, setFactions] = useState([]);
  const [reading, setReading] = useState(false); // lecture automatique en cours
  const [readInfo, setReadInfo] = useState(""); // ce que la lecture a trouvé
  const [isToken, setIsToken] = useState(false); // reste actif pour toute une série
  const fab = TCG === "fab"; // Flesh and Blood : type de carte et couleur de pitch, sans lecture automatique
  const [fabKind, setFabKind] = useState("carte"); // reste actif pour toute une série
  const [pitch, setPitch] = useState("");
  const [fabCards, setFabCards] = useState([]); // { name, pitch } déjà dans la collection
  const [names, setNames] = useState(null); // noms déjà dans la collection
  const [saved, setSaved] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Engagement au premier scan (enregistré sur le compte, demandé une seule fois)
  const [pledged, setPledged] = useState(!!user.scan_pledge);
  const [pledgeOk, setPledgeOk] = useState(false);

  async function openCamera() {
    setErr("");
    if (!pledged) {
      try {
        await pb.collection("users").update(user.id, { scan_pledge: new Date().toISOString().replace("T", " ") });
        await pb.collection("users").authRefresh().catch(() => {});
        setPledged(true);
      } catch (e) {
        return setErr(errMsg(e));
      }
    }
    if (!fab) preloadOcr();
    setStep("camera");
  }

  useEffect(() => {
    pb.collection("cards").getFullList({ filter: `owner="${user.id}" && ${tcgFilter(currentTcg())}`, fields: fab ? "id,name,pitch" : "id,name" })
      .then((r) => { setNames(r.map((c) => c.name || "")); if (fab) setFabCards(r); })
      .catch(() => setNames([]));
  }, []);

  const dupOf = fab
    ? (n) => fabCards.find((x) => fabKey(x) === fabKey({ name: n, pitch }))?.name
    : (n) => (names || []).find((x) => nameKey(x) === nameKey(n));

  async function show(cv) {
    const blob = await toBlob(cv);
    if (result) URL.revokeObjectURL(result.url);
    setShot(cv);
    setResult({ url: URL.createObjectURL(blob), blob });
  }

  // Photo prise : affichage, puis lecture automatique du nom et des valeurs (cartes portrait)
  async function onCapture(cv, o) {
    setErr("");
    setOrient(o);
    await show(cv);
    setStep("result");
    setStats({ atk: "", val: "", def: "" });
    setFactions([]);
    setReadInfo("");
    if (fab) return setReadInfo("Saisissez le nom de la carte et sa couleur de pitch.");
    if (o !== "p") return setReadInfo("Carte paysage : saisissez le nom à la main.");
    setReading(true);
    try {
      const r = await readCard(cv);
      if (r.name) setName((cur) => cur || r.name);
      setStats({ atk: r.atk, val: r.val, def: r.def });
      if (r.factions?.length) setFactions(r.factions);
      const found = [r.name && "nom", r.factions?.length && "factions", (r.atk || r.val || r.def) && "valeurs"].filter(Boolean);
      setReadInfo(found.length ? `Lu automatiquement : ${found.join(", ")}. Vérifiez et corrigez si besoin.` : "Rien n'a pu être lu : saisissez le nom à la main.");
    } finally {
      setReading(false);
    }
  }

  // Carte tenue à l'envers dans le cadre : rotation d'un demi-tour
  async function flip() {
    const c = document.createElement("canvas");
    c.width = shot.width;
    c.height = shot.height;
    const ctx = c.getContext("2d");
    ctx.translate(c.width, c.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(shot, 0, 0);
    await show(c);
  }

  async function save() {
    const nm = name.trim();
    if (!nm) return setErr("Donnez le nom de la carte.");
    const dup = dupOf(nm);
    if (dup && fab) return setErr(`« ${dup} » de cette couleur est déjà dans votre collection : inutile de la scanner à nouveau, le deck permet plusieurs exemplaires.`);
    if (dup) return setErr(`« ${dup} » est déjà dans votre collection : inutile de la scanner à nouveau, le deck permet d'en mettre 2 exemplaires. Pour une autre version de la carte, ajoutez un repère au nom (ex. « ${nm} UR »).`);
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("owner", user.id);
      fd.append("tcg", currentTcg());
      fd.append("name", nm);
      fd.append("orient", orient);
      fd.append("kind", fab ? fabKind : isToken ? "jeton" : "carte");
      if (fab) fd.append("pitch", fabKind === "carte" ? pitch : "");
      for (const k of ["atk", "val", "def"]) fd.append(k, (stats[k] || "").trim().slice(0, 6));
      fd.append("factions", JSON.stringify(factions));
      fd.append("image", new File([result.blob], "scan.jpg", { type: "image/jpeg" }));
      await pb.collection("cards").create(fd);
      URL.revokeObjectURL(result.url);
      setNames((l) => [...(l || []), nm]);
      if (fab) setFabCards((l) => [...l, { name: nm, pitch: fabKind === "carte" ? pitch : "" }]);
      setSaved((n) => n + 1);
      setResult(null);
      setShot(null);
      setName("");
      setStats({ atk: "", val: "", def: "" });
      setFactions([]);
      setReadInfo("");
      setStep("camera");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const tokenToggle = fab ? (
    <KindPicker value={fabKind} onChange={setFabKind} />
  ) : (
    <div className="row" style={{ marginBottom: 12 }}>
      <button className={`btn sm ${isToken ? "primary" : ""}`} onClick={() => setIsToken(!isToken)}>
        {isToken ? "✓ Cartes jetons" : "Cartes jetons ?"}
      </button>
      <span className="muted small grow">
        {isToken ? "Iront dans la réserve à côté du tapis, copies illimitées." : "Cartes normales, pour le deck."}
      </span>
    </div>
  );

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => go("home")} aria-label="Retour">←</button>
        <h1>Scanner</h1>
        {saved > 0 && <span className="chip">{saved} enregistrée{saved > 1 ? "s" : ""}</span>}
      </div>
      {err && <div className="err">{err}</div>}

      {step === "intro" && (
        <div className="card-box">
          <h2>Ajouter des cartes</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Les cartes s'ajoutent avec l'appareil photo, depuis l'appli. Un cadre au format carte s'affiche : placez votre carte
            dedans, bord à bord, puis validez. {fab ? "Vous saisissez ensuite le nom de la carte." : "Le nom et les valeurs sont ensuite lus automatiquement, à vérifier."}
          </p>
          <ul className="muted small tips">
            <li>Téléphone tenu à 15-20 cm, bien parallèle à la carte : de plus près, il ne fait plus la mise au point.</li>
            <li>{fab ? "Cartes en largeur" : "Commandants et cartes en largeur"} : touchez « Carte en largeur ? » pour coucher le cadre.</li>
            <li>Lumière de côté ou indirecte : une lampe juste au-dessus fait des reflets, surtout sur les cartes holographiques.</li>
            {fab ? (
              <li>Chaque carte ne s'ajoute qu'une fois (nom et couleur de pitch) : le deck permet plusieurs exemplaires.</li>
            ) : (
              <li>Chaque carte ne s'ajoute qu'une fois (par son nom) : le deck permet d'en mettre 2 exemplaires.</li>
            )}
          </ul>
          {tokenToggle}
          {!pledged && (
            <label className="init-toggle pledge">
              <input type="checkbox" checked={pledgeOk} onChange={(e) => setPledgeOk(e.target.checked)} />
              <span>
                <b>Je n'ajoute que des cartes que je possède, en les photographiant moi-même.</b>
                <span className="muted small"> Pas d'images trouvées en ligne ni photographiées sur un écran. En cas d'abus, le compte peut être supprimé (<a href={`${window.location.pathname}?infos`} target="_blank" rel="noreferrer">règles d'usage</a>).</span>
              </span>
            </label>
          )}
          <button className="btn primary" onClick={openCamera} disabled={!pledged && !pledgeOk}>Ouvrir l'appareil photo</button>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => go("library")}>Voir mes cartes ({names?.length ?? "…"})</button>
        </div>
      )}

      {step === "camera" && <Camera orient={orient} setOrient={setOrient} onCapture={onCapture} onClose={() => setStep("intro")} />}

      {step === "result" && result && (
        <>
          <div className="scan-result">
            <img src={result.url} alt="Carte photographiée" />
          </div>
          <div className="row" style={{ justifyContent: "center", margin: "8px 0" }}>
            <button className="btn sm" onClick={flip}>↻ Retourner (carte à l'envers)</button>
          </div>
          {reading && <div className="card-box small" style={{ padding: "8px 12px" }}>Lecture du nom et des valeurs…</div>}
          {!reading && readInfo && <div className="muted small" style={{ marginBottom: 8 }}>{readInfo}</div>}
          <div className="field">
            <label>Nom de la carte (obligatoire)</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(""); }}
              placeholder={fab ? "Ex. Snatch" : "Ex. Potion rouge"}
              maxLength={120}
            />
            {name.trim() && dupOf(name) && <div className="warn small">Déjà dans votre collection.</div>}
          </div>
          {fab ? (
            <>
              {fabKind === "carte" && <PitchPicker value={pitch} onChange={setPitch} />}
              <FabStats stats={stats} setStats={setStats} />
              <FactionPicker value={factions} onChange={setFactions} list={FAB_CLASSES} extra={FAB_TALENTS} label="Classes et talents" />
            </>
          ) : (
            <>
              <StatsFields stats={stats} setStats={setStats} />
              <FactionPicker value={factions} onChange={setFactions} />
            </>
          )}
          {tokenToggle}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => { setErr(""); setStep("camera"); }}>↺ Reprendre la photo</button>
            <span className="grow" />
            <button className="btn primary" onClick={save} disabled={busy || reading || !name.trim() || !!dupOf(name)}>Enregistrer et scanner la suivante</button>
          </div>
        </>
      )}
    </div>
  );
}

// ATK / Valeur / DEF : facultatifs (la carte reste lisible en jeu en la touchant)
export function StatsFields({ stats, setStats }) {
  const f = (k, label) => (
    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
      <label>{label}</label>
      <input
        className="input stat-in"
        value={stats[k] || ""}
        inputMode="numeric"
        maxLength={6}
        onChange={(e) => setStats({ ...stats, [k]: e.target.value })}
        placeholder="–"
      />
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        {f("atk", "ATK")}
        {f("val", "Valeur")}
        {f("def", "DEF")}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>Facultatif. Une magie n'a qu'une Valeur.</div>
    </div>
  );
}

// Position du cadre dans la zone de visée (px), au format carte, le plus grand possible
function frameRect(cw, ch, orient) {
  // Cadre volontairement moyen : le téléphone se tient à 15-20 cm, distance où la mise au point se fait bien
  const r = RATIO[orient];
  const K = orient === "p" ? 0.6 : 0.7;
  let fw = cw * K, fh = fw / r;
  if (fh > ch * 0.62) {
    fh = ch * 0.62;
    fw = fh * r;
  }
  return { x: (cw - fw) / 2, y: (ch - fh) / 2, w: fw, h: fh };
}

// Viseur plein écran avec cadre-guide ; « Valider » découpe exactement la zone du cadre
function Camera({ orient, setOrient, onCapture, onClose }) {
  const boxRef = useRef();
  const videoRef = useRef();
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [fail, setFail] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFail("Cet appareil ou ce navigateur ne donne pas accès à l'appareil photo. Utilisez votre téléphone (Chrome ou Safari).");
        return;
      }
      try {
        const st = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 }, aspectRatio: { ideal: 4 / 3 } },
        });
        if (!alive) return st.getTracks().forEach((t) => t.stop());
        streamRef.current = st;
        // Mise au point continue quand l'appareil le permet (Android)
        const track = st.getVideoTracks()[0];
        try {
          const caps = track.getCapabilities?.() || {};
          if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        } catch (_) {}
        const v = videoRef.current;
        v.srcObject = st;
        await v.play().catch(() => {});
        setReady(true);
      } catch (e) {
        setFail(
          e?.name === "NotAllowedError"
            ? "Accès à l'appareil photo refusé. Autorisez-le dans les réglages du navigateur pour ce site, puis réessayez."
            : "Impossible d'ouvrir l'appareil photo. Aucun appareil photo trouvé, ou il est utilisé par une autre application."
        );
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const upd = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fail]);

  async function capture() {
    const v = videoRef.current;
    if (!v?.videoWidth || !box.w || shooting) return;
    // La vidéo remplit la zone (object-fit: cover) : conversion du cadre affiché en pixels de la vidéo
    const s = Math.max(box.w / v.videoWidth, box.h / v.videoHeight);
    const ox = (box.w - v.videoWidth * s) / 2, oy = (box.h - v.videoHeight * s) / 2;
    const f = frameRect(box.w, box.h, orient);
    const vx = (f.x - ox) / s, vy = (f.y - oy) / s, vw = f.w / s, vh = f.h / s;
    // Image de secours tout de suite (flux vidéo), puis tentative de vraie photo pleine résolution
    const [W, H] = OUT[orient];
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, vx, vy, vw, vh, 0, 0, W, H);
    setShooting(true);
    const ph = await takeFullPhoto(streamRef.current?.getVideoTracks()[0], v);
    if (ph) ctx.drawImage(ph.src, ph.x + vx * ph.k, ph.y + vy * ph.k, vw * ph.k, vh * ph.k, 0, 0, W, H);
    setShooting(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(c, orient);
  }

  if (fail) {
    return (
      <div className="card-box">
        <p className="err" style={{ marginTop: 0 }}>{fail}</p>
        <button className="btn" onClick={onClose}>Retour</button>
      </div>
    );
  }

  const f = box.w ? frameRect(box.w, box.h, orient) : null;
  return (
    <>
      <div className="cam2" ref={boxRef}>
        <video ref={videoRef} playsInline muted />
        {f && (
          <svg width={box.w} height={box.h}>
            {/* zone sombre autour du cadre */}
            <path
              fillRule="evenodd"
              fill="rgba(0,0,0,.6)"
              d={`M0,0H${box.w}V${box.h}H0Z M${f.x},${f.y}V${f.y + f.h}H${f.x + f.w}V${f.y}Z`}
            />
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.w * 0.045} fill="none" stroke="#d6be8c" strokeWidth="3" />
            {[[f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1]].map(([x, y, dx, dy], i) => (
              <path key={i} d={`M${x + dx * 26},${y} L${x},${y} L${x},${y + dy * 26}`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
            ))}
          </svg>
        )}
        <div className="cam-hint">
          {!ready
            ? "Ouverture de l'appareil photo…"
            : shooting
              ? "Photo… ne bougez plus"
              : "Téléphone à 15-20 cm : la carte remplit le cadre, sans reflet"}
        </div>
      </div>
      <div className="row cam-bar">
        <button className="btn ghost" onClick={onClose}>Fermer</button>
        <button className="btn" onClick={() => setOrient(orient === "p" ? "l" : "p")}>
          {orient === "p" ? "Carte en largeur ?" : "Carte en hauteur ?"}
        </button>
        <span className="grow" />
        <button className="btn primary cam-shot" onClick={capture} disabled={!ready || shooting}>{shooting ? "Photo…" : "Valider"}</button>
      </div>
    </>
  );
}
