/// <reference path="../pb_data/types.d.ts" />
// Abonnements aux notifications (un par appareil) : seul leur propriétaire les voit et les gère.
migrate((app) => {
  try { app.findCollectionByNameOrId("push_subs"); return; } catch (_) {}
  const OWN = "@request.auth.id != '' && user = @request.auth.id";
  app.save(new Collection({
    type: "base",
    name: "push_subs",
    listRule: OWN,
    viewRule: OWN,
    createRule: OWN,
    updateRule: OWN,
    deleteRule: OWN,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "endpoint", required: true, max: 1000 },
      { type: "text", name: "p256dh", required: true, max: 200 },
      { type: "text", name: "auth", required: true, max: 100 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_endpoint ON push_subs (endpoint)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("push_subs")); } catch (_) {}
});
