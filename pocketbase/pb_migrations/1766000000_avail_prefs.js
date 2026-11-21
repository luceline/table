/// <reference path="../pb_data/types.d.ts" />
// Agenda : préférences de jeu du joueur (vocal ou non, cartes filmées, débutant…) et un petit mot,
// montrés aux joueurs qui ont des créneaux en commun avec lui.
migrate((app) => {
  const c = app.findCollectionByNameOrId("avail");
  if (!c.fields.getByName("prefs")) c.fields.add(new JSONField({ name: "prefs", maxSize: 2000 }));
  if (!c.fields.getByName("note")) c.fields.add(new TextField({ name: "note", max: 120 }));
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("avail");
  for (const n of ["prefs", "note"]) if (c.fields.getByName(n)) c.fields.removeByName(n);
  app.save(c);
});
