// Envoi d'une notification à une liste d'abonnements (appelé par PocketBase, un seul argument JSON) :
//   { subs: [{ endpoint, keys: { p256dh, auth } }], payload: { title, body, url, tag } }
// Écrit en sortie { sent, gone: [endpoints expirés à supprimer] }. Ne renvoie jamais d'erreur à PocketBase.
const fs = require("fs");
const path = require("path");
const out = (o) => process.stdout.write(JSON.stringify(o));
try {
  const webpush = require("web-push");
  const vapid = JSON.parse(fs.readFileSync(path.join(__dirname, "vapid.json"), "utf8"));
  webpush.setVapidDetails("mailto:resgestae.game@gmail.com", vapid.publicKey, vapid.privateKey);
  const { subs = [], payload = {} } = JSON.parse(process.argv[2] || "{}");
  const gone = [];
  let sent = 0;
  const timer = setTimeout(() => { out({ sent, gone, timeout: true }); process.exit(0); }, 4000);
  Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification(s, JSON.stringify(payload), { TTL: 900, urgency: "high", topic: payload.tag || undefined })
        .then(() => sent++)
        .catch((e) => {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        }),
    ),
  ).then(() => {
    clearTimeout(timer);
    out({ sent, gone });
  });
} catch (e) {
  out({ sent: 0, gone: [], error: String(e && e.message || e) });
}
