/**
 * Conexión a PostgreSQL.
 *
 * Toda consulta pasa por aquí. Los parámetros se envían siempre como
 * argumentos ($1, $2, ...) y nunca concatenados en el texto de la consulta,
 * que es lo que evita la inyección de SQL.
 */
import pg from "pg";
import { config } from "./config.js";
import { ErrorDeNegocio } from "./tipos.js";

/** PostgreSQL devuelve date y numeric como texto; se convierten aquí. */
pg.types.setTypeParser(pg.types.builtins.DATE, (valor) => valor);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (valor) => Number(valor));
pg.types.setTypeParser(pg.types.builtins.INT8, (valor) => Number(valor));

export const pool = new pg.Pool({
  connectionString: config.urlBaseDeDatos,
  ssl: config.usarSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  // prestamo es el esquema del sistema y extensions el de citext, pgcrypto y
  // btree_gist, que es donde Supabase las instala. Sin extensions en la ruta,
  // crypt() y el tipo citext no se resuelven al autenticar.
  options: "-c search_path=prestamo,extensions,public",
});

pool.on("error", (error) => {
  console.error("[bd] error inesperado en una conexión inactiva:", error.message);
});

/**
 * Códigos de error de PostgreSQL cuyo mensaje fue redactado por nosotros en
 * las funciones del esquema y, por tanto, puede mostrarse al usuario.
 *
 *   23514 check_violation      · las validaciones de registrar_solicitud
 *   23P01 exclusion_violation  · la restricción que impide empalmes
 *   23505 unique_violation     · claves y correos repetidos
 */
const CODIGOS_DE_NEGOCIO = new Set(["23514", "23P01", "23505"]);

const MENSAJES_POR_RESTRICCION: Record<string, string> = {
  reservacion_sin_empalme:
    "Ese laboratorio ya tiene una reservación que se traslapa con este horario.",
  laboratorio_clave_key: "Ya existe un laboratorio con esa clave.",
  usuario_correo_key: "Ya existe un usuario con ese correo.",
  horario_sin_duplicado: "Ese bloque horario ya está registrado para ese día.",
  laboratorio_capacidad_valida: "La capacidad debe ser un número entre 1 y 100.",
  horario_rango_valido: "La hora de fin debe ser posterior a la de inicio.",
  usuario_correo_institucional: "El correo debe pertenecer al dominio uabc.edu.mx.",
};

/** Ejecuta una consulta y traduce los errores del motor a errores de negocio. */
export async function consultar<T extends object>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  try {
    const resultado = await pool.query(texto, parametros);
    return resultado.rows as T[];
  } catch (error) {
    const err = error as pg.DatabaseError;
    if (err.code && CODIGOS_DE_NEGOCIO.has(err.code)) {
      const porRestriccion = err.constraint ? MENSAJES_POR_RESTRICCION[err.constraint] : undefined;
      throw new ErrorDeNegocio(porRestriccion ?? err.message);
    }
    console.error("[bd] consulta fallida:", err.message);
    throw new Error("No fue posible completar la operación en la base de datos.");
  }
}

/** Devuelve la primera fila, o null si la consulta no devolvió ninguna. */
export async function consultarUna<T extends object>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T | null> {
  const filas = await consultar<T>(texto, parametros);
  return filas[0] ?? null;
}

export async function cerrarPool(): Promise<void> {
  await pool.end();
}
