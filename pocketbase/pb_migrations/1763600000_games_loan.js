/// <reference path="../pb_data/types.d.ts" />
// Deck prêté : le créateur d'une partie peut prêter un de ses decks à un adversaire qui n'a pas de cartes.
// Instantané des cartes (id, fichier, nom, format, type) : le joueur invité n'a pas accès à la collection
// du prêteur, il affiche simplement les images par leur URL.
migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  if (!games.fields.getByName("loan")) {
    games.fields.add(new JSONField({ name: "loan", maxSize: 500000 }));
    app.save(games);
  }
}, (app) => {
  const games = app.findCollectionByNameOrId("games");
  if (games.fields.getByName("loan")) {
    games.fields.removeByName("loan");
    app.save(games);
  }
});
