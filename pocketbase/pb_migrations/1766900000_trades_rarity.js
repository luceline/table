/// <reference path="../pb_data/types.d.ts" />
// Échanges : rareté (et finition pour Flesh and Blood : normale, Rainbow Foil, Cold Foil) ; la quantité existait déjà.
// Une même carte peut figurer plusieurs fois dans une liste avec des raretés ou finitions différentes.
migrate((app) => {
  const c = app.findCollectionByNameOrId("trades");
  if (!c.fields.getByName("rarity")) c.fields.add(new TextField({ name: "rarity", max: 20 }));
  if (!c.fields.getByName("finish")) c.fields.add(new TextField({ name: "finish", max: 12 }));
  c.indexes = [
    "CREATE UNIQUE INDEX idx_trades_card ON trades (user, tcg, kind, series, num, rarity, finish)",
    "CREATE INDEX idx_trades_match ON trades (tcg, series, num)",
  ];
  app.save(c);
}, (app) => {
  const c = app.findCollectionByNameOrId("trades");
  c.indexes = [
    "CREATE UNIQUE INDEX idx_trades_card ON trades (user, tcg, kind, series, num)",
    "CREATE INDEX idx_trades_match ON trades (tcg, series, num)",
  ];
  c.fields.removeByName("rarity");
  c.fields.removeByName("finish");
  app.save(c);
});
