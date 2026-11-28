// Prototype Héros : import de decks depuis un fichier Markdown au format « Decks de démo » (v0.1),
// et synchronisation des cartes du joueur (création ou mise à jour, image redessinée si le texte change).
//
// Format lu (souple) : chaque section « ## … Deck … — Nom (…) » contient
//   - un tableau des cartes : colonnes #, Carte, Ex., Type, Niv. / coût, Texte de la carte (les autres sont ignorées) ;
//     « **Enchaînement** (facile) : … » dans le texte devient l'enchaînement de la carte ;
//     famille : colonne « Famille », ou [Feu] dans le type ou le nom, ou la phrase « Toutes les cartes portent l'étiquette [Feu] »
//     de la section (avec « sauf X (sans famille) ») ;
//   - un tableau des quêtes : colonnes Quête (« **D3 Assaut** ⚔ »), Palier / coût, Objectif, Récompense ;
//   - un plan d'équipement (facultatif) : colonne Déblocage (« **Gants de duelliste** (3) : … »).
import { pb, me } from "../pb.js";
import { renderHerosCard, HEROS_TIER } from "./herosCard.js";
import { HEROS_EQUIP } from "./mat.js";

const clean = (s) => String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const fold = (s) => clean(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function tables(lines) {
  const out = [];
  let cur = null;
  for (const l of lines) {
    if (/^\s*\|/.test(l)) {
      const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue; // ligne de séparation
      if (!cur) out.push((cur = { head: cells.map(fold), rows: [] }));
      else cur.rows.push(cells);
    } else cur = null;
  }
  return out;
}
const col = (head, ...keys) => head.findIndex((h) => keys.some((k) => (k instanceof RegExp ? k.test(h) : h === k || h.startsWith(k))));

function tierOf(s) {
  const f = fold(s);
  return f.includes("complex") ? "complexe" : f.includes("interm") ? "intermediaire" : f.includes("simple") ? "simple" : "";
}
function slotOf(name) {
  const f = fold(name);
  return HEROS_EQUIP.find((s) => f.includes(fold(s))) || "";
}

export function parseHerosDecks(md) {
  const text = String(md || "").replace(/\r/g, "");
  const parts = text.split(/\n(?=##\s)/);
  const decks = [];
  for (const part of parts) {
    const lines = part.split("\n");
    const head = lines[0].replace(/^#+\s*/, "");
    if (!/^##\s/.test(lines[0]) || !/deck/i.test(head)) continue;
    // nom : après le tiret long (ou « : »), sans parenthèse ; sinon sans numéro ni « Deck X »
    let name = (head.split(/\s[—–-]\s|:\s/)[1] || head.replace(/^\d+[.)]?\s*/, "").replace(/^deck\s+\S+\s*/i, "")).replace(/\(.*\)/, "").trim();
    if (!name) name = head.trim();
    const body = lines.slice(1).join("\n");
    const famM = body.match(/[ée]tiquette\s*\[([^\]]+)\]/i);
    const defFam = famM ? famM[1].trim() : "";
    const noFam = new Set();
    for (const m of body.matchAll(/sauf\s+([^.\n]+?)\s*\(sans famille\)/gi)) for (const n of m[1].split(/,| et /)) noFam.add(fold(n));
    const deck = { name, cards: [], quests: [], equip: [], warnings: [] };
    for (const t of tables(lines)) {
      const h = t.head;
      const iName = col(h, "carte");
      const iQty = col(h, "ex", "exemplaires", "qte", "nb");
      const iTxt = col(h, /^texte/);
      const iQuest = col(h, "quete");
      const iGoal = col(h, "objectif");
      const iDeb = col(h, "deblocage", "piece");
      if (iName >= 0 && iQty >= 0 && iTxt >= 0) {
        const iCode = col(h, "#", "code");
        const iType = col(h, "type");
        const iLvl = col(h, /^niv/);
        const iFam = col(h, "famille");
        for (const r of t.rows) {
          const nm = clean(r[iName]);
          if (!nm || /^total/i.test(nm)) continue;
          const qty = parseInt(clean(r[iQty]), 10);
          const lc = clean(r[iLvl]).match(/(\d+)\s*\/\s*(\d+)/);
          if (!(qty > 0) || !lc) {
            deck.warnings.push(`Ligne ignorée (exemplaires ou « niveau / coût » illisibles) : ${nm}`);
            continue;
          }
          const raw = r[iTxt] || "";
          const ch = raw.match(/\*\*\s*Encha[iî]nement\s*\*\*\s*(?:\(([^)]*)\))?\s*:?\s*([\s\S]*)$/i);
          const base = clean(ch ? raw.slice(0, ch.index) : raw);
          const tagIn = (clean(r[iType]) + " " + nm).match(/\[([^\]]+)\]/);
          const fam = iFam >= 0 ? clean(r[iFam]).replace(/[[\]]/g, "") : tagIn ? tagIn[1] : noFam.has(fold(nm)) ? "" : defFam;
          deck.cards.push({
            kind: /r[ée]action/i.test(r[iType] || "") ? "reaction" : "action",
            code: iCode >= 0 ? clean(r[iCode]) : "",
            name: nm.replace(/\s*\[[^\]]+\]\s*/g, " ").trim(),
            qty,
            lvl: +lc[1],
            cost: +lc[2],
            fam,
            text: base,
            chain: ch ? `${cap(clean(ch[1]) || "Facile")} : ${clean(ch[2])}` : "",
          });
        }
      } else if (iQuest >= 0 && iGoal >= 0) {
        const iTier = col(h, "palier");
        const iRew = col(h, "recompense");
        for (const r of t.rows) {
          const cell = clean(r[iQuest]);
          const m = cell.match(/^([A-Z]{1,2}\d+)\s+(.+?)\s*(⚔|⏳)?\s*$/u);
          if (!m) {
            if (cell) deck.warnings.push(`Quête illisible : ${cell}`);
            continue;
          }
          const tier = tierOf(r[iTier]);
          if (!tier) deck.warnings.push(`Palier inconnu pour la quête ${m[2]} : simple par défaut.`);
          deck.quests.push({ kind: "quete", code: m[1], name: m[2].trim(), tag: m[3] || "", tier: tier || "simple", cost: HEROS_TIER[tier || "simple"][2], goal: clean(r[iGoal]), reward: clean(r[iRew]) });
        }
      } else if (iDeb >= 0) {
        for (const r of t.rows) {
          const m = String(r[iDeb] || "").match(/\*\*([^*]+)\*\*\s*(?:\((\d+)\))?\s*:?\s*(.*)$/);
          if (!m) continue;
          const nm = clean(m[1]);
          const txt = clean(m[3]);
          deck.equip.push({ kind: "equipement", name: nm, cost: m[2] ? +m[2] : 0, slot: slotOf(nm), text: cap(txt), mode: /^(quand|au d[ée]but|la premi[eè]re|à la fin)/i.test(txt) ? "Passif" : "Activé" });
        }
      }
    }
    if (deck.cards.length || deck.quests.length) decks.push(deck);
  }
  return decks;
}

// Résumé d'un deck lu : nombres et écarts avec la Référence v0.2 (section 2)
export function summarize(d) {
  const total = d.cards.reduce((n, c) => n + c.qty, 0);
  const tiers = { simple: 0, intermediaire: 0, complexe: 0 };
  for (const q of d.quests) tiers[q.tier]++;
  const problems = [];
  if (total !== 30) problems.push(`${total} cartes (30 attendues)`);
  for (const c of d.cards) if (c.qty > 3) problems.push(`${c.name} en ${c.qty} exemplaires`);
  if (d.quests.length !== 10) problems.push(`${d.quests.length} quêtes (10 attendues)`);
  for (const [t, n] of Object.entries(tiers)) if (n < 2) problems.push(`${n} quête(s) ${t}`);
  return { total, tiers, problems };
}

// ---------- Synchronisation avec les cartes du joueur ----------
const famOf = (c) => (c.kind === "equipement" ? [c.slot || slotOf(c.name)].filter(Boolean) : c.fam ? [c.fam] : []);
const metaOf = (c) =>
  c.kind === "quete" ? { code: c.code, goal: c.goal, reward: c.reward, tag: c.tag || "" }
  : c.kind === "equipement" ? { code: c.code || "", mode: c.mode, text: c.text }
  : { code: c.code || "", text: c.text, chain: c.chain || "" };
const fieldsOf = (c) => ({
  name: c.name,
  kind: c.kind,
  val: String(c.cost ?? ""),
  atk: c.kind === "action" || c.kind === "reaction" ? String(c.lvl ?? "") : "",
  rarity: c.kind === "quete" ? c.tier : "",
  factions: famOf(c),
  meta: metaOf(c),
});
const sameAs = (rec, f) =>
  rec.kind === f.kind && (rec.val || "") === f.val && (rec.atk || "") === f.atk && (rec.rarity || "") === f.rarity &&
  JSON.stringify(rec.factions || []) === JSON.stringify(f.factions) && JSON.stringify(rec.meta || null) === JSON.stringify(f.meta);
// carte du joueur qui correspond (même nom ; Action et Réaction comptent pour un même type)
const group = (k) => (k === "action" || k === "reaction" ? "carte" : k);
export const findCard = (existing, c) => existing.find((r) => fold(r.name) === fold(c.name) && group(r.kind) === group(c.kind));

// Une quête sans mention ⚔ / ⏳ dans le fichier de deck garde celle de la carte existante (ces fichiers ne la recopient pas toujours)
const withTag = (c, old) => (c.kind === "quete" && !c.tag && old?.meta?.tag ? { ...c, tag: old.meta.tag } : c);

// Compte ce qui sera créé ou modifié, sans rien écrire
export function plan(existing, list) {
  let created = 0, changed = 0;
  const seen = new Set();
  for (const c of list) {
    const k = group(c.kind) + "|" + fold(c.name);
    if (seen.has(k)) continue;
    seen.add(k);
    const r = findCard(existing, c);
    if (!r) created++;
    else if (!sameAs(r, fieldsOf(withTag(c, r)))) changed++;
  }
  return { created, changed };
}

// Crée ou met à jour les cartes (image redessinée seulement si quelque chose a changé). Renvoie { cle -> id }.
export async function syncCards(existing, list, onStep) {
  const u = me();
  const ids = {};
  const all = [...existing];
  let i = 0;
  for (let c of list) {
    i++;
    const k = group(c.kind) + "|" + fold(c.name);
    if (ids[k]) continue;
    onStep?.(`Cartes : ${i} / ${list.length}`);
    const old = findCard(all, c);
    c = withTag(c, old);
    const f = fieldsOf(c);
    if (old && sameAs(old, f)) {
      ids[k] = old.id;
      continue;
    }
    const blob = await renderHerosCard({ ...c, slot: f.factions[0] || c.slot });
    const fd = new FormData();
    fd.append("owner", u.id);
    fd.append("tcg", "heros");
    fd.append("orient", "p");
    for (const [key, v] of Object.entries(f)) fd.append(key, typeof v === "string" ? v : JSON.stringify(v));
    fd.append("image", new File([blob], `${(c.code || c.name).replace(/[^\w-]+/g, "_")}.jpg`, { type: "image/jpeg" }));
    const rec = old ? await pb.collection("cards").update(old.id, fd) : await pb.collection("cards").create(fd);
    if (!old) all.push(rec);
    ids[k] = rec.id;
  }
  return { ids, all };
}
export const keyOf = (c) => group(c.kind) + "|" + fold(c.name);

// Liste du deck : cartes, quêtes, puis une pièce par emplacement (celles du plan d'abord, sinon celles du joueur)
export function deckEntries(d, ids, allCards) {
  const entries = [];
  for (const c of d.cards) if (ids[keyOf(c)]) entries.push({ card: ids[keyOf(c)], qty: c.qty });
  for (const q of d.quests) if (ids[keyOf(q)]) entries.push({ card: ids[keyOf(q)], qty: 1 });
  const bySlot = {};
  for (const e of d.equip) {
    const id = ids[keyOf(e)];
    const sl = slotOf(e.name) || e.slot;
    if (id && sl && !bySlot[sl]) bySlot[sl] = id;
  }
  for (const r of allCards) if (r.kind === "equipement") {
    const sl = (r.factions || [])[0];
    if (sl && !bySlot[sl]) bySlot[sl] = r.id;
  }
  for (const id of Object.values(bySlot)) entries.push({ card: id, qty: 1 });
  return entries;
}
