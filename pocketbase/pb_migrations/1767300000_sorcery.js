/// <reference path="../pb_data/types.d.ts" />
// Sorcery: Contested Realm, 3e jeu : types de cartes (avatar, site, sort), rareté (exemplaires permis dans un deck), salons texte et vocaux,
// salon de la carte du jour et séries pour les échanges (modifiables par l'administrateur).
migrate((app) => {
  const cards = app.findCollectionByNameOrId("cards");
  if (!cards.fields.getByName("rarity")) cards.fields.add(new TextField({ name: "rarity", max: 20 }));
  // types de cartes Sorcery : avatar, site (atlas), sort (grimoire)
  const kind = cards.fields.getByName("kind");
  const vals = [...(kind.values || [])];
  for (const v of ["avatar", "site", "sort"]) if (!vals.includes(v)) vals.push(v);
  kind.values = vals;
  app.save(cards);
  const T = "sorcery";
  const exists = (col, filter) => {
    try { app.findFirstRecordByFilter(col, filter); return true; } catch (_) { return false; }
  };
  try {
    const ch = app.findCollectionByNameOrId("channels");
    [
      ["général", "Discussions libres", 0],
      ["cherche-partie", "Trouver un adversaire, proposer une heure", 1],
      ["carte-du-jour", "Partagez votre résultat de la carte du jour (sans donner la réponse !)", 2],
    ].forEach(([name, topic, n]) => {
      if (exists("channels", `tcg = '${T}' && name = '${name}'`)) return;
      const r = new Record(ch);
      r.set("tcg", T); r.set("name", name); r.set("topic", topic); r.set("sort", n);
      app.save(r);
    });
  } catch (_) {}
  try {
    const vr = app.findCollectionByNameOrId("voice_rooms");
    [["vocal-général", 0], ["stream-et-parties", 1]].forEach(([name, n]) => {
      if (exists("voice_rooms", `tcg = '${T}' && name = '${name}'`)) return;
      const r = new Record(vr);
      r.set("tcg", T); r.set("name", name); r.set("sort", n); r.set("max", 6);
      app.save(r);
    });
  } catch (_) {}
  try {
    const se = app.findCollectionByNameOrId("series");
    [["ALP", "Alpha"], ["BET", "Beta"], ["ART", "Arthurian Legends"], ["DRA", "Dragonlord"], ["GOT", "Gothic"]].forEach(([code, name], i) => {
      if (exists("series", `tcg = '${T}' && code = '${code}'`)) return;
      const r = new Record(se);
      r.set("tcg", T); r.set("code", code); r.set("name", name); r.set("sort", i);
      app.save(r);
    });
  } catch (_) {}
}, (app) => {
  const cards = app.findCollectionByNameOrId("cards");
  cards.fields.removeByName("rarity");
  app.save(cards);
});
