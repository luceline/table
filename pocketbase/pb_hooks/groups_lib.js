// Groupes privés : création, ajout, retrait (ou départ), renommage. Appelé par groups.pb.js.
const MAX = 10;
const now = () => new Date().toISOString().replace("T", " ");
const nameOf = (uid) => {
  try { return $app.findRecordById("users", uid).getString("name") || "Joueur"; } catch (_) { return null; }
};
// target a bloqué actor ?
const blockedBy = (target, actor) => {
  try { $app.findFirstRecordByFilter("blocks", "user = {:t} && blocked = {:a}", { t: target, a: actor }); return true; } catch (_) { return false; }
};
const members = (g) => g.getStringSlice("members");
function sysMsg(g, actor, actorName, text) {
  const r = new Record($app.findCollectionByNameOrId("gmsgs"));
  r.set("group", g.id);
  r.set("from", actor);
  r.set("from_name", actorName);
  r.set("text", text);
  r.set("sys", true);
  $app.save(r);
  g.set("last", r.getString("created") || now());
  g.set("last_text", text.slice(0, 160));
}
const push = (ids, payload) => { try { require(`${__hooks}/push_lib.js`).sendTo(ids, payload); } catch (_) {} };
const fail = (e, msg) => e.json(400, { message: msg });
const listNames = (l) => (l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " et " + l[l.length - 1]);

module.exports = {
  MAX,
  handle(e) {
    const b = e.requestInfo().body || {};
    const me = e.auth.id;
    const myName = nameOf(me) || "Joueur";
    const action = String(b.action || "");

    if (action === "create") {
      const ids = [me];
      for (const u of Array.isArray(b.members) ? b.members : []) {
        const id = String(u || "");
        if (/^[a-z0-9]{15}$/.test(id) && !ids.includes(id)) ids.push(id);
      }
      if (ids.length < 3) return fail(e, "Choisissez au moins deux autres joueurs.");
      if (ids.length > MAX) return fail(e, `${MAX} joueurs au plus dans un groupe.`);
      const names = {};
      for (const id of ids) {
        const n = nameOf(id);
        if (n === null) return fail(e, "Joueur introuvable.");
        if (id !== me && blockedBy(id, me)) return fail(e, `${n} ne peut pas être ajouté à un groupe.`);
        names[id] = n;
      }
      // pas plus de 10 groupes créés par jour
      const since = new Date(Date.now() - 86400000).toISOString().replace("T", " ");
      if ($app.countRecords("dm_groups", $dbx.exp("owner = {:u} AND created >= {:s}", { u: me, s: since })) >= 10) return fail(e, "Trop de groupes créés aujourd'hui : réessayez demain.");
      const g = new Record($app.findCollectionByNameOrId("dm_groups"));
      g.set("owner", me);
      g.set("members", ids);
      g.set("names", names);
      g.set("name", String(b.name || "").trim().slice(0, 40));
      g.set("last", now());
      $app.save(g);
      sysMsg(g, me, myName, `${myName} a créé le groupe avec ${listNames(ids.filter((x) => x !== me).map((x) => names[x]))}.`);
      $app.save(g);
      push(ids.filter((x) => x !== me), {
        title: `${myName} vous a ajouté à un groupe`,
        body: g.getString("name") || listNames(ids.map((x) => names[x])),
        url: "/?dm=g:" + g.id, tag: "gm-" + g.id,
      });
      return e.json(200, { id: g.id });
    }

    let g;
    try { g = $app.findRecordById("dm_groups", String(b.id || "")); } catch (_) { return e.json(404, { message: "Groupe introuvable." }); }
    const cur = members(g);
    if (!cur.includes(me)) return e.json(404, { message: "Groupe introuvable." });
    let names = {};
    try { names = JSON.parse(g.getString("names") || "{}") || {}; } catch (_) {}

    if (action === "add") {
      const add = [];
      for (const u of Array.isArray(b.uids) ? b.uids : []) {
        const id = String(u || "");
        if (/^[a-z0-9]{15}$/.test(id) && !cur.includes(id) && !add.includes(id)) add.push(id);
      }
      if (!add.length) return fail(e, "Personne à ajouter.");
      if (cur.length + add.length > MAX) return fail(e, `${MAX} joueurs au plus dans un groupe.`);
      for (const id of add) {
        const n = nameOf(id);
        if (n === null) return fail(e, "Joueur introuvable.");
        if (blockedBy(id, me)) return fail(e, `${n} ne peut pas être ajouté à un groupe.`);
        names[id] = n;
      }
      g.set("members", [...cur, ...add]);
      g.set("names", names);
      sysMsg(g, me, myName, `${myName} a ajouté ${listNames(add.map((x) => names[x]))}.`);
      $app.save(g);
      push(add, { title: `${myName} vous a ajouté à un groupe`, body: g.getString("name") || listNames([...cur, ...add].map((x) => names[x] || "Joueur")), url: "/?dm=g:" + g.id, tag: "gm-" + g.id });
      return e.json(200, { id: g.id });
    }

    if (action === "remove") {
      const uid = String(b.uid || "");
      if (!cur.includes(uid)) return fail(e, "Ce joueur n'est pas dans le groupe.");
      if (uid !== me && g.getString("owner") !== me) return fail(e, "Seul le créateur du groupe peut retirer un joueur.");
      const rest = cur.filter((x) => x !== uid);
      if (!rest.length) {
        $app.delete(g);
        return e.json(200, { id: "" });
      }
      g.set("members", rest);
      if (g.getString("owner") === uid) g.set("owner", rest[0]);
      const who = names[uid] || nameOf(uid) || "Joueur";
      sysMsg(g, me, myName, uid === me ? `${myName} a quitté le groupe.` : `${myName} a retiré ${who}.`);
      delete names[uid];
      g.set("names", names);
      $app.save(g);
      try { $app.delete($app.findFirstRecordByFilter("gm_reads", "group = {:g} && user = {:u}", { g: g.id, u: uid })); } catch (_) {}
      return e.json(200, { id: g.id });
    }

    if (action === "rename") {
      const name = String(b.name || "").trim().slice(0, 40);
      g.set("name", name);
      sysMsg(g, me, myName, name ? `${myName} a renommé le groupe « ${name} ».` : `${myName} a retiré le nom du groupe.`);
      $app.save(g);
      return e.json(200, { id: g.id });
    }

    return fail(e, "Action inconnue.");
  },
};
