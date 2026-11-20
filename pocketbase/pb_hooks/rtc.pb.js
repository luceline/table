/// <reference path="../pb_data/types.d.ts" />
// Nettoyage des messages de mise en relation WebRTC oubliés (normalement effacés dès lecture)
cronAdd("rtc_cleanup", "*/15 * * * *", () => {
  const t = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace("T", " ");
  try {
    $app.db().newQuery("DELETE FROM rtc WHERE created < {:t}").bind({ t: t }).execute();
  } catch (_) {}
});
