/**
 * Rutas de la API.
 *
 * Cada grupo corresponde a una historia de usuario; el comentario de cada
 * bloque indica cuál, para que la trazabilidad entre el código y el backlog
 * se pueda seguir sin consultar otro documento.
 */
import { Router } from "express";
import { consultar, consultarUna } from "./bd.js";
import { cerrarSesion, exigeRol, exigeSesion, iniciarSesion, COOKIE_SESION } from "./autenticacion.js";
import { config } from "./config.js";
import {
  ErrorDeNegocio,
  type BloqueDisponibilidad,
  type Laboratorio,
  type Parametro,
  type Solicitud,
  type SolicitudPendiente,
  type Aviso,
  type Indicadores,
} from "./tipos.js";

export const rutas = Router();

/** Envuelve un manejador asíncrono para que sus errores lleguen al manejador central. */
function asinc(fn: (req: any, res: any) => Promise<unknown>) {
  return (req: any, res: any, next: any) => {
    fn(req, res).catch(next);
  };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

function exigeTexto(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new ErrorDeNegocio(`Captura ${campo}.`);
  }
  return valor.trim();
}

function exigeEntero(valor: unknown, campo: string): number {
  const numero = Number(valor);
  if (!Number.isInteger(numero)) throw new ErrorDeNegocio(`${campo} debe ser un número entero.`);
  return numero;
}

// =====================================================================
// Estado del servicio. El portal lo consulta al arrancar para saber si
// hay servidor detrás o si debe operar en modo de demostración.
// =====================================================================

// La revisión de salud del proveedor y el pinger que evita que el servicio
// se duerma pegan aquí. Por eso la consulta trivial a la base: así ese mismo
// tráfico cuenta como actividad y el plan gratuito no suspende el proyecto por
// inactividad. Responde 200 aunque la base falle, con bd en false, porque el
// portal usa esta ruta para decidir si registra su service worker y una base
// caída no debe dejarlo sin el aviso de "sin conexión".
rutas.get("/estado", async (_req, res) => {
  let bd = false;
  try {
    await consultarUna("SELECT 1 AS viva");
    bd = true;
  } catch {
    bd = false;
  }
  res.json({ servicio: "prestamo-laboratorios", version: "2.0.0", entorno: config.entorno, bd });
});

// =====================================================================
// HU-02 · Inicio de sesión por rol
// =====================================================================

rutas.post(
  "/acceso",
  asinc(async (req, res) => {
    const correo = exigeTexto(req.body?.correo, "tu correo institucional");
    const clave = exigeTexto(req.body?.clave, "tu contraseña");
    const { usuario, token } = await iniciarSesion(correo, clave, req.ip);

    res.cookie(COOKIE_SESION, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.entorno === "production",
      maxAge: config.horasDeSesion * 60 * 60 * 1000,
    });
    res.json({ usuario });
  }),
);

rutas.post(
  "/salir",
  asinc(async (req, res) => {
    await cerrarSesion(req.cookies?.[COOKIE_SESION]);
    res.clearCookie(COOKIE_SESION);
    res.json({ cerrada: true });
  }),
);

rutas.get("/sesion", exigeSesion, (req, res) => {
  res.json({ usuario: req.usuario });
});

// =====================================================================
// HU-09 · Catálogo de laboratorios y horarios
// =====================================================================

const CONSULTA_LABORATORIOS = `
  SELECT l.id, l.clave, l.nombre, l.capacidad, l.ubicacion, l.equipamiento, l.activo,
         count(h.id)::int AS bloques_horario,
         coalesce(sum(EXTRACT(epoch FROM (h.hora_fin - h.hora_inicio)) / 3600), 0)::numeric(6,1) AS horas_semana,
         coalesce(
           json_agg(
             json_build_object('id', h.id, 'dia_semana', h.dia_semana,
                               'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
                               'hora_fin',    to_char(h.hora_fin, 'HH24:MI'))
             ORDER BY h.dia_semana, h.hora_inicio
           ) FILTER (WHERE h.id IS NOT NULL), '[]'::json) AS horarios
    FROM prestamo.laboratorio l
    LEFT JOIN prestamo.horario_laboratorio h ON h.laboratorio_id = l.id
   WHERE ($1::boolean IS FALSE OR l.activo)
   GROUP BY l.id
   ORDER BY l.clave`;

rutas.get(
  "/laboratorios",
  exigeSesion,
  asinc(async (req, res) => {
    // El encargado ve también los laboratorios desactivados; los demás no.
    const soloActivos = req.usuario!.rol !== "administrador";
    res.json(await consultar<Laboratorio>(CONSULTA_LABORATORIOS, [soloActivos]));
  }),
);

/** Reemplaza los horarios de un laboratorio por los recibidos. */
async function guardarHorarios(laboratorioId: number, horarios: unknown): Promise<void> {
  if (!Array.isArray(horarios)) return;
  await consultarUna(
    "DELETE FROM prestamo.horario_laboratorio WHERE laboratorio_id = $1 RETURNING id",
    [laboratorioId],
  );
  for (const bloque of horarios) {
    const dia = exigeEntero((bloque as any)?.dia_semana, "El día");
    const inicio = String((bloque as any)?.hora_inicio ?? "");
    const fin = String((bloque as any)?.hora_fin ?? "");
    if (!HORA.test(inicio) || !HORA.test(fin)) {
      throw new ErrorDeNegocio("Las horas de cada bloque deben tener el formato HH:MM.");
    }
    await consultarUna(
      `INSERT INTO prestamo.horario_laboratorio (laboratorio_id, dia_semana, hora_inicio, hora_fin)
       VALUES ($1, $2, $3::time, $4::time) RETURNING id`,
      [laboratorioId, dia, inicio, fin],
    );
  }
}

rutas.post(
  "/laboratorios",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    const nuevo = await consultarUna<{ id: number }>(
      `INSERT INTO prestamo.laboratorio (clave, nombre, capacidad, ubicacion, equipamiento)
       VALUES (upper($1), $2, $3, $4, $5) RETURNING id`,
      [
        exigeTexto(req.body?.clave, "la clave del laboratorio"),
        exigeTexto(req.body?.nombre, "el nombre del laboratorio"),
        exigeEntero(req.body?.capacidad, "La capacidad"),
        exigeTexto(req.body?.ubicacion, "la ubicación"),
        req.body?.equipamiento ?? null,
      ],
    );
    await guardarHorarios(nuevo!.id, req.body?.horarios);
    res.status(201).json({ id: nuevo!.id });
  }),
);

rutas.put(
  "/laboratorios/:id",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    const id = exigeEntero(req.params.id, "El laboratorio");
    const actualizado = await consultarUna<{ id: number }>(
      `UPDATE prestamo.laboratorio
          SET clave = upper($2), nombre = $3, capacidad = $4, ubicacion = $5,
              equipamiento = $6, actualizado_en = now()
        WHERE id = $1 RETURNING id`,
      [
        id,
        exigeTexto(req.body?.clave, "la clave del laboratorio"),
        exigeTexto(req.body?.nombre, "el nombre del laboratorio"),
        exigeEntero(req.body?.capacidad, "La capacidad"),
        exigeTexto(req.body?.ubicacion, "la ubicación"),
        req.body?.equipamiento ?? null,
      ],
    );
    if (!actualizado) throw new ErrorDeNegocio("El laboratorio no existe.", 404);
    await guardarHorarios(id, req.body?.horarios);
    res.json({ id });
  }),
);

/**
 * Reservaciones aprobadas a futuro de un laboratorio. El portal las consulta
 * antes de desactivarlo, para advertir cuáles quedarían sin espacio: es el
 * tercer criterio de aceptación de HU-09.
 */
rutas.get(
  "/laboratorios/:id/reservaciones-futuras",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    res.json(
      await consultar(
        `SELECT r.folio, r.fecha_uso, to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(r.hora_fin, 'HH24:MI') AS hora_fin, u.nombre AS docente,
                r.grupo_materia
           FROM prestamo.reservacion r
           JOIN prestamo.usuario u ON u.id = r.usuario_id
           JOIN prestamo.estatus_reservacion e ON e.id = r.estatus_id
          WHERE r.laboratorio_id = $1 AND r.fecha_uso >= current_date AND e.ocupa_horario
          ORDER BY r.fecha_uso, r.hora_inicio`,
        [exigeEntero(req.params.id, "El laboratorio")],
      ),
    );
  }),
);

rutas.post(
  "/laboratorios/:id/estado",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    const id = exigeEntero(req.params.id, "El laboratorio");
    const activo = Boolean(req.body?.activo);
    const cambiado = await consultarUna<{ id: number }>(
      "UPDATE prestamo.laboratorio SET activo = $2, actualizado_en = now() WHERE id = $1 RETURNING id",
      [id, activo],
    );
    if (!cambiado) throw new ErrorDeNegocio("El laboratorio no existe.", 404);
    res.json({ id, activo });
  }),
);

// =====================================================================
// HU-03 · Consulta de disponibilidad en tiempo real
// =====================================================================

rutas.get(
  "/disponibilidad",
  exigeSesion,
  asinc(async (req, res) => {
    const fecha = String(req.query.fecha ?? "");
    if (!FECHA.test(fecha)) throw new ErrorDeNegocio("Indica la fecha con el formato AAAA-MM-DD.");
    res.json(
      await consultar<BloqueDisponibilidad>(
        `SELECT laboratorio_id, clave, laboratorio, capacidad,
                to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(hora_fin, 'HH24:MI') AS hora_fin,
                estado, folio, docente, grupo_materia
           FROM prestamo.disponibilidad($1::date)`,
        [fecha],
      ),
    );
  }),
);

// =====================================================================
// HU-04 · Registro de solicitud  ·  HU-20 · Límites por docente
// =====================================================================

rutas.post(
  "/solicitudes",
  exigeRol("docente"),
  asinc(async (req, res) => {
    const fecha = String(req.body?.fecha_uso ?? "");
    const inicio = String(req.body?.hora_inicio ?? "");
    const fin = String(req.body?.hora_fin ?? "");
    if (!FECHA.test(fecha)) throw new ErrorDeNegocio("Selecciona una fecha válida.");
    if (!HORA.test(inicio) || !HORA.test(fin)) throw new ErrorDeNegocio("Selecciona un horario válido.");

    // Las ocho validaciones de HU-04 y HU-20 las aplica la función del motor.
    const fila = await consultarUna<{ folio: string }>(
      `SELECT prestamo.registrar_solicitud($1, $2, $3::date, $4::time, $5::time, $6, $7) AS folio`,
      [
        req.usuario!.id,
        exigeEntero(req.body?.laboratorio_id, "El laboratorio"),
        fecha,
        inicio,
        fin,
        req.body?.grupo_materia ?? "",
        req.body?.motivo_uso ?? "",
      ],
    );
    res.status(201).json({ folio: fila!.folio });
  }),
);

// =====================================================================
// HU-05 · Seguimiento del estatus
// =====================================================================

const CAMPOS_SOLICITUD = `
  id, folio, laboratorio_clave, laboratorio, fecha_uso,
  to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
  to_char(hora_fin, 'HH24:MI') AS hora_fin,
  grupo_materia, motivo_uso, estatus, estatus_clave, solicitada_en,
  motivo_rechazo, marcada_no_asistio, resuelta_por`;

rutas.get(
  "/solicitudes/mias",
  exigeRol("docente"),
  asinc(async (req, res) => {
    res.json(
      await consultar<Solicitud>(
        // Los dos indicadores se calculan aquí para que la pantalla no tenga
        // que reimplementar las reglas de plazo y tolerancia.
        `SELECT ${CAMPOS_SOLICITUD},
                (estatus_clave IN ('solicitada', 'aprobada', 'confirmada')
                 AND (estatus_clave = 'solicitada'
                      OR (fecha_uso + hora_inicio) AT TIME ZONE current_setting('TimeZone')
                         - now() >= (prestamo.parametro_entero('P-08') || ' hours')::interval)
                ) AS puede_cancelar,
                (estatus_clave IN ('aprobada', 'confirmada')
                 AND now() >= (fecha_uso + hora_inicio) AT TIME ZONE current_setting('TimeZone')
                 AND now() <= (fecha_uso + hora_inicio) AT TIME ZONE current_setting('TimeZone')
                              + (prestamo.parametro_entero('P-01') || ' minutes')::interval
                ) AS puede_checkin
           FROM prestamo.v_mis_solicitudes WHERE usuario_id = $1`,
        [req.usuario!.id],
      ),
    );
  }),
);

// =====================================================================
// HU-12 · Prevención de empalmes
// =====================================================================

rutas.get(
  "/solicitudes/pendientes",
  exigeRol("administrador"),
  asinc(async (_req, res) => {
    const pendientes = await consultar<SolicitudPendiente>(
      `SELECT v.id, v.folio, v.laboratorio_clave, v.laboratorio, v.fecha_uso,
              to_char(v.hora_inicio, 'HH24:MI') AS hora_inicio,
              to_char(v.hora_fin, 'HH24:MI') AS hora_fin,
              v.grupo_materia, v.motivo_uso, v.estatus, v.estatus_clave,
              v.solicitada_en, v.motivo_rechazo, v.marcada_no_asistio, v.resuelta_por,
              u.nombre AS docente,
              r.requiere_autorizacion,
              prestamo.inasistencias_vigentes(u.id) AS faltas_docente,
              coalesce(
                (SELECT json_agg(json_build_object(
                          'conflicto_folio',   c.conflicto_folio,
                          'conflicto_docente', c.conflicto_docente,
                          'conflicto_inicio',  to_char(c.conflicto_inicio, 'HH24:MI'),
                          'conflicto_fin',     to_char(c.conflicto_fin, 'HH24:MI'),
                          'conflicto_estatus', c.conflicto_estatus))
                   FROM prestamo.v_solicitudes_en_conflicto c
                  WHERE c.id = v.id), '[]'::json) AS conflictos
         FROM prestamo.v_mis_solicitudes v
         JOIN prestamo.usuario u     ON u.id = v.usuario_id
         JOIN prestamo.reservacion r ON r.id = v.id
        WHERE v.estatus_clave = 'solicitada'
        ORDER BY v.fecha_uso, v.hora_inicio`,
    );
    res.json(pendientes);
  }),
);

rutas.post(
  "/solicitudes/:id/aprobar",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    await consultarUna("SELECT prestamo.aprobar_solicitud($1, $2) AS ok", [
      exigeEntero(req.params.id, "La solicitud"),
      req.usuario!.id,
    ]);
    res.json({ aprobada: true });
  }),
);

rutas.post(
  "/solicitudes/:id/rechazar",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    await consultarUna("SELECT prestamo.rechazar_solicitud($1, $2, $3) AS ok", [
      exigeEntero(req.params.id, "La solicitud"),
      req.usuario!.id,
      req.body?.motivo ?? "",
    ]);
    res.json({ rechazada: true });
  }),
);

// =====================================================================
// Parámetros de préstamo y usuarios
// =====================================================================

rutas.get(
  "/parametros",
  exigeSesion,
  asinc(async (_req, res) => {
    res.json(
      await consultar<Parametro>(
        `SELECT clave, nombre, valor, unidad, descripcion, tipo_dato, minimo, maximo,
                actualizado_en
           FROM prestamo.parametro ORDER BY clave`,
      ),
    );
  }),
);

rutas.get(
  "/usuarios",
  exigeRol("administrador"),
  asinc(async (_req, res) => {
    res.json(
      await consultar(
        `SELECT u.id, u.numero_empleado, u.nombre, u.correo::text AS correo,
                r.clave AS rol, r.nombre AS rol_nombre, u.activo
           FROM prestamo.usuario u JOIN prestamo.rol r ON r.id = u.rol_id
          ORDER BY r.id, u.nombre`,
      ),
    );
  }),
);

// =====================================================================
// SPRINT 3
// =====================================================================

// ---------------------------------------------------------------------
// HU-07 · Cancelación de solicitud
// ---------------------------------------------------------------------

rutas.post(
  "/solicitudes/:id/cancelar",
  exigeRol("docente"),
  asinc(async (req, res) => {
    await consultarUna("SELECT prestamo.cancelar_solicitud($1, $2) AS ok", [
      exigeEntero(req.params.id, "La reservación"),
      req.usuario!.id,
    ]);
    res.json({ cancelada: true });
  }),
);

// ---------------------------------------------------------------------
// HU-16 · Registro de asistencia
// ---------------------------------------------------------------------

rutas.post(
  "/solicitudes/:id/checkin",
  exigeRol("docente", "administrador"),
  asinc(async (req, res) => {
    const fila = await consultarUna<{ retraso: number }>(
      "SELECT prestamo.registrar_checkin($1, $2) AS retraso",
      [exigeEntero(req.params.id, "La reservación"), req.usuario!.id],
    );
    res.json({ registrado: true, minutos_retraso: fila?.retraso ?? 0 });
  }),
);

// ---------------------------------------------------------------------
// HU-19 · Situación del docente frente a las reglas de reincidencia
// ---------------------------------------------------------------------

rutas.get(
  "/mi-situacion",
  exigeRol("docente"),
  asinc(async (req, res) => {
    res.json(await consultarUna("SELECT * FROM prestamo.situacion_docente($1)", [req.usuario!.id]));
  }),
);

rutas.get(
  "/docentes",
  exigeRol("administrador", "coordinacion"),
  asinc(async (_req, res) => {
    res.json(
      await consultar(
        `SELECT u.id, u.nombre, u.correo::text AS correo,
                prestamo.inasistencias_vigentes(u.id) AS faltas,
                (SELECT s.nivel FROM prestamo.situacion_docente(u.id) s) AS nivel,
                (SELECT count(*)::int FROM prestamo.reservacion r
                  WHERE r.usuario_id = u.id) AS reservaciones
           FROM prestamo.usuario u
          WHERE u.rol_id = 1 AND u.activo
          ORDER BY prestamo.inasistencias_vigentes(u.id) DESC, u.nombre`,
      ),
    );
  }),
);

rutas.get(
  "/docentes/:id/historial",
  exigeRol("administrador", "coordinacion"),
  asinc(async (req, res) => {
    const id = exigeEntero(req.params.id, "El docente");
    const [situacion, historial] = await Promise.all([
      consultarUna("SELECT * FROM prestamo.situacion_docente($1)", [id]),
      consultar(
        `SELECT folio, laboratorio, fecha_uso,
                to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(hora_fin, 'HH24:MI') AS hora_fin,
                estatus, estatus_clave, checkin_en, minutos_retraso,
                horas_perdidas, falta_contabilizada
           FROM prestamo.v_historial_asistencia WHERE usuario_id = $1`,
        [id],
      ),
    ]);
    res.json({ situacion, historial });
  }),
);

// ---------------------------------------------------------------------
// HU-10 · Bloqueo por mantenimiento o evento
// ---------------------------------------------------------------------

rutas.get(
  "/bloqueos",
  exigeRol("administrador", "coordinacion"),
  asinc(async (_req, res) => {
    res.json(
      await consultar(
        `SELECT b.id, b.laboratorio_id, l.clave AS laboratorio, l.nombre AS laboratorio_nombre,
                b.motivo, b.fecha_inicio, b.fecha_fin, b.registrado_en,
                u.nombre AS registrado_por,
                (b.fecha_fin >= current_date) AS vigente
           FROM prestamo.bloqueo_laboratorio b
           JOIN prestamo.laboratorio l ON l.id = b.laboratorio_id
           JOIN prestamo.usuario u ON u.id = b.registrado_por
          ORDER BY b.fecha_inicio DESC`,
      ),
    );
  }),
);

rutas.post(
  "/bloqueos",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    const inicio = String(req.body?.fecha_inicio ?? "");
    const fin = String(req.body?.fecha_fin ?? "");
    if (!FECHA.test(inicio) || !FECHA.test(fin)) {
      throw new ErrorDeNegocio("Indica las fechas de inicio y fin del bloqueo.");
    }
    const fila = await consultarUna<{ id: number }>(
      "SELECT prestamo.registrar_bloqueo($1, $2, $3::date, $4::date, $5) AS id",
      [
        exigeEntero(req.body?.laboratorio_id, "El laboratorio"),
        req.body?.motivo ?? "",
        inicio,
        fin,
        req.usuario!.id,
      ],
    );
    res.status(201).json({ id: fila?.id });
  }),
);

// ---------------------------------------------------------------------
// HU-11 · Calendario general de reservaciones
// ---------------------------------------------------------------------

rutas.get(
  "/calendario",
  exigeRol("administrador", "coordinacion"),
  asinc(async (req, res) => {
    const desde = String(req.query.desde ?? "");
    const hasta = String(req.query.hasta ?? "");
    if (!FECHA.test(desde) || !FECHA.test(hasta)) {
      throw new ErrorDeNegocio("Indica el rango de fechas con el formato AAAA-MM-DD.");
    }
    const laboratorio = req.query.laboratorio ? exigeEntero(req.query.laboratorio, "El laboratorio") : null;
    res.json(
      await consultar(
        `SELECT id, folio, laboratorio_id, laboratorio, laboratorio_nombre, fecha_uso,
                to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(hora_fin, 'HH24:MI') AS hora_fin,
                docente, grupo_materia, motivo_uso, estatus, estatus_clave,
                asistencia, minutos_retraso
           FROM prestamo.calendario_general($1::date, $2::date, $3)`,
        [desde, hasta, laboratorio],
      ),
    );
  }),
);

// ---------------------------------------------------------------------
// HU-21 · Configuración de las reglas de préstamo
// ---------------------------------------------------------------------

rutas.put(
  "/parametros/:clave",
  exigeRol("administrador"),
  asinc(async (req, res) => {
    const clave = exigeTexto(req.params.clave, "la clave del parámetro");
    await consultarUna("SELECT prestamo.actualizar_parametro($1, $2, $3) AS ok", [
      clave,
      String(req.body?.valor ?? "").trim(),
      req.usuario!.id,
    ]);
    res.json({ clave, valor: req.body?.valor });
  }),
);

rutas.get(
  "/parametros/bitacora",
  exigeRol("administrador", "coordinacion"),
  asinc(async (_req, res) => {
    res.json(
      await consultar(
        `SELECT b.clave, p.nombre, b.valor_anterior, b.valor_nuevo, b.ocurrido_en,
                u.nombre AS usuario
           FROM prestamo.bitacora_parametro b
           JOIN prestamo.parametro p ON p.clave = b.clave
           JOIN prestamo.usuario u ON u.id = b.usuario_id
          ORDER BY b.ocurrido_en DESC
          LIMIT 50`,
      ),
    );
  }),
);

// ---------------------------------------------------------------------
// HU-17 · Liberación automática, disparada a mano
// ---------------------------------------------------------------------

rutas.post(
  "/mantenimiento/liberar",
  exigeRol("administrador"),
  asinc(async (_req, res) => {
    res.json({ liberadas: await consultar("SELECT * FROM prestamo.liberar_inasistencias()") });
  }),
);

// =====================================================================
// SPRINT 4
// =====================================================================

// ---------------------------------------------------------------------
// HU-06 y HU-18 · Bandeja de avisos
// ---------------------------------------------------------------------

rutas.get(
  "/avisos",
  exigeSesion,
  asinc(async (req, res) => {
    const avisos = await consultar<Aviso>(
      `SELECT id, reservacion_id, folio, tipo, asunto, cuerpo, accion,
              programada_para, leida, reservacion_estatus
         FROM prestamo.v_mis_avisos
        WHERE usuario_id = $1
        LIMIT 50`,
      [req.usuario!.id],
    );
    res.json({ avisos, sinLeer: avisos.filter((a) => !a.leida).length });
  }),
);

rutas.post(
  "/avisos/:id/leida",
  exigeSesion,
  asinc(async (req, res) => {
    const id = exigeEntero(req.params.id, "El aviso");
    // El usuario_id en el WHERE no es adorno: impide marcar como leído el
    // aviso de otra persona si alguien cambia el identificador a mano.
    const fila = await consultarUna<{ id: number }>(
      `UPDATE prestamo.notificacion SET leida_en = now()
        WHERE id = $1 AND usuario_id = $2 AND leida_en IS NULL
        RETURNING id`,
      [id, req.usuario!.id],
    );
    res.json({ id, actualizada: fila !== null });
  }),
);

rutas.post(
  "/avisos/leidas",
  exigeSesion,
  asinc(async (req, res) => {
    const filas = await consultar<{ id: number }>(
      `UPDATE prestamo.notificacion SET leida_en = now()
        WHERE usuario_id = $1 AND leida_en IS NULL AND estatus_envio = 'entregada'
        RETURNING id`,
      [req.usuario!.id],
    );
    res.json({ marcadas: filas.length });
  }),
);

rutas.post(
  "/reservaciones/:id/confirmar",
  exigeSesion,
  asinc(async (req, res) => {
    const id = exigeEntero(req.params.id, "La reservación");
    await consultarUna("SELECT prestamo.confirmar_reservacion($1, $2) AS ok", [id, req.usuario!.id]);
    res.json({ id, estatus: "Confirmada" });
  }),
);

// ---------------------------------------------------------------------
// HU-13, HU-14 y HU-22 · Reportes de uso
// ---------------------------------------------------------------------

/** Lee y valida el filtro que comparten todos los reportes. */
function filtroDeReporte(req: any): [string, string, number | null] {
  const desde = String(req.query.desde ?? "");
  const hasta = String(req.query.hasta ?? "");
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    throw new ErrorDeNegocio("Indica el rango de fechas con el formato AAAA-MM-DD.");
  }
  if (desde > hasta) {
    throw new ErrorDeNegocio("La fecha inicial debe ser anterior a la final.");
  }
  const laboratorio = req.query.laboratorio ? exigeEntero(req.query.laboratorio, "El laboratorio") : null;
  return [desde, hasta, laboratorio];
}

rutas.get(
  "/reportes",
  exigeRol("coordinacion", "administrador"),
  asinc(async (req, res) => {
    const filtro = filtroDeReporte(req);

    // Las cuatro consultas son independientes entre sí, así que se lanzan
    // juntas y el dashboard se arma con una sola espera.
    const [indicadores, laboratorios, horarios, serie] = await Promise.all([
      consultarUna<Indicadores>(
        `SELECT total, aprobadas, cumplidas, no_asistio, canceladas, rechazadas,
                tasa_asistencia, horas_perdidas, lab_mas_solicitado, horario_mas_demandado
           FROM prestamo.indicadores_uso($1::date, $2::date, $3)`,
        filtro,
      ),
      consultar(
        `SELECT laboratorio_id, clave, nombre, solicitudes, aprobadas, cumplidas,
                no_asistio, horas_usadas, horas_perdidas
           FROM prestamo.reporte_demanda_laboratorio($1::date, $2::date, $3)`,
        filtro,
      ),
      consultar(
        `SELECT bloque, solicitudes, cumplidas
           FROM prestamo.reporte_demanda_horario($1::date, $2::date, $3)`,
        filtro,
      ),
      consultar(
        `SELECT dia, solicitudes, cumplidas, no_asistio
           FROM prestamo.reporte_solicitudes_periodo($1::date, $2::date, $3)`,
        filtro,
      ),
    ]);

    res.json({
      desde: filtro[0],
      hasta: filtro[1],
      laboratorio: filtro[2],
      indicadores,
      laboratorios,
      horarios,
      serie,
    });
  }),
);

// ---------------------------------------------------------------------
// HU-15 · Exportación
// ---------------------------------------------------------------------

/** Arma un CSV. Entre comillas todo, que es lo que Excel abre sin pelear. */
function aCsv(encabezados: string[], filas: (string | number | null)[][]): string {
  const celda = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lineas = [encabezados.map(celda).join(","), ...filas.map((f) => f.map(celda).join(","))];
  // El BOM le dice a Excel que el archivo viene en UTF-8; sin él, los
  // acentos de los nombres de laboratorio se abren rotos en Windows.
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

rutas.get(
  "/reportes/exportar",
  exigeRol("coordinacion", "administrador"),
  asinc(async (req, res) => {
    const filtro = filtroDeReporte(req);
    const tipo = String(req.query.tipo ?? "laboratorios");

    let encabezados: string[];
    let filas: (string | number | null)[][];
    let nombre: string;

    if (tipo === "horarios") {
      const datos = await consultar<Record<string, any>>(
        `SELECT bloque, solicitudes, cumplidas
           FROM prestamo.reporte_demanda_horario($1::date, $2::date, $3)`,
        filtro,
      );
      encabezados = ["Bloque", "Solicitudes", "Cumplidas"];
      filas = datos.map((d) => [d.bloque, d.solicitudes, d.cumplidas]);
      nombre = "demanda_por_horario";
    } else if (tipo === "detalle") {
      const datos = await consultar<Record<string, any>>(
        `SELECT r.folio, l.clave, l.nombre AS laboratorio, u.nombre AS docente,
                r.fecha_uso,
                to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio,
                to_char(r.hora_fin, 'HH24:MI')    AS hora_fin,
                r.grupo_materia, e.nombre AS estatus
           FROM prestamo.reservacion r
           JOIN prestamo.laboratorio l ON l.id = r.laboratorio_id
           JOIN prestamo.usuario u ON u.id = r.usuario_id
           JOIN prestamo.estatus_reservacion e ON e.id = r.estatus_id
          WHERE r.fecha_uso BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR r.laboratorio_id = $3)
          ORDER BY r.fecha_uso, l.clave, r.hora_inicio`,
        filtro,
      );
      encabezados = ["Folio", "Clave", "Laboratorio", "Docente", "Fecha", "Inicio", "Fin", "Grupo o materia", "Estatus"];
      filas = datos.map((d) => [
        d.folio, d.clave, d.laboratorio, d.docente,
        new Date(d.fecha_uso).toISOString().slice(0, 10),
        d.hora_inicio, d.hora_fin, d.grupo_materia, d.estatus,
      ]);
      nombre = "detalle_de_reservaciones";
    } else {
      const datos = await consultar<Record<string, any>>(
        `SELECT clave, nombre, solicitudes, aprobadas, cumplidas, no_asistio,
                horas_usadas, horas_perdidas
           FROM prestamo.reporte_demanda_laboratorio($1::date, $2::date, $3)`,
        filtro,
      );
      encabezados = ["Clave", "Laboratorio", "Solicitudes", "Aprobadas", "Cumplidas",
                     "No asistió", "Horas usadas", "Horas perdidas"];
      filas = datos.map((d) => [
        d.clave, d.nombre, d.solicitudes, d.aprobadas, d.cumplidas,
        d.no_asistio, d.horas_usadas, d.horas_perdidas,
      ]);
      nombre = "demanda_por_laboratorio";
    }

    const archivo = `${nombre}_${filtro[0]}_a_${filtro[1]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${archivo}"`);
    res.send(aCsv(encabezados, filas));
  }),
);
