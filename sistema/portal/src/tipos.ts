/** Tipos del portal. Son los mismos que devuelve la API. */

export type ClaveRol = "docente" | "administrador" | "coordinacion";

export interface Usuario {
  id: number;
  numero_empleado: string;
  nombre: string;
  correo: string;
  rol: ClaveRol;
  rol_nombre: string;
}

export interface UsuarioListado extends Usuario {
  activo: boolean;
}

export interface BloqueHorario {
  id?: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface Laboratorio {
  id: number;
  clave: string;
  nombre: string;
  capacidad: number;
  ubicacion: string;
  equipamiento: string | null;
  activo: boolean;
  bloques_horario: number;
  horas_semana: number;
  horarios: BloqueHorario[];
}

export type DatosLaboratorio = Omit<
  Laboratorio,
  "id" | "activo" | "bloques_horario" | "horas_semana"
>;

export type EstadoBloque = "libre" | "ocupado" | "bloqueado";

export interface BloqueDisponibilidad {
  laboratorio_id: number;
  clave: string;
  laboratorio: string;
  capacidad: number;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoBloque;
  folio: string | null;
  docente: string | null;
  grupo_materia: string | null;
}

export interface ReservacionFutura {
  folio: string;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  docente: string;
  grupo_materia: string;
}

export interface Solicitud {
  puede_cancelar?: boolean;
  puede_checkin?: boolean;
  id: number;
  folio: string;
  laboratorio_clave: string;
  laboratorio: string;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  grupo_materia: string;
  motivo_uso: string;
  estatus: string;
  estatus_clave: string;
  solicitada_en: string;
  motivo_rechazo: string | null;
  marcada_no_asistio: string | null;
  resuelta_por: string | null;
}

export interface Conflicto {
  conflicto_folio: string;
  conflicto_docente: string;
  conflicto_inicio: string;
  conflicto_fin: string;
  conflicto_estatus: string;
}

export interface SolicitudPendiente extends Solicitud {
  docente: string;
  conflictos: Conflicto[];
  requiere_autorizacion: boolean;
  faltas_docente: number;
}

export interface NuevaSolicitud {
  laboratorio_id: number;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  grupo_materia: string;
  motivo_uso: string;
}

export interface Parametro {
  clave: string;
  nombre: string;
  valor: string;
  unidad: string | null;
  descripcion: string;
  tipo_dato: string;
  minimo: number | null;
  maximo: number | null;
  actualizado_en?: string;
}

export interface CambioParametro {
  clave: string;
  nombre: string;
  valor_anterior: string;
  valor_nuevo: string;
  ocurrido_en: string;
  usuario: string;
}

export type NivelRestriccion = "ninguna" | "autorizacion" | "suspension";

export interface SituacionDocente {
  faltas: number;
  umbral_aviso: number;
  umbral_suspension: number;
  nivel: NivelRestriccion;
  suspendido_hasta: string | null;
  mensaje: string;
}

export interface Bloqueo {
  id: number;
  laboratorio_id: number;
  laboratorio: string;
  laboratorio_nombre: string;
  motivo: string;
  fecha_inicio: string;
  fecha_fin: string;
  registrado_en: string;
  registrado_por: string;
  vigente: boolean;
}

export interface NuevoBloqueo {
  laboratorio_id: number;
  motivo: string;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface EventoCalendario {
  id: number;
  folio: string;
  laboratorio_id: number;
  laboratorio: string;
  laboratorio_nombre: string;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  docente: string;
  grupo_materia: string;
  motivo_uso: string;
  estatus: string;
  estatus_clave: string;
  asistencia: string;
  minutos_retraso: number | null;
}

export interface DocenteResumen {
  id: number;
  nombre: string;
  correo: string;
  faltas: number;
  nivel: NivelRestriccion;
  reservaciones: number;
}

export interface RenglonHistorial {
  folio: string;
  laboratorio: string;
  fecha_uso: string;
  hora_inicio: string;
  hora_fin: string;
  estatus: string;
  estatus_clave: string;
  checkin_en: string | null;
  minutos_retraso: number | null;
  horas_perdidas: number | null;
  falta_contabilizada: boolean | null;
}

export interface LiberacionAutomatica {
  ret_folio: string;
  ret_laboratorio: string;
  ret_docente: string;
  ret_horas_perdidas: number;
}

export const DIAS = [
  "",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export const SECCIONES_POR_ROL: Record<ClaveRol, string[]> = {
  docente: ["inicio", "calendario", "mis-solicitudes", "avisos", "laboratorios"],
  administrador: [
    "inicio", "calendario", "pendientes", "agenda", "reportes", "catalogo", "bloqueos",
    "docentes", "parametros", "usuarios", "laboratorios",
  ],
  coordinacion: ["inicio", "agenda", "reportes", "docentes", "laboratorios"],
};

// ---------------------------------------------------------------------
// Sprint 4
// ---------------------------------------------------------------------

/** Aviso de la bandeja. Se llama así y no "Aviso" para no confundirse con el
 *  componente del mismo nombre, que es la caja de notas de las vistas. */
export interface Notificacion {
  id: number;
  reservacion_id: number | null;
  folio: string | null;
  tipo: string;
  asunto: string;
  cuerpo: string | null;
  accion: string | null;
  programada_para: string;
  leida: boolean;
  reservacion_estatus: number | null;
}

export interface Indicadores {
  total: number;
  aprobadas: number;
  cumplidas: number;
  no_asistio: number;
  canceladas: number;
  rechazadas: number;
  tasa_asistencia: number | null;
  horas_perdidas: number;
  lab_mas_solicitado: string | null;
  horario_mas_demandado: string | null;
}

export interface DemandaLaboratorio {
  laboratorio_id: number;
  clave: string;
  nombre: string;
  solicitudes: number;
  aprobadas: number;
  cumplidas: number;
  no_asistio: number;
  horas_usadas: number;
  horas_perdidas: number;
}

export interface DemandaHorario {
  bloque: string;
  solicitudes: number;
  cumplidas: number;
}

export interface PuntoSerie {
  dia: string;
  solicitudes: number;
  cumplidas: number;
  no_asistio: number;
}

export interface Reportes {
  desde: string;
  hasta: string;
  laboratorio: number | null;
  indicadores: Indicadores;
  laboratorios: DemandaLaboratorio[];
  horarios: DemandaHorario[];
  serie: PuntoSerie[];
}
