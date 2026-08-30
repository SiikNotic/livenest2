import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Con dominio propio (livenest.net, vía public/CNAME) GitHub Pages sirve
// la app en la raíz del dominio, no bajo /<repo>/ como pasaba con la URL
// de project page (siiknotic.github.io/livenest2/) — de ahí el "/". Se
// puede pisar con la env var VITE_BASE_PATH si en algún momento se vuelve
// a servir bajo un subpath.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
  server: { host: true, port: 5173 },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
