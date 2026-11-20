// Vidéo et vocal en direct côté joueur (écran Table) : vocal avec l'adversaire, son envoyé aux spectateurs,
// réception de la caméra d'un joueur filmé (le mien en aperçu, celui de l'adversaire à la place de son tapis).
import { useEffect, useRef, useState } from "react";
import { pb } from "../pb.js";
import { Mesh, rtcOk, getMic, audioOut, camId, rnd } from "./rtc.js";

export function useTableRtc({ gameId, userId, meta, mine, opp }) {
  const [peers, setPeers] = useState({}); // id -> { state, stream, v }
  const [mic, setMic] = useState(false);
  const [oppMic, setOppMic] = useState(false);
  const [oppMuted, setOppMuted] = useState(false);
  const [specHear, setSpecHearS] = useState(() => {
    try {
      return localStorage.getItem("table_spec_hear") !== "0";
    } catch (_) {
      return true;
    }
  });
  const [camKey, setCamKey] = useState("");
  const meshRef = useRef(null);
  const micRef = useRef(null);
  const specHearRef = useRef(specHear);
  specHearRef.current = specHear;
  const ctx = useRef({});
  ctx.current = { meta, mine, opp, camKey };
  const oppKeys = useRef({});
  const touched = useRef(new Set());
  const oppId = meta ? (meta.p1 === userId ? meta.p2 : meta.p1) || "" : "";
  const ok = rtcOk();

  useEffect(() => {
    if (!ok || !gameId || !userId) return;
    const otherOf = (m) => (m ? (m.p1 === userId ? m.p2 : m.p1) || "" : "");
    const m = new Mesh({
      gameId,
      self: userId,
      plan: (peer) => {
        const { meta, mine, opp } = ctx.current;
        if (!meta) return null;
        const oid = otherOf(meta);
        if (oid && peer === oid) return { offer: meta.p1 === userId, audio: "sendrecv", data: true };
        if (peer.startsWith("cam-")) {
          const x = peer.slice(4);
          return (x === userId && mine?.filmed) || (x === oid && opp?.filmed) ? { offer: false, video: "recv" } : null;
        }
        if (peer.startsWith("spec-")) return { offer: true, audio: "send" };
        return null;
      },
      // Une caméra doit présenter la clé du joueur filmé (que les spectateurs ne connaissent pas)
      accept: async (peer, data) => {
        if (!peer.startsWith("cam-")) return true; // offre d'un joueur : le serveur garantit l'expéditeur
        const x = peer.slice(4);
        if (!data.key) return false;
        if (x === userId) return data.key === ctx.current.camKey;
        if (oppKeys.current[x] !== data.key) {
          oppKeys.current[x] = await pb
            .collection("cams")
            .getFirstListItem(`game="${gameId}" && player="${x}"`)
            .then((r) => r.key)
            .catch(() => "");
        }
        return oppKeys.current[x] === data.key;
      },
      onPeer: (id, info) => {
        setPeers((cur) => {
          const n = { ...cur };
          if (info) n[id] = { ...info, v: (cur[id]?.v || 0) + 1 };
          else delete n[id];
          return n;
        });
        if (!id.startsWith("cam-") && !id.startsWith("spec-")) {
          audioOut.set(id, info?.stream || null);
          if (!info || info.state === "failed" || info.state === "closed") setOppMic(false);
        }
      },
      onCtl: (id, o) => {
        if (o && "mic" in o) setOppMic(!!o.mic);
      },
    });
    m.audioTo = (peer) => !peer.startsWith("spec-") || specHearRef.current;
    meshRef.current = m;
    m.start([]);
    return () => {
      m.stop();
      micRef.current?.stop();
      micRef.current = null;
      audioOut.clear();
      meshRef.current = null;
      touched.current = new Set();
    };
  }, [gameId, userId, ok]);

  // Joueur filmé : clé secrète de mon téléphone caméra (créée une fois par partie)
  useEffect(() => {
    if (!mine?.filmed || camKey || !gameId) return;
    let alive = true;
    (async () => {
      try {
        let r = await pb.collection("cams").getFirstListItem(`game="${gameId}" && player="${userId}"`).catch(() => null);
        if (!r) r = await pb.collection("cams").create({ game: gameId, player: userId, key: rnd(20) });
        if (alive) setCamKey(r.key);
      } catch (_) {}
    })();
    return () => {
      alive = false;
    };
  }, [mine?.filmed, gameId, userId, camKey]);

  // Mise en relation avec l'adversaire et les caméras, dès qu'ils sont connus
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const want = [];
    if (oppId) want.push(oppId);
    if (mine?.filmed && camKey) want.push(camId(userId));
    if (opp?.filmed && oppId) want.push(camId(oppId));
    for (const t of want) {
      if (touched.current.has(t)) continue;
      touched.current.add(t);
      m.touch(t);
    }
  }, [oppId, !!mine?.filmed, !!opp?.filmed, camKey, userId]);

  async function micOn() {
    const tr = await getMic();
    micRef.current?.stop();
    micRef.current = tr;
    meshRef.current?.setAudio(tr);
    meshRef.current?.sendCtl({ mic: true });
    audioOut.resume();
    setMic(true);
  }
  function micOff() {
    micRef.current?.stop();
    micRef.current = null;
    meshRef.current?.setAudio(null);
    meshRef.current?.sendCtl({ mic: false });
    setMic(false);
  }
  function setSpecHear(v) {
    specHearRef.current = v;
    setSpecHearS(v);
    try {
      localStorage.setItem("table_spec_hear", v ? "1" : "0");
    } catch (_) {}
    meshRef.current?.refreshAudio();
  }
  function muteOpp(v) {
    setOppMuted(v);
    audioOut.mutePeer(oppId, v);
  }

  const peer = (id) => peers[id] || null;
  const listeners = Object.entries(peers).filter(([id, p]) => id.startsWith("spec-") && p.state === "connected").length;
  const camLink = meta && camKey ? `${window.location.origin}${window.location.pathname}?cam=${meta.code}&p=${userId}&k=${camKey}` : "";

  return {
    ok,
    mic, micOn, micOff,
    oppMic, oppMuted, muteOpp,
    specHear, setSpecHear, listeners,
    oppLink: peer(oppId),
    myCam: peer(camId(userId)),
    oppCam: oppId ? peer(camId(oppId)) : null,
    camLink,
  };
}
