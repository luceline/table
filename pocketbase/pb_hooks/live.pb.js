/// <reference path="../pb_data/types.d.ts" />
// Parties en direct : parties en cours du jeu choisi, avec une action récente, pour les regarder en spectateur.
// Réservé aux joueurs connectés. Renvoie seulement le code (déjà suffisant pour regarder), les pseudos,
// l'heure de la dernière action et le nombre de spectateurs ; jamais l'état de jeu.
routerAdd("GET", "/api/table/live", (e) => {
  const tcg = require(`${__hooks}/tcg_lib.js`).norm(e.request.url.query().get("tcg"));
  const me = e.auth ? e.auth.id : "";
  const iso = (ms) => new Date(Date.now() - ms).toISOString().replace("T", " ");
  const rows = arrayOf(new DynamicModel({ code: "", n1: "", n2: "", last: "", watching: 0 }));
  $app.db().newQuery(
    "SELECT g.code AS code, g.n1 AS n1, g.n2 AS n2, MAX(s.updated) AS last, " +
    "(SELECT COUNT(*) FROM watchers w WHERE w.game = g.id AND w.updated >= {:wsince}) AS watching " +
    "FROM games g JOIN seats s ON s.game = g.id " +
    "WHERE g.status = 'playing' AND COALESCE(g.solo, 0) = 0 AND g.p1 != {:me} AND g.p2 != {:me} AND " +
    require(`${__hooks}/tcg_lib.js`).sql(tcg, "g.tcg") + " " +
    // au moins un des deux joueurs encore à sa table (présence rafraîchie toutes les 45 s)
    "AND EXISTS (SELECT 1 FROM here h WHERE h.game = g.id AND h.updated >= {:hsince}) " +
    "GROUP BY g.id HAVING last >= {:since} ORDER BY last DESC LIMIT 30"
  ).bind({ me: me, since: iso(45 * 60 * 1000), wsince: iso(90 * 1000), hsince: iso(150 * 1000) }).all(rows);
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { games: rows.map((r) => ({ code: r.code, n1: r.n1, n2: r.n2, last: r.last, watching: r.watching })) });
}, $apis.requireAuth());
