/**
 * Tipos compartidos por el servidor.
 *
 * Los nombres de los campos corresponden a las columnas de la base de datos,
 * de modo que una consulta se pueda tipar sin traducir nombres.
 */

export type ClaveRol = "docente" | "administrador" | "coordinacion";

export interface Usuario {
  id: number;
  numero_empleado: string;
  nombre: string;
  correo: string;
  rol: ClaveRol;
  rol_nombre: string;
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

export interface BloqueHorario {
  id?: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

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

export interface Solicitud {
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
}

export interface Parametro {
  clave: string;
  nombre: string;
  valor: string;
  unidad: string | null;
  descripcion: string;
}

/** Error que el servidor devuelve al cliente con un mensaje redactado para el usuario. */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string, public readonly estado = 400) {
    super(mensaje);
    this.name = "ErrorDeNegocio";
  }
}

/** Aviso de la bandeja del docente (HU-06, HU-18). */
export interface Aviso {
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

/** Tarjetas del dashboard de coordinación (HU-13, HU-22). */
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
