/// <reference path="../pb_data/types.d.ts" />
// Carte des joueurs : villes indiquées (facultatif), visibles des joueurs connectés.

// Ville : seulement en France, Belgique, Suisse, Luxembourg ou Monaco (centre de la ville, pas d'adresse) ; vide = retirée
onRecordUpdateRequest((e) => {
  const r = e.record;
  const city = String(r.getString("city") || "").trim().slice(0, 80);
  r.set("city", city);
  if (!city) {
    r.set("city_tag", "");
    r.set("city_lat", 0);
    r.set("city_lon", 0);
  } else {
    const lat = r.getFloat("city_lat"), lon = r.getFloat("city_lon");
    if (!(lat > 41 && lat < 52 && lon > -6 && lon < 11)) throw new BadRequestError("Choisissez une ville de la liste (France, Belgique, Suisse, Luxembourg ou Monaco).");
    r.set("city_lat", Math.round(lat * 1000) / 1000);
    r.set("city_lon", Math.round(lon * 1000) / 1000);
  }
  e.next();
}, "users");

routerAdd("GET", "/api/table/map", (e) => {
  const list = $app.findRecordsByFilter("users", "city != ''", "city", 2000, 0);
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, {
    players: list.map((u) => ({
      id: u.id,
      name: u.getString("name") || "Joueur",
      city: u.getString("city"),
      tag: u.getString("city_tag"),
      lat: u.getFloat("city_lat"),
      lon: u.getFloat("city_lon"),
    })),
  });
}, $apis.requireAuth());
