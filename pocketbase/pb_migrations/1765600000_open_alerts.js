/// <reference path="../pb_data/types.d.ts" />
// Annonce des tables ouvertes par notification :
// push_subs.open_tcg : jeux pour lesquels cet appareil veut être prévenu (["safir"], ["fab"]...)
// push_subs.last_open : dernière annonce reçue (au plus une toutes les 30 min par joueur)
// games.announced : table déjà annoncée (une seule notification par table)
migrate((app) => {
  const subs = app.findCollectionByNameOrId("push_subs");
  if (!subs.fields.getByName("open_tcg")) subs.fields.add(new JSONField({ name: "open_tcg", maxSize: 2000 }));
  if (!subs.fields.getByName("last_open")) subs.fields.add(new DateField({ name: "last_open" }));
  app.save(subs);
  const games = app.findCollectionByNameOrId("games");
  if (!games.fields.getByName("announced")) {
    games.fields.add(new BoolField({ name: "announced" }));
    app.save(games);
  }
  // les tables déjà ouvertes avant cette version ne sont pas annoncées
  app.db().newQuery("UPDATE games SET announced = 1 WHERE open = 1").execute();
}, (app) => {
  const subs = app.findCollectionByNameOrId("push_subs");
  for (const n of ["open_tcg", "last_open"]) if (subs.fields.getByName(n)) subs.fields.removeByName(n);
  app.save(subs);
  const games = app.findCollectionByNameOrId("games");
  if (games.fields.getByName("announced")) { games.fields.removeByName("announced"); app.save(games); }
});
