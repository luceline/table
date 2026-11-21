import { useEffect, useRef, useState } from "react";
import { pb } from "../pb.js";
import { Mesh, rtcOk, camId } from "../lib/rtc.js";
import { CamVideo } from "../components/CamView.jsx";

const MAX_SPEC = 4; // spectateurs servis en direct par le téléphone (au-delà, sa connexion saturerait)

// Téléphone caméra d'un joueur filmé (lien ?cam=CODE&p=JOUEUR&k=CLÉ, sans compte) :
// filme le tapis réel et l'envoie en direct à l'adversaire, au joueur lui-même (aperçu) et à quelques spectateurs.
export default function Cam({ code, player, camKey }) {
  const q = { spectate: code };
  const [game, setGame] = useState(null);
  const [err, setErr] = useState("");
  const [track, setTrack] = useState(null);
  const [stream, setStream] = useState(null);
  const [facing, setFacing] = useState("environment");
  // Caméras disponibles (webcam d'ordinateur, caméras avant/arrière) et caméra choisie, mémorisée sur l'appareil
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return localStorage.getItem("table_cam_device") || "";
    } catch (_) {
      return "";
    }
  });
  const [peers, setPeers] = useState({});
  const [portrait, setPortrait] = useState(false);
  const [wake, setWake] = useState(null); // true / false (non disponible)
  const meshRef = useRef(null);
  const gameRef = useRef(null);
  const trackRef = useRef(null);

  // Partie (lecture comme un spectateur)
  useEffect(() => {
    let alive = true, un = null;
    (async () => {
      try {
        const g = await pb.collection("games").getFirstListItem(`code="${code}"`, { query: q });
        if (!alive) return;
        if (g.p1 !== player && g.p2 !== player) throw new Error();
        gameRef.current = g;
        setGame(g);
        un = await pb.collection("games").subscribe(g.id, (e) => {
          const before = gameRef.current;
          gameRef.current = e.record;
          setGame(e.record);
          // l'adversaire vient de s'asseoir : on lui envoie l'image
          const opp = e.record.p1 === player ? e.record.p2 : e.record.p1;
          const oppBefore = before?.p1 === player ? before?.p2 : before?.p1;
          if (opp && opp !== oppBefore) meshRef.current?.touch(opp);
        }, { query: q });
      } catch (_) {
        if (alive) setErr("Lien caméra invalide ou partie terminée. Rouvrez le QR code depuis la table.");
      }
    })();
    return () => {
      alive = false;
      un?.();
    };
  }, [code, player]);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const upd = () => setPortrait(mq.matches);
    upd();
    mq.addEventListener?.("change", upd);
    return () => mq.removeEventListener?.("change", upd);
  }, []);

  async function openCam(face, devId) {
    const size = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 24, max: 30 } };
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: devId ? { deviceId: { exact: devId }, ...size } : { facingMode: { ideal: face }, ...size },
      });
    } catch (e) {
      if (!devId || e?.name === "NotAllowedError") throw e;
      // caméra mémorisée débranchée : caméra par défaut
      s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: face }, ...size } });
    }
    const t = s.getVideoTracks()[0];
    try {
      t.contentHint = "detail"; // privilégier la netteté (texte des cartes)
    } catch (_) {}
    // liste des caméras (les noms ne sont connus qu'une fois l'accès autorisé)
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDevices(list.map((d, i) => ({ id: d.deviceId, label: d.label || `Caméra ${i + 1}` })));
      const cur = t.getSettings?.().deviceId;
      if (cur) setDeviceId(cur);
      const fm = t.getSettings?.().facingMode;
      if (fm) setFacing(fm);
    } catch (_) {}
    return { s, t };
  }

  // Choisir une autre caméra dans la liste (ex. webcam USB au-dessus du tapis)
  async function pickDevice(id) {
    try {
      const { s, t } = await openCam(facing, id);
      const old = trackRef.current;
      trackRef.current = t;
      setTrack(t);
      setStream(s);
      await meshRef.current?.setVideo(t); // la nouvelle image part d'abord, l'ancienne caméra est coupée ensuite
      old?.stop();
      try {
        localStorage.setItem("table_cam_device", id);
      } catch (_) {}
    } catch (_) {
      setErr("Impossible d'ouvrir cette caméra : est-elle utilisée par une autre application ?");
    }
  }

  async function start() {
    setErr("");
    try {
      const { s, t } = await openCam(facing, deviceId);
      trackRef.current = t;
      setTrack(t);
      setStream(s);
      const g = gameRef.current;
      const m = new Mesh({
        gameId: g.id,
        self: camId(player),
        query: q,
        offerExtra: { key: camKey },
        onBusy: true,
        plan: (peer) => {
          const gg = gameRef.current;
          const opp = gg.p1 === player ? gg.p2 : gg.p1;
          if (peer === player) return { offer: true, video: "send", videoMax: 700000, videoScale: 2 }; // aperçu du joueur
          if (opp && peer === opp) return { offer: true, video: "send", videoMax: 2500000 };
          if (peer.startsWith("spec-") && (m.peers.has(peer) || m.count("spec-") < MAX_SPEC)) {
            return { offer: true, video: "send", videoMax: 450000, videoScale: 2 };
          }
          return null;
        },
        onPeer: (id, info) =>
          setPeers((cur) => {
            const n = { ...cur };
            if (info) n[id] = info.state;
            else delete n[id];
            return n;
          }),
      });
      m.setVideo(t);
      meshRef.current = m;
      const opp = g.p1 === player ? g.p2 : g.p1;
      m.start([player, opp].filter(Boolean));
      keepAwake();
    } catch (e) {
      setErr(e?.name === "NotAllowedError" ? "Accès à la caméra refusé : autorisez-le pour ce site dans les réglages du navigateur." : "Impossible d'ouvrir la caméra : est-elle branchée, ou utilisée par une autre application (visio, autre onglet) ?");
    }
  }

  async function switchCam() {
    const nf = facing === "environment" ? "user" : "environment";
    try {
      const { s, t } = await openCam(nf);
      const old = trackRef.current;
      trackRef.current = t;
      setTrack(t);
      setStream(s);
      setFacing(nf);
      await meshRef.current?.setVideo(t);
      old?.stop();
    } catch (_) {}
  }

  // Écran toujours allumé pendant la partie (sinon la caméra s'arrête à la mise en veille)
  async function keepAwake() {
    try {
      if (!navigator.wakeLock) return setWake(false);
      const lock = await navigator.wakeLock.request("screen");
      setWake(true);
      lock.addEventListener?.("release", () => setWake(false));
    } catch (_) {
      setWake(false);
    }
  }
  useEffect(() => {
    const vis = () => document.visibilityState === "visible" && meshRef.current && keepAwake();
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  useEffect(() => () => {
    meshRef.current?.stop();
    trackRef.current?.stop();
  }, []);

  function stop() {
    meshRef.current?.stop();
    meshRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
    setTrack(null);
    setStream(null);
    setPeers({});
  }

  const g = game;
  const opp = g ? (g.p1 === player ? g.p2 : g.p1) : "";
  const me = g ? (g.p1 === player ? g.n1 : g.n2) : "";
  const oppName = g ? (g.p1 === player ? g.n2 : g.n1) : "";
  const st = (id) => peers[id];
  const lbl = (s) => (s === "connected" ? "✓ reçoit l'image" : s === "failed" || s === "disconnected" ? "connexion perdue…" : s ? "connexion…" : "en attente");
  const nSpec = Object.entries(peers).filter(([id, s]) => id.startsWith("spec-") && s === "connected").length;

  if (!rtcOk()) {
    return (
      <div className="page"><div className="card-box"><h2>Caméra</h2><p className="err">Ce navigateur ne permet pas la vidéo en direct. Essayez Chrome ou Safari à jour.</p></div></div>
    );
  }

  return (
    <div className="cam-page">
      {stream ? (
        <div className="cam-stage">
          <CamVideo stream={stream} mirror={facing === "user"} className="cam-preview" />
          <div className="cam-guide"><span>Cadrez votre tapis dans ce rectangle</span></div>
        </div>
      ) : (
        <div className="cam-intro">
          <h2>🎥 Caméra de la table</h2>
          {g && <p>Partie <b>{g.code}</b> · vous filmez le tapis de <b>{me || "votre joueur"}</b>{oppName ? <> pour <b>{oppName}</b></> : null}.</p>}
          <ol className="small">
            <li>Placez la caméra au-dessus du tapis : téléphone (caméra arrière vers le bas, à l'horizontale) ou webcam d'ordinateur.</li>
            <li>Touchez « Démarrer la caméra » et autorisez l'accès. Avec plusieurs caméras, choisissez la bonne dans la liste en bas.</li>
            <li>Cadrez tout le tapis dans le rectangle. Le son passe par l'écran de jeu.</li>
          </ol>
          {err && <p className="err">{err}</p>}
          <button className="btn primary" onClick={start} disabled={!g}>Démarrer la caméra</button>
        </div>
      )}
      {stream && (
        <div className="cam-hud">
          <div className="cam-hud-row">
            <span className="cam-live">● EN DIRECT</span>
            <span>{oppName || "Adversaire"} : {opp ? lbl(st(opp)) : "pas encore à la table"}</span>
            <span>Votre écran : {lbl(st(player))}</span>
            {nSpec > 0 && <span>👁 {nSpec}</span>}
          </div>
          {portrait && <div className="cam-warn">Tournez le téléphone à l'horizontale pour filmer tout le tapis.</div>}
          {wake === false && <div className="cam-warn">Désactivez la mise en veille de l'écran pendant la partie, sinon la caméra se coupe.</div>}
          {err && <div className="cam-warn">{err}</div>}
          <div className="cam-hud-row">
            {devices.length > 1 ? (
              <select className="input cam-select" value={deviceId} onChange={(e) => pickDevice(e.target.value)} aria-label="Caméra">
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            ) : (
              <button className="btn sm" onClick={switchCam}>Changer de caméra</button>
            )}
            <button className="btn sm ghost" onClick={stop}>Arrêter</button>
          </div>
        </div>
      )}
    </div>
  );
}
