/// <reference path="../pb_data/types.d.ts" />
// Messages privés : noms fixés par le serveur, refus si le destinataire a bloqué l'expéditeur, notification au destinataire.
onRecordCreateRequest((e) => {
  const r = e.record;
  const from = r.getString("from"), to = r.getString("to");
  let blocked = false;
  try {
    $app.findFirstRecordByFilter("blocks", "user = {:to} && blocked = {:from}", { to: to, from: from });
    blocked = true;
  } catch (_) {}
  if (blocked) throw new BadRequestError("Ce joueur ne reçoit pas vos messages privés.");
  // pas plus de 20 messages privés par minute
  const since = new Date(Date.now() - 60000).toISOString().replace("T", " ");
  if ($app.countRecords("dms", $dbx.exp("[[from]] = {:f} AND created >= {:s}", { f: from, s: since })) >= 20) throw new BadRequestError("Doucement : trop de messages en une minute.");
  let fromName = "Joueur", toName = "Joueur";
  try { fromName = $app.findRecordById("users", from).getString("name") || fromName; } catch (_) {}
  try { toName = $app.findRecordById("users", to).getString("name") || toName; } catch (_) { throw new BadRequestError("Joueur introuvable."); }
  r.set("from_name", fromName.slice(0, 40));
  r.set("to_name", toName.slice(0, 40));
  e.next();
  const text = r.getString("text");
  require(`${__hooks}/push_lib.js`).sendTo([to], {
    title: `Message privé de ${fromName}`,
    body: text.length > 140 ? text.slice(0, 137) + "…" : text,
    url: "/?dm=" + from,
    tag: "dm-" + from,
  });
}, "dms");
