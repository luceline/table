/// <reference path="../pb_data/types.d.ts" />
// Prototype « Héros » (jeu maison, réservé à l'admin) : types de cartes Action, Réaction, Quête, Équipement.
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  const kind = cards.fields.getByName("kind");
  const vals = [...(kind.values || [])];
  for (const v of ["action", "reaction", "quete", "equipement"]) if (!vals.includes(v)) vals.push(v);
  kind.values = vals;
  app.save(cards);
}, (app) => {});
