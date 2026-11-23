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

// Annonce des tables ouvertes (« Je cherche un partenaire ») : chaque minute, les tables ouvertes (immédiates, ou dont l'heure
// d'ouverture est passée) pas encore annoncées et toujours libres sont signalées :
//  - aux joueurs qui ont au moins un deck de ce jeu, sauf s'ils ont coupé ces alertes (users.partner_off), hors 23 h - 8 h (Paris) ;
//  - aux appareils abonnés explicitement à ce jeu (push_subs.open_tcg), à toute heure.
// Jamais au créateur, ni à un joueur en pleine partie. Au plus une alerte toutes les 30 minutes par joueur,
// et au plus une annonce toutes les 20 minutes par créateur (les suivantes restent visibles dans la liste, sans notification).
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
  if (!games.length) return;
  const ids = (sql, params) => {
    try {
      const rows = arrayOf(new DynamicModel({ id: "" }));
      $app.db().newQuery(sql).bind(params || {}).all(rows);
      return rows.map((r) => r.id);
    } catch (_) {
      return [];
    }
  };
  let quiet = false;
  try {
    const m = require(`${__hooks}/daily_lib.js`).paris().min;
    quiet = m >= 23 * 60 || m < 8 * 60;
  } catch (_) {}
  // joueurs en pleine partie (présence de moins de 3 minutes)
  const playing = {};
  for (const u of ids("SELECT user AS id FROM online WHERE [[where]] = 'partie' AND at >= {:t}", { t: iso(3 * 60 * 1000) })) playing[u] = true;
  for (const g of games) {
    g.set("announced", true);
    try { $app.save(g); } catch (_) { continue; }
    const tcg = g.getString("tcg") === "fab" ? "fab" : "safir";
    const host = g.getString("p1");
    // limite par créateur
    try {
      const h = $app.findRecordById("users", host);
      if (h.getString("partner_last") > iso(20 * 60 * 1000)) continue;
      h.set("partner_last", now);
      $app.saveNoValidate(h);
    } catch (_) {}
    const off = {};
    for (const u of ids("SELECT id FROM users WHERE partner_off LIKE {:t}", { t: '%"' + tcg + '"%' })) off[u] = true;
    const withDeck = {};
    if (!quiet) {
      const sql = tcg === "fab"
        ? "SELECT DISTINCT owner AS id FROM decks WHERE tcg = 'fab'"
        : "SELECT DISTINCT owner AS id FROM decks WHERE tcg = '' OR tcg = 'safir' OR tcg IS NULL";
      for (const u of ids(sql)) withDeck[u] = true;
    }
    let subs = [];
    try {
      subs = $app.findRecordsByFilter("push_subs", "user != {:host}", "", 3000, 0, { host: host });
    } catch (_) {
      continue;
    }
    const recent = {};
    const since = iso(30 * 60 * 1000);
    for (const s of subs) if (s.getString("last_open") > since) recent[s.getString("user")] = true;
    subs = subs.filter((s) => {
      const u = s.getString("user");
      if (recent[u] || playing[u] || off[u]) return false;
      const explicit = s.getString("open_tcg").indexOf('"' + tcg + '"') >= 0;
      return explicit || !!withDeck[u];
    });
    if (!subs.length) continue;
    const note = g.getString("note");
    const payload = {
      title: tcg === "fab" ? "Partenaire recherché · Flesh and Blood" : "Partenaire recherché · Safir",
      body: `${g.getString("n1") || "Un joueur"} cherche un partenaire${note ? " : « " + note + " »" : ""}. Touchez pour vous asseoir.`,
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
