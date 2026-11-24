import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * El portal se compila a archivos estáticos que sirve el mismo servidor de la
 * API, de modo que la cookie de sesión viaje sin configurar CORS.
 *
 * base: "./"  hace que los archivos se referencien por ruta relativa, lo que
 * permite publicar el build en cualquier carpeta, incluida la demostración.
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", assetsDir: "recursos", sourcemap: false },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
