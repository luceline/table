// Salons vocaux : voix, partage d'écran ou caméra, d'appareil à appareil (WebRTC, 6 personnes environ).
// Un seul salon à la fois, qui reste ouvert quand on change d'écran (sauf à la table de jeu, qui a son propre vocal).
// État partagé hors de React : useVoice() pour l'afficher, joinVoice / leaveVoice / setMic / setDeaf / startShare / stopShare.
import { useEffect, useState, useSyncExternalStore } from "react";
import { pb, me, errMsg, PB_URL, safeUn } from "../pb.js";
import { Mesh, rtcOk, getMic, audioOut } from "./rtc.js";
import { setWhere } from "./presence.js";

export const FRESH = 150000; // présence périmée sans signe de vie depuis 2 min 30
const fresh = (h) => !h.beat || Date.now() - new Date(h.beat.replace(" ", "T") + (h.beat.endsWith("Z") ? "" : "Z")).getTime() < FRESH;
const akey = (uid) => "v-" + uid;
export const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

let S = { room: null, here: [], peers: {}, mic: false, hasMic: false, deaf: false, share: "", local: null, speaking: {}, muted: {}, err: "", joining: false };
const subs = new Set();
const set = (p) => {
  S = { ...S, ...p };
  subs.forEach((f) => f());
};
export const voiceState = () => S;
const subscribe = (f) => (subs.add(f), () => subs.delete(f));
export const useVoice = () => useSyncExternalStore(subscribe, voiceState);
export const clearVoiceErr = () => set({ err: "" });

let mesh = null, micTrack = null, shareTrack = null, hereRec = null, beatT = null, unHere = null, leaving = false;
const checking = new Set();

function plan(peer) {
  const h = S.here.find((x) => x.user === peer);
  if (!h) {
    checkPeer(peer);
    return null;
  }
  return { offer: me().id < peer, audio: "sendrecv", video: "sendrecv", data: true, videoMax: shareTrack ? 1500000 : 0 };
}

// Appareil inconnu qui me contacte : il vient peut-être d'arriver (présence pas encore reçue)
async function checkPeer(peer) {
  if (!S.room || checking.has(peer)) return;
  checking.add(peer);
  try {
    const h = await pb.collection("voice_here").getFirstListItem(`room = "${S.room.id}" && user = "${peer}"`, { requestKey: null });
    if (fresh(h) && S.room?.id === h.room) {
      upsertHere(h);
      mesh?.touch(peer);
    }
  } catch (_) {}
  setTimeout(() => checking.delete(peer), 3000);
}

function upsertHere(h) {
  set({ here: [...S.here.filter((x) => x.user !== h.user), h].sort((a, b) => (a.name || "").localeCompare(b.name || "")) });
}

function applyOut(uid) {
  audioOut.mutePeer(akey(uid), S.deaf || !!S.muted[uid]);
}

function onPeer(peer, info) {
  if (!info) {
    const peers = { ...S.peers };
    delete peers[peer];
    audioOut.set(akey(peer), null);
    dropLevel(peer);
    return set({ peers });
  }
  if (info.stream?.getAudioTracks().length) {
    audioOut.set(akey(peer), info.stream);
    applyOut(peer);
    watchLevel(peer, info.stream);
  }
  if (info.state === "connected" && shareTrack) mesh?.tuneVideoAll(1500000);
  const old = S.peers[peer];
  set({ peers: { ...S.peers, [peer]: { state: info.state, stream: info.stream, n: (old?.n || 0) + 1 } } });
}

async function loadHere(roomId) {
  const l = await pb.collection("voice_here").getFullList({ filter: `room = "${roomId}"`, sort: "name", requestKey: null }).catch(() => []);
  return l.filter(fresh);
}

// Signe de vie, et liste de présence remise à jour (les absents sont oubliés)
async function beat() {
  if (!S.room || !hereRec) return;
  try {
    hereRec = await pb.collection("voice_here").update(hereRec.id, { beat: new Date().toISOString().replace("T", " ") }, { requestKey: null });
  } catch (e) {
    if (e?.status === 404) return leaveVoice("Vous n'êtes plus dans le salon vocal.");
  }
  const here = await loadHere(S.room.id);
  if (!S.room) return;
  set({ here });
  const ids = new Set(here.map((h) => h.user));
  for (const uid of Object.keys(S.peers)) if (!ids.has(uid)) mesh?.drop(uid);
}

function onHereEvt(e) {
  const h = e.record;
  if (!S.room || h.room !== S.room.id) return;
  const mine = h.user === me().id;
  if (e.action === "delete") {
    if (mine) {
      if (!leaving && hereRec?.id === h.id) leaveVoice("Vous avez quitté le salon vocal (retiré par l'administrateur, ou connecté depuis un autre appareil).");
      return;
    }
    set({ here: S.here.filter((x) => x.user !== h.user) });
    mesh?.drop(h.user);
    return;
  }
  if (mine) hereRec = h;
  upsertHere(h);
}

function onHide() {
  if (!hereRec) return;
  try {
    fetch(`${PB_URL}/api/collections/voice_here/records/${hereRec.id}`, { method: "DELETE", keepalive: true, headers: { Authorization: pb.authStore.token } });
  } catch (_) {}
}

// ---------- Qui parle (niveau sonore) ----------
let actx = null, levelT = null;
const levels = new Map(); // uid -> { an, src, buf }
function watchLevel(uid, stream) {
  try {
    if (!actx) return;
    const cur = levels.get(uid);
    if (cur && cur.stream === stream) return;
    dropLevel(uid);
    const src = actx.createMediaStreamSource(stream);
    const an = actx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    levels.set(uid, { an, src, stream, buf: new Uint8Array(an.fftSize) });
  } catch (_) {}
}
function dropLevel(uid) {
  const l = levels.get(uid);
  if (!l) return;
  try { l.src.disconnect(); } catch (_) {}
  levels.delete(uid);
}
function startLevels() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    actx.resume?.().catch(() => {});
  } catch (_) {
    actx = null;
  }
  if (micTrack) watchLevel(me().id, new MediaStream([micTrack]));
  levelT = setInterval(() => {
    const sp = {};
    for (const [uid, l] of levels) {
      l.an.getByteTimeDomainData(l.buf);
      let sum = 0;
      for (let i = 0; i < l.buf.length; i++) {
        const v = (l.buf[i] - 128) / 128;
        sum += v * v;
      }
      if (Math.sqrt(sum / l.buf.length) > 0.04) sp[uid] = true;
    }
    if (uid0(sp) !== uid0(S.speaking)) set({ speaking: sp });
  }, 250);
}
const uid0 = (o) => Object.keys(o).sort().join(",");
function stopLevels() {
  clearInterval(levelT);
  levelT = null;
  for (const uid of [...levels.keys()]) dropLevel(uid);
  try { actx?.close(); } catch (_) {}
  actx = null;
}

// ---------- Actions ----------
export async function joinVoice(room) {
  if (!rtcOk()) return set({ err: "Ce navigateur ne permet pas le vocal." });
  if (S.joining || S.room?.id === room.id) return;
  if (S.room) await leaveVoice();
  set({ joining: true, err: "" });
  const user = me();
  try {
    micTrack = await getMic();
  } catch (_) {
    micTrack = null; // sans micro : on écoute seulement
  }
  try {
    hereRec = await pb.collection("voice_here").create({ room: room.id, user: user.id, mic: !!micTrack, share: "" }, { requestKey: null });
  } catch (e) {
    stopTracks();
    return set({ joining: false, err: errMsg(e) });
  }
  leaving = false;
  set({ room, here: [], peers: {}, mic: !!micTrack, hasMic: !!micTrack, deaf: false, share: "", local: null, speaking: {}, muted: {}, joining: false, err: micTrack ? "" : "Micro indisponible : vous écoutez seulement." });
  mesh = new Mesh({ gameId: room.id, self: user.id, coll: "vrtc", scope: "room", plan, onPeer });
  mesh.setAudio(micTrack);
  startLevels();
  const here = await loadHere(room.id);
  if (!S.room) return;
  set({ here: here.some((h) => h.user === user.id) ? here : [...here, hereRec] });
  try {
    const un = await pb.collection("voice_here").subscribe("*", onHereEvt, { requestKey: null });
    if (!S.room) safeUn(un);
    else unHere = un;
  } catch (_) {}
  mesh.start(here.filter((h) => h.user !== user.id).map((h) => h.user));
  beatT = setInterval(beat, 20000);
  window.addEventListener("pagehide", onHide);
  setWhere("vocal");
}

function stopTracks() {
  try { micTrack?.stop(); } catch (_) {}
  try { shareTrack?.stop(); } catch (_) {}
  micTrack = null;
  shareTrack = null;
}

export async function leaveVoice(err = "") {
  if (!S.room) return;
  leaving = true;
  const rec = hereRec;
  hereRec = null;
  clearInterval(beatT);
  beatT = null;
  window.removeEventListener("pagehide", onHide);
  stopLevels();
  safeUn(unHere);
  unHere = null;
  mesh?.stop();
  mesh = null;
  for (const uid of Object.keys(S.peers)) {
    audioOut.mutePeer(akey(uid), false);
    audioOut.set(akey(uid), null);
  }
  stopTracks();
  set({ room: null, here: [], peers: {}, mic: false, hasMic: false, share: "", local: null, speaking: {}, muted: {}, deaf: false, err });
  if (rec) await pb.collection("voice_here").delete(rec.id, { requestKey: null }).catch(() => {});
  leaving = false;
  setWhere(/[?&]game=/.test(location.search) ? "partie" : "salons");
}

const saveHere = (data) => hereRec && pb.collection("voice_here").update(hereRec.id, data, { requestKey: null }).then((r) => (hereRec = r)).catch(() => {});

export async function setMic(on) {
  if (!S.room) return;
  if (on && !micTrack) {
    try {
      micTrack = await getMic();
      mesh?.setAudio(micTrack);
      watchLevel(me().id, new MediaStream([micTrack]));
      set({ hasMic: true });
    } catch (_) {
      return set({ err: "Micro indisponible : autorisez-le dans le navigateur." });
    }
  }
  if (micTrack) micTrack.enabled = !!on;
  const wasDeaf = S.deaf;
  set({ mic: !!on && !!micTrack, err: "" });
  if (on && wasDeaf) setDeaf(false);
  saveHere({ mic: !!on && !!micTrack });
}

// Sourdine : je n'entends plus personne (et mon micro se coupe)
export function setDeaf(on) {
  set({ deaf: !!on });
  for (const uid of Object.keys(S.peers)) applyOut(uid);
  if (on && S.mic) setMic(false);
}

// Couper un joueur pour moi seulement
export function mutePeer(uid, on) {
  set({ muted: { ...S.muted, [uid]: !!on } });
  applyOut(uid);
}

// kind : "screen" (écran ou fenêtre, sur ordinateur) ou "cam" (caméra, ex. cartes posées sur la table)
export async function startShare(kind) {
  if (!S.room || !mesh) return;
  let track;
  try {
    if (kind === "screen") {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: false });
      track = s.getVideoTracks()[0];
      try { track.contentHint = "detail"; } catch (_) {}
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
      track = s.getVideoTracks()[0];
    }
  } catch (_) {
    return set({ err: kind === "screen" ? "Partage d'écran annulé ou refusé." : "Caméra indisponible : autorisez-la dans le navigateur." });
  }
  if (!S.room || !mesh) return track.stop();
  try { shareTrack?.stop(); } catch (_) {}
  shareTrack = track;
  track.onended = () => shareTrack === track && stopShare();
  await mesh.setVideo(track);
  await mesh.tuneVideoAll(1500000);
  set({ share: kind, local: new MediaStream([track]), err: "" });
  saveHere({ share: kind });
}

export async function stopShare() {
  const t = shareTrack;
  shareTrack = null;
  try { t?.stop(); } catch (_) {}
  await mesh?.setVideo(null);
  set({ share: "", local: null });
  saveHere({ share: "" });
}

export const kickVoice = (uid) => pb.send("/api/table/voice/kick", { method: "POST", body: { user: uid }, requestKey: null });

// ---------- Salons vocaux d'un jeu et qui y est (pour la liste à gauche) ----------
const tcgF = (tcg) => (tcg === "fab" ? 'tcg = "fab"' : '(tcg = "" || tcg = "safir")');
export function useVoiceRooms(tcg) {
  const [rooms, setRooms] = useState([]);
  const [here, setHere] = useState([]);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true, un1 = null, un2 = null;
    const loadR = () => pb.collection("voice_rooms").getFullList({ filter: tcgF(tcg), sort: "sort,created", requestKey: null }).then((l) => alive && setRooms(l)).catch(() => {});
    const loadH = () => pb.collection("voice_here").getFullList({ requestKey: null }).then((l) => alive && setHere(l.filter(fresh))).catch(() => {});
    loadR();
    loadH();
    pb.collection("voice_rooms").subscribe("*", loadR, { requestKey: null }).then((u) => (alive ? (un1 = u) : safeUn(u))).catch(() => {});
    pb.collection("voice_here").subscribe("*", (e) => {
      const h = e.record;
      setHere((l) => {
        const o = l.filter((x) => x.id !== h.id && x.user !== h.user);
        return e.action === "delete" ? o : [...o, h];
      });
    }, { requestKey: null }).then((u) => (alive ? (un2 = u) : safeUn(u))).catch(() => {});
    const t = setInterval(() => { loadH(); setN((x) => x + 1); }, 30000);
    return () => { alive = false; clearInterval(t); safeUn(un1); safeUn(un2); };
  }, [tcg]);
  const byRoom = {};
  for (const h of here) if (fresh(h)) (byRoom[h.room] ||= []).push(h);
  for (const k of Object.keys(byRoom)) byRoom[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return { rooms, byRoom, tick: n };
}
