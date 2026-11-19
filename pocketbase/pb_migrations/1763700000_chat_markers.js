/// <reference path="../pb_data/types.d.ts" />
// Tchat de partie (messages) et marqueurs de territoire (marks.label).
// messages : lisibles par les deux joueurs de la partie, chacun n'écrit qu'en son nom, pas de modification.
// marks.label : un jeton avec un texte (ex. « Gel ») est affiché comme marqueur de territoire.
migrate((app) => {
  const marks = app.findCollectionByNameOrId("marks");
  if (!marks.fields.getByName("label")) {
    marks.fields.add(new TextField({ name: "label", max: 40 }));
    app.save(marks);
  }

  let exists = null;
  try { exists = app.findCollectionByNameOrId("messages"); } catch (_) {}
  if (exists) return;

  const users = app.findCollectionByNameOrId("users");
  const games = app.findCollectionByNameOrId("games");
  const gameMember = "@request.auth.id != '' && (game.p1 = @request.auth.id || game.p2 = @request.auth.id)";

  const messages = new Collection({
    type: "base",
    name: "messages",
    listRule: gameMember,
    viewRule: gameMember,
    createRule: gameMember + " && author = @request.auth.id",
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "author", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", max: 60 },
      { type: "text", name: "text", required: true, max: 300 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_messages_game ON messages (game)"],
  });
  app.save(messages);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("messages")); } catch (_) {}
  const marks = app.findCollectionByNameOrId("marks");
  if (marks.fields.getByName("label")) {
    marks.fields.removeByName("label");
    app.save(marks);
  }
});
