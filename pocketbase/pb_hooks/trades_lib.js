// Échanges : normalisation d'une ligne (appelé par trades.pb.js)
function fix(e, isNew) {
  const r = e.record;
  let name = "Joueur";
  try { name = $app.findRecordById("users", r.getString("user")).getString("name") || name; } catch (_) {}
  r.set("uname", name.slice(0, 40));
  // numéro : « 003 » = « 3 » ; lettres en majuscules (ex. P100, WTR001)
  let num = String(r.getString("num") || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d+$/.test(num)) num = String(parseInt(num, 10));
  if (!num) throw new BadRequestError("Indiquez le numéro de la carte.");
  r.set("num", num);
  r.set("series", String(r.getString("series") || "").trim());
  r.set("qty", Math.max(1, Math.min(99, r.getInt("qty") || 1)));
  r.set("rarity", String(r.getString("rarity") || "").trim().slice(0, 20));
  r.set("finish", String(r.getString("finish") || "").trim().slice(0, 12));
  try {
    const dup = $app.findFirstRecordByFilter("trades", "user = {:u} && tcg = {:t} && kind = {:k} && series = {:s} && num = {:n} && rarity = {:r} && finish = {:f}", {
      u: r.getString("user"), t: r.getString("tcg"), k: r.getString("kind"), s: r.getString("series"), n: num, r: r.getString("rarity"), f: r.getString("finish"),
    });
    if (dup && dup.id !== r.id) throw new BadRequestError("Cette carte est déjà dans cette liste.");
  } catch (err) {
    if (String(err).includes("déjà")) throw err;
  }
  if (isNew && $app.countRecords("trades", $dbx.exp("user = {:u}", { u: r.getString("user") })) >= 300) {
    throw new BadRequestError("300 cartes au plus dans vos listes.");
  }
}

module.exports = { fix };
