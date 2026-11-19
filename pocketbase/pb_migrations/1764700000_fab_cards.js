/// <reference path="../pb_data/types.d.ts" />
// Flesh and Blood : couleur de pitch des cartes (r = rouge, y = jaune, b = bleu ; vide = sans pitch).
// Une carte FaB est unique par son nom ET sa couleur de pitch.
// Types de cartes ajoutés : « arene » (armes et équipements, hors deck) et « heros ».
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (!cards.fields.getByName("pitch")) {
    cards.fields.add(new TextField({ name: "pitch", max: 1 }));
  }
  const kind = cards.fields.getByName("kind");
  const vals = [...(kind.values || [])];
  for (const v of ["arene", "heros"]) if (!vals.includes(v)) vals.push(v);
  kind.values = vals;
  app.save(cards);
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (cards.fields.getByName("pitch")) {
    cards.fields.removeByName("pitch");
    app.save(cards);
  }
});
