/// <reference path="../pb_data/types.d.ts" />
// Groupes privés : actions (créer, ajouter, retirer ou quitter, renommer), messages, recherche d'un joueur par pseudo.

routerAdd("POST", "/api/table/groups", (e) => require(`${__hooks}/groups_lib.js`).handle(e), $apis.requireAuth());

// Joueurs dont le pseudo contient le texte (pour inviter quelqu'un) : 8 au plus, sans soi-même
routerAdd("GET", "/api/table/players", (e) => {
  const q = String(e.request.url.query().get("q") || "").trim().slice(0, 30);
  if (q.length < 2) return e.json(200, { players: [] });
  const list = $app.findRecordsByFilter("users", "name ~ {:q} && id != {:me}", "name", 8, 0, { q: q, me: e.auth.id });
  return e.json(200, { players: list.map((u) => ({ id: u.id, name: u.getString("name") || "Joueur" })) });
}, $apis.requireAuth());

// Message dans un groupe : nom fixé par le serveur, 20 par minute au plus, notification aux autres membres (sauf sourdine)
onRecordCreateRequest((e) => {
  const r = e.record;
  const from = r.getString("from");
  const since = new Date(Date.now() - 60000).toISOString().replace("T", " ");
  if ($app.countRecords("gmsgs", $dbx.exp("[[from]] = {:f} AND created >= {:s}", { f: from, s: since })) >= 20) throw new BadRequestError("Doucement : trop de messages en une minute.");
  let name = "Joueur";
  try { name = $app.findRecordById("users", from).getString("name") || name; } catch (_) {}
  r.set("from_name", name.slice(0, 40));
  e.next();
  const text = r.getString("text");
  let g;
  try { g = $app.findRecordById("dm_groups", r.getString("group")); } catch (_) { return; }
  g.set("last", r.getString("created"));
  g.set("last_text", (name + " : " + text).slice(0, 160));
  $app.save(g);
  const muted = $app.findRecordsByFilter("gm_reads", "group = {:g} && muted = true", "", 20, 0, { g: g.id }).map((x) => x.getString("user"));
  const to = g.getStringSlice("members").filter((u) => u !== from && !muted.includes(u));
  let names = {};
  try { names = JSON.parse(g.getString("names") || "{}") || {}; } catch (_) {}
  const title = g.getString("name") || g.getStringSlice("members").map((u) => names[u] || "Joueur").slice(0, 4).join(", ");
  require(`${__hooks}/push_lib.js`).sendTo(to, {
    title: title,
    body: (name + " : " + text).slice(0, 140),
    url: "/?dm=g:" + g.id,
    tag: "gm-" + g.id,
  });
}, "gmsgs");
