// Vidéo et vocal en direct, d'appareil à appareil (WebRTC). Le serveur ne sert qu'à la mise en relation :
// quelques messages (collection « rtc ») effacés dès lecture. Le son et l'image ne passent jamais par lui.
//
// Identifiants des pairs : id du compte pour un joueur, « cam-<id joueur> » pour le téléphone qui filme un joueur,
// « spec-<sid> » pour un spectateur. Pour chaque paire, un seul côté fait l'offre (plan.offer) ; l'autre envoie
// « hello » pour la demander (à son arrivée, ou si la connexion tombe).
import { pb } from "../pb.js";

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
export const rtcOk = () => typeof window !== "undefined" && typeof window.RTCPeerConnection === "function";
export const rnd = (n = 12) => {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (x) => a[x % a.length]).join("");
};
export const camId = (playerId) => `cam-${playerId}`;

// Identifiant de spectateur, stable pendant la session de l'onglet
export function specPeerId() {
  let sid = "";
  try {
    sid = sessionStorage.getItem("table_rtc_sid") || "";
    if (!sid) sessionStorage.setItem("table_rtc_sid", (sid = rnd(12)));
  } catch (_) {
    sid = rnd(12);
  }
  return `spec-${sid}`;
}

const DIR = { send: "sendonly", recv: "recvonly", sendrecv: "sendrecv" };
const sends = (m) => m === "send" || m === "sendrecv";

// Attend la fin de la collecte des adresses réseau (au plus 2,5 s) : une seule offre complète, pas de flot de messages
function iceDone(pc) {
  return new Promise((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        res();
      }
    });
  });
}

async function tuneVideo(sender, max, scale) {
  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = max;
    if (scale) p.encodings[0].scaleResolutionDownBy = scale;
    p.degradationPreference = "maintain-resolution"; // une image nette (texte des cartes) plutôt que fluide
    await sender.setParameters(p);
  } catch (_) {}
}

export class Mesh {
  // gameId, self (mon identifiant), query (?spectate=CODE pour les appareils sans compte)
  // plan(peerId) -> { offer, audio: "send"|"recv"|"sendrecv", video: idem, videoMax, videoScale, data } | null
  // accept(peerId, data) -> bool (vérifie une offre reçue, ex. clé de la caméra)
  // onPeer(peerId, info | null) : changement d'état d'un pair ({ state, stream, offerer })
  // onCtl(peerId, obj) : message reçu sur le canal de contrôle (ex. { mic: true })
  constructor({ gameId, self, query, plan, accept, onPeer, onCtl, offerExtra, onBusy }) {
    Object.assign(this, { gameId, self, query, plan, accept, onPeer, onCtl, offerExtra, onBusy });
    this.peers = new Map();
    this.audio = null;
    this.video = null;
    this.audioTo = () => true; // à qui envoyer mon micro
    this.ctl = null;
    this.alive = true;
    this.ready = false;
    this.pending = new Set(); // contacts demandés avant la fin du démarrage
    this.unsub = null;
    this.opt = query ? { query } : {};
  }

  async start(targets = []) {
    try {
      // anciens messages qui me sont adressés (session précédente) : effacés
      const old = await pb.collection("rtc").getFullList({ filter: `game="${this.gameId}" && to="${this.self}"`, fields: "id", ...this.opt });
      await Promise.all(old.map((r) => pb.collection("rtc").delete(r.id, this.opt).catch(() => {})));
    } catch (_) {}
    if (!this.alive) return;
    try {
      const un = await pb.collection("rtc").subscribe(
        "*",
        (e) => e.action === "create" && e.record.to === this.self && e.record.game === this.gameId && this.onMsg(e.record),
        { filter: `game="${this.gameId}" && to="${this.self}"`, ...this.opt },
      );
      if (!this.alive) return Promise.resolve(un()).catch(() => {});
      this.unsub = un;
    } catch (_) {
      return;
    }
    this.ready = true;
    [...targets, ...this.pending].forEach((t) => this.touch(t));
    this.pending.clear();
  }

  // Prendre contact avec un pair : offre si c'est à moi de la faire, sinon demande
  touch(peerId) {
    if (!this.alive || !peerId || peerId === this.self) return;
    if (!this.ready) return void this.pending.add(peerId);
    const plan = this.plan(peerId);
    if (!plan) return;
    if (plan.offer) this.connect(peerId);
    else this.send(peerId, "hello");
  }

  send(to, type, data = {}) {
    return pb.collection("rtc").create({ game: this.gameId, from: this.self, to, type, data }, this.opt).catch(() => {});
  }

  async onMsg(rec) {
    pb.collection("rtc").delete(rec.id, this.opt).catch(() => {});
    if (!this.alive) return;
    const { from, type } = rec;
    const data = rec.data || {};
    try {
      if (type === "hello") {
        const plan = this.plan(from);
        if (plan?.offer) this.connect(from);
        else if (plan === null && this.onBusy) this.send(from, "busy");
      } else if (type === "offer") {
        const plan = this.plan(from);
        if (!plan || plan.offer || !data.sdp) return;
        if (this.accept && !(await this.accept(from, data))) return;
        await this.answer(from, plan, data);
      } else if (type === "answer") {
        const p = this.peers.get(from);
        if (!p || !p.offerer || p.sess !== data.sess || p.pc.signalingState !== "have-local-offer") return;
        await p.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      } else if (type === "bye") {
        this.drop(from);
      } else if (type === "busy") {
        this.onPeer?.(from, { state: "busy" });
      }
    } catch (_) {}
  }

  newPeer(peerId, offerer, tries = 0) {
    this.drop(peerId, true);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, sess: rnd(8), offerer, stream: new MediaStream(), tries, timer: null, dc: null };
    this.peers.set(peerId, p);
    pc.ontrack = (e) => {
      if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track);
      e.track.onunmute = () => this.emit(peerId);
      this.emit(peerId);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(peerId) !== p) return;
      const st = pc.connectionState;
      this.emit(peerId);
      clearTimeout(p.timer);
      if (st === "connected") p.tries = 0;
      else if (st === "failed") this.retry(peerId, p);
      else if (st === "disconnected") p.timer = setTimeout(() => pc.connectionState !== "connected" && this.retry(peerId, p), 5000);
    };
    return p;
  }

  retry(peerId, p) {
    if (!this.alive || this.peers.get(peerId) !== p || p.tries >= 8) return;
    const n = p.tries + 1;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!this.alive || this.peers.get(peerId) !== p) return;
      if (p.offerer) this.connect(peerId, n);
      else {
        p.tries = n;
        this.send(peerId, "hello");
        this.retry(peerId, p); // nouvel essai plus tard si personne ne répond
      }
    }, Math.min(30000, n === 1 ? 1000 : 2500 * n));
  }

  async connect(peerId, tries = 0) {
    const plan = this.plan(peerId);
    if (!plan?.offer || !this.alive) return;
    const p = this.newPeer(peerId, true, tries);
    const { pc } = p;
    if (plan.audio) {
      const t = pc.addTransceiver("audio", { direction: DIR[plan.audio] });
      if (sends(plan.audio)) t.sender.replaceTrack(this.audioTo(peerId) ? this.audio : null);
    }
    let vs = null;
    if (plan.video) {
      if (sends(plan.video) && this.video) vs = pc.addTransceiver(this.video, { direction: DIR[plan.video] }).sender;
      else pc.addTransceiver("video", { direction: sends(plan.video) ? DIR[plan.video] : "recvonly" });
    }
    if (plan.data) this.setupDc(peerId, p, pc.createDataChannel("ctl"));
    else pc.ondatachannel = null;
    this.emit(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (vs && plan.videoMax) await tuneVideo(vs, plan.videoMax, plan.videoScale);
    await iceDone(pc);
    if (this.peers.get(peerId) !== p) return;
    this.send(peerId, "offer", { sess: p.sess, sdp: pc.localDescription.sdp, ...(this.offerExtra || {}) });
    // pas de réponse (pair absent) : on réessaiera quand il dira bonjour
  }

  async answer(peerId, plan, data) {
    const p = this.newPeer(peerId, false);
    p.sess = data.sess;
    const { pc } = p;
    pc.ondatachannel = (e) => this.setupDc(peerId, p, e.channel);
    await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      const mode = plan[kind];
      if (!mode) {
        t.direction = "inactive";
        continue;
      }
      t.direction = DIR[mode];
      if (sends(mode)) await t.sender.replaceTrack(kind === "audio" ? (this.audioTo(peerId) ? this.audio : null) : this.video);
    }
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await iceDone(pc);
    if (this.peers.get(peerId) !== p) return;
    this.send(peerId, "answer", { sess: p.sess, sdp: pc.localDescription.sdp });
    this.emit(peerId);
  }

  setupDc(peerId, p, dc) {
    p.dc = dc;
    dc.onopen = () => this.ctl && dc.send(JSON.stringify(this.ctl));
    dc.onmessage = (e) => {
      try {
        this.onCtl?.(peerId, JSON.parse(e.data));
      } catch (_) {}
    };
  }

  emit(peerId) {
    const p = this.peers.get(peerId);
    if (!p) return;
    this.onPeer?.(peerId, { state: p.pc.connectionState, stream: p.stream, offerer: p.offerer });
  }

  drop(peerId, silent) {
    const p = this.peers.get(peerId);
    if (!p) return;
    clearTimeout(p.timer);
    this.peers.delete(peerId);
    try {
      p.pc.close();
    } catch (_) {}
    if (!silent) this.onPeer?.(peerId, null);
  }

  // Micro : remplace la piste envoyée à chaque pair, sans renégocier
  setAudio(track) {
    this.audio = track || null;
    this.refreshAudio();
  }
  refreshAudio() {
    for (const [id, p] of this.peers) {
      for (const t of p.pc.getTransceivers()) {
        if (t.receiver.track?.kind !== "audio" || !(t.direction === "sendrecv" || t.direction === "sendonly")) continue;
        t.sender.replaceTrack(this.audioTo(id) ? this.audio : null).catch(() => {});
      }
    }
  }

  // Caméra changée : remplace l'image envoyée à chaque pair, sans renégocier
  async setVideo(track) {
    this.video = track || null;
    const all = [];
    for (const [, p] of this.peers) {
      for (const t of p.pc.getTransceivers()) {
        if (t.receiver.track?.kind === "video" && (t.direction === "sendonly" || t.direction === "sendrecv")) all.push(t.sender.replaceTrack(this.video).catch(() => {}));
      }
    }
    await Promise.all(all);
  }

  // Message de contrôle à tous les pairs reliés par un canal (ex. état du micro)
  sendCtl(obj) {
    this.ctl = obj;
    for (const [, p] of this.peers) if (p.dc?.readyState === "open") p.dc.send(JSON.stringify(obj));
  }

  count(prefix) {
    let n = 0;
    for (const [id, p] of this.peers) if (id.startsWith(prefix) && p.pc.connectionState !== "failed" && p.pc.connectionState !== "closed") n++;
    return n;
  }

  stop() {
    this.alive = false;
    for (const id of [...this.peers.keys()]) {
      this.send(id, "bye");
      this.drop(id, true);
    }
    Promise.resolve(this.unsub?.()).catch(() => {});
  }
}

// ---------- Micro ----------
export async function getMic() {
  const s = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return s.getAudioTracks()[0];
}

// ---------- Sortie du son reçu ----------
// Un lecteur caché par pair ; « muted » coupe tout (ex. spectateur qui n'a pas activé le son)
const outs = new Map();
let outMuted = false;
const mutedPeers = new Set();
export const audioOut = {
  set(peerId, stream) {
    let el = outs.get(peerId);
    if (!stream || !stream.getAudioTracks().length) {
      if (el) {
        el.srcObject = null;
        el.remove();
        outs.delete(peerId);
      }
      return;
    }
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.style.display = "none";
      document.body.appendChild(el);
      outs.set(peerId, el);
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = outMuted || mutedPeers.has(peerId);
    el.play().catch(() => {});
  },
  mute(v) {
    outMuted = !!v;
    for (const [id, el] of outs) {
      el.muted = outMuted || mutedPeers.has(id);
      if (!el.muted) el.play().catch(() => {});
    }
  },
  mutePeer(peerId, v) {
    if (v) mutedPeers.add(peerId);
    else mutedPeers.delete(peerId);
    const el = outs.get(peerId);
    if (el) el.muted = outMuted || !!v;
  },
  // à appeler sur un geste (iPhone : la lecture doit être déclenchée par l'utilisateur)
  resume() {
    for (const [, el] of outs) if (!el.muted) el.play().catch(() => {});
  },
  clear() {
    for (const [, el] of outs) {
      el.srcObject = null;
      el.remove();
    }
    outs.clear();
    mutedPeers.clear();
    outMuted = false;
  },
};
