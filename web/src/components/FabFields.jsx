// Champs propres à Flesh and Blood : type de carte, couleur de pitch, valeurs, classes et talents.
export const FAB_KINDS = [
  { id: "carte", label: "Carte du deck" },
  { id: "heros", label: "Héros" },
  { id: "arene", label: "Arme / équipement" },
  { id: "jeton", label: "Jeton" },
];
export const FAB_KIND_LABEL = Object.fromEntries(FAB_KINDS.map((k) => [k.id, k.label]));

// Classes et talents tels qu'imprimés sur les cartes (anglais)
export const FAB_CLASSES = [
  "Generic", "Warrior", "Guardian", "Ninja", "Brute", "Ranger", "Mechanologist", "Runeblade", "Wizard",
  "Illusionist", "Assassin", "Bard", "Merchant", "Necromancer", "Shapeshifter", "Pirate", "Thief", "Adjudicator",
];
export const FAB_TALENTS = ["Light", "Shadow", "Elemental", "Draconic", "Earth", "Ice", "Lightning", "Mystic", "Royal", "Revered", "Reviled", "Chaos"];

const PITCHES = [
  { id: "r", label: "Rouge", hex: "#c83a32" },
  { id: "y", label: "Jaune", hex: "#d6b13b" },
  { id: "b", label: "Bleu", hex: "#3b78c8" },
  { id: "", label: "Aucun", hex: null },
];

export function KindPicker({ value, onChange }) {
  return (
    <div className="field">
      <label>Type de carte</label>
      <div className="fac-chips">
        {FAB_KINDS.map((k) => (
          <button key={k.id} type="button" className={`fac ${value === k.id ? "on" : ""}`} onClick={() => onChange(k.id)}>{k.label}</button>
        ))}
      </div>
    </div>
  );
}

export function PitchPicker({ value, onChange }) {
  return (
    <div className="field">
      <label>Couleur de pitch <span className="muted">(rouge 1, jaune 2, bleu 3 ressources, ajoutées d'office en jeu ; la même carte en rouge et en bleu = deux cartes différentes)</span></label>
      <div className="fac-chips">
        {PITCHES.map((p) => (
          <button
            key={p.id || "none"}
            type="button"
            className={`fac pitch ${value === p.id ? "on" : ""}`}
            style={p.hex ? { "--pitch": p.hex } : null}
            onClick={() => onChange(p.id)}
          >
            {p.hex && <i className="pitch-dot" />}
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Coût / Attaque / Défense : facultatifs (la carte reste lisible en jeu en la touchant)
export function FabStats({ stats, setStats }) {
  const f = (k, label) => (
    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
      <label>{label}</label>
      <input
        className="input stat-in"
        value={stats[k] || ""}
        inputMode="numeric"
        maxLength={6}
        onChange={(e) => setStats({ ...stats, [k]: e.target.value })}
        placeholder="–"
      />
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        {f("val", "Coût")}
        {f("atk", "Attaque")}
        {f("def", "Défense")}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>Facultatif.</div>
    </div>
  );
}
