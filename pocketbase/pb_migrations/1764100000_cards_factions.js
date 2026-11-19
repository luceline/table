/// <reference path="../pb_data/types.d.ts" />
// Factions d'une carte (liste, ex. ["Kin", "Chaos", "Nature"]), saisies par le joueur. Facultatif.
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (!cards.fields.getByName("factions")) {
    cards.fields.add(new JSONField({ name: "factions", maxSize: 2000 }));
    app.save(cards);
  }
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (cards.fields.getByName("factions")) {
    cards.fields.removeByName("factions");
    app.save(cards);
  }
});
