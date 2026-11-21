/// <reference path="../pb_data/types.d.ts" />
// Agenda des disponibilités, par jeu :
// avail   : semaine type d'un joueur pour un jeu (créneaux { d: 0 = lundi … 6, s, e : minutes depuis minuit, heure locale },
//           off = décalage horaire du navigateur en minutes, paused_until = « pas disponible cette semaine »).
//           Privé : seul le joueur le lit ; les autres ne voient que les créneaux en commun (route /api/table/agenda-matches).
// invites : propositions de partie entre deux joueurs, pour un jour et une heure. Lisibles par les deux joueurs seulement.
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users").id;
  if (!has("avail")) {
    const OWN = "@request.auth.id != '' && user = @request.auth.id";
    app.save(new Collection({
      type: "base", name: "avail",
      listRule: OWN, viewRule: OWN, createRule: OWN, deleteRule: OWN,
      updateRule: OWN + " && @request.body.user:isset = false",
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "tcg", max: 20 },
        { type: "json", name: "slots", maxSize: 20000 },
        { type: "number", name: "off" },
        { type: "date", name: "paused_until" },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_avail_user_tcg ON avail (user, tcg)"],
    }));
  }
  if (!has("invites")) {
    const PART = "@request.auth.id != '' && (from = @request.auth.id || to = @request.auth.id)";
    const FIXED = ["from", "to", "tcg", "at", "end", "note", "label", "from_name", "to_name", "reminded"]
      .map((f) => `@request.body.${f}:isset = false`).join(" && ");
    app.save(new Collection({
      type: "base", name: "invites",
      listRule: PART, viewRule: PART, deleteRule: PART,
      createRule: "@request.auth.id != '' && from = @request.auth.id && to != @request.auth.id && status = 'pending' && code = '' && game = '' && reply = ''",
      updateRule: PART + " && " + FIXED +
        // accepter ou refuser : le destinataire, tant que la proposition est en attente ; annuler : l'un ou l'autre
        " && (@request.body.status:isset = false || (to = @request.auth.id && status = 'pending' && (@request.body.status = 'accepted' || @request.body.status = 'declined')) || @request.body.status = 'cancelled')" +
        " && (@request.body.reply:isset = false || to = @request.auth.id)" +
        // table de la partie : une fois la proposition acceptée
        " && ((@request.body.code:isset = false && @request.body.game:isset = false) || status = 'accepted')",
      fields: [
        { type: "relation", name: "from", required: true, collectionId: users, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "to", required: true, collectionId: users, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "tcg", max: 20 },
        { type: "date", name: "at", required: true },
        { type: "date", name: "end" },
        { type: "text", name: "label", max: 120 },
        { type: "text", name: "note", max: 200 },
        { type: "text", name: "reply", max: 200 },
        { type: "text", name: "from_name", max: 100 },
        { type: "text", name: "to_name", max: 100 },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "accepted", "declined", "cancelled"] },
        { type: "text", name: "code", max: 6 },
        { type: "text", name: "game", max: 15 },
        { type: "bool", name: "reminded" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_invites_at ON invites (status, at)"],
    }));
  }
}, (app) => {
  for (const n of ["invites", "avail"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
});
