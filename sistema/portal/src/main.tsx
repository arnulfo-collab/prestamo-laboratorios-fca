import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * HU-01 · segundo incremento: el portal se puede instalar en el teléfono.
 *
 * El trabajador de servicio solo se registra cuando el portal se sirve desde
 * el servidor. En el modo de demostración, abierto desde un enlace publicado,
 * no se registra: instalar una copia que no habla con ninguna base de datos
 * confundiría más de lo que ayuda.
 */
if ("serviceWorker" in navigator && location.protocol !== "blob:") {
  window.addEventListener("load", () => {
    void fetch("/api/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((estado) => {
        if (estado?.servicio === "prestamo-laboratorios") {
          return navigator.serviceWorker.register("./sw.js", { scope: "./" });
        }
        return null;
      })
      .catch(() => null);
  });
}
