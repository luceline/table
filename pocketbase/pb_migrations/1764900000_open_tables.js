/// <reference path="../pb_data/types.d.ts" />
// Tables ouvertes : partie en attente visible de tous les joueurs du même jeu, avec heure d'ouverture
// facultative et petit message. Les parties en attente sont déjà lisibles par tout joueur connecté.
migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  if (!games.fields.getByName("open")) games.fields.add(new BoolField({ name: "open" }));
  if (!games.fields.getByName("opens_at")) games.fields.add(new DateField({ name: "opens_at" }));
  if (!games.fields.getByName("note")) games.fields.add(new TextField({ name: "note", max: 80 }));
  app.save(games);
}, (app) => {
  const games = app.findCollectionByNameOrId("games");
  for (const n of ["open", "opens_at", "note"]) if (games.fields.getByName(n)) games.fields.removeByName(n);
  app.save(games);
});
