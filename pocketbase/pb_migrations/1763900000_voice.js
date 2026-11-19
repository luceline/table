/// <reference path="../pb_data/types.d.ts" />
// Talkie-walkie : messages vocaux dans le tchat (fichier audio court + durée). Le texte devient facultatif.
migrate((app) => {
  const m = app.findCollectionByNameOrId("messages");
  const t = m.fields.getByName("text");
  if (t) t.required = false;
  if (!m.fields.getByName("audio")) {
    m.fields.add(new FileField({
      name: "audio",
      maxSelect: 1,
      maxSize: 2000000,
      mimeTypes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav", "video/webm", "video/mp4", "application/octet-stream"],
    }));
  }
  if (!m.fields.getByName("dur")) m.fields.add(new NumberField({ name: "dur" }));
  app.save(m);
}, (app) => {
  const m = app.findCollectionByNameOrId("messages");
  for (const n of ["audio", "dur"]) if (m.fields.getByName(n)) m.fields.removeByName(n);
  app.save(m);
});
