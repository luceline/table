/// <reference path="../pb_data/types.d.ts" />
// Salons : image jointe à un message, avertissement « spoiler », et réactions aux messages.
// post_reacts : une ligne par joueur, message et émoji ; lisibles par les joueurs connectés, chacun gère les siennes.
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🤔"];
migrate((app) => {
  const posts = app.findCollectionByNameOrId("posts");
  if (!posts.fields.getByName("image")) {
    posts.fields.add(new FileField({ name: "image", maxSelect: 1, maxSize: 4 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], thumbs: ["0x480"] }));
  }
  if (!posts.fields.getByName("spoiler")) posts.fields.add(new BoolField({ name: "spoiler" }));
  const text = posts.fields.getByName("text");
  if (text) text.required = false; // un message peut n'être qu'une image
  app.save(posts);

  try { app.findCollectionByNameOrId("post_reacts"); return; } catch (_) {}
  const AUTH = "@request.auth.id != ''";
  app.save(new Collection({
    type: "base", name: "post_reacts",
    listRule: AUTH, viewRule: AUTH,
    // émojis proposés par l'appli seulement
    createRule: AUTH + " && user = @request.auth.id && (" + EMOJIS.map((e) => `emoji = '${e}'`).join(" || ") + ")",
    updateRule: null,
    deleteRule: AUTH + " && user = @request.auth.id",
    fields: [
      { type: "relation", name: "post", required: true, collectionId: posts.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "emoji", required: true, max: 8 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_post_reacts ON post_reacts (post, user, emoji)", "CREATE INDEX idx_post_reacts_post ON post_reacts (post)"],
  }));
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("post_reacts")); } catch (_) {}
  const posts = app.findCollectionByNameOrId("posts");
  for (const n of ["image", "spoiler"]) if (posts.fields.getByName(n)) posts.fields.removeByName(n);
  app.save(posts);
});
