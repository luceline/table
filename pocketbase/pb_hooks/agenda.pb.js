/// <reference path="../pb_data/types.d.ts" />
// Agenda des disponibilités et propositions de partie.

// Créneaux en commun (30 min au moins) entre mon agenda et celui des autres joueurs du jeu choisi.
// Les agendas restent privés : on ne renvoie que les intersections, en minutes de la semaine UTC (lundi 0 h = 0).
routerAdd("GET", "/api/table/agenda-matches", (e) => {
  const tcg = require(`${__hooks}/tcg_lib.js`).norm(e.request.url.query().get("tcg"));
  const W = 7 * 1440;
  const now = new Date().toISOString().replace("T", " ");
  const read = (r) => {
    let slots = [];
    try { slots = JSON.parse(r.getString("slots") || "[]") || []; } catch (_) {}
    const off = r.getInt("off");
    const out = [];
    for (const sl of slots) {
      const d = +sl.d, s = +sl.s, en = +sl.e;
      if (!(d >= 0 && d < 7 && s >= 0 && en <= 1440 && en > s)) continue;
      const a = (((d * 1440 + s + off) % W) + W) % W;
      const len = en - s;
      if (a + len <= W) out.push([a, a + len]);
      else { out.push([a, W]); out.push([0, a + len - W]); }
    }
    return out;
  };
  const merge = (iv) => {
    iv.sort((x, y) => x[0] - y[0]);
    const m = [];
    for (const x of iv) {
      if (m.length && x[0] <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], x[1]);
      else m.push([x[0], x[1]]);
    }
    // créneau à cheval sur dimanche-lundi (UTC) : on le recolle
    if (m.length > 1 && m[0][0] === 0 && m[m.length - 1][1] === W) {
      const first = m.shift();
      m[m.length - 1][1] = W + first[1];
    }
    return m;
  };
  let mine;
  try {
    mine = $app.findFirstRecordByFilter("avail", "user = {:u} && tcg = {:t}", { u: e.auth.id, t: tcg });
  } catch (_) {
    return e.json(200, { players: [] });
  }
  const my = merge(read(mine));
  if (!my.length) return e.json(200, { players: [] });
  let others = [];
  try {
    others = $app.findRecordsByFilter("avail", "user != {:u} && tcg = {:t} && (paused_until = '' || paused_until < {:now})", "-updated", 500, 0, { u: e.auth.id, t: tcg, now: now });
  } catch (_) {}
  const players = [];
  for (const o of others) {
    const th = merge(read(o));
    const common = [];
    for (const a of my) for (const b of th) {
      // les deux listes peuvent déborder de W (créneau recollé) : on compare aussi décalé d'une semaine
      for (const sh of [0, W, -W]) {
        const lo = Math.max(a[0], b[0] + sh), hi = Math.min(a[1], b[1] + sh);
        if (hi - lo >= 30) common.push([lo, hi]);
      }
    }
    if (!common.length) continue;
    let name = "Joueur";
    try { name = $app.findRecordById("users", o.getString("user")).getString("name") || "Joueur"; } catch (_) {}
    let prefs = [];
    try { prefs = (JSON.parse(o.getString("prefs") || "[]") || []).filter((x) => typeof x === "string").slice(0, 12); } catch (_) {}
    players.push({ id: o.getString("user"), name: name, prefs: prefs, note: o.getString("note"), slots: merge(common.map((c) => [((c[0] % W) + W) % W, ((c[0] % W) + W) % W + (c[1] - c[0])])) });
  }
  players.sort((x, y) => y.slots.reduce((n, s) => n + s[1] - s[0], 0) - x.slots.reduce((n, s) => n + s[1] - s[0], 0));
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { players: players.slice(0, 50) });
}, $apis.requireAuth());

// Proposition reçue : notification au destinataire
onRecordCreateRequest((e) => {
  e.next();
  const r = e.record;
  const tcg = require(`${__hooks}/tcg_lib.js`).norm(r.getString("tcg"));
  const note = r.getString("note");
  require(`${__hooks}/push_lib.js`).sendTo([r.getString("to")], {
    title: "Proposition de partie · " + require(`${__hooks}/tcg_lib.js`).short(tcg),
    body: `${r.getString("from_name") || "Un joueur"} vous propose une partie ${r.getString("label")}${note ? " : « " + note + " »" : ""}`,
    url: "/?agenda=" + tcg,
    tag: "inv-" + r.id,
  });
}, "invites");

// Réponse ou annulation : notification à l'autre joueur
onRecordUpdateRequest((e) => {
  const before = e.record.original().getString("status");
  e.next();
  const r = e.record;
  const st = r.getString("status");
  if (st === before) return;
  const tcg = require(`${__hooks}/tcg_lib.js`).norm(r.getString("tcg"));
  const reply = r.getString("reply");
  const label = r.getString("label");
  let to = "", body = "";
  if (st === "accepted") { to = r.getString("from"); body = `${r.getString("to_name") || "Votre adversaire"} accepte votre partie ${label}. Rappel 10 minutes avant.`; }
  else if (st === "declined") { to = r.getString("from"); body = `${r.getString("to_name") || "Votre adversaire"} ne peut pas jouer ${label}${reply ? " : « " + reply + " »" : "."}`; }
  else if (st === "cancelled") {
    const by = e.auth ? e.auth.id : "";
    to = by === r.getString("from") ? r.getString("to") : r.getString("from");
    const who = by === r.getString("from") ? r.getString("from_name") : r.getString("to_name");
    if (before === "pending" && by === r.getString("from")) return; // proposition retirée avant réponse : rien à signaler
    body = `${who || "Votre adversaire"} annule la partie ${label}.`;
  }
  if (!to) return;
  require(`${__hooks}/push_lib.js`).sendTo([to], { title: "Table de jeu", body: body + (reply && st === "accepted" ? " « " + reply + " »" : ""), url: "/?agenda=" + tcg, tag: "inv-" + r.id });
}, "invites");

// Rappel 10 minutes avant une partie prévue, aux deux joueurs
cronAdd("agenda_reminders", "* * * * *", () => {
  const iso = (ms) => new Date(Date.now() + ms).toISOString().replace("T", " ");
  let list = [];
  try {
    list = $app.findRecordsByFilter("invites", "status = 'accepted' && reminded = false && at <= {:soon} && at >= {:late}", "at", 50, 0, { soon: iso(10 * 60 * 1000), late: iso(-30 * 60 * 1000) });
  } catch (_) {
    return;
  }
  for (const r of list) {
    r.set("reminded", true);
    try { $app.save(r); } catch (_) { continue; }
    const tcg = require(`${__hooks}/tcg_lib.js`).norm(r.getString("tcg"));
    const lib = require(`${__hooks}/push_lib.js`);
    lib.sendTo([r.getString("from")], { title: "Table de jeu", body: `Votre partie avec ${r.getString("to_name") || "votre adversaire"} commence bientôt (${r.getString("label")}). Ouvrez l'appli pour lancer la table.`, url: "/?agenda=" + tcg, tag: "rem-" + r.id });
    lib.sendTo([r.getString("to")], { title: "Table de jeu", body: `Votre partie avec ${r.getString("from_name") || "votre adversaire"} commence bientôt (${r.getString("label")}). Ouvrez l'appli pour la rejoindre.`, url: "/?agenda=" + tcg, tag: "rem-" + r.id });
  }
});
