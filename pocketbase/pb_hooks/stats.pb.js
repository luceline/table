/// <reference path="../pb_data/types.d.ts" />
// Compteurs publics pour l'accueil : joueurs inscrits, et joueurs ayant des cartes de chaque jeu.
// Aucune donnée personnelle : seulement des nombres.
routerAdd("GET", "/api/table/stats", (e) => {
  const count = (sql) => {
    const r = new DynamicModel({ n: 0 });
    $app.db().newQuery(sql).one(r);
    return r.n;
  };
  const users = count("SELECT COUNT(*) AS n FROM users");
  const safir = count("SELECT COUNT(DISTINCT owner) AS n FROM cards WHERE tcg = '' OR tcg = 'safir'");
  const fab = count("SELECT COUNT(DISTINCT owner) AS n FROM cards WHERE tcg = 'fab'");
  const sorcery = count("SELECT COUNT(DISTINCT owner) AS n FROM cards WHERE tcg = 'sorcery'");
  e.response.header().set("Cache-Control", "public, max-age=60");
  return e.json(200, { users, tcg: { safir, fab, sorcery } });
});
