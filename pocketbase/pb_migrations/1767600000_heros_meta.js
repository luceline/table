/// <reference path="../pb_data/types.d.ts" />
// Prototype Héros : texte des cartes (meta JSON : texte, enchaînement, objectif, récompense…), pour redessiner
// une carte seulement quand son texte change (import d'un deck au format Markdown).
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (!cards.fields.getByName("meta")) cards.fields.add(new JSONField({ name: "meta", maxSize: 8000 }));
  app.save(cards);
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  const f = cards.fields.getByName("meta");
  if (f) { cards.fields.removeById(f.id); app.save(cards); }
});
