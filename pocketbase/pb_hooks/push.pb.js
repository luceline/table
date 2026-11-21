/// <reference path="../pb_data/types.d.ts" />
// Notifications : « quelqu'un a rejoint votre table ».
// La signature des notifications (VAPID) est faite par un petit script Node (push/send.js), appelé ici.
// Clés : push/vapid.json, créé une fois par « node push/keys.js ».

// Clé publique, nécessaire au navigateur pour s'abonner
routerAdd("GET", "/api/table/push-key", (e) => {
  try {
    const raw = toString($os.readFile(__hooks + "/../../push/vapid.json"));
    return e.json(200, { key: JSON.parse(raw).publicKey });
  } catch (_) {
    return e.json(200, { key: "" });
  }
});

// Un joueur s'assoit à une table (p2 passe de vide à rempli) : on prévient celui qui l'a créée
onRecordUpdate((e) => {
  const before = e.record.original().getString("p2");
  e.next();
  const after = e.record.getString("p2");
  if (before || !after || e.record.getBool("solo")) return;
  const host = e.record.getString("p1");
  if (!host || host === after) return;
  try {
    const subs = $app.findRecordsByFilter("push_subs", "user = {:u}", "", 20, 0, { u: host });
    if (!subs.length) return;
    const who = e.record.getString("n2") || "Un joueur";
    const payload = {
      title: "Table de jeu",
      body: `${who} a rejoint votre table ${e.record.getString("code")} : à vous de jouer !`,
      url: "/?game=" + e.record.id,
      tag: "join-" + e.record.id,
    };
    const arg = JSON.stringify({
      subs: subs.map((s) => ({ endpoint: s.getString("endpoint"), keys: { p256dh: s.getString("p256dh"), auth: s.getString("auth") } })),
      payload: payload,
    });
    const res = JSON.parse(toString($os.cmd("node", __hooks + "/../../push/send.js", arg).output()) || "{}");
    for (const ep of res.gone || []) {
      for (const s of subs) if (s.getString("endpoint") === ep) $app.delete(s);
    }
    if (res.error) console.log("notification non envoyée :", res.error);
  } catch (err) {
    console.log("notification non envoyée :", err);
  }
}, "games");

// Annonce des tables ouvertes : chaque minute, les tables ouvertes (immédiates, ou dont l'heure d'ouverture est passée)
// pas encore annoncées et toujours libres sont signalées aux appareils abonnés à ce jeu.
// Une seule annonce par table ; au plus une annonce toutes les 30 minutes par joueur ; jamais au créateur de la table.
cronAdd("open_tables_alert", "* * * * *", () => {
  const iso = (ms) => new Date(Date.now() - ms).toISOString().replace("T", " ");
  const now = iso(0);
  let games = [];
  try {
    games = $app.findRecordsByFilter(
      "games",
      "open = true && announced = false && status = 'waiting' && p2 = '' && (opens_at = '' || opens_at <= {:now}) && created >= {:day}",
      "created", 20, 0, { now: now, day: iso(24 * 3600 * 1000) },
    );
  } catch (_) {
    return;
  }
  for (const g of games) {
    g.set("announced", true);
    try { $app.save(g); } catch (_) { continue; }
    const tcg = g.getString("tcg") === "fab" ? "fab" : "safir";
    const host = g.getString("p1");
    let subs = [];
    try {
      // appareils abonnés à ce jeu, hors créateur, dont le joueur n'a rien reçu depuis 30 minutes
      subs = $app.findRecordsByFilter(
        "push_subs",
        "open_tcg ~ {:t} && user != {:host}",
        "", 500, 0, { t: '"' + tcg + '"', host: host },
      );
    } catch (_) {
      continue;
    }
    const recent = {};
    const since = iso(30 * 60 * 1000);
    for (const s of subs) if (s.getString("last_open") > since) recent[s.getString("user")] = true;
    subs = subs.filter((s) => !recent[s.getString("user")]);
    if (!subs.length) continue;
    const note = g.getString("note");
    const payload = {
      title: tcg === "fab" ? "Table ouverte · Flesh and Blood" : "Table ouverte · Safir",
      body: `${g.getString("n1") || "Un joueur"} ouvre une table${note ? " : « " + note + " »" : ""}. Touchez pour vous asseoir.`,
      url: "/?tables=" + tcg,
      tag: "open-" + g.id,
    };
    try {
      const arg = JSON.stringify({
        subs: subs.map((s) => ({ endpoint: s.getString("endpoint"), keys: { p256dh: s.getString("p256dh"), auth: s.getString("auth") } })),
        payload: payload,
      });
      const res = JSON.parse(toString($os.cmd("node", __hooks + "/../../push/send.js", arg).output()) || "{}");
      const gone = {};
      for (const ep of res.gone || []) gone[ep] = true;
      for (const s of subs) {
        if (gone[s.getString("endpoint")]) { try { $app.delete(s); } catch (_) {} continue; }
        s.set("last_open", now);
        try { $app.save(s); } catch (_) {}
      }
      if (res.error) console.log("annonce de table non envoyée :", res.error);
    } catch (err) {
      console.log("annonce de table non envoyée :", err);
    }
  }
});
