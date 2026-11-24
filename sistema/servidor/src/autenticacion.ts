/**
 * Acceso por rol · HU-02
 *
 * La contraseña nunca viaja ni se guarda en claro: la comparación la hace
 * PostgreSQL con crypt(), contra el hash bcrypt almacenado.
 *
 * La sesión vive en la tabla `sesion`, no en la memoria del proceso. Así el
 * cierre de sesión es real —se marca `cerrada_en` y el identificador deja de
 * servir— y reiniciar el servidor no deja sesiones huérfanas abiertas.
 */
import type { NextFunction, Request, Response } from "express";
import { consultarUna } from "./bd.js";
import { config } from "./config.js";
import { ErrorDeNegocio, type ClaveRol, type Usuario } from "./tipos.js";

export const COOKIE_SESION = "sesion_prestamo";

declare module "express-serve-static-core" {
  interface Request {
    usuario?: Usuario;
  }
}

const CONSULTA_USUARIO = `
  SELECT u.id, u.numero_empleado, u.nombre, u.correo::text AS correo,
         r.clave AS rol, r.nombre AS rol_nombre
    FROM prestamo.usuario u
    JOIN prestamo.rol r ON r.id = u.rol_id
   WHERE u.id = $1`;

/** Verifica las credenciales y abre una sesión. Devuelve el usuario y el token. */
export async function iniciarSesion(
  correo: string,
  clave: string,
  origen: string | undefined,
): Promise<{ usuario: Usuario; token: string }> {
  const encontrado = await consultarUna<{ id: number }>(
    `SELECT u.id
       FROM prestamo.usuario u
      WHERE u.correo = $1::citext
        AND u.activo
        AND u.contrasena_hash = crypt($2, u.contrasena_hash)`,
    [correo.trim(), clave],
  );

  await consultarUna(
    "INSERT INTO prestamo.intento_acceso (correo, exitoso, origen) VALUES ($1::citext, $2, $3) RETURNING id",
    [correo.trim(), encontrado !== null, origen ?? null],
  );

  if (!encontrado) {
    // El mismo mensaje para un correo inexistente y para una contraseña
    // equivocada: el sistema no revela cuál de los dos datos falló.
    throw new ErrorDeNegocio(
      "Los datos no corresponden a una cuenta válida. Verifica tu correo institucional y tu contraseña.",
      401,
    );
  }

  const sesion = await consultarUna<{ id: string }>(
    `INSERT INTO prestamo.sesion (usuario_id, expira_en)
     VALUES ($1, now() + ($2 || ' hours')::interval)
     RETURNING id`,
    [encontrado.id, config.horasDeSesion],
  );

  await consultarUna("UPDATE prestamo.usuario SET ultimo_acceso = now() WHERE id = $1 RETURNING id", [
    encontrado.id,
  ]);

  const usuario = await consultarUna<Usuario>(CONSULTA_USUARIO, [encontrado.id]);
  if (!usuario || !sesion) throw new Error("No fue posible abrir la sesión.");
  return { usuario, token: sesion.id };
}

export async function cerrarSesion(token: string | undefined): Promise<void> {
  if (!token) return;
  await consultarUna(
    "UPDATE prestamo.sesion SET cerrada_en = now() WHERE id = $1 AND cerrada_en IS NULL RETURNING id",
    [token],
  );
}

/** Resuelve el usuario de una sesión vigente, o null. */
export async function usuarioDeSesion(token: string | undefined): Promise<Usuario | null> {
  if (!token) return null;
  const sesion = await consultarUna<{ usuario_id: number }>(
    `SELECT usuario_id FROM prestamo.sesion
      WHERE id = $1 AND cerrada_en IS NULL AND expira_en > now()`,
    [token],
  );
  if (!sesion) return null;
  return consultarUna<Usuario>(CONSULTA_USUARIO, [sesion.usuario_id]);
}

/** Adjunta el usuario a la petición cuando hay sesión vigente. */
export async function cargarUsuario(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_SESION] as string | undefined;
    const usuario = await usuarioDeSesion(token);
    if (usuario) req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

/** Exige sesión iniciada. */
export function exigeSesion(req: Request, _res: Response, next: NextFunction) {
  if (!req.usuario) {
    next(new ErrorDeNegocio("Inicia sesión para continuar.", 401));
    return;
  }
  next();
}

/** Exige que el usuario tenga uno de los roles indicados. */
export function exigeRol(...roles: ClaveRol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) {
      next(new ErrorDeNegocio("Inicia sesión para continuar.", 401));
      return;
    }
    if (!roles.includes(req.usuario.rol)) {
      next(
        new ErrorDeNegocio(
          `Tu rol es ${req.usuario.rol_nombre} y no tiene permiso para esta función.`,
          403,
        ),
      );
      return;
    }
    next();
  };
}
