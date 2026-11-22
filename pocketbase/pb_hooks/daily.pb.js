/// <reference path="../pb_data/types.d.ts" />
// Carte du jour, classement du mois, profils (titre, badges), titres en lot, présence, rappel du soir.
// Toute la logique est dans daily_lib.js.

routerAdd("GET", "/api/table/daily", (e) => {
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(`${__hooks}/daily_lib.js`).state(e.auth.id, e.request.url.query().get("tcg")));
}, $apis.requireAuth());

routerAdd("POST", "/api/table/daily/guess", (e) => {
  const b = e.requestInfo().body || {};
  return e.json(200, require(`${__hooks}/daily_lib.js`).guess(e.auth.id, String(b.tcg || ""), b.guess));
}, $apis.requireAuth());

routerAdd("GET", "/api/table/daily/board", (e) => {
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(`${__hooks}/daily_lib.js`).board(e.auth.id, e.request.url.query().get("tcg")));
}, $apis.requireAuth());

routerAdd("GET", "/api/table/profile", (e) => {
  const p = require(`${__hooks}/daily_lib.js`).profile(String(e.request.url.query().get("u") || e.auth.id));
  if (!p) return e.json(404, { message: "Joueur introuvable." });
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, p);
}, $apis.requireAuth());

// Titres de plusieurs joueurs (pseudos affichés dans les salons) : ids séparés par des virgules, 60 au plus
routerAdd("GET", "/api/table/titles", (e) => {
  const ids = String(e.request.url.query().get("ids") || "").split(",").filter((x) => /^[a-z0-9]{15}$/.test(x)).slice(0, 60);
  return e.json(200, { titles: require(`${__hooks}/daily_lib.js`).titles(ids) });
}, $apis.requireAuth());

routerAdd("GET", "/api/table/online", (e) => {
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, require(`${__hooks}/daily_lib.js`).online(e.request.url.query().get("tcg")));
}, $apis.requireAuth());

// Rappel du soir : vers 17 h 30 (heure de Paris), une notification au plus par jour et par joueur qui l'a demandé
cronAdd("evening_remind", "*/10 * * * *", () => {
  const lib = require(`${__hooks}/daily_lib.js`);
  const p = lib.paris();
  if (p.min < 17 * 60 + 30 || p.min >= 19 * 60) return;
  lib.remindEvening();
});

// Ménage de la présence (plus d'un jour sans signe de vie)
cronAdd("online_cleanup", "17 4 * * *", () => {
  try { $app.db().newQuery("DELETE FROM online WHERE at < {:t}").bind({ t: new Date(Date.now() - 86400000).toISOString().replace("T", " ") }).execute(); } catch (_) {}
});
