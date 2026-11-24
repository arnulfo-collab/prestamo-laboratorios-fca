/**
 * Servidor del sistema de préstamo de laboratorios de cómputo
 * Facultad de Ciencias Administrativas · UABC Mexicali
 *
 * Arranque:  npm run dev     (desarrollo, recarga al guardar)
 *            npm run build && npm start   (producción)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { cargarUsuario } from "./autenticacion.js";
import { cerrarPool, consultarUna } from "./bd.js";
import { config } from "./config.js";
import { rutas } from "./rutas.js";
import { ErrorDeNegocio } from "./tipos.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(aqui, "../../portal/dist");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(cargarUsuario);
app.use("/api", rutas);

// El portal compilado se sirve desde el mismo origen, de modo que la cookie
// de sesión viaje sin necesidad de configurar CORS.
app.use(express.static(PORTAL));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(PORTAL, "index.html"));
});

// Manejador central de errores. Solo los mensajes marcados como errores de
// negocio llegan al usuario; cualquier otro se registra y se responde en
// términos genéricos, para no filtrar detalles del servidor.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ErrorDeNegocio) {
    res.status(error.estado).json({ error: error.message });
    return;
  }
  console.error("[servidor]", error);
  res.status(500).json({ error: "Ocurrió un error inesperado. Intenta de nuevo." });
});

/**
 * Comprueba que los dos trabajos de pg_cron estén programados y activos.
 *
 * No aborta el arranque: el sistema sirve de todas formas, y puede ser que la
 * base la administre alguien más. Solo deja dicho en la bitácora que los
 * procesos periódicos no están corriendo, para que la falla sea visible.
 */
async function verificarProcesosProgramados(): Promise<void> {
  try {
    // Se pregunta en dos pasos a propósito. Un CASE no sirve aquí: la
    // referencia a cron.job falla al ANALIZAR la consulta, no al ejecutarla,
    // así que la rama que "no se toma" revienta igual si la tabla no existe.
    const hay = await consultarUna<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'cron' AND c.relname = 'job') AS existe`,
    );
    if (!hay?.existe) {
      console.log("[procesos] pg_cron no está instalado en esta base (normal en desarrollo local)");
      return;
    }

    const fila = await consultarUna<{ activos: number }>(
      "SELECT count(*)::int AS activos FROM cron.job WHERE jobname LIKE 'prestamo-%' AND active",
    );
    const activos = fila?.activos ?? 0;
    if (activos >= 2) {
      console.log(`[procesos] ${activos} trabajos de pg_cron activos`);
    } else {
      console.warn(
        `[procesos] ATENCIÓN: solo ${activos} de 2 trabajos de pg_cron están activos. ` +
          "Los horarios no se liberarán ni saldrán recordatorios. " +
          "Aplica bd/11_pg_cron.sql contra esta base.",
      );
    }
  } catch {
    // La cuenta de la aplicación puede no tener permiso de leer el esquema
    // cron. No es un error del sistema, solo significa que esta verificación
    // no se puede hacer desde aquí.
    console.log("[procesos] no fue posible verificar pg_cron desde esta cuenta");
  }
}

async function arrancar() {
  try {
    const prueba = await consultarUna<{ laboratorios: number }>(
      "SELECT count(*)::int AS laboratorios FROM prestamo.laboratorio",
    );
    console.log(`[bd] conectada · ${prueba?.laboratorios ?? 0} laboratorios en el catálogo`);
  } catch {
    console.error(
      "[bd] no fue posible conectar. Revisa DATABASE_URL y que los guiones de ../bd estén aplicados.",
    );
    process.exit(1);
  }

  // HU-17, HU-06 y HU-18 · los dos procesos de 60 segundos ya no viven aquí.
  //
  // Estuvieron en dos setInterval hasta el cierre del Sprint 4, lo que los
  // ataba a que este proceso estuviera encendido: si el servidor dormía o se
  // reiniciaba, los laboratorios no se liberaban y los recordatorios no
  // salían. Ahora los programa pg_cron dentro de la propia base, donde corren
  // aunque nadie haya abierto el portal en días. Ver bd/11_pg_cron.sql.
  //
  // Al arrancar se verifica que estén programados. Si no lo están, el sistema
  // funciona pero silenciosamente deja de liberar horarios y de avisar, que es
  // la peor clase de falla: la que no se nota. De ahí la advertencia.
  await verificarProcesosProgramados();

  const servidor = app.listen(config.puerto, () => {
    console.log(`[servidor] escuchando en el puerto ${config.puerto}`);
  });

  for (const senal of ["SIGINT", "SIGTERM"] as const) {
    process.on(senal, () => {
      servidor.close(() => {
        void cerrarPool().then(() => process.exit(0));
      });
    });
  }
}

void arrancar();
