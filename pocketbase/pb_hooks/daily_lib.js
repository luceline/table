// Outils partagés : heure de Paris, carte du jour, séries, titres, badges, présence, rappel du soir.
// (Les fonctions des fichiers .pb.js ne sont pas visibles dans les gestionnaires : tout passe par ce module.)

const MAX_TRIES = 5;
const LAUNCH = "2026-11-22"; // carte du jour n°1
const FRESH_MS = 150000; // en ligne : signe de vie depuis moins de 2 min 30

// ---------- Heure de Paris (heure d'été : du dernier dimanche de mars au dernier dimanche d'octobre, 1 h UTC) ----------
function lastSunday(y, m) {
  const d = new Date(Date.UTC(y, m + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}
function parisOffsetMin(ms) {
  const y = new Date(ms).getUTCFullYear();
  return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 120 : 60;
}
// Date et heure de Paris : { day: "AAAA-MM-JJ", min: minutes depuis minuit, wd: 0 lundi .. 6 dimanche }
function paris(ms) {
  const t = ms === undefined ? Date.now() : ms;
  const d = new Date(t + parisOffsetMin(t) * 60000);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: (d.getUTCDay() + 6) % 7 };
}
const dayMs = (day) => Date.parse(day + "T12:00:00Z");
const addDays = (day, n) => new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((dayMs(a) - dayMs(b)) / 86400000);
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString().replace("T", " ");

// ---------- Noms de cartes : comparaison tolérante (accents, majuscules, une faute de frappe) ----------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[n];
}
function sameName(guess, answer) {
  const g = norm(guess), a = norm(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  return lev(g, a) <= (a.length >= 10 ? 2 : 1);
}

// ---------- Carte du jour ----------
const tcgOf = (t) => (t === "fab" ? "fab" : "safir");
const tcgFilterSql = (t) => (t === "fab" ? "c.tcg = 'fab'" : "(c.tcg = '' OR c.tcg = 'safir')");

// Nom propre d'une carte pour le jeu : sans référence d'impression (« S1 », « S2.5 », « P/100 », numéro final),
// sans parenthèses ni crochets. Un nom qui contient un identifiant de fichier (longue suite de lettres et de chiffres,
// ex. import depuis Google Drive) n'est pas une vraie carte : exclu.
function isJunk(raw) {
  return /[A-Za-z0-9_-]{18,}/.test(String(raw || "").replace(/\s+/g, " ")) && /\d/.test(String(raw || ""));
}
function cleanName(raw) {
  let n = String(raw || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  n = n.replace(/^(P\s*\/\s*\d+|S\d+(\.\d+)?|P)\s*[\/-]?\s+/i, "");
  n = n.replace(/\s+(P\s*\/\s*)?\d+[a-z]?$/i, "");
  n = n.replace(/^[-–:·.\s]+|[-–:·.\s]+$/g, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Toutes les cartes possibles : un nom = une carte (scan choisi au hasard parmi ceux des joueurs).
// On préfère les noms présents chez au moins 2 joueurs (vraies cartes du jeu) quand il y en a assez.
function pool(tcg) {
  const rows = arrayOf(new DynamicModel({ id: "", name: "", owner: "", tcg: "" }));
  $app.db().newQuery(
    "SELECT c.id AS id, c.name AS name, c.owner AS owner, c.tcg AS tcg FROM cards c " +
    "WHERE " + tcgFilterSql(tcg) + " AND COALESCE(c.kind, '') != 'jeton' AND length(trim(c.name)) >= 2 AND c.image != ''"
  ).all(rows);
  const by = {};
  for (const r of rows) {
    if (isJunk(r.name)) continue;
    const name = cleanName(r.name);
    const k = norm(name);
    if (k.length < 2) continue;
    if (!by[k]) by[k] = { k: k, name: name, owners: {}, ids: [] };
    by[k].owners[r.owner] = 1;
    by[k].ids.push(r.id);
  }
  const all = Object.keys(by).map((k) => ({ k: k, name: by[k].name, owners: Object.keys(by[k].owners).length, ids: by[k].ids }));
  const common = all.filter((r) => r.owners >= 2);
  return { all: all, pick: common.length >= 15 ? common : all };
}

function today(tcg) {
  const t = tcgOf(tcg);
  const p = paris();
  try {
    const cur = $app.findFirstRecordByFilter("daily", "day = {:d} && tcg = {:t}", { d: p.day, t: t });
    const raw = cur.getString("name");
    if (!isJunk(raw) && cleanName(raw) === raw) return cur;
    if (!isJunk(raw) && cleanName(raw).length >= 2) {
      cur.set("name", cleanName(raw)); // nom avec référence d'impression : nettoyé, la partie continue
      $app.save(cur);
      return cur;
    }
    // carte du jour invalide (nom de fichier importé) : remplacée, les essais déjà faits sont annulés
    try { $app.db().newQuery("DELETE FROM daily_plays WHERE day = {:d} AND tcg = {:t}").bind({ d: p.day, t: t }).execute(); } catch (_) {}
    $app.delete(cur);
  } catch (_) {}
  const pl = pool(t);
  if (!pl.pick.length) return null;
  // pas une carte déjà tombée ces 60 derniers jours (si possible)
  const recent = {};
  try {
    for (const r of $app.findRecordsByFilter("daily", "tcg = {:t} && day >= {:s}", "", 100, 0, { t: t, s: addDays(p.day, -60) })) recent[norm(r.getString("name"))] = 1;
  } catch (_) {}
  let cand = pl.pick.filter((x) => !recent[norm(x.name)]);
  if (!cand.length) cand = pl.pick;
  const choice = cand[Math.floor(Math.random() * cand.length)];
  let card = null;
  try { card = $app.findRecordById("cards", choice.ids[Math.floor(Math.random() * choice.ids.length)]); } catch (_) {}
  if (!card) return null;
  const r = new Record($app.findCollectionByNameOrId("daily"));
  r.set("day", p.day);
  r.set("tcg", t);
  r.set("num", dayDiff(p.day, LAUNCH) + 1);
  r.set("card", card.id);
  r.set("name", choice.name);
  r.set("img", `/api/files/cards/${card.id}/${card.getString("image")}`);
  r.set("orient", card.getString("orient") === "l" ? "l" : "p");
  // point de départ du zoom : dans l'illustration, jamais sur le nom (bas de la carte)
  r.set("fx", Math.round((0.3 + Math.random() * 0.4) * 100) / 100);
  r.set("fy", Math.round((0.25 + Math.random() * 0.3) * 100) / 100);
  try {
    $app.save(r);
    return r;
  } catch (_) {
    // un autre joueur l'a créée au même instant
    return $app.findFirstRecordByFilter("daily", "day = {:d} && tcg = {:t}", { d: p.day, t: t });
  }
}

function playOf(uid, d) {
  try {
    return $app.findFirstRecordByFilter("daily_plays", "user = {:u} && day = {:d} && tcg = {:t}", { u: uid, d: d.getString("day"), t: d.getString("tcg") });
  } catch (_) {
    return null;
  }
}
const triesOf = (p) => {
  if (!p) return [];
  try { return JSON.parse(p.getString("tries") || "[]") || []; } catch (_) { return []; }
};

// Série : jours consécutifs où le joueur a fini la carte du jour (n'importe quel jeu).
// Un jour manqué est pardonné (joker) s'il n'y en a pas eu d'autre dans les 7 jours précédents.
function playedDays(uid) {
  const rows = arrayOf(new DynamicModel({ day: "" }));
  $app.db().newQuery("SELECT DISTINCT day FROM daily_plays WHERE user = {:u} AND done = 1 ORDER BY day").bind({ u: uid }).all(rows);
  return rows.map((r) => r.day);
}
function streakEnding(set, end) {
  let cur = end, n = 0, joker = null;
  for (let guard = 0; guard < 4000; guard++) {
    if (set[cur]) { n++; cur = addDays(cur, -1); continue; }
    const before = addDays(cur, -1);
    if (n > 0 && set[before] && (joker === null || dayDiff(joker, cur) >= 7)) { joker = cur; cur = before; continue; }
    break;
  }
  return n;
}
function streaks(uid) {
  const days = playedDays(uid);
  const set = {};
  for (const d of days) set[d] = true;
  const t = paris().day;
  // pas encore joué aujourd'hui : la série d'hier compte toujours (joker possible pour hier)
  let cur = set[t] ? streakEnding(set, t) : streakEnding(set, addDays(t, -1));
  if (!set[t] && !set[addDays(t, -1)] && set[addDays(t, -2)]) {
    const s2 = streakEnding(set, addDays(t, -2));
    if (s2 > 0) cur = s2; // hier manqué : joker
  }
  let best = 0;
  for (const d of days) best = Math.max(best, streakEnding(set, d));
  return { current: cur, best: Math.max(best, cur), played: days.length, today: !!set[t] };
}

// État de la carte du jour pour un joueur (réponse donnée seulement une fois la partie finie)
function state(uid, tcg) {
  const d = today(tcg);
  const t = tcgOf(tcg);
  if (!d) return { tcg: t, empty: true, streak: streaks(uid) };
  const p = playOf(uid, d);
  const tries = triesOf(p);
  const done = !!(p && p.getBool("done"));
  const pl = pool(t);
  return {
    tcg: t,
    day: d.getString("day"),
    num: d.getInt("num"),
    img: d.getString("img"),
    orient: d.getString("orient"),
    fx: d.getFloat("fx"),
    fy: d.getFloat("fy"),
    max: MAX_TRIES,
    tries: tries,
    found: !!(p && p.getBool("found")),
    done: done,
    score: p ? p.getInt("score") : 0,
    answer: done ? d.getString("name") : "",
    // indices : 1re lettre après 2 essais ratés, forme du nom (lettres par mot) après 3
    hint: !done && tries.length >= 2 ? d.getString("name").trim().charAt(0).toUpperCase() : "",
    shape: !done && tries.length >= 3 ? d.getString("name").trim().split(/\s+/).map((w) => w.length) : [],
    names: pl.all.map((x) => x.name).sort((a, b) => a.localeCompare(b)),
    streak: streaks(uid),
  };
}

function guess(uid, tcg, text) {
  const d = today(tcg);
  if (!d) throw new BadRequestError("Pas encore de carte du jour pour ce jeu : il faut des cartes scannées.");
  const g = String(text || "").trim().slice(0, 120);
  if (!g) throw new BadRequestError("Tapez un nom de carte.");
  let p = playOf(uid, d);
  if (p && p.getBool("done")) throw new BadRequestError("Déjà terminée pour aujourd'hui : revenez demain !");
  if (!p) {
    p = new Record($app.findCollectionByNameOrId("daily_plays"));
    p.set("user", uid);
    p.set("day", d.getString("day"));
    p.set("tcg", d.getString("tcg"));
    p.set("num", d.getInt("num"));
  }
  const tries = triesOf(p);
  if (tries.some((x) => norm(x.g) === norm(g))) throw new BadRequestError("Déjà essayé : tentez un autre nom.");
  const ok = sameName(g, d.getString("name")) || sameName(cleanName(g), d.getString("name"));
  tries.push({ g: g, ok: ok });
  p.set("tries", tries);
  if (ok || tries.length >= MAX_TRIES) {
    p.set("done", true);
    p.set("found", ok);
    p.set("score", ok ? MAX_TRIES + 1 - tries.length : 0);
  }
  $app.save(p);
  return state(uid, tcg);
}

const nameOf = (uid) => {
  try { return $app.findRecordById("users", uid).getString("name") || "Joueur"; } catch (_) { return "Joueur"; }
};

// Classement du mois (points : trouvée au 1er essai = 5 … au 5e = 1)
function board(uid, tcg) {
  const t = tcgOf(tcg);
  const p = paris();
  const from = p.day.slice(0, 8) + "01";
  const rows = arrayOf(new DynamicModel({ user: "", pts: 0, n: 0, found: 0 }));
  $app.db().newQuery(
    "SELECT user, SUM(score) AS pts, COUNT(*) AS n, SUM(found) AS found FROM daily_plays WHERE tcg = {:t} AND day >= {:f} AND done = 1 GROUP BY user ORDER BY pts DESC, found DESC, n DESC"
  ).bind({ t: t, f: from }).all(rows);
  const list = rows.map((r, i) => ({ rank: i + 1, id: r.user, pts: r.pts, n: r.n, found: r.found }));
  const top = list.slice(0, 10).map((r) => ({ ...r, name: nameOf(r.id) }));
  const mine = list.find((r) => r.id === uid);
  return { month: from.slice(0, 7), top: top, me: mine ? { ...mine, name: nameOf(uid) } : null, players: list.length };
}

// ---------- Titres et badges ----------
const TITLES = [
  [25, "👑", "Légende"],
  [10, "⚔️", "Vétéran"],
  [3, "🎲", "Habitué"],
  [1, "🌱", "Novice"],
];
const titleFor = (n) => {
  for (const [min, icon, name] of TITLES) if (n >= min) return { icon: icon, name: name };
  return null;
};
// Parties jouées à deux (pas en solo) ces 30 derniers jours, pour une liste de joueurs
function games30(ids) {
  const out = {};
  if (!ids.length) return out;
  const rows = arrayOf(new DynamicModel({ u: "", n: 0 }));
  const params = { s: isoAgo(30 * 86400000) };
  const ph = ids.map((id, i) => { params["u" + i] = id; return "{:u" + i + "}"; }).join(",");
  $app.db().newQuery(
    "SELECT u, COUNT(*) AS n FROM (" +
    "SELECT p1 AS u FROM games WHERE p2 != '' AND COALESCE(solo, 0) = 0 AND created >= {:s} " +
    "UNION ALL SELECT p2 AS u FROM games WHERE p2 != '' AND COALESCE(solo, 0) = 0 AND created >= {:s}" +
    ") WHERE u IN (" + ph + ") GROUP BY u"
  ).bind(params).all(rows);
  for (const r of rows) out[r.u] = r.n;
  return out;
}
function titles(ids) {
  const n = games30(ids);
  const out = {};
  for (const id of ids) out[id] = titleFor(n[id] || 0);
  return out;
}

const BADGES = [
  ["first", "🎉", "Première partie", "Jouer une partie contre un autre joueur"],
  ["win", "🏆", "Première victoire", "Gagner une partie (résultat enregistré)"],
  ["g10", "🔟", "10 parties", "Jouer 10 parties"],
  ["g50", "💯", "50 parties", "Jouer 50 parties"],
  ["opp5", "🤝", "Sociable", "Affronter 5 joueurs différents"],
  ["decks3", "🧱", "Bâtisseur", "Construire 3 decks"],
  ["cards100", "🃏", "Collectionneur", "Scanner 100 cartes"],
  ["agenda", "📅", "Organisé", "Remplir son agenda de disponibilités"],
  ["talk50", "💬", "Bavard", "Écrire 50 messages dans les salons"],
  ["daily1", "🧠", "Œil de lynx", "Trouver la carte du jour du premier coup"],
  ["s7", "🔥", "Série de 7", "7 jours de suite à la carte du jour"],
  ["s30", "🌋", "Série de 30", "30 jours de suite à la carte du jour"],
  ["top3", "🥇", "Podium", "Finir un mois dans le top 3 de la carte du jour"],
];
const count = (sql, params) => {
  const r = new DynamicModel({ n: 0 });
  try { $app.db().newQuery(sql).bind(params).one(r); } catch (_) {}
  return r.n;
};
function profile(uid) {
  let u;
  try { u = $app.findRecordById("users", uid); } catch (_) { return null; }
  const P = { u: uid };
  const gAll = count("SELECT COUNT(*) AS n FROM games WHERE p2 != '' AND COALESCE(solo, 0) = 0 AND (p1 = {:u} OR p2 = {:u})", P);
  const n30 = games30([uid])[uid] || 0;
  const opp = count("SELECT COUNT(DISTINCT CASE WHEN p1 = {:u} THEN p2 ELSE p1 END) AS n FROM games WHERE p2 != '' AND COALESCE(solo, 0) = 0 AND (p1 = {:u} OR p2 = {:u})", P);
  const wins = count("SELECT COUNT(*) AS n FROM results WHERE owner = {:u} AND outcome = 'win'", P);
  const decks = count("SELECT COUNT(*) AS n FROM decks WHERE owner = {:u}", P);
  const cards = count("SELECT COUNT(*) AS n FROM cards WHERE owner = {:u} AND COALESCE(kind, '') != 'jeton'", P);
  const agenda = count("SELECT COUNT(*) AS n FROM avail WHERE user = {:u} AND slots != '[]' AND slots != '' AND slots IS NOT NULL", P);
  const posts = count("SELECT COUNT(*) AS n FROM posts WHERE author = {:u}", P);
  const first = count("SELECT COUNT(*) AS n FROM daily_plays WHERE user = {:u} AND score = 5", P);
  const st = streaks(uid);
  // podium d'un mois terminé
  let top3 = false;
  const months = arrayOf(new DynamicModel({ m: "", tcg: "" }));
  try {
    $app.db().newQuery("SELECT DISTINCT substr(day, 1, 7) AS m, tcg FROM daily_plays WHERE user = {:u} AND substr(day, 1, 7) < {:cur}").bind({ u: uid, cur: paris().day.slice(0, 7) }).all(months);
  } catch (_) {}
  for (const mo of months) {
    if (top3) break;
    const rk = arrayOf(new DynamicModel({ user: "" }));
    $app.db().newQuery("SELECT user FROM daily_plays WHERE tcg = {:t} AND substr(day, 1, 7) = {:m} AND done = 1 GROUP BY user ORDER BY SUM(score) DESC, SUM(found) DESC LIMIT 3").bind({ t: mo.tcg, m: mo.m }).all(rk);
    if (rk.some((r) => r.user === uid)) top3 = true;
  }
  const got = {
    first: gAll >= 1, win: wins >= 1, g10: gAll >= 10, g50: gAll >= 50, opp5: opp >= 5, decks3: decks >= 3, cards100: cards >= 100,
    agenda: agenda >= 1, talk50: posts >= 50, daily1: first >= 1, s7: st.best >= 7, s30: st.best >= 30, top3: top3,
  };
  let on = null;
  try { on = $app.findFirstRecordByFilter("online", "user = {:u}", P); } catch (_) {}
  const hidden = u.getBool("hide_online");
  const at = on ? Date.parse(on.getString("at").replace(" ", "T")) : 0;
  return {
    id: uid,
    name: u.getString("name") || "Joueur",
    title: titleFor(n30),
    games30: n30,
    games: gAll,
    streak: st.current,
    best: st.best,
    online: !hidden && at > Date.now() - FRESH_MS,
    where: !hidden && on && at > Date.now() - FRESH_MS ? on.getString("where") : "",
    badges: BADGES.map(([id, icon, name, how]) => ({ id: id, icon: icon, name: name, how: how, got: !!got[id] })),
  };
}

// ---------- Présence ----------
function online(tcg) {
  const rows = arrayOf(new DynamicModel({ user: "", where: "", name: "", hide: 0 }));
  $app.db().newQuery(
    "SELECT o.user AS user, o.[[where]] AS [[where]], u.name AS name, COALESCE(u.hide_online, 0) AS hide FROM online o JOIN users u ON u.id = o.user WHERE o.at >= {:s} ORDER BY u.name"
  ).bind({ s: isoAgo(FRESH_MS) }).all(rows);
  const list = rows.filter((r) => !r.hide).map((r) => ({ id: r.user, name: r.name || "Joueur", where: r.where }));
  const tt = titles(list.map((x) => x.id));
  for (const x of list) x.title = tt[x.id];
  const t = tcgOf(tcg);
  const games = count(
    "SELECT COUNT(*) AS n FROM games g WHERE g.status = 'playing' AND COALESCE(g.solo, 0) = 0 AND " +
    (t === "fab" ? "g.tcg = 'fab' " : "(g.tcg = '' OR g.tcg = 'safir') ") +
    "AND EXISTS (SELECT 1 FROM here h WHERE h.game = g.id AND h.updated >= {:h})",
    { h: isoAgo(150000) },
  );
  const voice = count("SELECT COUNT(*) AS n FROM voice_here WHERE beat >= {:s}", { s: isoAgo(150000) });
  return { online: list, games: games, voice: voice };
}

// ---------- Rappel du soir : joueurs disponibles en même temps que moi ce soir (agenda) ----------
const W = 7 * 1440;
function slotsUtc(r) {
  let slots = [];
  try { slots = JSON.parse(r.getString("slots") || "[]") || []; } catch (_) {}
  const off = r.getInt("off");
  const out = [];
  for (const sl of slots) {
    const d = +sl.d, s = +sl.s, en = +sl.e;
    if (!(d >= 0 && d < 7 && s >= 0 && en <= 1440 && en > s)) continue;
    const a = (((d * 1440 + s + off) % W) + W) % W;
    out.push([a, a + en - s]);
    out.push([a - W, a + en - s - W]);
    out.push([a + W, a + en - s + W]);
  }
  return out;
}
// minutes de la semaine UTC (lundi 0 h UTC = 0)
function weekMinUtc(ms) {
  const d = new Date(ms);
  return ((d.getUTCDay() + 6) % 7) * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
}
const hm = (m) => {
  const x = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60), mi = x % 60;
  return h + " h" + (mi ? String(mi).padStart(2, "0") : "");
};
function remindEvening() {
  const p = paris();
  const now = Date.now();
  const lo = weekMinUtc(now);
  const hi = lo + (1440 - p.min); // jusqu'à minuit (Paris)
  const off = parisOffsetMin(now);
  let users = [];
  try { users = $app.findRecordsByFilter("users", "remind = true && remind_last != {:d}", "", 500, 0, { d: p.day }); } catch (_) { return 0; }
  const nowIso = new Date().toISOString().replace("T", " ");
  let all = [];
  try { all = $app.findRecordsByFilter("avail", "paused_until = '' || paused_until < {:n}", "", 2000, 0, { n: nowIso }); } catch (_) {}
  let sent = 0;
  for (const u of users) {
    u.set("remind_last", p.day);
    try { $app.save(u); } catch (_) { continue; }
    const mine = all.filter((a) => a.getString("user") === u.id);
    const found = []; // { name, tcg, from, to }
    for (const a of mine) {
      const my = slotsUtc(a).map((x) => [Math.max(x[0], lo), Math.min(x[1], hi)]).filter((x) => x[1] - x[0] >= 30);
      if (!my.length) continue;
      for (const o of all) {
        if (o.getString("user") === u.id || o.getString("tcg") !== a.getString("tcg")) continue;
        for (const x of my) for (const y of slotsUtc(o)) {
          const s = Math.max(x[0], y[0]), en = Math.min(x[1], y[1]);
          if (en - s >= 30 && !found.some((f) => f.uid === o.getString("user") && f.tcg === a.getString("tcg"))) {
            found.push({ uid: o.getString("user"), tcg: a.getString("tcg"), from: s, to: en });
          }
        }
      }
    }
    if (!found.length) continue;
    found.sort((a, b) => a.from - b.from);
    const names = [];
    for (const f of found) { const n = nameOf(f.uid); if (!names.includes(n)) names.push(n); }
    const first = found[0];
    const shown = names.length > 3 ? names.slice(0, 3).join(", ") + " et " + (names.length - 3) + " autre" + (names.length > 4 ? "s" : "") : names.length > 1 ? names.slice(0, -1).join(", ") + " et " + names[names.length - 1] : names[0];
    const verb = names.length > 1 ? "sont disponibles" : "est disponible";
    try {
      require(`${__hooks}/push_lib.js`).sendTo([u.id], {
        title: "Ce soir à la Table de jeu",
        body: `${shown} ${verb} en même temps que vous, dès ${hm(first.from + off)}. Proposez une partie !`,
        url: "/?agenda=" + (first.tcg === "fab" ? "fab" : "safir"),
        tag: "soir-" + p.day,
      });
      sent++;
    } catch (_) {}
  }
  return sent;
}

module.exports = { cleanName, isJunk, paris, parisOffsetMin, addDays, sameName, norm, state, guess, board, titles, profile, online, remindEvening, streakEnding, MAX_TRIES };
