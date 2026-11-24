/**
 * Capa de datos del portal.
 *
 * El portal habla con la API del servidor cuando hay uno detrás. Cuando no lo
 * hay —por ejemplo al abrir el build publicado desde un enlace— cae en el modo
 * de demostración, que replica las mismas reglas en memoria para que el
 * sistema pueda mostrarse sin instalar nada.
 *
 * Las dos implementaciones cumplen la misma interfaz, así que ninguna vista
 * sabe con cuál está trabajando.
 */
import { apiDemostracion } from "./demo";
import type {
  Bloqueo,
  BloqueDisponibilidad,
  CambioParametro,
  DatosLaboratorio,
  DocenteResumen,
  EventoCalendario,
  Laboratorio,
  LiberacionAutomatica,
  NuevaSolicitud,
  NuevoBloqueo,
  Parametro,
  RenglonHistorial,
  ReservacionFutura,
  Notificacion,
  Reportes,
  SituacionDocente,
  Solicitud,
  SolicitudPendiente,
  Usuario,
  UsuarioListado,
} from "./tipos";

export interface Api {
  readonly modo: "servidor" | "demostracion";
  acceso(correo: string, clave: string): Promise<Usuario>;
  salir(): Promise<void>;
  sesion(): Promise<Usuario | null>;
  laboratorios(): Promise<Laboratorio[]>;
  crearLaboratorio(datos: DatosLaboratorio): Promise<void>;
  actualizarLaboratorio(id: number, datos: DatosLaboratorio): Promise<void>;
  cambiarEstadoLaboratorio(id: number, activo: boolean): Promise<void>;
  reservacionesFuturas(id: number): Promise<ReservacionFutura[]>;
  disponibilidad(fecha: string): Promise<BloqueDisponibilidad[]>;
  crearSolicitud(datos: NuevaSolicitud): Promise<string>;
  misSolicitudes(): Promise<Solicitud[]>;
  pendientes(): Promise<SolicitudPendiente[]>;
  aprobar(id: number): Promise<void>;
  rechazar(id: number, motivo: string): Promise<void>;
  parametros(): Promise<Parametro[]>;
  usuarios(): Promise<UsuarioListado[]>;
  // Sprint 3
  cancelar(id: number): Promise<void>;
  checkin(id: number): Promise<number>;
  miSituacion(): Promise<SituacionDocente>;
  docentes(): Promise<DocenteResumen[]>;
  historialDocente(id: number): Promise<{ situacion: SituacionDocente; historial: RenglonHistorial[] }>;
  bloqueos(): Promise<Bloqueo[]>;
  crearBloqueo(datos: NuevoBloqueo): Promise<void>;
  calendarioGeneral(desde: string, hasta: string, laboratorio?: number | null): Promise<EventoCalendario[]>;
  guardarParametro(clave: string, valor: string): Promise<void>;
  bitacoraParametros(): Promise<CambioParametro[]>;
  liberarInasistencias(): Promise<LiberacionAutomatica[]>;
  // Sprint 4
  avisos(): Promise<{ avisos: Notificacion[]; sinLeer: number }>;
  marcarAvisoLeido(id: number): Promise<void>;
  marcarAvisosLeidos(): Promise<number>;
  confirmarReservacion(id: number): Promise<void>;
  reportes(desde: string, hasta: string, laboratorio?: number | null): Promise<Reportes>;
  /** Dirección del archivo a descargar, o nulo si el modo actual no exporta. */
  urlExportacion(
    desde: string, hasta: string, tipo: string, laboratorio?: number | null,
  ): string | null;
}

/** Error con el mensaje que el servidor redactó para el usuario. */
export class ErrorApi extends Error {
  constructor(mensaje: string, public readonly estado: number) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    credentials: "same-origin",
    headers: opciones.body ? { "Content-Type": "application/json" } : undefined,
    ...opciones,
  });

  if (respuesta.status === 204) return undefined as T;

  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }

  if (!respuesta.ok) {
    const mensaje =
      (cuerpo as { error?: string } | null)?.error ?? "No fue posible completar la operación.";
    throw new ErrorApi(mensaje, respuesta.status);
  }
  return cuerpo as T;
}

const cuerpo = (datos: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(datos),
});

const apiServidor: Api = {
  modo: "servidor",
  async acceso(correo, clave) {
    const { usuario } = await pedir<{ usuario: Usuario }>("/acceso", cuerpo({ correo, clave }));
    return usuario;
  },
  async salir() {
    await pedir("/salir", { method: "POST" });
  },
  async sesion() {
    try {
      const { usuario } = await pedir<{ usuario: Usuario }>("/sesion");
      return usuario;
    } catch {
      return null;
    }
  },
  laboratorios: () => pedir<Laboratorio[]>("/laboratorios"),
  crearLaboratorio: (datos) => pedir<void>("/laboratorios", cuerpo(datos)),
  actualizarLaboratorio: (id, datos) =>
    pedir<void>(`/laboratorios/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  cambiarEstadoLaboratorio: (id, activo) =>
    pedir<void>(`/laboratorios/${id}/estado`, cuerpo({ activo })),
  reservacionesFuturas: (id) => pedir<ReservacionFutura[]>(`/laboratorios/${id}/reservaciones-futuras`),
  disponibilidad: (fecha) => pedir<BloqueDisponibilidad[]>(`/disponibilidad?fecha=${fecha}`),
  async crearSolicitud(datos) {
    const { folio } = await pedir<{ folio: string }>("/solicitudes", cuerpo(datos));
    return folio;
  },
  misSolicitudes: () => pedir<Solicitud[]>("/solicitudes/mias"),
  pendientes: () => pedir<SolicitudPendiente[]>("/solicitudes/pendientes"),
  aprobar: (id) => pedir<void>(`/solicitudes/${id}/aprobar`, { method: "POST" }),
  rechazar: (id, motivo) => pedir<void>(`/solicitudes/${id}/rechazar`, cuerpo({ motivo })),
  parametros: () => pedir<Parametro[]>("/parametros"),
  usuarios: () => pedir<UsuarioListado[]>("/usuarios"),

  cancelar: (id) => pedir<void>(`/solicitudes/${id}/cancelar`, { method: "POST" }),
  async checkin(id) {
    const { minutos_retraso } = await pedir<{ minutos_retraso: number }>(
      `/solicitudes/${id}/checkin`,
      { method: "POST" },
    );
    return minutos_retraso;
  },
  miSituacion: () => pedir<SituacionDocente>("/mi-situacion"),
  docentes: () => pedir<DocenteResumen[]>("/docentes"),
  historialDocente: (id) =>
    pedir<{ situacion: SituacionDocente; historial: RenglonHistorial[] }>(`/docentes/${id}/historial`),
  bloqueos: () => pedir<Bloqueo[]>("/bloqueos"),
  crearBloqueo: (datos) => pedir<void>("/bloqueos", cuerpo(datos)),
  calendarioGeneral: (desde, hasta, laboratorio) =>
    pedir<EventoCalendario[]>(
      `/calendario?desde=${desde}&hasta=${hasta}` + (laboratorio ? `&laboratorio=${laboratorio}` : ""),
    ),
  guardarParametro: (clave, valor) =>
    pedir<void>(`/parametros/${clave}`, { method: "PUT", body: JSON.stringify({ valor }) }),
  bitacoraParametros: () => pedir<CambioParametro[]>("/parametros/bitacora"),
  liberarInasistencias: async () =>
    (await pedir<{ liberadas: LiberacionAutomatica[] }>("/mantenimiento/liberar", { method: "POST" }))
      .liberadas,

  avisos: () => pedir<{ avisos: Notificacion[]; sinLeer: number }>("/avisos"),
  marcarAvisoLeido: (id) => pedir<void>(`/avisos/${id}/leida`, { method: "POST" }),
  marcarAvisosLeidos: async () =>
    (await pedir<{ marcadas: number }>("/avisos/leidas", { method: "POST" })).marcadas,
  confirmarReservacion: (id) => pedir<void>(`/reservaciones/${id}/confirmar`, { method: "POST" }),
  reportes: (desde, hasta, laboratorio) =>
    pedir<Reportes>(
      `/reportes?desde=${desde}&hasta=${hasta}` + (laboratorio ? `&laboratorio=${laboratorio}` : ""),
    ),
  urlExportacion: (desde, hasta, tipo, laboratorio) =>
    `/api/reportes/exportar?desde=${desde}&hasta=${hasta}&tipo=${tipo}` +
    (laboratorio ? `&laboratorio=${laboratorio}` : ""),
};

/**
 * Decide con qué implementación trabajar. Pregunta una sola vez al arrancar,
 * con un plazo corto para no dejar la pantalla en blanco si no hay servidor.
 */
export async function elegirApi(): Promise<Api> {
  try {
    const control = new AbortController();
    const plazo = setTimeout(() => control.abort(), 2500);
    const respuesta = await fetch("/api/estado", { signal: control.signal });
    clearTimeout(plazo);
    if (respuesta.ok && (await respuesta.json())?.servicio === "prestamo-laboratorios") {
      return apiServidor;
    }
  } catch {
    // Sin servidor detrás: se usa el modo de demostración.
  }
  return apiDemostracion;
}
