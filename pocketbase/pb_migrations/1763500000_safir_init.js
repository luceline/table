/// <reference path="../pb_data/types.d.ts" />
// Table de jeu : schéma initial (PocketBase 0.23.x)
// cards : scans personnels (visibles uniquement par leur propriétaire, fichiers servis par URL)
//         kind = "carte" (va dans le deck) ou "jeton" (réserve à côté du tapis, copies illimitées)
// decks : decks construits à partir des scans
// games : partie à 2 joueurs (code, joueurs)
// seats : état de jeu d'un joueur dans une partie (un enregistrement par joueur :
//         les écritures simultanées des deux joueurs ne peuvent pas s'écraser)
// marks : un jeton posé sur un tapis ou accroché à une carte (un enregistrement par jeton,
//         modifiable uniquement par le joueur du côté concerné)

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const own = "@request.auth.id != '' && owner = @request.auth.id";

  const cards = new Collection({
    type: "base",
    name: "cards",
    listRule: own,
    viewRule: own,
    createRule: own,
    updateRule: own,
    deleteRule: own,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", max: 120 },
      { type: "select", name: "orient", values: ["p", "l"], maxSelect: 1 },
      { type: "select", name: "kind", values: ["carte", "jeton"], maxSelect: 1 },
      {
        type: "file", name: "image", required: true, maxSelect: 1, maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["0x300"],
      },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_cards_owner ON cards (owner)"],
  });
  app.save(cards);

  const decks = new Collection({
    type: "base",
    name: "decks",
    listRule: own,
    viewRule: own,
    createRule: own,
    updateRule: own,
    deleteRule: own,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 80 },
      { type: "json", name: "entries", maxSize: 200000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(decks);

  const member = "@request.auth.id != '' && (p1 = @request.auth.id || p2 = @request.auth.id || p2 = '')";

  const games = new Collection({
    type: "base",
    name: "games",
    listRule: member,
    viewRule: member,
    createRule: "@request.auth.id != '' && p1 = @request.auth.id",
    updateRule:
      "@request.auth.id != '' && (p1 = @request.auth.id || p2 = @request.auth.id || (p2 = '' && @request.body.p2 = @request.auth.id))",
    deleteRule: "@request.auth.id != '' && p1 = @request.auth.id",
    fields: [
      { type: "text", name: "code", required: true, min: 6, max: 6 },
      { type: "relation", name: "p1", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "p2", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "n1", max: 60 },
      { type: "text", name: "n2", max: 60 },
      { type: "select", name: "status", values: ["waiting", "playing", "finished"], maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_games_code ON games (code)"],
  });
  app.save(games);

  const seatMember =
    "@request.auth.id != '' && (player = @request.auth.id || game.p1 = @request.auth.id || game.p2 = @request.auth.id)";

  const seats = new Collection({
    type: "base",
    name: "seats",
    listRule: seatMember,
    viewRule: seatMember,
    createRule:
      "@request.auth.id != '' && player = @request.auth.id && (game.p1 = @request.auth.id || game.p2 = @request.auth.id)",
    updateRule: "@request.auth.id != '' && player = @request.auth.id",
    deleteRule: "@request.auth.id != '' && player = @request.auth.id",
    fields: [
      { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "player", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "json", name: "state", maxSize: 2000000 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_seats_game_player ON seats (game, player)"],
  });
  app.save(seats);

  const gameMember = "@request.auth.id != '' && (game.p1 = @request.auth.id || game.p2 = @request.auth.id)";
  // Chaque joueur ne gère que les jetons de son côté du plateau
  const ownSide = "@request.auth.id != '' && ((side = 'p1' && game.p1 = @request.auth.id) || (side = 'p2' && game.p2 = @request.auth.id))";

  const marks = new Collection({
    type: "base",
    name: "marks",
    listRule: gameMember,
    viewRule: gameMember,
    createRule: ownSide,
    updateRule: ownSide + " && (@request.body.side:isset = false || @request.body.side = side) && (@request.body.game:isset = false || @request.body.game = game)",
    deleteRule: ownSide,
    fields: [
      { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "side", required: true, values: ["p1", "p2"], maxSelect: 1 },
      { type: "number", name: "x" },
      { type: "number", name: "y" },
      { type: "text", name: "on", max: 20 },
      { type: "number", name: "dx" },
      { type: "number", name: "dy" },
      { type: "text", name: "color", max: 20 },
      { type: "number", name: "v", onlyInt: true },
    ],
    indexes: ["CREATE INDEX idx_marks_game ON marks (game)"],
  });
  app.save(marks);
}, (app) => {
  for (const name of ["marks", "seats", "games", "decks", "cards"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
