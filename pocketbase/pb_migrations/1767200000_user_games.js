/// <reference path="../pb_data/types.d.ts" />
// Jeux auxquels le joueur joue (["safir"], ["fab"], ou les deux) : la carte des joueurs ne montre que ceux du même jeu.
// Vide = déduit des decks du joueur.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("games")) users.fields.add(new JSONField({ name: "games", maxSize: 200 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("games");
  app.save(users);
});
