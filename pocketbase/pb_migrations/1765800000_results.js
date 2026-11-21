/// <reference path="../pb_data/types.d.ts" />
// Résultats des parties (victoire / défaite par deck) : privés, seul le joueur les voit et les gère.
migrate((app) => {
  try { app.findCollectionByNameOrId("results"); return; } catch (_) {}
  const OWN = "@request.auth.id != '' && owner = @request.auth.id";
  app.save(new Collection({
    type: "base",
    name: "results",
    listRule: OWN,
    viewRule: OWN,
    createRule: OWN,
    updateRule: OWN + " && @request.body.owner:isset = false",
    deleteRule: OWN,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "game", required: true, max: 30 },
      { type: "text", name: "deck", max: 30 },
      { type: "text", name: "deck_name", max: 200 },
      { type: "text", name: "tcg", max: 20 },
      { type: "select", name: "outcome", required: true, maxSelect: 1, values: ["win", "loss"] },
      { type: "text", name: "opp_name", max: 100 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_results_owner_game ON results (owner, game)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("results")); } catch (_) {}
});
