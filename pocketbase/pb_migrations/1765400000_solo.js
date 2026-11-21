/// <reference path="../pb_data/types.d.ts" />
// Partie solo : un joueur teste deux de ses decks l'un contre l'autre, en changeant de côté.
// games.solo : partie solo (p1 = p2 = le joueur) ; seats.slot : "" pour le côté 1, "b" pour le côté 2
// (les parties normales gardent un seul siège par joueur, slot vide).
migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  if (!games.fields.getByName("solo")) {
    games.fields.add(new BoolField({ name: "solo" }));
    app.save(games);
  }
  const seats = app.findCollectionByNameOrId("seats");
  if (!seats.fields.getByName("slot")) seats.fields.add(new TextField({ name: "slot", max: 2 }));
  seats.indexes = ["CREATE UNIQUE INDEX idx_seats_game_player_slot ON seats (game, player, slot)"];
  app.save(seats);
}, (app) => {
  const seats = app.findCollectionByNameOrId("seats");
  seats.indexes = ["CREATE UNIQUE INDEX idx_seats_game_player ON seats (game, player)"];
  if (seats.fields.getByName("slot")) seats.fields.removeByName("slot");
  app.save(seats);
  const games = app.findCollectionByNameOrId("games");
  if (games.fields.getByName("solo")) { games.fields.removeByName("solo"); app.save(games); }
});
