/// <reference path="../pb_data/types.d.ts" />
// Plusieurs jeux de cartes : champ « tcg » sur les cartes, decks et parties (vide = Safir, données existantes),
// et format du deck (ex. Flesh and Blood : cc = Classic Constructed, blitz).
migrate((app) => {
  for (const name of ["cards", "decks", "games"]) {
    const c = app.findCollectionByNameOrId(name);
    if (!c.fields.getByName("tcg")) {
      c.fields.add(new TextField({ name: "tcg", max: 20 }));
      app.save(c);
    }
  }
  const decks = app.findCollectionByNameOrId("decks");
  if (!decks.fields.getByName("format")) {
    decks.fields.add(new TextField({ name: "format", max: 20 }));
    app.save(decks);
  }
}, (app) => {
  for (const name of ["cards", "decks", "games"]) {
    const c = app.findCollectionByNameOrId(name);
    if (c.fields.getByName("tcg")) { c.fields.removeByName("tcg"); app.save(c); }
  }
  const decks = app.findCollectionByNameOrId("decks");
  if (decks.fields.getByName("format")) { decks.fields.removeByName("format"); app.save(decks); }
});
