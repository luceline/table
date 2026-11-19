/// <reference path="../pb_data/types.d.ts" />
// Mode spectateur : lecture seule d'une partie pour qui connaît son code (6 caractères aléatoires),
// sans compte. Le client passe ?spectate=CODE ; aucune écriture n'est ouverte aux spectateurs.
const SPEC_GAME = "(@request.query.spectate != '' && code = @request.query.spectate)";
const SPEC_CHILD = "(@request.query.spectate != '' && game.code = @request.query.spectate)";
const wrap = (rule, extra) => (rule === null || rule === undefined ? extra : rule === "" ? "" : `(${rule}) || ${extra}`);

migrate((app) => {
  const games = app.findCollectionByNameOrId("games");
  games.listRule = wrap(games.listRule, SPEC_GAME);
  games.viewRule = wrap(games.viewRule, SPEC_GAME);
  app.save(games);
  for (const name of ["seats", "marks", "messages"]) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = wrap(c.listRule, SPEC_CHILD);
    c.viewRule = wrap(c.viewRule, SPEC_CHILD);
    app.save(c);
  }
}, (app) => {
  const strip = (rule, extra) => (rule && rule.endsWith(` || ${extra}`) ? rule.slice(1, -(` || ${extra}`.length) - 1) : rule);
  const games = app.findCollectionByNameOrId("games");
  games.listRule = strip(games.listRule, SPEC_GAME);
  games.viewRule = strip(games.viewRule, SPEC_GAME);
  app.save(games);
  for (const name of ["seats", "marks", "messages"]) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = strip(c.listRule, SPEC_CHILD);
    c.viewRule = strip(c.viewRule, SPEC_CHILD);
    app.save(c);
  }
});
