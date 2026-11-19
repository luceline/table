import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// Polices du thème Jade et laque, servies par l'appli (sous-ensembles latins seulement)
import "@fontsource/zen-antique/latin-400.css";
import "@fontsource/zen-antique/latin-ext-400.css";
import "@fontsource/zen-kaku-gothic-new/latin-400.css";
import "@fontsource/zen-kaku-gothic-new/latin-500.css";
import "@fontsource/zen-kaku-gothic-new/latin-700.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
