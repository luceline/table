// Identifiants temporaires du relais de connexion (coturn, option « use-auth-secret ») :
// nom = « expiration:joueur », mot de passe = base64(HMAC-SHA1(secret, nom)). Le secret est dans /opt/table/turn/turn.json
// (créé par deploy/turn.sh, hors du dépôt). Sans ce fichier : seulement les serveurs publics de mise en relation (STUN).
const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] };

function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function sha1(bytes) {
  const m = bytes.slice();
  const len = bytes.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  for (let i = 7; i >= 0; i--) m.push(i >= 4 ? 0 : (len >>> (i * 8)) & 255);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let o = 0; o < m.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rol(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = [];
  for (const h of [h0, h1, h2, h3, h4]) out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  return out;
}

function hmacSha1(key, msg) {
  let k = utf8(key);
  if (k.length > 64) k = sha1(k);
  while (k.length < 64) k.push(0);
  const ipad = k.map((x) => x ^ 0x36), opad = k.map((x) => x ^ 0x5c);
  return sha1(opad.concat(sha1(ipad.concat(utf8(msg)))));
}

function b64(bytes) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? A[n & 63] : "=");
  }
  return s;
}

module.exports = {
  hmacSha1, b64,
  // Serveurs à donner au navigateur ; ttl en secondes
  ice(who, ttl) {
    const out = [STUN];
    try {
      const conf = JSON.parse(toString($os.readFile(__hooks + "/../../turn/turn.json")));
      if (conf.secret && Array.isArray(conf.urls) && conf.urls.length) {
        const username = Math.floor(Date.now() / 1000 + ttl) + ":" + String(who || "x").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
        out.push({ urls: conf.urls, username: username, credential: b64(hmacSha1(conf.secret, username)) });
      }
    } catch (_) {}
    return out;
  },
};
