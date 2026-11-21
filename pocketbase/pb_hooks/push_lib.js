// Envoi de notifications à des joueurs (utilisé par les hooks : require(`${__hooks}/push_lib.js`))
// Les abonnements morts (appareil désinscrit) sont supprimés.
module.exports = {
  sendTo(userIds, payload) {
    const ids = (userIds || []).filter(Boolean);
    if (!ids.length) return;
    try {
      const filter = ids.map((_, i) => `user = {:u${i}}`).join(" || ");
      const params = {};
      ids.forEach((u, i) => { params["u" + i] = u; });
      const subs = $app.findRecordsByFilter("push_subs", filter, "", 100, 0, params);
      if (!subs.length) return;
      const arg = JSON.stringify({
        subs: subs.map((s) => ({ endpoint: s.getString("endpoint"), keys: { p256dh: s.getString("p256dh"), auth: s.getString("auth") } })),
        payload: payload,
      });
      const res = JSON.parse(toString($os.cmd("node", __hooks + "/../../push/send.js", arg).output()) || "{}");
      for (const ep of res.gone || []) {
        for (const s of subs) if (s.getString("endpoint") === ep) { try { $app.delete(s); } catch (_) {} }
      }
      if (res.error) console.log("notification non envoyée :", res.error);
    } catch (err) {
      console.log("notification non envoyée :", err);
    }
  },
};
