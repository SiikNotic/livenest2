import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sirve un "project page" bajo /<repo>/, no en la raíz del
// dominio (a diferencia de Bolt.new o un dominio propio) — sin esto, los
// assets del build (JS/CSS) se pedirían con rutas absolutas desde "/" y
// devolverían 404 en producción, aunque en local (`npm run dev`) todo
// funcione bien porque ahí sí se sirve desde la raíz.
// Se puede pisar con la env var VITE_BASE_PATH (ej. "/" si en algún
// momento se pasa a un dominio propio o a un user/org page).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/livenest2/",
  server: { host: true, port: 5173 },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
