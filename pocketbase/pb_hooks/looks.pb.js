/// <reference path="../pb_data/types.d.ts" />
// Tapis et dos de cartes des joueurs d'une partie, et modération des images signalées.

// Apparence des deux joueurs d'une partie (pour l'adversaire et les spectateurs) ; une image signalée n'est pas renvoyée.
routerAdd("GET", "/api/table/looks", (e) => {
  const id = e.request.url.query().get("game") || "";
  let g;
  try { g = $app.findRecordById("games", id); } catch (_) { return e.json(404, { message: "Partie introuvable." }); }
  const out = {};
  for (const uid of [g.getString("p1"), g.getString("p2")]) {
    if (!uid) continue;
    try {
      const u = $app.findRecordById("users", uid);
      const bgB = u.getBool("bg_blocked"), backB = u.getBool("back_blocked");
      out[uid] = {
        bg: bgB ? "" : u.getString("mat_bg"),
        dim: u.get("mat_dim"),
        back: backB ? "" : u.getString("card_back"),
        bg_blocked: bgB,
        back_blocked: backB,
      };
    } catch (_) {}
  }
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { players: out });
}, $apis.requireAuth());

// Signalement : l'image est masquée tout de suite, l'admin est prévenu par e-mail (et notification)
onRecordCreateRequest((e) => {
  const r = e.record;
  const since = new Date(Date.now() - 86400000).toISOString().replace("T", " ");
  const recent = $app.countRecords("reports", $dbx.exp("reporter = {:u} AND created >= {:s}", { u: r.getString("reporter"), s: since }));
  if (recent >= 5) throw new BadRequestError("Trop de signalements aujourd'hui : réessayez demain.");
  let target;
  try { target = $app.findRecordById("users", r.getString("target")); } catch (_) { throw new BadRequestError("Joueur introuvable."); }
  const kind = r.getString("kind");
  if (kind === "dm") {
    // conversation privée signalée : il faut au moins un message entre les deux joueurs
    const n = $app.countRecords("dms", $dbx.exp("([[from]] = {:a} AND [[to]] = {:b}) OR ([[from]] = {:b} AND [[to]] = {:a})", { a: r.getString("reporter"), b: target.id }));
    if (!n) throw new BadRequestError("Aucun message privé avec ce joueur.");
    e.next();
  } else {
    const field = kind === "bg" ? "mat_bg" : "card_back";
    const file = target.getString(field);
    if (!file) throw new BadRequestError("Ce joueur n'a pas d'image personnalisée.");
    r.set("file", file);
    e.next();
    target.set(kind === "bg" ? "bg_blocked" : "back_blocked", true);
    $app.save(target);
  }

  const what = kind === "bg" ? "tapis" : kind === "back" ? "dos de cartes" : "conversation privée avec lui";
  let reporter = "un joueur";
  try { reporter = $app.findRecordById("users", r.getString("reporter")).getString("name") || reporter; } catch (_) {}
  const base = ($app.settings().meta.appURL || "").replace(/\/$/, "");
  const img = `${base}/api/files/users/${target.id}/${file}`;
  const admins = $app.findRecordsByFilter("admins", "user != ''", "", 20, 0);
  const emails = [];
  for (const a of admins) {
    try { const u = $app.findRecordById("users", a.getString("user")); if (u.getString("email")) emails.push({ address: u.getString("email") }); } catch (_) {}
  }
  if (emails.length) {
    try {
      const msg = new MailerMessage({
        from: { address: $app.settings().meta.senderAddress, name: $app.settings().meta.senderName || "Table de jeu" },
        to: emails,
        subject: `Signalement : ${what} de ${target.getString("name") || "un joueur"}`,
        html: `<p>${reporter} a signalé le <b>${what}</b> de <b>${target.getString("name") || "un joueur"}</b>.</p>` +
          (r.getString("reason") ? `<p>Motif : « ${r.getString("reason").replace(/[<>]/g, "")} »</p>` : "") +
          (kind === "dm"
            ? `<p><a href="${base}/?moderation">Lire la conversation signalée</a></p>`
            : `<p>L'image est masquée pour ses adversaires et les spectateurs jusqu'à votre décision.</p>` +
              `<p><a href="${img}">Voir l'image</a> · <a href="${base}/?moderation">Décider (débloquer ou supprimer)</a></p>`),
      });
      $app.newMailClient().send(msg);
    } catch (err) {
      console.log("e-mail de signalement non envoyé :", err);
    }
  }
  try {
    require(`${__hooks}/push_lib.js`).sendTo(admins.map((a) => a.getString("user")), {
      title: "Signalement à vérifier", body: `${what} de ${target.getString("name") || "un joueur"} signalé par ${reporter}`, url: "/?moderation", tag: "report-" + r.id,
    });
  } catch (_) {}
}, "reports");

// Modération (admin) : liste des signalements ouverts
routerAdd("GET", "/api/table/mod/reports", (e) => {
  try { $app.findFirstRecordByFilter("admins", "user = {:u}", { u: e.auth.id }); } catch (_) { return e.json(403, { message: "Réservé à l'administrateur." }); }
  const list = $app.findRecordsByFilter("reports", "status = 'open'", "-created", 100, 0);
  // 40 derniers messages entre les deux joueurs (conversation signalée)
  const convo = (a, b) => $app.findRecordsByFilter("dms", "(from = {:a} && to = {:b}) || (from = {:b} && to = {:a})", "-created", 40, 0, { a: a, b: b })
    .reverse().map((m) => ({ from: m.getString("from_name"), text: m.getString("text"), created: m.getString("created") }));
  const out = [];
  for (const r of list) {
    let t = null, rep = null;
    try { t = $app.findRecordById("users", r.getString("target")); } catch (_) {}
    try { rep = $app.findRecordById("users", r.getString("reporter")); } catch (_) {}
    out.push({
      id: r.id, kind: r.getString("kind"), reason: r.getString("reason"), created: r.getString("created"),
      target: r.getString("target"), target_name: t ? t.getString("name") : "(compte supprimé)",
      reporter_name: rep ? rep.getString("name") : "(compte supprimé)",
      file: r.getString("file"), current: t && r.getString("kind") !== "dm" ? t.getString(r.getString("kind") === "bg" ? "mat_bg" : "card_back") : "",
      reporter: r.getString("reporter"),
      messages: r.getString("kind") === "dm" ? convo(r.getString("reporter"), r.getString("target")) : undefined,
    });
  }
  return e.json(200, { reports: out });
}, $apis.requireAuth());

// Décision de l'admin pour un joueur et un type d'image : « unblock » (image correcte) ou « remove » (image supprimée)
routerAdd("POST", "/api/table/mod/decide", (e) => {
  try { $app.findFirstRecordByFilter("admins", "user = {:u}", { u: e.auth.id }); } catch (_) { return e.json(403, { message: "Réservé à l'administrateur." }); }
  const b = e.requestInfo().body || {};
  if (b.kind === "dm") {
    const open = $app.findRecordsByFilter("reports", "status = 'open' && kind = 'dm' && target = {:t} && reporter = {:r}", "", 50, 0, { t: String(b.target || ""), r: String(b.reporter || "") });
    for (const r of open) { r.set("status", "ok"); $app.save(r); }
    return e.json(200, { ok: true, closed: open.length });
  }
  const kind = b.kind === "back" ? "back" : "bg";
  let t;
  try { t = $app.findRecordById("users", String(b.target || "")); } catch (_) { return e.json(404, { message: "Joueur introuvable." }); }
  const remove = b.action === "remove";
  if (remove) t.set(kind === "bg" ? "mat_bg" : "card_back", null);
  t.set(kind === "bg" ? "bg_blocked" : "back_blocked", false);
  $app.save(t);
  const open = $app.findRecordsByFilter("reports", "status = 'open' && target = {:t} && kind = {:k}", "", 200, 0, { t: t.id, k: kind });
  for (const r of open) { r.set("status", remove ? "removed" : "ok"); $app.save(r); }
  return e.json(200, { ok: true, closed: open.length });
}, $apis.requireAuth());
