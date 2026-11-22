/// <reference path="../pb_data/types.d.ts" />
// Salons vocaux (voix et partage d'écran d'appareil à appareil) et relais de connexion (TURN).

// Serveurs de mise en relation pour la vidéo et le vocal (table, caméra, spectateurs, salons vocaux).
// Joueur connecté, ou appareil sans compte qui connaît le code d'une partie (?spectate=CODE).
routerAdd("GET", "/api/table/ice", (e) => {
  let who = e.auth ? e.auth.id : "";
  if (!who) {
    const code = String(e.request.url.query().get("spectate") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    try {
      if (code.length !== 6) throw 0;
      $app.findFirstRecordByFilter("games", "code = {:c}", { c: code });
      who = "spec-" + code;
    } catch (_) {
      return e.json(401, { message: "Connexion requise." });
    }
  }
  const ttl = 12 * 3600;
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { ice: require(`${__hooks}/turn_lib.js`).ice(who, ttl), ttl: ttl });
});

// Entrée dans un salon vocal : nom fixé par le serveur, salon plein, joueur retiré récemment, ancienne présence effacée
onRecordCreateRequest((e) => {
  const r = e.record;
  const uid = r.getString("user"), room = r.getString("room");
  const nowIso = new Date().toISOString().replace("T", " ");
  let vr;
  try { vr = $app.findRecordById("voice_rooms", room); } catch (_) { throw new BadRequestError("Salon vocal introuvable."); }
  let kicked = false;
  try { $app.findFirstRecordByFilter("voice_kicks", "room = {:r} && user = {:u} && until > {:n}", { r: room, u: uid, n: nowIso }); kicked = true; } catch (_) {}
  if (kicked) throw new BadRequestError("Vous avez été retiré de ce salon vocal : réessayez dans quelques minutes.");
  const fresh = new Date(Date.now() - 150000).toISOString().replace("T", " ");
  const max = vr.getInt("max") || 6;
  const n = $app.countRecords("voice_here", $dbx.exp("room = {:r} AND user != {:u} AND beat >= {:f}", { r: room, u: uid, f: fresh }));
  if (n >= max) throw new BadRequestError(`Salon vocal plein (${max} personnes au plus).`);
  // une seule présence par joueur : l'ancienne (autre salon, autre appareil, onglet fermé) est remplacée
  try { $app.delete($app.findFirstRecordByFilter("voice_here", "user = {:u}", { u: uid })); } catch (_) {}
  let name = "Joueur";
  try { name = $app.findRecordById("users", uid).getString("name") || name; } catch (_) {}
  r.set("name", name.slice(0, 40));
  r.set("beat", nowIso);
  e.next();
}, "voice_here");

// L'administrateur retire un joueur d'un salon vocal (il ne peut pas revenir pendant 10 minutes)
routerAdd("POST", "/api/table/voice/kick", (e) => {
  try { $app.findFirstRecordByFilter("admins", "user = {:u}", { u: e.auth.id }); } catch (_) { return e.json(403, { message: "Réservé à l'administrateur." }); }
  const b = e.requestInfo().body || {};
  let h;
  try { h = $app.findFirstRecordByFilter("voice_here", "user = {:u}", { u: String(b.user || "") }); } catch (_) { return e.json(404, { message: "Ce joueur n'est plus dans un salon vocal." }); }
  const k = new Record($app.findCollectionByNameOrId("voice_kicks"));
  k.set("room", h.getString("room"));
  k.set("user", h.getString("user"));
  k.set("until", new Date(Date.now() + 10 * 60000).toISOString().replace("T", " "));
  $app.save(k);
  $app.delete(h);
  return e.json(200, { ok: true });
}, $apis.requireAuth());

// Ménage : présences sans signe de vie depuis 3 min (un téléphone en veille ralentit ses signes de vie), messages de mise en relation de plus de 15 min, retraits terminés
cronAdd("voice_cleanup", "* * * * *", () => {
  const iso = (ms) => new Date(Date.now() - ms).toISOString().replace("T", " ");
  try {
    for (const h of $app.findRecordsByFilter("voice_here", "beat < {:t}", "", 100, 0, { t: iso(180000) })) $app.delete(h);
  } catch (_) {}
  try { $app.db().newQuery("DELETE FROM vrtc WHERE created < {:t}").bind({ t: iso(15 * 60000) }).execute(); } catch (_) {}
  try { $app.db().newQuery("DELETE FROM voice_kicks WHERE until < {:t}").bind({ t: iso(0) }).execute(); } catch (_) {}
});
