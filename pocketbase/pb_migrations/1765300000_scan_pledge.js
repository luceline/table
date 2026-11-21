/// <reference path="../pb_data/types.d.ts" />
// Engagement du joueur au premier scan : « je n'ajoute que des cartes que je possède, photographiées par moi ».
// Date d'acceptation, enregistrée sur le compte.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("scan_pledge")) {
    users.fields.add(new DateField({ name: "scan_pledge" }));
    app.save(users);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  if (users.fields.getByName("scan_pledge")) {
    users.fields.removeByName("scan_pledge");
    app.save(users);
  }
});
