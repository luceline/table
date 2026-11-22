/// <reference path="../pb_data/types.d.ts" />
// Messages privés entre joueurs (lisibles par les deux joueurs seulement), blocage d'un joueur,
// et signalement d'une conversation privée à l'administrateur (reports.kind = "dm").
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users");
  const OWNB = "@request.auth.id != '' && user = @request.auth.id";
  if (!has("blocks")) {
    app.save(new Collection({
      type: "base", name: "blocks",
      listRule: OWNB, viewRule: OWNB, createRule: OWNB + " && blocked != @request.auth.id", updateRule: null, deleteRule: OWNB,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "blocked", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_blocks ON blocks (user, blocked)"],
    }));
  }
  if (!has("dms")) {
    const PART = "@request.auth.id != '' && (from = @request.auth.id || to = @request.auth.id)";
    app.save(new Collection({
      type: "base", name: "dms",
      listRule: PART, viewRule: PART,
      createRule: "@request.auth.id != '' && from = @request.auth.id && to != @request.auth.id && read = false",
      // seul le destinataire marque un message comme lu
      updateRule: "@request.auth.id != '' && to = @request.auth.id && @request.body.text:isset = false && @request.body.from:isset = false && @request.body.to:isset = false && @request.body.from_name:isset = false && @request.body.to_name:isset = false",
      deleteRule: "@request.auth.id != '' && from = @request.auth.id",
      fields: [
        { type: "relation", name: "from", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "to", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "from_name", max: 40 },
        { type: "text", name: "to_name", max: 40 },
        { type: "text", name: "text", required: true, max: 1000 },
        { type: "bool", name: "read" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_dms_to ON dms (to, read)", "CREATE INDEX idx_dms_pair ON dms (from, to, created)"],
    }));
  }
  const reports = app.findCollectionByNameOrId("reports");
  const kind = reports.fields.getByName("kind");
  if (kind && !kind.values.includes("dm")) { kind.values = [...kind.values, "dm"]; app.save(reports); }
}, (app) => {
  for (const n of ["dms", "blocks"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
});
