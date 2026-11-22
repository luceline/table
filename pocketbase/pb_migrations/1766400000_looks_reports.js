/// <reference path="../pb_data/types.d.ts" />
// Tapis et dos de cartes personnels visibles de l'adversaire et des spectateurs, avec signalement :
// - users.bg_blocked / back_blocked : image signalée, masquée aux autres jusqu'à la décision de l'admin
//   (le joueur ne peut pas changer ces champs lui-même) ;
// - reports : signalements (lus et traités par l'admin seulement, via les routes /api/table/mod/*).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const n of ["bg_blocked", "back_blocked"]) if (!users.fields.getByName(n)) users.fields.add(new BoolField({ name: n }));
  const lock = "@request.body.bg_blocked:isset = false && @request.body.back_blocked:isset = false";
  if (users.updateRule && !users.updateRule.includes("bg_blocked")) users.updateRule = `(${users.updateRule}) && ${lock}`;
  app.save(users);

  try { app.findCollectionByNameOrId("reports"); return; } catch (_) {}
  const ADMIN = "@request.auth.id != '' && @collection.admins.user ?= @request.auth.id";
  app.save(new Collection({
    type: "base", name: "reports",
    listRule: ADMIN, viewRule: ADMIN,
    createRule: "@request.auth.id != '' && reporter = @request.auth.id && target != @request.auth.id && status = 'open'",
    updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "reporter", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "target", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["bg", "back"] },
      { type: "text", name: "file", max: 200 },
      { type: "text", name: "reason", max: 300 },
      { type: "text", name: "game", max: 15 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["open", "ok", "removed"] },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_reports_status ON reports (status, created)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("reports")); } catch (_) {}
  const users = app.findCollectionByNameOrId("users");
  for (const n of ["bg_blocked", "back_blocked"]) if (users.fields.getByName(n)) users.fields.removeByName(n);
  users.updateRule = (users.updateRule || "").replace(/^\((.*)\) && @request\.body\.bg_blocked:isset = false && @request\.body\.back_blocked:isset = false$/, "$1");
  app.save(users);
});
