/// <reference path="../pb_data/types.d.ts" />
// Carte normale qui existe aussi en jeton (ex. Safir « Singe ») : elle se met dans le deck
// et peut aussi être choisie dans la réserve de jetons du deck.
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (!cards.fields.getByName("token_too")) {
    cards.fields.add(new BoolField({ name: "token_too" }));
    app.save(cards);
  }
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (cards.fields.getByName("token_too")) {
    cards.fields.removeByName("token_too");
    app.save(cards);
  }
});
