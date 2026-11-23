/// <reference path="../pb_data/types.d.ts" />
// « Je cherche un partenaire » : les joueurs qui ont un deck d'un jeu sont prévenus par défaut (s'ils ont activé les notifications).
// users.partner_off  : jeux pour lesquels le joueur ne veut plus ces alertes (["safir"], ["fab"]…)
// users.partner_last : dernière annonce envoyée par ce joueur (serveur seul, limite l'envoi en rafale)
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("partner_off")) users.fields.add(new JSONField({ name: "partner_off", maxSize: 200 }));
  if (!users.fields.getByName("partner_last")) users.fields.add(new TextField({ name: "partner_last", max: 30 }));
  const lock = "@request.body.partner_last:isset = false";
  if (users.updateRule && !users.updateRule.includes("partner_last")) users.updateRule = `(${users.updateRule}) && ${lock}`;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("partner_off");
  users.fields.removeByName("partner_last");
  if (users.updateRule) users.updateRule = users.updateRule.replace(/^\((.*)\) && @request\.body\.partner_last:isset = false$/, "$1");
  app.save(users);
});
