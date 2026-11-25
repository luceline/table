// Champs propres à Sorcery: Contested Realm : type de carte, rareté, éléments (seuil ou affinité), valeurs.
import { SORC_ELEMENTS } from "../lib/game.js";

export const SORC_KINDS = [
  { id: "sort", label: "Sort", hint: "grimoire : sbires, magies, auras, artefacts" },
  { id: "site", label: "Site", hint: "atlas" },
  { id: "avatar", label: "Avatar" },
  { id: "jeton", label: "Jeton" },
];
export const SORC_KIND_LABEL = Object.fromEntries(SORC_KINDS.map((k) => [k.id, k.label]));
// Rareté imprimée : nombre d'exemplaires permis dans un deck
export const SORC_RARITIES = [
  { id: "ordinary", label: "Ordinaire", copies: 4 },
  { id: "exceptional", label: "Exceptionnelle", copies: 3 },
  { id: "elite", label: "Élite", copies: 2 },
  { id: "unique", label: "Unique", copies: 1 },
];
export const sorcCopies = (rarity) => SORC_RARITIES.find((r) => r.id === rarity)?.copies ?? 4;
export const sorcRarityLabel = (rarity) => SORC_RARITIES.find((r) => r.id === rarity)?.label || "";

export function SorcKindPicker({ value, onChange }) {
  return (
    <div className="field">
      <label>Type de carte</label>
      <div className="fac-chips">
        {SORC_KINDS.map((k) => (
          <button key={k.id} type="button" className={`fac ${value === k.id ? "on" : ""}`} onClick={() => onChange(k.id)} title={k.hint || ""}>
            {k.label}
          </button>
        ))}
      </div>
      {SORC_KINDS.find((k) => k.id === value)?.hint && <p className="muted small" style={{ margin: "4px 0 0" }}>{SORC_KINDS.find((k) => k.id === value).hint}</p>}
    </div>
  );
}

export function RarityPicker({ value, onChange }) {
  return (
    <div className="field">
      <label>Rareté <span className="muted">(exemplaires permis dans un deck)</span></label>
      <div className="fac-chips">
        {SORC_RARITIES.map((r) => (
          <button key={r.id} type="button" className={`fac ${value === r.id ? "on" : ""}`} onClick={() => onChange(value === r.id ? "" : r.id)}>
            {r.label} <span className="muted">×{r.copies}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Éléments : seuil d'un sort, ou symboles d'un site (son affinité). Rangés dans « factions ».
export function ElementPicker({ value, onChange, kind }) {
  const v = Array.isArray(value) ? value : [];
  const toggle = (id) => onChange(v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
  return (
    <div className="field">
      <label>
        Éléments{" "}
        <span className="muted">
          {kind === "site" ? "(symboles du site : ils donnent l'affinité)" : kind === "avatar" ? "" : "(seuil du sort)"}
        </span>
      </label>
      <div className="fac-chips">
        {SORC_ELEMENTS.map((e) => (
          <button key={e.id} type="button" className={`fac ${v.includes(e.id) ? "on" : ""}`} onClick={() => toggle(e.id)} style={{ "--pitch": e.hex }}>
            <span style={{ color: e.hex }}>{e.icon}</span> {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Valeurs : coût et puissance d'un sort ; vie et puissance d'un avatar ; rien pour un site
export function SorcStats({ stats, setStats, kind }) {
  if (kind === "site" || kind === "jeton") return null;
  const f = (k, label, ph = "–") => (
    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
      <label>{label}</label>
      <input className="input stat-in" value={stats[k] || ""} inputMode="numeric" maxLength={6} onChange={(e) => setStats({ ...stats, [k]: e.target.value })} placeholder={ph} />
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        {kind === "avatar" ? (
          <>
            {f("val", "Vie", "20")}
            {f("atk", "Puissance")}
          </>
        ) : (
          <>
            {f("val", "Coût (mana)")}
            {f("atk", "Puissance")}
            {f("def", "Défense", "si différente")}
          </>
        )}
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>Facultatif : la carte reste lisible en jeu en la touchant.</p>
    </div>
  );
}
