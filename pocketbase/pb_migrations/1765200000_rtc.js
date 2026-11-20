/// <reference path="../pb_data/types.d.ts" />
// Vidéo et vocal en direct (WebRTC, pair à pair) : la vidéo et le son ne passent jamais par le serveur.
// rtc  : petits messages de mise en relation (offre, réponse, bonjour), effacés dès lecture et au plus tard après 15 min.
//        Lisibles et créables par les joueurs de la partie et par qui connaît son code (spectateurs, téléphone caméra).
// cams : clé secrète du téléphone caméra d'un joueur filmé, lisible par les deux joueurs seulement
//        (les spectateurs ne la voient pas : ils ne peuvent pas se faire passer pour la caméra).
const SPEC_CHILD = "(@request.query.spectate != '' && game.code = @request.query.spectate)";
const MEMBER = "(@request.auth.id != '' && (game.p1 = @request.auth.id || game.p2 = @request.auth.id))";
const OPEN = `${MEMBER} || ${SPEC_CHILD}`;
// l'expéditeur ne peut pas se faire passer pour un joueur : son propre identifiant, ou un préfixe caméra / spectateur
const FROM_OK = "(from = @request.auth.id || from ~ 'cam-%' || from ~ 'spec-%')";

migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  if (!has("rtc")) {
    app.save(new Collection({
      type: "base",
      name: "rtc",
      listRule: OPEN,
      viewRule: OPEN,
      createRule: `(${OPEN}) && ${FROM_OK}`,
      updateRule: null,
      deleteRule: OPEN,
      fields: [
        { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "from", required: true, max: 48 },
        { type: "text", name: "to", required: true, max: 48 },
        { type: "text", name: "type", required: true, max: 12 },
        { type: "json", name: "data", maxSize: 200000 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_rtc_game_to ON rtc (game, `to`)"],
    }));
  }
  if (!has("cams")) {
    app.save(new Collection({
      type: "base",
      name: "cams",
      listRule: MEMBER,
      viewRule: MEMBER,
      createRule: `${MEMBER} && player = @request.auth.id`,
      updateRule: "@request.auth.id != '' && player = @request.auth.id",
      deleteRule: "@request.auth.id != '' && player = @request.auth.id",
      fields: [
        { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "player", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "key", required: true, min: 12, max: 32 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_cams_game_player ON cams (game, player)"],
    }));
  }
}, (app) => {
  for (const n of ["rtc", "cams"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});
