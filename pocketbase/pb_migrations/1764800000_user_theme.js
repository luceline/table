/// <reference path="../pb_data/types.d.ts" />
// Thème visuel choisi par le joueur (jade, grimoire, arene), pour le retrouver sur tous ses appareils.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("theme")) {
    users.fields.add(new TextField({ name: "theme", max: 20 }));
    app.save(users);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  if (users.fields.getByName("theme")) {
    users.fields.removeByName("theme");
    app.save(users);
  }
});
