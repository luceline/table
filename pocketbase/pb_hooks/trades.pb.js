/// <reference path="../pb_data/types.d.ts" />
// Échanges : pseudo et numéro normalisés par le serveur, 300 lignes au plus par joueur,
// et notification aux joueurs concernés quand une carte recherchée est proposée (ou l'inverse).

onRecordCreateRequest((e) => {
  require(`${__hooks}/trades_lib.js`).fix(e, true);
  try {
    e.next();
  } catch (err) {
    if (String(err).includes("UNIQUE") || String(err).includes("unique")) throw new BadRequestError("Cette carte est déjà dans cette liste.");
    throw err;
  }
  const r = e.record;
  const other = r.getString("kind") === "have" ? "want" : "have";
  const list = $app.findRecordsByFilter(
    "trades",
    "tcg = {:t} && series = {:s} && num = {:n} && kind = {:k} && user != {:u}",
    "", 50, 0,
    { t: r.getString("tcg"), s: r.getString("series"), n: r.getString("num"), k: other, u: r.getString("user") },
  );
  // même rareté et finition, ou non précisées d'un côté
  const ok = (x, k) => !x.getString(k) || !r.getString(k) || x.getString(k) === r.getString(k);
  const to = [...new Set(list.filter((x) => ok(x, "rarity") && ok(x, "finish")).map((x) => x.getString("user")))];
  if (!to.length) return;
  const card = `${r.getString("series")} n°${r.getString("num")}${r.getString("name") ? ` (${r.getString("name")})` : ""}${r.getString("rarity") ? `, ${r.getString("rarity")}` : ""}${r.getInt("qty") > 1 ? ` ×${r.getInt("qty")}` : ""}`;
  try {
    require(`${__hooks}/push_lib.js`).sendTo(to, {
      title: r.getString("kind") === "have" ? "Une carte que vous cherchez est disponible" : "Quelqu'un cherche une de vos cartes",
      body: r.getString("kind") === "have" ? `${r.getString("uname")} a ${card} en double.` : `${r.getString("uname")} cherche ${card}.`,
      url: "/?echanges",
      tag: "trade-" + r.id,
    });
  } catch (_) {}
}, "trades");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/trades_lib.js`).fix(e, false);
  e.next();
}, "trades");
