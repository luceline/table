/// <reference path="../pb_data/types.d.ts" />
// Cache navigateur : la page de l'appli est toujours revalidée (sinon, juste après une mise à jour, un joueur
// peut garder quelques minutes l'ancienne version) ; les fichiers de /assets/ portent une empreinte dans leur nom,
// ils peuvent rester en cache longtemps.
routerUse((e) => {
  const p = e.request.url.path;
  if (p.startsWith("/assets/")) e.response.header().set("Cache-Control", "public, max-age=31536000, immutable");
  else if (!p.startsWith("/api/") && !p.startsWith("/_/")) e.response.header().set("Cache-Control", "no-cache");
  return e.next();
});
