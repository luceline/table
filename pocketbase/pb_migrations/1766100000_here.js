/// <reference path="../pb_data/types.d.ts" />
// Présence des joueurs à leur table : une ligne par joueur et par partie, rafraîchie toutes les 45 secondes tant que
// la table est ouverte et visible. Sert à n'afficher « En direct » que les parties où un joueur est encore assis.
migrate((app) => {
  try { app.findCollectionByNameOrId("here"); return; } catch (_) {}
  const OWN = "@request.auth.id != '' && user = @request.auth.id";
  const MEMBER = " && (game.p1 = @request.auth.id || game.p2 = @request.auth.id)";
  app.save(new Collection({
    type: "base", name: "here",
    listRule: OWN, viewRule: OWN, deleteRule: OWN,
    createRule: OWN + MEMBER,
    updateRule: OWN + " && @request.body.user:isset = false && @request.body.game:isset = false",
    fields: [
      { type: "relation", name: "game", required: true, collectionId: app.findCollectionByNameOrId("games").id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "beat" },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_here_game_user ON here (game, user)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("here")); } catch (_) {}
});
