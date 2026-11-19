/// <reference path="../pb_data/types.d.ts" />
// Dos des cartes personnel : image choisie par le joueur, visible de lui seul.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("card_back")) {
    users.fields.add(new FileField({
      name: "card_back",
      maxSelect: 1,
      maxSize: 3 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    }));
    app.save(users);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  if (users.fields.getByName("card_back")) {
    users.fields.removeByName("card_back");
    app.save(users);
  }
});
