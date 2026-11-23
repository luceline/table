/// <reference path="../pb_data/types.d.ts" />
// Échanges entre joueurs : cartes en double et cartes recherchées (sans image), pour se mettre en relation.
// series : saisons / extensions de chaque jeu (Safir : S1, S2, S2.5, S3, S3.5), gérées par l'administrateur
// trades : une ligne par carte : kind « have » (en double) ou « want » (recherchée), saison, numéro, nom (facultatif),
//          mode « trade » (échange), « sell » (vente ; pour une recherche : achat) ou « both », prix en euros (facultatif)
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users");
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "@request.auth.id != '' && @collection.admins.user ?= @request.auth.id";
  const OWN = "@request.auth.id != '' && user = @request.auth.id";

  if (!has("series")) {
    app.save(new Collection({
      type: "base", name: "series",
      listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
      fields: [
        { type: "text", name: "tcg", max: 20 },
        { type: "text", name: "code", required: true, max: 12 },
        { type: "text", name: "name", max: 60 },
        { type: "number", name: "sort" },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_series_code ON series (tcg, code)"],
    }));
    const col = app.findCollectionByNameOrId("series");
    ["S1", "S2", "S2.5", "S3", "S3.5"].forEach((code, i) => {
      const r = new Record(col);
      r.set("tcg", "safir");
      r.set("code", code);
      r.set("name", "Saison " + code.slice(1));
      r.set("sort", i);
      app.save(r);
    });
  }

  if (!has("trades")) {
    app.save(new Collection({
      type: "base", name: "trades",
      listRule: AUTH, viewRule: AUTH,
      createRule: OWN,
      updateRule: OWN + " && @request.body.user:isset = false",
      deleteRule: OWN,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "uname", max: 40 },
        { type: "text", name: "tcg", max: 20 },
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["have", "want"] },
        { type: "text", name: "series", required: true, max: 12 },
        { type: "text", name: "num", required: true, max: 12 },
        { type: "text", name: "name", max: 80 },
        { type: "select", name: "mode", required: true, maxSelect: 1, values: ["trade", "sell", "both"] },
        { type: "number", name: "price", min: 0, max: 100000 },
        { type: "number", name: "qty", min: 1, max: 99 },
        { type: "text", name: "note", max: 140 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_trades_card ON trades (user, tcg, kind, series, num)",
        "CREATE INDEX idx_trades_match ON trades (tcg, series, num)",
      ],
    }));
  }
}, (app) => {
  for (const n of ["trades", "series"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});
