// Thème visuel : Arène arcane par défaut ; Jade et laque, Grimoire au choix du joueur.
// Appliqué tout de suite depuis l'appareil, et enregistré sur le compte pour le retrouver ailleurs.
// Seul un choix fait par le joueur est retenu : sans choix, c'est le thème par défaut (même s'il change un jour).
export const THEMES = [
  { id: "jade", name: "Jade et laque", color: "#0f0c0b" },
  { id: "grimoire", name: "Grimoire", color: "#1d110a" },
  { id: "arene", name: "Arène arcane", color: "#0b0c22" },
];
export const DEFAULT_THEME = "arene";
const KEY = "table_theme";
const PICKED = "table_theme_choisi";

export function storedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return localStorage.getItem(PICKED) && THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME;
  } catch (_) {
    return DEFAULT_THEME;
  }
}

// picked : choix du joueur (réglages, ou thème enregistré sur son compte)
export function applyTheme(id, picked = false) {
  const t = THEMES.find((x) => x.id === id) || THEMES.find((x) => x.id === DEFAULT_THEME);
  const root = document.documentElement;
  if (t.id === "jade") delete root.dataset.theme;
  else root.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.color);
  try {
    localStorage.setItem(KEY, t.id);
    if (picked) localStorage.setItem(PICKED, "1");
  } catch (_) {}
  return t.id;
}
