// Génère les données de la carte des joueurs (à relancer seulement pour mettre à jour les données) :
//   cd /tmp/geo && npm install all-the-cities world-atlas topojson-client
//   NODE_PATH=/tmp/geo/node_modules node /chemin/table/tools/build_geo.cjs /chemin/table
// - web/public/geo/villes.json : villes de France, Belgique, Suisse, Luxembourg et Monaco de plus de 1 000 habitants
//   (GeoNames, CC BY 4.0) : [nom, département ou pays, latitude, longitude, population]
// - web/src/lib/mapShapes.js : contours des pays (Natural Earth, domaine public) déjà projetés en SVG
const path = require("path");
const fs = require("fs");
const root = process.argv[2] || path.resolve(__dirname, "..");
const cities = require("all-the-cities");
const topo = require("world-atlas/countries-50m.json");
const { feature } = require("topojson-client");

const KEEP = ["FR", "BE", "CH", "LU", "MC"];
const out = cities
  .filter((c) => KEEP.includes(c.country))
  .map((c) => {
    const [lon, lat] = c.loc.coordinates;
    const tag = c.country === "FR" ? (c.muniSub || "").slice(0, 2) || "FR" : c.country;
    return [c.name, tag, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, c.population];
  })
  .sort((a, b) => b[4] - a[4]);
fs.writeFileSync(path.join(root, "web/public/geo/villes.json"), JSON.stringify(out));
console.log("villes :", out.length);

// Projection simple (équirectangulaire corrigée à 46,5° de latitude), cadre lon -5,6 → 10,8, lat 41,2 → 51,7
const BOX = { w: -5.6, e: 10.8, s: 41.2, n: 51.7 };
const K = Math.cos((46.5 * Math.PI) / 180);
const W = 1000;
const scale = W / ((BOX.e - BOX.w) * K);
const H = Math.round((BOX.n - BOX.s) * scale);
const proj = (lon, lat) => [(lon - BOX.w) * K * scale, (BOX.n - lat) * scale];
const MAIN = { 250: "FR", 56: "BE", 756: "CH", 442: "LU", 492: "MC" };
const NEAR = [276, 528, 380, 724, 20, 826, 40, 438, 674, 336];
const geo = feature(topo, topo.objects.countries);
const shapes = [];
for (const f of geo.features) {
  const id = Number(f.id);
  if (!MAIN[id] && !NEAR.includes(id)) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  for (const poly of polys) {
    for (const ring of poly) {
      // anneaux loin du cadre ignorés (outre-mer, îles lointaines)
      if (!ring.some(([lo, la]) => lo > BOX.w - 3 && lo < BOX.e + 3 && la > BOX.s - 3 && la < BOX.n + 3)) continue;
      let prev = "";
      ring.forEach(([lo, la], i) => {
        const [x, y] = proj(lo, la);
        const p = `${x.toFixed(1)} ${y.toFixed(1)}`;
        if (p === prev) return;
        d += (i ? "L" : "M") + p;
        prev = p;
      });
      d += "Z";
    }
  }
  if (d) shapes.push({ id: MAIN[id] || String(id), main: !!MAIN[id], name: f.properties.name, d });
}
const js =
  "// Généré par tools/build_geo.cjs : contours Natural Earth (domaine public), projection maison.\n" +
  `export const MAP_W = ${W};\nexport const MAP_H = ${H};\n` +
  `export const BOX = ${JSON.stringify(BOX)};\nexport const K = ${K};\nexport const SCALE = ${scale};\n` +
  "export const project = (lon, lat) => [(lon - BOX.w) * K * SCALE, (BOX.n - lat) * SCALE];\n" +
  `export const SHAPES = ${JSON.stringify(shapes)};\n`;
fs.writeFileSync(path.join(root, "web/src/lib/mapShapes.js"), js);
console.log("formes :", shapes.map((s) => s.id).join(" "), "·", Math.round(js.length / 1024), "Ko · hauteur", H);
