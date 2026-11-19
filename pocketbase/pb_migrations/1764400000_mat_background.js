/// <reference path="../pb_data/types.d.ts" />
// Fond personnel du tapis : image choisie par le joueur (visible de lui seul) et assombrissement (0 à 90 %).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("mat_bg")) {
    users.fields.add(new FileField({
      name: "mat_bg",
      maxSelect: 1,
      maxSize: 5 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    }));
  }
  if (!users.fields.getByName("mat_dim")) {
    users.fields.add(new NumberField({ name: "mat_dim", min: 0, max: 90 }));
  }
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const n of ["mat_bg", "mat_dim"]) if (users.fields.getByName(n)) users.fields.removeByName(n);
  app.save(users);
});
