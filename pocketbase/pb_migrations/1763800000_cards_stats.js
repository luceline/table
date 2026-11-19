/// <reference path="../pb_data/types.d.ts" />
// Valeurs imprimées des cartes (facultatives) : ATK, Valeur, DEF.
// Texte court pour accepter aussi les chiffres romains des cartes UR.
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  for (const name of ["atk", "val", "def"]) {
    if (!cards.fields.getByName(name)) cards.fields.add(new TextField({ name, max: 6 }));
  }
  app.save(cards);
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  for (const name of ["atk", "val", "def"]) if (cards.fields.getByName(name)) cards.fields.removeByName(name);
  app.save(cards);
});
