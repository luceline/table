import { FACTIONS, KIN_SUB } from "../lib/factions.js";

// Choix des factions d'une carte (plusieurs possibles) ; les sous-factions Kin n'apparaissent que si Kin est coché
// list / extra / label : autre jeu (ex. Flesh and Blood : classes puis talents) ; sans eux, factions de Safir
export default function FactionPicker({ value = [], onChange, list, extra, label }) {
  const tog = (f) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  if (list) {
    return (
      <div className="field">
        <label>{label || "Classes"} <span className="muted">(facultatif, plusieurs possibles)</span></label>
        <div className="fac-chips">
          {list.map((f) => (
            <button key={f} type="button" className={`fac ${value.includes(f) ? "on" : ""}`} onClick={() => tog(f)}>{f}</button>
          ))}
        </div>
        {extra && (
          <div className="fac-chips" style={{ marginTop: 6 }}>
            {extra.map((f) => (
              <button key={f} type="button" className={`fac sub ${value.includes(f) ? "on" : ""}`} onClick={() => tog(f)}>{f}</button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const kin = value.includes("Kin") || KIN_SUB.some((f) => value.includes(f));
  return (
    <div className="field">
      <label>Factions <span className="muted">(facultatif, plusieurs possibles)</span></label>
      <div className="fac-chips">
        {FACTIONS.map((f) => (
          <button key={f} type="button" className={`fac ${value.includes(f) ? "on" : ""}`} onClick={() => tog(f)}>{f}</button>
        ))}
      </div>
      {kin && (
        <div className="fac-chips" style={{ marginTop: 6 }}>
          <span className="muted small">Sous-faction Kin :</span>
          {KIN_SUB.map((f) => (
            <button key={f} type="button" className={`fac sub ${value.includes(f) ? "on" : ""}`} onClick={() => tog(f)}>{f}</button>
          ))}
        </div>
      )}
    </div>
  );
}
