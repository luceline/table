import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// Polices du thème Jade et laque, servies par l'appli (sous-ensembles latins seulement)
import "@fontsource/zen-antique/latin-400.css";
import "@fontsource/zen-antique/latin-ext-400.css";
import "@fontsource/zen-kaku-gothic-new/latin-400.css";
import "@fontsource/zen-kaku-gothic-new/latin-500.css";
import "@fontsource/zen-kaku-gothic-new/latin-700.css";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/alegreya/latin-400.css";
import "@fontsource/alegreya/latin-700.css";
import "@fontsource/exo-2/latin-700.css";
import "@fontsource/exo-2/latin-800-italic.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import "./themes.css";
import { applyTheme, storedTheme } from "./lib/theme.js";

applyTheme(storedTheme()); // thème de l'appareil, avant le premier affichage

createRoot(document.getElementById("root")).render(<App />);
