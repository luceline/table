// Thème visuel choisi par le joueur : Jade et laque (défaut), Grimoire, Arène arcane.
// Appliqué tout de suite depuis l'appareil, et enregistré sur le compte pour le retrouver ailleurs.
export const THEMES = [
  { id: "jade", name: "Jade et laque", color: "#0f0c0b" },
  { id: "grimoire", name: "Grimoire", color: "#1d110a" },
  { id: "arene", name: "Arène arcane", color: "#0b0c22" },
];
const KEY = "table_theme";

export function storedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === v) ? v : "jade";
  } catch (_) {
    return "jade";
  }
}

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const root = document.documentElement;
  if (t.id === "jade") delete root.dataset.theme;
  else root.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.color);
  try { localStorage.setItem(KEY, t.id); } catch (_) {}
  return t.id;
}
