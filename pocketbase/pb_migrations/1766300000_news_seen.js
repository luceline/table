/// <reference path="../pb_data/types.d.ts" />
// Dernière fenêtre « Nouveautés » vue par le joueur (numéro de mise à jour), pour ne la montrer qu'une fois, sur tous ses appareils.
migrate((app) => {
  const c = app.findCollectionByNameOrId("users");
  if (!c.fields.getByName("news_seen")) c.fields.add(new NumberField({ name: "news_seen", onlyInt: true }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("users");
  if (c.fields.getByName("news_seen")) c.fields.removeByName("news_seen");
  app.save(c);
});
