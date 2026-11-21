/// <reference path="../pb_data/types.d.ts" />
// Salons de discussion par jeu (comme des salons Discord) :
// admins   : comptes administrateurs (ajoutés sur le serveur : ./pocketbase table-admin add e-mail), lisibles par eux seuls
// channels : salons d'un jeu (tcg), créés, renommés, rangés et supprimés par un administrateur
// posts    : messages des salons, lisibles par tous les joueurs connectés ; chacun supprime les siens, l'admin tous
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users");
  const ADMIN = "@request.auth.id != '' && @collection.admins.user ?= @request.auth.id";
  const AUTH = "@request.auth.id != ''";
  if (!has("admins")) {
    app.save(new Collection({
      type: "base", name: "admins",
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      createRule: null, updateRule: null, deleteRule: null,
      fields: [{ type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true }],
      indexes: ["CREATE UNIQUE INDEX idx_admins_user ON admins (user)"],
    }));
  }
  if (!has("channels")) {
    app.save(new Collection({
      type: "base", name: "channels",
      listRule: AUTH, viewRule: AUTH,
      createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
      fields: [
        { type: "text", name: "tcg", max: 20 },
        { type: "text", name: "name", required: true, max: 40 },
        { type: "text", name: "topic", max: 200 },
        { type: "number", name: "sort" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
    }));
    // un premier salon par jeu, pour ne pas arriver dans le vide
    const ch = app.findCollectionByNameOrId("channels");
    for (const [tcg, i] of [["safir", 0], ["fab", 0]]) {
      for (const [name, topic, n] of [
        ["général", "Discussions libres", 0],
        ["cherche-partie", "Trouver un adversaire, proposer une heure", 1],
      ]) {
        const r = new Record(ch);
        r.set("tcg", tcg); r.set("name", name); r.set("topic", topic); r.set("sort", n + i);
        app.save(r);
      }
    }
  }
  if (!has("posts")) {
    const channels = app.findCollectionByNameOrId("channels");
    app.save(new Collection({
      type: "base", name: "posts",
      listRule: AUTH, viewRule: AUTH,
      createRule: "@request.auth.id != '' && author = @request.auth.id",
      updateRule: null,
      deleteRule: `@request.auth.id != '' && (author = @request.auth.id || @collection.admins.user ?= @request.auth.id)`,
      fields: [
        { type: "relation", name: "channel", required: true, collectionId: channels.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "author", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "name", max: 40 },
        { type: "text", name: "text", required: true, max: 1000 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_posts_channel_created ON posts (channel, created)"],
    }));
  }
}, (app) => {
  for (const n of ["posts", "channels", "admins"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
});
