// Crée une fois pour toutes les clés des notifications (VAPID) dans push/vapid.json, si elles n'existent pas.
// À garder secret (fichier ignoré par git) : sans lui, les téléphones déjà abonnés ne recevraient plus rien.
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const file = path.join(__dirname, "vapid.json");
if (fs.existsSync(file)) {
  console.log("Clés de notification déjà présentes :", file);
} else {
  const k = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify({ publicKey: k.publicKey, privateKey: k.privateKey }, null, 2), { mode: 0o600 });
  console.log("Clés de notification créées :", file);
}
