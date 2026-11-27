/// <reference path="../pb_data/types.d.ts" />
// Netrunner, 4e jeu, joué sur jinteki.net : ici seulement la communauté (salons texte et vocaux).
migrate((app) => {
  const T = "netrunner";
  const exists = (col, filter) => {
    try { app.findFirstRecordByFilter(col, filter); return true; } catch (_) { return false; }
  };
  try {
    const ch = app.findCollectionByNameOrId("channels");
    [
      ["général", "Discussions libres", 0],
      ["cherche-partie", "Trouver un adversaire pour une partie sur jinteki.net", 1],
      ["decks", "Partager et commenter des decks (liens NetrunnerDB)", 2],
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
}, (app) => {});
