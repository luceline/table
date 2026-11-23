import { useState } from "react";
import { fxSetting, setFxSetting } from "../lib/fx.js";

// Effets spéciaux (Safir) : activés ou coupés sur cet appareil, depuis la partie (menu ☰) ou en spectateur
export default function FxToggle({ compact }) {
  const [v, setV] = useState(fxSetting);
  const flip = () => {
    const next = v === "off" ? "full" : "off";
    setFxSetting(next);
    setV(next);
  };
  if (compact) {
    return (
      <button className="btn sm" onClick={flip} title={v === "off" ? "Effets spéciaux coupés : toucher pour les activer" : "Effets spéciaux activés : toucher pour les couper"}>
        {v === "off" ? "🚫 Effets" : "✨ Effets"}
      </button>
    );
  }
  return (
    <div className="row fx-toggle" style={{ marginBottom: 12, alignItems: "center" }}>
      <span className="grow small">
        ✨ Effets spéciaux <span className="muted">(arrivée des cartes, Gel)</span>
      </span>
      <div className="hand-tabs" style={{ margin: 0 }}>
        <button className={v !== "off" ? "on" : ""} onClick={() => v === "off" && flip()}>Activés</button>
        <button className={v === "off" ? "on" : ""} onClick={() => v !== "off" && flip()}>Coupés</button>
      </div>
    </div>
  );
}
