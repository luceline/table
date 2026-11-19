/// <reference path="../pb_data/types.d.ts" />
// Commandant facultatif d'un deck (identifiant d'une carte de la collection). Hors deck : posé d'office en zone Commandant.
migrate((app) => {
  const decks = app.findCollectionByNameOrId("decks");
  if (!decks.fields.getByName("commander")) {
    decks.fields.add(new TextField({ name: "commander", max: 30 }));
    app.save(decks);
  }
}, (app) => {
  const decks = app.findCollectionByNameOrId("decks");
  if (decks.fields.getByName("commander")) {
    decks.fields.removeByName("commander");
    app.save(decks);
  }
});
