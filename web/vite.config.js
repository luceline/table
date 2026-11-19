import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev : VITE_PB_URL=http://127.0.0.1:8090 npm run dev
// En prod : servi sur https://table.resgestae.fr ; nginx transmet tout
// à PocketBase (port 8093), qui sert ce build depuis pb_public. Même origine, pas de CORS.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
