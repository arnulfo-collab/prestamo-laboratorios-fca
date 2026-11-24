/**
 * Modo de demostración.
 *
 * Replica en memoria las reglas que en el sistema real viven en PostgreSQL,
 * para que el portal pueda mostrarse sin servidor ni base de datos. Los datos
 * son los mismos que carga `bd/02_datos_iniciales.sql` y las validaciones son
 * las mismas que aplica `prestamo.registrar_solicitud`.
 *
 * Nada de lo que se capture aquí se guarda: al recargar la página el sistema
 * vuelve a su estado inicial.
 */
import type { Api } from "./api";
import { ErrorApi } from "./api";
import type {
  Bloqueo,
  BloqueDisponibilidad,
  BloqueHorario,
  CambioParametro,
  DocenteResumen,
  EventoCalendario,
  LiberacionAutomatica,
  NuevoBloqueo,
  RenglonHistorial,
  Reportes,
  SituacionDocente,
  DatosLaboratorio,
  EstadoBloque,
  Laboratorio,
  NuevaSolicitud,
  Parametro,
  ReservacionFutura,
  Solicitud,
  SolicitudPendiente,
  Usuario,
  UsuarioListado,
} from "./tipos";

// ---------------------------------------------------------------------
// Datos iniciales
// ---------------------------------------------------------------------

const USUARIOS: (UsuarioListado & { clave: string })[] = [
  { id: 1, numero_empleado: "30125", nombre: "Arnulfo Vásquez Romero", correo: "arnulfo.vasquez@uabc.edu.mx", rol: "docente", rol_nombre: "Docente", activo: true, clave: "Lab2026$fca" },
  { id: 2, numero_empleado: "28470", nombre: "Encargado de Laboratorios", correo: "laboratorios.fca@uabc.edu.mx", rol: "administrador", rol_nombre: "Encargado de laboratorios", activo: true, clave: "Lab2026$fca" },
  { id: 3, numero_empleado: "19003", nombre: "Coordinación FCA", correo: "coordinacion.fca@uabc.edu.mx", rol: "coordinacion", rol_nombre: "Coordinación", activo: true, clave: "Lab2026$fca" },
  { id: 4, numero_empleado: "30488", nombre: "Docente de Prueba", correo: "docente.prueba@uabc.edu.mx", rol: "docente", rol_nombre: "Docente", activo: true, clave: "Lab2026$fca" },
];

function bloques(desde: number, hasta: number): BloqueHorario[] {
  const lista: BloqueHorario[] = [];
  for (let dia = 1; dia <= 5; dia++) {
    for (let hora = desde; hora < hasta; hora += 2) {
      lista.push({
        dia_semana: dia,
        hora_inicio: `${String(hora).padStart(2, "0")}:00`,
        hora_fin: `${String(hora + 2).padStart(2, "0")}:00`,
      });
    }
  }
  return lista;
}

interface LabInterno extends Omit<Laboratorio, "bloques_horario" | "horas_semana"> {}

let laboratorios: LabInterno[] = [
  { id: 1, clave: "LAB-01", nombre: "Laboratorio de Cómputo 1", capacidad: 30, ubicacion: "Edificio A, planta baja", equipamiento: "Equipos de escritorio, proyector y pizarrón", activo: true, horarios: bloques(7, 21) },
  { id: 2, clave: "LAB-02", nombre: "Laboratorio de Cómputo 2", capacidad: 30, ubicacion: "Edificio A, planta baja", equipamiento: "Equipos de escritorio y proyector", activo: true, horarios: bloques(7, 21) },
  { id: 3, clave: "LAB-03", nombre: "Laboratorio de Cómputo 3", capacidad: 25, ubicacion: "Edificio A, primer piso", equipamiento: "Equipos de escritorio y pantalla", activo: true, horarios: bloques(7, 21) },
  { id: 4, clave: "LAB-04", nombre: "Laboratorio de Cómputo 4", capacidad: 25, ubicacion: "Edificio B, primer piso", equipamiento: "Equipos de escritorio y proyector", activo: true, horarios: bloques(7, 21) },
  { id: 5, clave: "LAB-05", nombre: "Centro de Autoacceso", capacidad: 20, ubicacion: "Edificio B, planta baja", equipamiento: "Equipos de escritorio y audífonos", activo: true, horarios: bloques(9, 17) },
];

const PARAMETROS: Parametro[] = [
  { clave: "P-01", nombre: "Tolerancia para registrar el check-in", valor: "15", unidad: "minutos", tipo_dato: "entero", minimo: 0, maximo: 120, descripcion: "Vencida sin check-in, la reservación pasa a No asistió y el laboratorio se libera." },
  { clave: "P-02", nombre: "Periodo en que se contabilizan las inasistencias", valor: "30", unidad: "días", tipo_dato: "entero", minimo: 1, maximo: 365, descripcion: "Ventana móvil sobre la que se cuentan las faltas de un docente." },
  { clave: "P-03", nombre: "Inasistencias antes de requerir autorización manual", valor: "2", unidad: "faltas", tipo_dato: "entero", minimo: 1, maximo: 20, descripcion: "Al alcanzarlo, las nuevas solicitudes requieren autorización del encargado." },
  { clave: "P-04", nombre: "Inasistencias antes de suspender el apartado", valor: "3", unidad: "faltas", tipo_dato: "entero", minimo: 1, maximo: 20, descripcion: "Al alcanzarlo, el docente pierde temporalmente el apartado con antelación." },
  { clave: "P-05", nombre: "Duración de la suspensión por reincidencia", valor: "15", unidad: "días", tipo_dato: "entero", minimo: 1, maximo: 180, descripcion: "Tiempo que dura la suspensión derivada de P-04." },
  { clave: "P-06", nombre: "Reservaciones activas simultáneas por docente", valor: "3", unidad: "reservas", tipo_dato: "entero", minimo: 1, maximo: 20, descripcion: "Límite de reservaciones vigentes al mismo tiempo." },
  { clave: "P-07", nombre: "Anticipación máxima para apartar", valor: "30", unidad: "días", tipo_dato: "entero", minimo: 1, maximo: 365, descripcion: "No se admiten solicitudes para fechas más lejanas." },
  { clave: "P-08", nombre: "Plazo mínimo para cancelar sin que cuente como falta", valor: "2", unidad: "horas", tipo_dato: "entero", minimo: 0, maximo: 72, descripcion: "Cancelar con menos tiempo requiere intervención del encargado." },
  { clave: "P-09", nombre: "Momentos de envío de recordatorio", valor: "24,1", unidad: "horas", tipo_dato: "lista", minimo: null, maximo: null, descripcion: "Horas de antelación con que se envía cada recordatorio." },
];

const parametro = (clave: string) => Number(PARAMETROS.find((p) => p.clave === clave)?.valor ?? 0);

// Estados del ciclo de vida, con las dos banderas que gobiernan el sistema.
const ESTATUS: Record<string, { nombre: string; ocupa: boolean; final: boolean }> = {
  solicitada: { nombre: "Solicitada", ocupa: false, final: false },
  aprobada: { nombre: "Aprobada", ocupa: true, final: false },
  rechazada: { nombre: "Rechazada", ocupa: false, final: true },
  confirmada: { nombre: "Confirmada", ocupa: true, final: false },
  en_curso: { nombre: "En curso", ocupa: true, final: false },
  cumplida: { nombre: "Cumplida", ocupa: true, final: true },
  cancelada: { nombre: "Cancelada", ocupa: false, final: true },
  no_asistio: { nombre: "No asistió", ocupa: false, final: true },
};

interface Reservacion {
  id: number;
  folio: string;
  usuario_id: number;
  laboratorio_id: number;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  grupo_materia: string;
  motivo_uso: string;
  estatus_clave: keyof typeof ESTATUS;
  solicitada_en: string;
  motivo_rechazo: string | null;
  marcada_no_asistio: string | null;
  resuelta_por: number | null;
  requiere_autorizacion: boolean;
}



// ---------------------------------------------------------------------
// Utilidades de fecha y hora
// ---------------------------------------------------------------------

/** Fecha local en formato AAAA-MM-DD. toISOString daría el día anterior en Mexicali. */
export function enDias(dias: number, desde = new Date()): string {
  const f = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

/** Día de la semana ISO (1 = lunes) de una fecha AAAA-MM-DD. */
export function diaIso(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = new Date(a!, m! - 1, d!).getDay();
  return dia === 0 ? 7 : dia;
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + (m ?? 0);
};

const seTraslapan = (a1: string, a2: string, b1: string, b2: string) =>
  minutos(a1) < minutos(b2) && minutos(b1) < minutos(a2);

// ---------------------------------------------------------------------
// Estado de la demostración
// ---------------------------------------------------------------------

let sesion: Usuario | null = null;
let siguienteFolio = 1;
let siguienteId = 1;

const folio = () => `RES-${new Date().getFullYear()}-${String(siguienteFolio++).padStart(5, "0")}`;

function crearReservacion(
  usuario_id: number,
  laboratorio_id: number,
  fecha_uso: string,
  hora_inicio: string,
  hora_fin: string,
  grupo_materia: string,
  motivo_uso: string,
  estatus_clave: keyof typeof ESTATUS,
): Reservacion {
  return {
    id: siguienteId++,
    folio: folio(),
    usuario_id,
    laboratorio_id,
    fecha_uso,
    hora_inicio,
    hora_fin,
    grupo_materia,
    motivo_uso,
    estatus_clave,
    solicitada_en: new Date().toISOString(),
    motivo_rechazo: null,
    marcada_no_asistio: null,
    resuelta_por: estatus_clave === "solicitada" ? null : 2,
    requiere_autorizacion: false,
  };
}

/**
 * Reservaciones de arranque. Dan contenido al calendario y permiten demostrar
 * tres criterios sin que el evaluador tenga que prepararlos: la advertencia al
 * desactivar un laboratorio con reservaciones aprobadas (HU-09), el estatus
 * No asistió en el seguimiento (HU-05) y el conflicto entre dos docentes que
 * piden el mismo horario (HU-12).
 */
let reservaciones: Reservacion[] = [
  crearReservacion(1, 4, enDias(5), "09:00", "11:00", "Informática Administrativa · Grupo 421", "Práctica de hoja de cálculo", "aprobada"),
  crearReservacion(1, 4, enDias(12), "15:00", "17:00", "Sistemas de Información · Grupo 318", "Taller de bases de datos", "aprobada"),
  crearReservacion(4, 1, enDias(3), "07:00", "09:00", "Contabilidad Digital · Grupo 205", "Ejercicios de software contable", "aprobada"),
  crearReservacion(4, 3, enDias(2), "11:00", "13:00", "Estadística Aplicada · Grupo 112", "Prácticas con hoja de cálculo", "solicitada"),
  crearReservacion(1, 3, enDias(2), "11:30", "13:00", "Informática Administrativa · Grupo 421", "Examen práctico", "solicitada"),
];

// Una reservación pasada que el docente no utilizó, para el tercer criterio de HU-05.
const noAsistio = crearReservacion(1, 2, enDias(-6), "09:00", "11:00", "Informática Administrativa · Grupo 421", "Práctica de sistemas operativos", "no_asistio");
noAsistio.marcada_no_asistio = new Date(Date.now() - 6 * 86_400_000).toISOString();
reservaciones.push(noAsistio);

// Una reservación pasada que sí se utilizó, para que el historial de asistencia
// del docente tenga las dos caras.
const cumplida = crearReservacion(1, 1, enDias(-9), "11:00", "13:00", "Sistemas de Información · Grupo 318", "Taller de modelado de datos", "cumplida");
reservaciones.push(cumplida);

// Una rechazada, para el segundo criterio de HU-05.
const rechazada = crearReservacion(1, 1, enDias(-3), "13:00", "15:00", "Sistemas de Información · Grupo 318", "Sesión de repaso", "rechazada");
rechazada.motivo_rechazo = "El laboratorio estaba asignado a un examen departamental.";
reservaciones.push(rechazada);

let bloqueos: Bloqueo[] = [
  {
    id: 1,
    laboratorio_id: 5,
    laboratorio: "LAB-05",
    laboratorio_nombre: "Centro de Autoacceso",
    motivo: "Mantenimiento preventivo de equipos",
    fecha_inicio: enDias(4),
    fecha_fin: enDias(6),
    registrado_en: new Date().toISOString(),
    registrado_por: "Encargado de Laboratorios",
    vigente: true,
  },
];

interface Asistencia {
  reservacion_id: number;
  registrada_en: string;
  registrada_por: number;
  minutos_retraso: number;
}

interface Inasistencia {
  reservacion_id: number;
  usuario_id: number;
  ocurrida_en: string;
  horas_perdidas: number;
  contabiliza: boolean;
}

const asistencias: Asistencia[] = [
  {
    reservacion_id: cumplida.id,
    registrada_en: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    registrada_por: 1,
    minutos_retraso: 4,
  },
];

const inasistencias: Inasistencia[] = [
  {
    reservacion_id: noAsistio.id,
    usuario_id: 1,
    ocurrida_en: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    horas_perdidas: 2,
    contabiliza: true,
  },
];

interface NotificacionInterna {
  id: number;
  usuario_id: number;
  reservacion_id: number | null;
  tipo: string;
  asunto: string;
  cuerpo: string;
  accion: string | null;
  programada_para: string;
  leida: boolean;
}

let siguienteAviso = 1;
const notificaciones: NotificacionInterna[] = [];

/** Encola un aviso. Mismo papel que encolar_aviso() en la base de datos. */
function encolarAviso(
  usuario_id: number,
  r: Reservacion | null,
  tipo: string,
  asunto: string,
  cuerpo: string,
  accion: string | null = null,
  cuando: Date = new Date(),
) {
  // El tipo identifica al recordatorio, así que repetirlo no duplica nada.
  if (tipo.startsWith("recordatorio_") && r &&
      notificaciones.some((n) => n.reservacion_id === r.id && n.tipo === tipo)) {
    return;
  }
  notificaciones.unshift({
    id: siguienteAviso++,
    usuario_id,
    reservacion_id: r?.id ?? null,
    tipo,
    asunto,
    cuerpo,
    accion,
    programada_para: cuando.toISOString(),
    leida: false,
  });
}

/** Texto compartido por los avisos: laboratorio, día y horario. */
function refDe(r: Reservacion): { lab: string; cuando: string } {
  const lab = labPorId(r.laboratorio_id);
  return {
    lab: lab ? `${lab.clave} · ${lab.nombre}` : "el laboratorio",
    cuando: `${r.fecha_uso.split("-").reverse().join("/")} de ${r.hora_inicio} a ${r.hora_fin}`,
  };
}

function avisarRegistro(r: Reservacion) {
  const { lab, cuando } = refDe(r);
  encolarAviso(r.usuario_id, r, "solicitud_registrada",
    `Recibimos tu solicitud ${r.folio}`,
    `Tu solicitud del laboratorio ${lab} para el ${cuando} quedó registrada con el folio ` +
    `${r.folio}. Te avisamos en cuanto el encargado de laboratorios la resuelva.`);
}

function avisarEstatus(r: Reservacion) {
  const { lab, cuando } = refDe(r);
  if (r.estatus_clave === "aprobada") {
    encolarAviso(r.usuario_id, r, "aprobada", `Aprobada la reservación ${r.folio}`,
      `El laboratorio ${lab} quedó apartado a tu nombre el ${cuando}. ` +
      `Recuerda registrar tu asistencia al llegar.`);
  } else if (r.estatus_clave === "rechazada") {
    encolarAviso(r.usuario_id, r, "rechazada", `No se autorizó la reservación ${r.folio}`,
      `Tu solicitud del laboratorio ${lab} para el ${cuando} no fue autorizada. ` +
      `Motivo: ${r.motivo_rechazo ?? "no se indicó."}`);
  } else if (r.estatus_clave === "no_asistio") {
    encolarAviso(r.usuario_id, r, "liberada", `Se liberó la reservación ${r.folio}`,
      `Nadie registró asistencia en el laboratorio ${lab} el ${cuando}, así que el horario ` +
      `se liberó y la falta quedó registrada.`);
  }
}

/** Equivalente de procesar_avisos(): genera los recordatorios que tocan. */
function generarRecordatorios() {
  const momentos = (PARAMETROS.find((p: Parametro) => p.clave === "P-09")?.valor ?? "24,1")
    .split(",").map((h: string) => Number(h.trim())).filter((h: number) => h > 0);
  for (const horas of momentos) {
    for (const r of reservaciones) {
      if (r.estatus_clave !== "aprobada" && r.estatus_clave !== "confirmada") continue;
      const falta = inicioDe(r).getTime() - Date.now();
      if (falta <= 0 || falta > horas * 3_600_000) continue;
      const { lab, cuando } = refDe(r);
      encolarAviso(r.usuario_id, r, `recordatorio_${horas}h`,
        `Tu reservación ${r.folio} es ${horas >= 24 ? "mañana" : `en menos de ${horas} h`}`,
        `Tienes apartado el laboratorio ${lab} el ${cuando}. Confírmala para conservar el ` +
        `horario o cancélala si ya no la vas a usar.`,
        "confirmar_cancelar");
    }
  }
}

const bitacoraParametros: CambioParametro[] = [];

// ---------------------------------------------------------------------
// Consultas derivadas
// ---------------------------------------------------------------------

const usuarioPorId = (id: number) => USUARIOS.find((u) => u.id === id);
const labPorId = (id: number) => laboratorios.find((l) => l.id === id);

const horasSemana = (lab: LabInterno) =>
  Math.round(lab.horarios.reduce((s, h) => s + (minutos(h.hora_fin) - minutos(h.hora_inicio)) / 60, 0) * 10) / 10;

const conCalculados = (lab: LabInterno): Laboratorio => ({
  ...lab,
  bloques_horario: lab.horarios.length,
  horas_semana: horasSemana(lab),
});

const ocupaHorario = (r: Reservacion) => ESTATUS[r.estatus_clave]!.ocupa;
const esFinal = (r: Reservacion) => ESTATUS[r.estatus_clave]!.final;

function aSolicitud(r: Reservacion): Solicitud {
  const lab = labPorId(r.laboratorio_id)!;
  const inicio = inicioDe(r).getTime();
  const ahora = Date.now();
  const enEspera = r.estatus_clave === "solicitada";
  const vigente = r.estatus_clave === "aprobada" || r.estatus_clave === "confirmada";

  return {
    // Una solicitud en espera se retira cuando sea; una ya autorizada, solo
    // con la anticipación mínima del parámetro P-08.
    puede_cancelar: enEspera || (vigente && inicio - ahora >= parametro("P-08") * 3_600_000),
    puede_checkin: vigente && ahora >= inicio && ahora <= inicio + parametro("P-01") * MINUTO,
    id: r.id,
    folio: r.folio,
    laboratorio_clave: lab.clave,
    laboratorio: lab.nombre,
    fecha_uso: r.fecha_uso,
    hora_inicio: r.hora_inicio,
    hora_fin: r.hora_fin,
    grupo_materia: r.grupo_materia,
    motivo_uso: r.motivo_uso,
    estatus: ESTATUS[r.estatus_clave]!.nombre,
    estatus_clave: r.estatus_clave,
    solicitada_en: r.solicitada_en,
    motivo_rechazo: r.motivo_rechazo,
    marcada_no_asistio: r.marcada_no_asistio,
    resuelta_por: r.resuelta_por ? (usuarioPorId(r.resuelta_por)?.nombre ?? null) : null,
  };
}

function conflictosDe(r: Reservacion) {
  return reservaciones
    .filter(
      (otra) =>
        otra.id !== r.id &&
        otra.laboratorio_id === r.laboratorio_id &&
        otra.fecha_uso === r.fecha_uso &&
        !esFinal(otra) &&
        seTraslapan(r.hora_inicio, r.hora_fin, otra.hora_inicio, otra.hora_fin),
    )
    .map((otra) => ({
      conflicto_folio: otra.folio,
      conflicto_docente: usuarioPorId(otra.usuario_id)?.nombre ?? "",
      conflicto_inicio: otra.hora_inicio,
      conflicto_fin: otra.hora_fin,
      conflicto_estatus: ESTATUS[otra.estatus_clave]!.nombre,
    }));
}

const exigeSesion = (): Usuario => {
  if (!sesion) throw new ErrorApi("Inicia sesión para continuar.", 401);
  return sesion;
};

function exigeRol(...roles: Usuario["rol"][]): Usuario {
  const usuario = exigeSesion();
  if (!roles.includes(usuario.rol)) {
    throw new ErrorApi(`Tu rol es ${usuario.rol_nombre} y no tiene permiso para esta función.`, 403);
  }
  return usuario;
}

const demora = () => new Promise((listo) => setTimeout(listo, 120));

/** Momento exacto en que empieza una reservación, en hora local. */
function inicioDe(r: Reservacion): Date {
  const [a, m, d] = r.fecha_uso.split("-").map(Number);
  const [h, min] = r.hora_inicio.split(":").map(Number);
  return new Date(a!, m! - 1, d!, h!, min ?? 0);
}

const MINUTO = 60_000;
const DIA = 86_400_000;

/** Faltas de un docente dentro del periodo móvil P-02. */
function faltasVigentes(usuarioId: number): number {
  const desde = Date.now() - parametro("P-02") * DIA;
  return inasistencias.filter(
    (i) => i.usuario_id === usuarioId && i.contabiliza && new Date(i.ocurrida_en).getTime() >= desde,
  ).length;
}

/** Situación del docente frente a las reglas de reincidencia (HU-19). */
function situacionDe(usuarioId: number): SituacionDocente {
  const faltas = faltasVigentes(usuarioId);
  const p03 = parametro("P-03");
  const p04 = parametro("P-04");
  const p05 = parametro("P-05");
  const p02 = parametro("P-02");

  const propias = inasistencias.filter((i) => i.usuario_id === usuarioId && i.contabiliza);
  const ultima = propias.length
    ? Math.max(...propias.map((i) => new Date(i.ocurrida_en).getTime()))
    : null;
  const hasta = ultima === null ? null : new Date(ultima + p05 * DIA);
  const hoy = new Date(enDias(0));

  if (faltas >= p04 && hasta && hasta >= hoy) {
    const texto = enDias(0, hasta).split("-").reverse().join("/");
    return {
      faltas,
      umbral_aviso: p03,
      umbral_suspension: p04,
      nivel: "suspension",
      suspendido_hasta: enDias(0, hasta),
      mensaje: `Tienes ${faltas} inasistencias en los últimos ${p02} días. No puedes apartar laboratorios hasta el ${texto}.`,
    };
  }
  if (faltas >= p03) {
    return {
      faltas,
      umbral_aviso: p03,
      umbral_suspension: p04,
      nivel: "autorizacion",
      suspendido_hasta: null,
      mensaje: `Tienes ${faltas} inasistencias en los últimos ${p02} días. Tus nuevas solicitudes requieren autorización del encargado.`,
    };
  }
  return {
    faltas,
    umbral_aviso: p03,
    umbral_suspension: p04,
    nivel: "ninguna",
    suspendido_hasta: null,
    mensaje: faltas === 0
      ? "No tienes inasistencias registradas."
      : `Tienes ${faltas} inasistencia(s) en los últimos ${p02} días. Al llegar a ${p03}, tus solicitudes requerirán autorización.`,
  };
}

// ---------------------------------------------------------------------
// Implementación
// ---------------------------------------------------------------------

export const apiDemostracion: Api = {
  modo: "demostracion",

  async acceso(correo, clave) {
    await demora();
    const usuario = USUARIOS.find(
      (u) => u.correo.toLowerCase() === correo.trim().toLowerCase() && u.activo && u.clave === clave,
    );
    if (!usuario) {
      // El mismo mensaje para los dos casos: el sistema no revela cuál dato falló.
      throw new ErrorApi(
        "Los datos no corresponden a una cuenta válida. Verifica tu correo institucional y tu contraseña.",
        401,
      );
    }
    const { clave: _, activo: __, ...publico } = usuario;
    sesion = publico;
    return publico;
  },

  async salir() {
    sesion = null;
  },

  async sesion() {
    return sesion;
  },

  async laboratorios() {
    const usuario = exigeSesion();
    await demora();
    return laboratorios
      .filter((l) => usuario.rol === "administrador" || l.activo)
      .map(conCalculados)
      .sort((a, b) => a.clave.localeCompare(b.clave));
  },

  async crearLaboratorio(datos: DatosLaboratorio) {
    exigeRol("administrador");
    validarLaboratorio(datos, null);
    laboratorios.push({
      id: Math.max(0, ...laboratorios.map((l) => l.id)) + 1,
      ...datos,
      clave: datos.clave.trim().toUpperCase(),
      activo: true,
    });
  },

  async actualizarLaboratorio(id, datos: DatosLaboratorio) {
    exigeRol("administrador");
    validarLaboratorio(datos, id);
    const lab = labPorId(id);
    if (!lab) throw new ErrorApi("El laboratorio no existe.", 404);
    Object.assign(lab, datos, { clave: datos.clave.trim().toUpperCase() });
  },

  async cambiarEstadoLaboratorio(id, activo) {
    exigeRol("administrador");
    const lab = labPorId(id);
    if (!lab) throw new ErrorApi("El laboratorio no existe.", 404);
    lab.activo = activo;
  },

  async reservacionesFuturas(id): Promise<ReservacionFutura[]> {
    exigeRol("administrador");
    const hoy = enDias(0);
    return reservaciones
      .filter((r) => r.laboratorio_id === id && r.fecha_uso >= hoy && ocupaHorario(r))
      .map((r) => ({
        folio: r.folio,
        fecha_uso: r.fecha_uso,
        hora_inicio: r.hora_inicio,
        hora_fin: r.hora_fin,
        docente: usuarioPorId(r.usuario_id)?.nombre ?? "",
        grupo_materia: r.grupo_materia,
      }))
      .sort((a, b) => a.fecha_uso.localeCompare(b.fecha_uso));
  },

  async disponibilidad(fecha) {
    exigeSesion();
    await demora();
    const dia = diaIso(fecha);
    const resultado: BloqueDisponibilidad[] = [];

    for (const lab of laboratorios.filter((l) => l.activo).sort((a, b) => a.clave.localeCompare(b.clave))) {
      for (const bloque of lab.horarios.filter((h) => h.dia_semana === dia)) {
        const bloqueado = bloqueos.some(
          (b) => b.laboratorio_id === lab.id && fecha >= b.fecha_inicio && fecha <= b.fecha_fin,
        );
        const ocupada = reservaciones.find(
          (r) =>
            r.laboratorio_id === lab.id &&
            r.fecha_uso === fecha &&
            ocupaHorario(r) &&
            seTraslapan(r.hora_inicio, r.hora_fin, bloque.hora_inicio, bloque.hora_fin),
        );
        const estado: EstadoBloque = bloqueado ? "bloqueado" : ocupada ? "ocupado" : "libre";
        resultado.push({
          laboratorio_id: lab.id,
          clave: lab.clave,
          laboratorio: lab.nombre,
          capacidad: lab.capacidad,
          hora_inicio: bloque.hora_inicio,
          hora_fin: bloque.hora_fin,
          estado,
          folio: ocupada?.folio ?? null,
          docente: ocupada ? (usuarioPorId(ocupada.usuario_id)?.nombre ?? null) : null,
          grupo_materia: ocupada?.grupo_materia ?? null,
        });
      }
    }
    return resultado;
  },

  async crearSolicitud(datos: NuevaSolicitud) {
    const usuario = exigeRol("docente");
    await demora();
    const nueva = validarSolicitud(usuario.id, datos);
    reservaciones.push(nueva);
    avisarRegistro(nueva);
    return nueva.folio;
  },

  async misSolicitudes() {
    const usuario = exigeRol("docente");
    await demora();
    return reservaciones
      .filter((r) => r.usuario_id === usuario.id)
      .sort((a, b) => b.fecha_uso.localeCompare(a.fecha_uso))
      .map(aSolicitud);
  },

  async pendientes(): Promise<SolicitudPendiente[]> {
    exigeRol("administrador");
    await demora();
    return reservaciones
      .filter((r) => r.estatus_clave === "solicitada")
      .sort((a, b) => a.fecha_uso.localeCompare(b.fecha_uso) || a.hora_inicio.localeCompare(b.hora_inicio))
      .map((r) => ({
        ...aSolicitud(r),
        docente: usuarioPorId(r.usuario_id)?.nombre ?? "",
        conflictos: conflictosDe(r),
        requiere_autorizacion: r.requiere_autorizacion,
        faltas_docente: faltasVigentes(r.usuario_id),
      }));
  },

  async aprobar(id) {
    const admin = exigeRol("administrador");
    const r = reservaciones.find((x) => x.id === id);
    if (!r || r.estatus_clave !== "solicitada") {
      throw new ErrorApi("La solicitud no existe o ya fue resuelta.", 400);
    }
    const choque = conflictosDe(r).find((c) =>
      ["Aprobada", "Confirmada", "En curso", "Cumplida"].includes(c.conflicto_estatus),
    );
    if (choque) {
      const lab = labPorId(r.laboratorio_id)!;
      throw new ErrorApi(
        `No se puede aprobar: el laboratorio ${lab.clave} ya tiene la reservación ` +
          `${choque.conflicto_folio} de ${choque.conflicto_docente} el ` +
          `${r.fecha_uso.split("-").reverse().join("/")} de ${choque.conflicto_inicio} a ${choque.conflicto_fin}.`,
        400,
      );
    }
    r.estatus_clave = "aprobada";
    r.resuelta_por = admin.id;
    avisarEstatus(r);
  },

  async rechazar(id, motivo) {
    const admin = exigeRol("administrador");
    if (!motivo || !motivo.trim()) throw new ErrorApi("Captura el motivo del rechazo.", 400);
    const r = reservaciones.find((x) => x.id === id);
    if (!r || r.estatus_clave !== "solicitada") {
      throw new ErrorApi("La solicitud no existe o ya fue resuelta.", 400);
    }
    r.estatus_clave = "rechazada";
    r.motivo_rechazo = motivo.trim();
    r.resuelta_por = admin.id;
    avisarEstatus(r);
  },

  async parametros() {
    exigeSesion();
    return PARAMETROS;
  },

  async usuarios() {
    exigeRol("administrador");
    return USUARIOS.map(({ clave: _, ...resto }) => resto);
  },

  // ------------------------------------------------------------------
  // HU-07 · Cancelación de solicitud
  // ------------------------------------------------------------------
  async cancelar(id) {
    const usuario = exigeRol("docente");
    const r = reservaciones.find((x) => x.id === id);
    if (!r || r.usuario_id !== usuario.id) {
      throw new ErrorApi("La reservación no existe o no es tuya.", 400);
    }
    if (!["solicitada", "aprobada", "confirmada"].includes(r.estatus_clave)) {
      throw new ErrorApi(
        "Solo puedes cancelar una solicitud que siga en espera, aprobada o confirmada.", 400);
    }
    const horas = parametro("P-08");
    if (r.estatus_clave !== "solicitada" && inicioDe(r).getTime() - Date.now() < horas * 3_600_000) {
      throw new ErrorApi(
        `Faltan menos de ${horas} horas para tu reservación. Contacta al encargado de laboratorios para cancelarla.`,
        400,
      );
    }
    r.estatus_clave = "cancelada";
  },

  // ------------------------------------------------------------------
  // HU-16 · Registro de asistencia
  // ------------------------------------------------------------------
  async checkin(id) {
    const usuario = exigeRol("docente", "administrador");
    const r = reservaciones.find((x) => x.id === id);
    if (!r) throw new ErrorApi("La reservación no existe.", 400);
    if (r.usuario_id !== usuario.id && usuario.rol !== "administrador") {
      throw new ErrorApi(
        "Solo el docente titular o el encargado de laboratorios pueden registrar el check-in.", 400);
    }
    if (r.estatus_clave === "no_asistio") {
      throw new ErrorApi(
        "La reservación ya fue liberada por inasistencia y el laboratorio quedó disponible para otros docentes.",
        400,
      );
    }
    if (r.estatus_clave === "en_curso") {
      throw new ErrorApi("El check-in de esta reservación ya estaba registrado.", 400);
    }
    if (!["aprobada", "confirmada"].includes(r.estatus_clave)) {
      throw new ErrorApi("Solo se registra el check-in de una reservación aprobada o confirmada.", 400);
    }

    const tolerancia = parametro("P-01");
    const retraso = Math.floor((Date.now() - inicioDe(r).getTime()) / MINUTO);
    if (retraso < 0) {
      throw new ErrorApi(
        `Aún no empieza tu horario. Puedes registrar el check-in a partir de las ${r.hora_inicio} y hasta ${tolerancia} minutos después.`,
        400,
      );
    }
    if (retraso > tolerancia) {
      throw new ErrorApi(
        `Venció la tolerancia de ${tolerancia} minutos. El laboratorio ya fue liberado.`, 400);
    }

    r.estatus_clave = "en_curso";
    asistencias.push({
      reservacion_id: r.id,
      registrada_en: new Date().toISOString(),
      registrada_por: usuario.id,
      minutos_retraso: retraso,
    });
    return retraso;
  },

  // ------------------------------------------------------------------
  // HU-17 · Liberación automática por inasistencia
  // ------------------------------------------------------------------
  async liberarInasistencias(): Promise<LiberacionAutomatica[]> {
    const tolerancia = parametro("P-01");
    const liberadas: LiberacionAutomatica[] = [];

    for (const r of reservaciones) {
      if (!["aprobada", "confirmada"].includes(r.estatus_clave)) continue;
      if (asistencias.some((a) => a.reservacion_id === r.id)) continue;
      if (inicioDe(r).getTime() + tolerancia * MINUTO >= Date.now()) continue;

      const horas = (minutos(r.hora_fin) - minutos(r.hora_inicio)) / 60;
      r.estatus_clave = "no_asistio";
      r.marcada_no_asistio = new Date().toISOString();
      inasistencias.push({
        reservacion_id: r.id,
        usuario_id: r.usuario_id,
        ocurrida_en: new Date().toISOString(),
        horas_perdidas: horas,
        contabiliza: true,
      });
      avisarEstatus(r);
      liberadas.push({
        ret_folio: r.folio,
        ret_laboratorio: labPorId(r.laboratorio_id)?.clave ?? "",
        ret_docente: usuarioPorId(r.usuario_id)?.nombre ?? "",
        ret_horas_perdidas: horas,
      });
    }
    return liberadas;
  },

  // ------------------------------------------------------------------
  // HU-19 · Control de inasistencias reincidentes
  // ------------------------------------------------------------------
  async miSituacion() {
    const usuario = exigeRol("docente");
    return situacionDe(usuario.id);
  },

  async docentes(): Promise<DocenteResumen[]> {
    exigeRol("administrador", "coordinacion");
    return USUARIOS.filter((u) => u.rol === "docente" && u.activo)
      .map((u) => ({
        id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        faltas: faltasVigentes(u.id),
        nivel: situacionDe(u.id).nivel,
        reservaciones: reservaciones.filter((r) => r.usuario_id === u.id).length,
      }))
      .sort((a, b) => b.faltas - a.faltas || a.nombre.localeCompare(b.nombre));
  },

  async historialDocente(id) {
    exigeRol("administrador", "coordinacion");
    const historial: RenglonHistorial[] = reservaciones
      .filter((r) => r.usuario_id === id)
      .sort((a, b) => b.fecha_uso.localeCompare(a.fecha_uso))
      .map((r) => {
        const a = asistencias.find((x) => x.reservacion_id === r.id);
        const i = inasistencias.find((x) => x.reservacion_id === r.id);
        return {
          folio: r.folio,
          laboratorio: labPorId(r.laboratorio_id)?.clave ?? "",
          fecha_uso: r.fecha_uso,
          hora_inicio: r.hora_inicio,
          hora_fin: r.hora_fin,
          estatus: ESTATUS[r.estatus_clave]!.nombre,
          estatus_clave: r.estatus_clave,
          checkin_en: a?.registrada_en ?? null,
          minutos_retraso: a?.minutos_retraso ?? null,
          horas_perdidas: i?.horas_perdidas ?? null,
          falta_contabilizada: i?.contabiliza ?? null,
        };
      });
    return { situacion: situacionDe(id), historial };
  },

  // ------------------------------------------------------------------
  // HU-10 · Bloqueo por mantenimiento o evento
  // ------------------------------------------------------------------
  async bloqueos() {
    exigeRol("administrador", "coordinacion");
    const hoy = enDias(0);
    return bloqueos
      .map((b) => ({ ...b, vigente: b.fecha_fin >= hoy }))
      .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
  },

  async crearBloqueo(datos: NuevoBloqueo) {
    const admin = exigeRol("administrador");
    if (!datos.motivo?.trim()) throw new ErrorApi("Captura el motivo del bloqueo.", 400);
    if (datos.fecha_fin < datos.fecha_inicio) {
      throw new ErrorApi("La fecha final no puede ser anterior a la inicial.", 400);
    }
    const lab = labPorId(datos.laboratorio_id);
    if (!lab) throw new ErrorApi("El laboratorio no existe.", 404);

    bloqueos.push({
      id: Math.max(0, ...bloqueos.map((b) => b.id)) + 1,
      laboratorio_id: lab.id,
      laboratorio: lab.clave,
      laboratorio_nombre: lab.nombre,
      motivo: datos.motivo.trim(),
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin,
      registrado_en: new Date().toISOString(),
      registrado_por: admin.nombre,
      vigente: true,
    });

    // Las reservaciones vigentes dentro del bloqueo se cancelan: el espacio no
    // estará disponible y no es falta del docente.
    for (const r of reservaciones) {
      if (
        r.laboratorio_id === lab.id &&
        r.fecha_uso >= datos.fecha_inicio &&
        r.fecha_uso <= datos.fecha_fin &&
        ["solicitada", "aprobada", "confirmada"].includes(r.estatus_clave)
      ) {
        r.estatus_clave = "cancelada";
      }
    }
  },

  // ------------------------------------------------------------------
  // HU-11 · Calendario general de reservaciones
  // ------------------------------------------------------------------
  async calendarioGeneral(desde, hasta, laboratorio): Promise<EventoCalendario[]> {
    exigeRol("administrador", "coordinacion");
    await demora();
    return reservaciones
      .filter(
        (r) =>
          r.fecha_uso >= desde &&
          r.fecha_uso <= hasta &&
          r.estatus_clave !== "rechazada" &&
          (!laboratorio || r.laboratorio_id === laboratorio),
      )
      .sort(
        (a, b) =>
          a.fecha_uso.localeCompare(b.fecha_uso) || a.hora_inicio.localeCompare(b.hora_inicio),
      )
      .map((r) => {
        const lab = labPorId(r.laboratorio_id)!;
        const a = asistencias.find((x) => x.reservacion_id === r.id);
        return {
          id: r.id,
          folio: r.folio,
          laboratorio_id: lab.id,
          laboratorio: lab.clave,
          laboratorio_nombre: lab.nombre,
          fecha_uso: r.fecha_uso,
          hora_inicio: r.hora_inicio,
          hora_fin: r.hora_fin,
          docente: usuarioPorId(r.usuario_id)?.nombre ?? "",
          grupo_materia: r.grupo_materia,
          motivo_uso: r.motivo_uso,
          estatus: ESTATUS[r.estatus_clave]!.nombre,
          estatus_clave: r.estatus_clave,
          asistencia: a
            ? "Asistió"
            : r.estatus_clave === "no_asistio"
              ? "No asistió"
              : r.estatus_clave === "cancelada"
                ? "Cancelada"
                : "Pendiente",
          minutos_retraso: a?.minutos_retraso ?? null,
        };
      });
  },

  // ------------------------------------------------------------------
  // HU-21 · Configuración de las reglas de préstamo
  // ------------------------------------------------------------------
  async guardarParametro(clave, valor) {
    const admin = exigeRol("administrador");
    const param = PARAMETROS.find((x) => x.clave === clave);
    if (!param) throw new ErrorApi(`El parámetro ${clave} no existe.`, 400);

    const limpio = String(valor).trim();
    if (param.tipo_dato === "entero") {
      if (!/^-?\d+$/.test(limpio)) {
        throw new ErrorApi(`El valor de ${clave} debe ser un número entero.`, 400);
      }
      const numero = Number(limpio);
      if (numero < (param.minimo ?? 0) || numero > (param.maximo ?? 0)) {
        throw new ErrorApi(
          `El valor de ${clave} debe estar entre ${param.minimo} y ${param.maximo} ${param.unidad ?? ""}.`.trim(),
          400,
        );
      }
    } else if (param.tipo_dato === "lista" && !/^\d+(,\d+)*$/.test(limpio)) {
      throw new ErrorApi(
        `El valor de ${clave} debe ser una lista de números separados por comas.`, 400);
    }

    if (param.valor === limpio) return;

    bitacoraParametros.unshift({
      clave,
      nombre: param.nombre,
      valor_anterior: param.valor,
      valor_nuevo: limpio,
      ocurrido_en: new Date().toISOString(),
      usuario: admin.nombre,
    });
    param.valor = limpio;
    param.actualizado_en = new Date().toISOString();
  },

  async bitacoraParametros() {
    exigeRol("administrador", "coordinacion");
    return bitacoraParametros;
  },

  // ---- Sprint 4 ----

  async avisos() {
    const usuario = exigeSesion();
    await demora();
    generarRecordatorios();
    const mios = notificaciones
      .filter((n) => n.usuario_id === usuario.id && Date.parse(n.programada_para) <= Date.now())
      .map((n) => {
        const r = reservaciones.find((x) => x.id === n.reservacion_id);
        return {
          id: n.id,
          reservacion_id: n.reservacion_id,
          folio: r?.folio ?? null,
          tipo: n.tipo,
          asunto: n.asunto,
          cuerpo: n.cuerpo,
          accion: n.accion,
          programada_para: n.programada_para,
          leida: n.leida,
          reservacion_estatus: r ? ORDEN_ESTATUS.indexOf(r.estatus_clave) + 1 : null,
        };
      })
      .sort((a, b) => b.programada_para.localeCompare(a.programada_para));
    return { avisos: mios, sinLeer: mios.filter((a) => !a.leida).length };
  },

  async marcarAvisoLeido(id) {
    const usuario = exigeSesion();
    const n = notificaciones.find((x) => x.id === id && x.usuario_id === usuario.id);
    if (n) n.leida = true;
  },

  async marcarAvisosLeidos() {
    const usuario = exigeSesion();
    let marcadas = 0;
    for (const n of notificaciones) {
      if (n.usuario_id === usuario.id && !n.leida) {
        n.leida = true;
        marcadas++;
      }
    }
    return marcadas;
  },

  async confirmarReservacion(id) {
    const usuario = exigeRol("docente");
    await demora();
    const r = reservaciones.find((x) => x.id === id && x.usuario_id === usuario.id);
    if (!r) throw new ErrorApi("La reservación no existe o no es tuya.", 400);
    if (r.estatus_clave === "confirmada") return;
    if (r.estatus_clave !== "aprobada") {
      throw new ErrorApi("Solo puedes confirmar una reservación aprobada.", 400);
    }
    if (inicioDe(r).getTime() <= Date.now()) {
      throw new ErrorApi(
        "El horario de esta reservación ya empezó. Registra tu asistencia en el laboratorio.", 400);
    }
    r.estatus_clave = "confirmada";
  },

  async reportes(desde, hasta, laboratorio) {
    exigeRol("coordinacion", "administrador");
    await demora();
    return calcularReportes(desde, hasta, laboratorio ?? null);
  },

  urlExportacion(desde, hasta, tipo, laboratorio) {
    // Sin servidor no hay descarga que pedir, así que el archivo se arma aquí
    // mismo y se entrega como dirección de datos. El navegador lo descarga
    // igual, y la demostración de HU-15 no depende de estar conectada.
    const csv = csvDeReporte(calcularReportes(desde, hasta, laboratorio ?? null), tipo);
    return "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
  },
};

// ---------------------------------------------------------------------
// Validaciones, equivalentes a las que declara el esquema de PostgreSQL
// ---------------------------------------------------------------------

function validarLaboratorio(datos: DatosLaboratorio, id: number | null) {
  if (!datos.clave?.trim()) throw new ErrorApi("Captura la clave del laboratorio.", 400);
  if (laboratorios.some((l) => l.clave.toLowerCase() === datos.clave.trim().toLowerCase() && l.id !== id)) {
    throw new ErrorApi("Ya existe un laboratorio con esa clave.", 400);
  }
  if (!datos.nombre?.trim()) throw new ErrorApi("Captura el nombre del laboratorio.", 400);
  if (!Number.isInteger(datos.capacidad) || datos.capacidad < 1 || datos.capacidad > 100) {
    throw new ErrorApi("La capacidad debe ser un número entero entre 1 y 100.", 400);
  }
  if (!datos.ubicacion?.trim()) throw new ErrorApi("Captura la ubicación.", 400);
}

/** Las ocho validaciones de HU-04 y HU-20, en el mismo orden que la función del motor. */
function validarSolicitud(usuarioId: number, datos: NuevaSolicitud): Reservacion {
  const { laboratorio_id, fecha_uso, hora_inicio, hora_fin, grupo_materia, motivo_uso } = datos;

  if (!grupo_materia?.trim()) {
    throw new ErrorApi("Indica el grupo o la materia para la que usarás el laboratorio.", 400);
  }
  if (!motivo_uso?.trim()) throw new ErrorApi("Indica el motivo de uso del laboratorio.", 400);

  const hoy = enDias(0);
  if (fecha_uso < hoy) {
    throw new ErrorApi(
      `La fecha ${fecha_uso.split("-").reverse().join("/")} ya pasó. Elige una fecha a partir de hoy.`,
      400,
    );
  }

  const maxDias = parametro("P-07");
  if (fecha_uso > enDias(maxDias)) {
    throw new ErrorApi(
      `Solo puedes apartar con ${maxDias} días de anticipación. ` +
        `La fecha máxima permitida es el ${enDias(maxDias).split("-").reverse().join("/")}.`,
      400,
    );
  }

  const situacion = situacionDe(usuarioId);
  if (situacion.nivel === "suspension") {
    throw new ErrorApi(situacion.mensaje, 400);
  }

  const lab = labPorId(laboratorio_id);
  if (!lab || !lab.activo) {
    throw new ErrorApi("El laboratorio seleccionado no está disponible para préstamo.", 400);
  }

  const dia = diaIso(fecha_uso);
  const cabe = lab.horarios.some(
    (h) =>
      h.dia_semana === dia &&
      minutos(hora_inicio) >= minutos(h.hora_inicio) &&
      minutos(hora_fin) <= minutos(h.hora_fin),
  );
  if (!cabe) {
    throw new ErrorApi("El horario solicitado excede el bloque que este laboratorio ofrece ese día.", 400);
  }

  if (bloqueos.some((b) => b.laboratorio_id === lab.id && fecha_uso >= b.fecha_inicio && fecha_uso <= b.fecha_fin)) {
    throw new ErrorApi("El laboratorio está bloqueado en esa fecha y no admite reservaciones.", 400);
  }

  const maxActivas = parametro("P-06");
  const activas = reservaciones.filter(
    (r) => r.usuario_id === usuarioId && r.fecha_uso >= hoy && !esFinal(r),
  ).length;
  if (activas >= maxActivas) {
    throw new ErrorApi(
      `Ya tienes ${activas} reservaciones activas y el límite vigente es de ${maxActivas}. ` +
        "Cancela una para registrar otra.",
      400,
    );
  }

  if (
    reservaciones.some(
      (r) =>
        r.laboratorio_id === laboratorio_id &&
        r.fecha_uso === fecha_uso &&
        ocupaHorario(r) &&
        seTraslapan(r.hora_inicio, r.hora_fin, hora_inicio, hora_fin),
    )
  ) {
    throw new ErrorApi("Ese horario ya está ocupado. Elige otro bloque del calendario.", 400);
  }

  const nueva = crearReservacion(
    usuarioId,
    laboratorio_id,
    fecha_uso,
    hora_inicio,
    hora_fin,
    grupo_materia.trim(),
    motivo_uso.trim(),
    "solicitada",
  );
  nueva.requiere_autorizacion = situacion.nivel === "autorizacion";
  return nueva;
}

// ---------------------------------------------------------------------
// Sprint 4 · cálculo de los reportes en memoria
// ---------------------------------------------------------------------

/** Mismo orden que estatus_reservacion en la base: la posición es el id. */
const ORDEN_ESTATUS = [
  "solicitada", "aprobada", "rechazada", "confirmada",
  "en_curso", "cumplida", "cancelada", "no_asistio",
];

const horasDe = (r: Reservacion) => (minutos(r.hora_fin) - minutos(r.hora_inicio)) / 60;
const redondear = (n: number) => Math.round(n * 10) / 10;

function calcularReportes(desde: string, hasta: string, laboratorio: number | null): Reportes {
  const dentro = reservaciones.filter(
    (r) => r.fecha_uso >= desde && r.fecha_uso <= hasta &&
           (laboratorio === null || r.laboratorio_id === laboratorio),
  );
  const cuenta = (lista: Reservacion[], clave: string) =>
    lista.filter((r) => r.estatus_clave === clave).length;
  const ocuparon = (r: Reservacion) =>
    ["aprobada", "confirmada", "en_curso", "cumplida", "no_asistio"].includes(r.estatus_clave);

  const cumplidas = cuenta(dentro, "cumplida");
  const faltas = cuenta(dentro, "no_asistio");
  const base = cumplidas + faltas;

  const porLaboratorio = laboratorios
    .filter((l) => laboratorio === null || l.id === laboratorio)
    .map((l) => {
      const suyas = dentro.filter((r) => r.laboratorio_id === l.id);
      return {
        laboratorio_id: l.id,
        clave: l.clave,
        nombre: l.nombre,
        solicitudes: suyas.length,
        aprobadas: suyas.filter(ocuparon).length,
        cumplidas: cuenta(suyas, "cumplida"),
        no_asistio: cuenta(suyas, "no_asistio"),
        horas_usadas: redondear(
          suyas.filter((r) => r.estatus_clave === "cumplida").reduce((s, r) => s + horasDe(r), 0)),
        horas_perdidas: redondear(
          suyas.filter((r) => r.estatus_clave === "no_asistio").reduce((s, r) => s + horasDe(r), 0)),
      };
    })
    .sort((a, b) => b.solicitudes - a.solicitudes || a.clave.localeCompare(b.clave));

  const bloques = [...new Set(
    laboratorios.flatMap((l) => l.horarios.map((h) => `${h.hora_inicio}–${h.hora_fin}`)),
  )].sort();
  const porHorario = bloques.map((bloque) => {
    const [ini, fin] = bloque.split("–");
    const suyas = dentro.filter((r) => r.hora_inicio === ini && r.hora_fin === fin);
    return { bloque, solicitudes: suyas.length, cumplidas: cuenta(suyas, "cumplida") };
  });

  const serie: Reportes["serie"] = [];
  for (let d = new Date(desde + "T12:00:00"); d <= new Date(hasta + "T12:00:00");
       d.setDate(d.getDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const suyas = dentro.filter((r) => r.fecha_uso === dia);
    serie.push({
      dia,
      solicitudes: suyas.length,
      cumplidas: cuenta(suyas, "cumplida"),
      no_asistio: cuenta(suyas, "no_asistio"),
    });
  }

  const masSolicitado = porLaboratorio.find((l) => l.solicitudes > 0);
  const masDemandado = [...porHorario].sort((a, b) => b.solicitudes - a.solicitudes)[0];

  return {
    desde,
    hasta,
    laboratorio,
    indicadores: {
      total: dentro.length,
      aprobadas: dentro.filter(ocuparon).length,
      cumplidas,
      no_asistio: faltas,
      canceladas: cuenta(dentro, "cancelada"),
      rechazadas: cuenta(dentro, "rechazada"),
      // Nulo y no cero: el portal distingue "no hubo nada que medir" de
      // "se midió y dio cero", igual que lo hace indicadores_uso() en la base.
      tasa_asistencia: base === 0 ? null : redondear((100 * cumplidas) / base),
      horas_perdidas: redondear(
        dentro.filter((r) => r.estatus_clave === "no_asistio").reduce((s, r) => s + horasDe(r), 0)),
      lab_mas_solicitado: masSolicitado ? `${masSolicitado.clave} · ${masSolicitado.nombre}` : null,
      horario_mas_demandado: masDemandado && masDemandado.solicitudes > 0 ? masDemandado.bloque : null,
    },
    laboratorios: porLaboratorio,
    horarios: porHorario,
    serie,
  };
}

function csvDeReporte(datos: Reportes, tipo: string): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linea = (campos: unknown[]) => campos.map(celda).join(",");

  if (tipo === "horarios") {
    return [linea(["Bloque", "Solicitudes", "Cumplidas"]),
            ...datos.horarios.map((h) => linea([h.bloque, h.solicitudes, h.cumplidas]))].join("\r\n");
  }
  if (tipo === "detalle") {
    const dentro = reservaciones.filter(
      (r) => r.fecha_uso >= datos.desde && r.fecha_uso <= datos.hasta &&
             (datos.laboratorio === null || r.laboratorio_id === datos.laboratorio),
    );
    return [
      linea(["Folio", "Clave", "Laboratorio", "Docente", "Fecha", "Inicio", "Fin",
             "Grupo o materia", "Estatus"]),
      ...dentro.map((r) => {
        const lab = labPorId(r.laboratorio_id);
        return linea([r.folio, lab?.clave, lab?.nombre, usuarioPorId(r.usuario_id)?.nombre,
                      r.fecha_uso, r.hora_inicio, r.hora_fin, r.grupo_materia,
                      ESTATUS[r.estatus_clave]!.nombre]);
      }),
    ].join("\r\n");
  }
  return [
    linea(["Clave", "Laboratorio", "Solicitudes", "Aprobadas", "Cumplidas", "No asistió",
           "Horas usadas", "Horas perdidas"]),
    ...datos.laboratorios.map((l) => linea([l.clave, l.nombre, l.solicitudes, l.aprobadas,
                                            l.cumplidas, l.no_asistio, l.horas_usadas,
                                            l.horas_perdidas])),
  ].join("\r\n");
}

// ---------------------------------------------------------------------
// Avisos de arranque
// ---------------------------------------------------------------------
// Se generan al final, cuando ya existen las reservaciones de ejemplo y todas
// las funciones auxiliares. Así la bandeja no arranca vacía y HU-06 y HU-18
// pueden verse sin preparar nada.

for (const r of reservaciones) {
  avisarRegistro(r);
  if (r.estatus_clave !== "solicitada") avisarEstatus(r);
}
generarRecordatorios();
