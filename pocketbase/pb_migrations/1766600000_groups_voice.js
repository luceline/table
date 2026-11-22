/// <reference path="../pb_data/types.d.ts" />
// Groupes privés (conversations à plusieurs, 10 joueurs au plus) et salons vocaux avec partage d'écran.
// dm_groups   : groupes, lisibles par leurs membres ; créés et modifiés seulement par le serveur (/api/table/groups)
// gmsgs       : messages des groupes, lisibles par les membres ; sys = message automatique (« X a ajouté Y »)
// gm_reads    : dernier message lu et sourdine, par joueur et par groupe (à lui seul)
// voice_rooms : salons vocaux d'un jeu, gérés par l'administrateur
// voice_here  : qui est dans quel salon vocal (un seul à la fois), signe de vie toutes les 20 s (périmé après 2 min 30)
// voice_kicks : joueur retiré d'un salon vocal par l'administrateur (10 minutes)
// vrtc        : mise en relation des appareils d'un salon vocal (effacée dès lecture)
migrate((app) => {
  const has = (n) => { try { app.findCollectionByNameOrId(n); return true; } catch (_) { return false; } };
  const users = app.findCollectionByNameOrId("users");
  const AUTH = "@request.auth.id != ''";
  const ADMIN = "@request.auth.id != '' && @collection.admins.user ?= @request.auth.id";
  const MEMBER = "@request.auth.id != '' && members.id ?= @request.auth.id";
  const GMEMBER = "@request.auth.id != '' && group.members.id ?= @request.auth.id";
  const SELF = "@request.auth.id != '' && user = @request.auth.id";

  if (!has("dm_groups")) {
    app.save(new Collection({
      type: "base", name: "dm_groups",
      listRule: MEMBER, viewRule: MEMBER, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: "relation", name: "owner", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "members", collectionId: users.id, maxSelect: 10, cascadeDelete: false },
        { type: "json", name: "names", maxSize: 4000 },
        { type: "text", name: "name", max: 40 },
        { type: "text", name: "last", max: 40 },
        { type: "text", name: "last_text", max: 160 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
    }));
  }
  const groups = app.findCollectionByNameOrId("dm_groups");
  if (!has("gmsgs")) {
    app.save(new Collection({
      type: "base", name: "gmsgs",
      listRule: GMEMBER, viewRule: GMEMBER,
      createRule: GMEMBER + " && from = @request.auth.id && sys = false",
      updateRule: null,
      deleteRule: "@request.auth.id != '' && from = @request.auth.id && sys = false",
      fields: [
        { type: "relation", name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "from", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "from_name", max: 40 },
        { type: "text", name: "text", required: true, max: 1000 },
        { type: "bool", name: "sys" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_gmsgs_group ON gmsgs (`group`, created)"],
    }));
  }
  if (!has("gm_reads")) {
    app.save(new Collection({
      type: "base", name: "gm_reads",
      listRule: SELF, viewRule: SELF,
      createRule: SELF + " && group.members.id ?= @request.auth.id",
      updateRule: SELF + " && @request.body.user:isset = false && @request.body.group:isset = false",
      deleteRule: SELF,
      fields: [
        { type: "relation", name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "at", max: 40 },
        { type: "bool", name: "muted" },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_gm_reads ON gm_reads (`group`, user)"],
    }));
  }

  // Signalement d'un joueur dans un groupe : kind « grp », identifiant du groupe dans grp
  const reports = app.findCollectionByNameOrId("reports");
  const kind = reports.fields.getByName("kind");
  if (kind && !kind.values.includes("grp")) kind.values = [...kind.values, "grp"];
  if (!reports.fields.getByName("grp")) reports.fields.add(new TextField({ name: "grp", max: 20 }));
  app.save(reports);

  if (!has("voice_rooms")) {
    app.save(new Collection({
      type: "base", name: "voice_rooms",
      listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
      fields: [
        { type: "text", name: "tcg", max: 20 },
        { type: "text", name: "name", required: true, max: 40 },
        { type: "number", name: "sort" },
        { type: "number", name: "max", min: 2, max: 8 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
    }));
    const vr = app.findCollectionByNameOrId("voice_rooms");
    for (const tcg of ["safir", "fab"]) {
      for (const [name, n] of [["vocal-général", 0], ["stream-et-parties", 1]]) {
        const r = new Record(vr);
        r.set("tcg", tcg); r.set("name", name); r.set("sort", n); r.set("max", 6);
        app.save(r);
      }
    }
  }
  const rooms = app.findCollectionByNameOrId("voice_rooms");
  if (!has("voice_here")) {
    app.save(new Collection({
      type: "base", name: "voice_here",
      listRule: AUTH, viewRule: AUTH,
      createRule: SELF,
      updateRule: SELF + " && @request.body.user:isset = false && @request.body.room:isset = false && @request.body.name:isset = false",
      deleteRule: "@request.auth.id != '' && (user = @request.auth.id || @collection.admins.user ?= @request.auth.id)",
      fields: [
        { type: "relation", name: "room", required: true, collectionId: rooms.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "name", max: 40 },
        { type: "text", name: "beat", max: 40 },
        { type: "bool", name: "mic" },
        { type: "text", name: "share", max: 10 },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_voice_here_user ON voice_here (user)"],
    }));
  }
  if (!has("voice_kicks")) {
    app.save(new Collection({
      type: "base", name: "voice_kicks",
      listRule: SELF, viewRule: SELF, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: "relation", name: "room", required: true, collectionId: rooms.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "until", max: 40 },
      ],
    }));
  }
  if (!has("vrtc")) {
    const MINE = "@request.auth.id != '' && (to = @request.auth.id || from = @request.auth.id)";
    app.save(new Collection({
      type: "base", name: "vrtc",
      listRule: MINE, viewRule: MINE,
      createRule: "@request.auth.id != '' && from = @request.auth.id && to != @request.auth.id",
      updateRule: null, deleteRule: MINE,
      fields: [
        { type: "relation", name: "room", required: true, collectionId: rooms.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "from", required: true, max: 48 },
        { type: "text", name: "to", required: true, max: 48 },
        { type: "text", name: "type", required: true, max: 12 },
        { type: "json", name: "data", maxSize: 200000 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_vrtc_to ON vrtc (room, `to`)"],
    }));
  }
}, (app) => {
  for (const n of ["vrtc", "voice_kicks", "voice_here", "voice_rooms", "gm_reads", "gmsgs", "dm_groups"]) {
    try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {}
  }
});
