/// <reference path="../pb_data/types.d.ts" />
// Deck initiation (Flesh and Blood) : deck de démarrage officiel qui ne suit pas les règles de construction,
// jouable malgré tout (seul le héros reste obligatoire).
migrate((app) => {
  const decks = app.findCollectionByNameOrId("decks");
  if (!decks.fields.getByName("initiation")) {
    decks.fields.add(new BoolField({ name: "initiation" }));
    app.save(decks);
  }
}, (app) => {
  const decks = app.findCollectionByNameOrId("decks");
  if (decks.fields.getByName("initiation")) {
    decks.fields.removeByName("initiation");
    app.save(decks);
  }
});
