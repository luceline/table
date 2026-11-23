/// <reference path="../pb_data/types.d.ts" />
// Ville du joueur (facultative) pour la carte des joueurs : nom, département (France) ou pays, coordonnées du centre de la ville.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("city")) users.fields.add(new TextField({ name: "city", max: 80 }));
  if (!users.fields.getByName("city_tag")) users.fields.add(new TextField({ name: "city_tag", max: 4 }));
  if (!users.fields.getByName("city_lat")) users.fields.add(new NumberField({ name: "city_lat" }));
  if (!users.fields.getByName("city_lon")) users.fields.add(new NumberField({ name: "city_lon" }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const n of ["city", "city_tag", "city_lat", "city_lon"]) users.fields.removeByName(n);
  app.save(users);
});
