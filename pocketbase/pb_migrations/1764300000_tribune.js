/// <reference path="../pb_data/types.d.ts" />
// Tribune des spectateurs et présence.
// tribune  : tchat des spectateurs (sans compte, via ?spectate=CODE), lisible par les joueurs de la partie.
// watchers : une ligne par spectateur connecté, rafraîchie toutes les 30 s ; les joueurs comptent les lignes récentes.
const SPEC_CHILD = "(@request.query.spectate != '' && game.code = @request.query.spectate)";
const MEMBER = "(@request.auth.id != '' && (game.p1 = @request.auth.id || game.p2 = @request.auth.id))";
const READ = `${MEMBER} || ${SPEC_CHILD}`;

migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };

  if (!has("tribune")) {
    app.save(new Collection({
      type: "base",
      name: "tribune",
      listRule: READ,
      viewRule: READ,
      createRule: SPEC_CHILD,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "name", required: true, max: 24 },
        { type: "text", name: "text", required: true, max: 200 },
        { type: "text", name: "sid", max: 16 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_tribune_game ON tribune (game)"],
    }));
  }

  if (!has("watchers")) {
    app.save(new Collection({
      type: "base",
      name: "watchers",
      listRule: READ,
      viewRule: READ,
      createRule: SPEC_CHILD,
      updateRule: SPEC_CHILD,
      deleteRule: READ,
      fields: [
        { type: "relation", name: "game", required: true, collectionId: games.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "sid", required: true, max: 16 },
        { type: "number", name: "beat" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_watchers_game_sid ON watchers (game, sid)"],
    }));
  }
}, (app) => {
  for (const n of ["watchers", "tribune"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});
