/// <reference path="../pb_data/types.d.ts" />
// Présence, rappel du soir, carte du jour.
// online      : dernier signe de vie de chaque joueur connecté (toutes les 60 s) et l'endroit (accueil, salons, partie, vocal)
// users       : hide_online (apparaître hors ligne), remind (rappel du soir), remind_last (jour du dernier rappel, serveur seul)
// daily       : carte du jour de chaque jeu (réponse cachée : lue seulement par le serveur)
// daily_plays : essais de chaque joueur (lus par lui seul ; écrits par le serveur)
// channels    : salon « carte-du-jour » ajouté à chaque jeu, pour partager son résultat
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users");
  const AUTH = "@request.auth.id != ''";
  const SELF = "@request.auth.id != '' && user = @request.auth.id";

  if (!users.fields.getByName("hide_online")) users.fields.add(new BoolField({ name: "hide_online" }));
  if (!users.fields.getByName("remind")) users.fields.add(new BoolField({ name: "remind" }));
  if (!users.fields.getByName("remind_last")) users.fields.add(new TextField({ name: "remind_last", max: 10 }));
  const lock = "@request.body.remind_last:isset = false";
  if (users.updateRule && !users.updateRule.includes("remind_last")) users.updateRule = `(${users.updateRule}) && ${lock}`;
  app.save(users);

  if (!has("online")) {
    app.save(new Collection({
      type: "base", name: "online",
      listRule: AUTH, viewRule: AUTH,
      createRule: SELF,
      updateRule: SELF + " && @request.body.user:isset = false",
      deleteRule: SELF,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "at", max: 40 },
        { type: "text", name: "where", max: 12 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_online_user ON online (user)"],
    }));
  }

  if (!has("daily")) {
    app.save(new Collection({
      type: "base", name: "daily",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: "text", name: "day", required: true, max: 10 },
        { type: "text", name: "tcg", max: 20 },
        { type: "number", name: "num" },
        { type: "text", name: "card", max: 20 },
        { type: "text", name: "name", max: 120 },
        { type: "text", name: "img", max: 200 },
        { type: "text", name: "orient", max: 2 },
        { type: "number", name: "fx" },
        { type: "number", name: "fy" },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_daily_day ON daily (day, tcg)"],
    }));
  }
  if (!has("daily_plays")) {
    app.save(new Collection({
      type: "base", name: "daily_plays",
      listRule: SELF, viewRule: SELF, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "day", required: true, max: 10 },
        { type: "text", name: "tcg", max: 20 },
        { type: "number", name: "num" },
        { type: "json", name: "tries", maxSize: 4000 },
        { type: "bool", name: "found" },
        { type: "bool", name: "done" },
        { type: "number", name: "score" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_daily_plays ON daily_plays (user, day, tcg)",
        "CREATE INDEX idx_daily_plays_tcg ON daily_plays (tcg, day)",
      ],
    }));
  }

  // Salon « carte-du-jour » dans chaque jeu (s'il n'existe pas déjà)
  try {
    const ch = app.findCollectionByNameOrId("channels");
    for (const tcg of ["safir", "fab"]) {
      const f = tcg === "fab" ? "tcg = 'fab'" : "(tcg = '' || tcg = 'safir')";
      let exists = false;
      try { app.findFirstRecordByFilter("channels", f + " && name = 'carte-du-jour'"); exists = true; } catch (_) {}
      if (exists) continue;
      let max = 0;
      try { for (const c of app.findRecordsByFilter("channels", f, "-sort", 1, 0)) max = c.getInt("sort"); } catch (_) {}
      const r = new Record(ch);
      r.set("tcg", tcg);
      r.set("name", "carte-du-jour");
      r.set("topic", "Partagez votre résultat de la carte du jour (sans donner la réponse !)");
      r.set("sort", max + 1);
      app.save(r);
    }
  } catch (_) {}
}, (app) => {
  for (const n of ["daily_plays", "daily", "online"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});
