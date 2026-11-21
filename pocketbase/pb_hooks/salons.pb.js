/// <reference path="../pb_data/types.d.ts" />
// Commande serveur pour gérer les administrateurs des salons (le tableau de bord n'est pas exposé) :
//   cd /opt/table/pocketbase && ./pocketbase table-admin add votre@email.fr
//   ./pocketbase table-admin remove votre@email.fr
//   ./pocketbase table-admin list
$app.rootCmd.addCommand(new Command({
  use: "table-admin",
  short: "Administrateurs des salons de Table de jeu : add | remove | list [e-mail]",
  run: (cmd, args) => {
    try { $app.findCollectionByNameOrId("admins"); } catch (_) {
      return console.log("Les salons ne sont pas encore installés : lancez d'abord la mise à jour (deploy/update.sh).");
    }
    const action = args[0] || "list";
    const email = (args[1] || "").trim().toLowerCase();
    if (action === "list") {
      const rows = $app.findAllRecords("admins");
      if (!rows.length) console.log("Aucun administrateur.");
      for (const r of rows) {
        try {
          const u = $app.findRecordById("users", r.getString("user"));
          console.log("- " + u.getString("email") + " (" + (u.getString("name") || "sans pseudo") + ")");
        } catch (_) {}
      }
      return;
    }
    if (!email) return console.log("Indiquez l'e-mail du compte, par exemple : table-admin add moi@exemple.fr");
    let u;
    try {
      u = $app.findAuthRecordByEmail("users", email);
    } catch (_) {
      return console.log("Aucun compte avec l'e-mail " + email + " : créez-le d'abord dans l'appli.");
    }
    const col = $app.findCollectionByNameOrId("admins");
    let cur = null;
    try { cur = $app.findFirstRecordByFilter("admins", "user = {:u}", { u: u.id }); } catch (_) {}
    if (action === "add") {
      if (cur) return console.log(email + " est déjà administrateur.");
      const r = new Record(col);
      r.set("user", u.id);
      $app.save(r);
      return console.log(email + " est maintenant administrateur des salons.");
    }
    if (action === "remove") {
      if (!cur) return console.log(email + " n'est pas administrateur.");
      $app.delete(cur);
      return console.log(email + " n'est plus administrateur.");
    }
    console.log("Action inconnue : add, remove ou list.");
  },
}));
