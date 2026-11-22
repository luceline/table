// Flesh and Blood : cartes bannies et héros mis au banc, par format, d'après la politique de légalité des cartes
// de Legend Story Studios (fabtcg.com) et ses annonces jusqu'au 26 octobre 2026. Avertissement seulement : le deck
// n'est jamais bloqué. pitch : couleurs concernées quand seules certaines le sont (r rouge, y jaune, b bleu).
import { makeMatcher } from "./banlist.js";
import { PITCH } from "./deckrules.js";

export const FAB_BAN_INFO = {
  date: "26 octobre 2026",
  next: "21 décembre 2026",
  url: "https://fabtcg.com/rules-and-policy-center/card-legality-policy/",
};

const L = (names) => names.map((n) => (typeof n === "string" ? { name: n } : n));
export const FAB_BANS = {
  cc: L([
    "Art of War", "Awakening", "Ball Lightning", "Belittle", "Berserk", "Bloodsheath Skeleta", "Bonds of Agony",
    { name: "Bonds of Ancestry", pitch: ["y", "b"] }, "Cash In", "Channel Lightning Valley", "Chart the High Seas",
    "Count Your Blessings", "Crown of Seeds", "Drone of Brutality", "Duskblade", { name: "Electromagnetic Somersault", pitch: ["y"] },
    { name: "Golden Tipple", pitch: ["r", "y"] }, "High Octane", "Orihon of Mystic Tenets", "Phantom Tidemaw", "Plume of Evergrowth",
    "Plunder Run", "Reaping Blade", "Remembrance", "Stubby Hammerers", "Tome of Aetherwind", "Tome of Divinity", "Tome of Fyendal",
    "Tome of Firebrand", "Traverse the Universe", "Volzar, the Lightning Rod", "Wrath of Retribution", "Zephyr Needle",
  ]),
  sage: L([
    "Absorb in Aether", "Aether Flare", "Aether Ironweave", "Ball Lightning", "Beaten Trackers", "Belittle", "Bonds of Ancestry",
    "Bracers of Belief", "Count Your Blessings", "Deadwood Dirge", "Drone of Brutality", "Ebon Fold", "Electromagnetic Somersault",
    "Emeritus Scolding", "Fate Foreseen", { name: "Fiddler's Green", pitch: ["r"] }, "Flic Flak", "Goliath Gauntlet", "Harmonized Kodachi",
    "Heartened Cross Strap", "Honing Hood", "Lightning Press", "Mask of Three Tails", { name: "Nimby", pitch: ["r"] }, "Old Knocker",
    "Plunder Run", "Pulping", "Ragamuffin's Hat", "Reality Refractor", "Reaping Blade", "Rosetta Thorn", "Sigil of Solace",
    "Sigil of Suffering", "Sink Below", "Snapback", "Snapdragon Scalers", "Stubby Hammerers", "Vest of the First Fist",
    "Volzar, the Lightning Rod", "Waning Moon", "Zephyr Needle",
  ]),
  blitz: L([
    "Aether Flare", "Aether Wildfire", "Art of War", "Awakening", "Ball Lightning", "Belittle", "Berserk", "Bloodsheath Skeleta",
    "Bonds of Ancestry", "Cash In", "Channel Lightning Valley", "Count Your Blessings", "Drone of Brutality", "Duskblade", "Flicker Wisp",
    "Hadron Collider", "Heartened Cross Strap", "Mask of the Pouncing Lynx", "Orihon of Mystic Tenets", "Snapback", "Storm Striders",
    "Stubby Hammerers", "Talk a Big Game", "Tome of Aetherwind", "Tome of Divinity", "Tome of Fyendal", "Tome of Firebrand",
    "Traverse the Universe", "Zephyr Needle",
  ]),
};
// Héros non jouables dans le format : mis au banc (Silver Age, saison en cours) ou Living Legend (Blitz)
export const FAB_HEROES_OUT = {
  sage: { why: "mis au banc pour la saison en cours", list: ["Briar", "Oldhim", "Oscilio", "Chane"] },
  blitz: { why: "Living Legend", list: ["Briar", "Chane", "Dash", "Ira, Crimson Haze", "Iyslander", "Kano", "Kassai, Cintari Sellsword", "Oldhim", "Rhinar", "Victor Goldmane", "Viserai"] },
};
// Classic Constructed : les héros Living Legend changent presque chaque semaine, l'appli ne les vérifie pas
export const FAB_LL_NOTE = "Les héros devenus Living Legend (et leur arme signature) ne sont plus légaux en Classic Constructed : la liste change presque chaque semaine, vérifiez-la sur fabtcg.com.";

const matchers = Object.fromEntries(Object.entries(FAB_BANS).map(([f, l]) => [f, makeMatcher(l)]));
const heroMatchers = Object.fromEntries(Object.entries(FAB_HEROES_OUT).map(([f, h]) => [f, makeMatcher(h.list.map((name) => ({ name, alias: [name.split(",")[0]] })))]));
export const fabBanLabel = (b) => `${b.name}${b.pitch ? ` (${b.pitch.map((p) => PITCH[p]).join(", ")})` : ""}`;

// Avertissements d'un deck FaB pour son format : [{ text, ban }]
export function fabBanWarnings(deck, cardsById, format) {
  const out = [];
  const seen = new Set();
  const m = matchers[format];
  for (const e of deck?.entries || []) {
    const c = cardsById[e.card];
    if (!c || c.kind === "jeton" || e.tok || c.kind === "heros" || !(e.qty > 0) || !m) continue;
    for (const { b, exact } of m(c.name)) {
      // seules certaines couleurs bannies : on ne prévient pas pour une autre couleur connue
      if (b.pitch && c.pitch && !b.pitch.includes(c.pitch)) continue;
      const key = b.name + "|" + (b.pitch ? c.pitch || "" : "") + "|" + c.name; // une seule ligne pour toutes les couleurs d'une carte bannie
      if (seen.has(key)) continue;
      seen.add(key);
      const color = b.pitch && !c.pitch ? " (selon sa couleur : couleur non renseignée sur votre carte)" : "";
      out.push({ ban: true, text: `« ${fabBanLabel(b)} » est bannie${color}${exact ? "" : ` (votre carte « ${c.name} » y ressemble)`}.` });
    }
  }
  const hero = deck?.commander && cardsById[deck.commander];
  const hm = heroMatchers[format];
  if (hero && hm) {
    const r = hm(hero.name)[0];
    if (r) out.push({ ban: true, text: `Le héros « ${r.b.name} » est ${FAB_HEROES_OUT[format].why}${r.exact ? "" : ` (votre héros « ${hero.name} » y ressemble)`}.` });
  }
  return out;
}
