/**
 * Configuración del servidor, leída de variables de entorno.
 *
 * Ninguna credencial vive en el código. El archivo .env no se versiona:
 * .env.ejemplo documenta qué variables hace falta definir.
 */
import "dotenv/config";

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(
      `Falta la variable de entorno ${nombre}. ` +
        "Copia .env.ejemplo como .env y llena sus valores.",
    );
    process.exit(1);
  }
  return valor;
}

export const config = {
  // Render y los servicios administrados en general inyectan PORT y
  // esperan que el proceso escuche ahí; en local manda PUERTO. Si el
  // servidor no atiende el puerto que el proveedor asignó, la revisión de
  // salud nunca pasa y el despliegue se marca como caído.
  puerto: Number(process.env["PORT"] ?? process.env["PUERTO"] ?? 3000),
  urlBaseDeDatos: requerida("DATABASE_URL"),
  usarSsl: process.env["BD_SSL"] === "true",
  /** Duración de la sesión en horas. */
  horasDeSesion: Number(process.env["HORAS_DE_SESION"] ?? 8),
  entorno: process.env["NODE_ENV"] ?? "development",
} as const;
