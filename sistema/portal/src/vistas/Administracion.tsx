/**
 * Pantallas de administración del Sprint 3.
 *
 *   Agenda      · HU-11 calendario general de reservaciones
 *   Bloqueos    · HU-10 bloqueo por mantenimiento o evento
 *   Parametros  · HU-21 configuración de las reglas de préstamo
 *   Docentes    · HU-19 control de inasistencias reincidentes
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Api } from "../api";
import {
  Aviso,
  Campo,
  Cargando,
  Cifra,
  Encabezado,
  Modal,
  Pastilla,
  PastillaEstatus,
  Tabla,
  Tarjeta,
  fechaCorta,
  fechaLarga,
} from "../componentes";
import { enDias } from "../demo";
import type {
  Bloqueo,
  CambioParametro,
  DocenteResumen,
  EventoCalendario,
  Laboratorio,
  NivelRestriccion,
  Parametro,
  RenglonHistorial,
  SituacionDocente,
} from "../tipos";

const COLOR_NIVEL: Record<NivelRestriccion, string> = {
  ninguna: "verde",
  autorizacion: "ambar",
  suspension: "roja",
};

const TEXTO_NIVEL: Record<NivelRestriccion, string> = {
  ninguna: "Sin restricción",
  autorizacion: "Requiere autorización",
  suspension: "Suspendido",
};

const COLOR_ASISTENCIA: Record<string, string> = {
  Asistió: "verde",
  "No asistió": "ambar",
  Cancelada: "gris",
  Pendiente: "azul",
};

function usarLaboratorios(api: Api) {
  const [laboratorios, setLaboratorios] = useState<Laboratorio[]>([]);
  useEffect(() => {
    void api.laboratorios().then(setLaboratorios).catch(() => setLaboratorios([]));
  }, [api]);
  return laboratorios;
}

// =====================================================================
// HU-11 · Calendario general
// =====================================================================

export function Agenda({ api }: { api: Api }) {
  const laboratorios = usarLaboratorios(api);
  const [desde, setDesde] = useState(enDias(-7));
  const [hasta, setHasta] = useState(enDias(21));
  const [laboratorio, setLaboratorio] = useState(0);
  const [eventos, setEventos] = useState<EventoCalendario[] | null>(null);
  const [detalle, setDetalle] = useState<EventoCalendario | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setEventos(null);
    setError("");
    try {
      setEventos(await api.calendarioGeneral(desde, hasta, laboratorio || null));
    } catch (problema) {
      setError((problema as Error).message);
      setEventos([]);
    }
  }, [api, desde, hasta, laboratorio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    const lista = eventos ?? [];
    const horas = lista.reduce((suma, e) => {
      const [hi] = e.hora_inicio.split(":").map(Number);
      const [hf] = e.hora_fin.split(":").map(Number);
      return suma + (hf! - hi!);
    }, 0);
    const perdidas = lista
      .filter((e) => e.asistencia === "No asistió")
      .reduce((suma, e) => {
        const [hi] = e.hora_inicio.split(":").map(Number);
        const [hf] = e.hora_fin.split(":").map(Number);
        return suma + (hf! - hi!);
      }, 0);
    return { total: lista.length, horas, perdidas };
  }, [eventos]);

  const porFecha = new Map<string, EventoCalendario[]>();
  for (const evento of eventos ?? []) {
    const lista = porFecha.get(evento.fecha_uso) ?? [];
    lista.push(evento);
    porFecha.set(evento.fecha_uso, lista);
  }

  return (
    <>
      <Encabezado
        titulo="Calendario general"
        texto="Todas las reservaciones del periodo, con su estado de asistencia. Es la vista única del uso de los laboratorios."
      />

      <div className="barra-fecha">
        <Campo id="desde" etiqueta="Desde">
          <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Campo>
        <Campo id="hasta" etiqueta="Hasta">
          <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Campo>
        <Campo id="filtro-lab" etiqueta="Laboratorio">
          <select
            id="filtro-lab"
            value={laboratorio}
            onChange={(e) => setLaboratorio(Number(e.target.value))}
          >
            <option value={0}>Todos</option>
            {laboratorios.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.clave} · {lab.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {error && <Aviso tipo="mal">{error}</Aviso>}

      {eventos && eventos.length > 0 && (
        <div className="rejilla cifras" style={{ marginBottom: 18 }}>
          <Cifra numero={resumen.total} etiqueta="Reservaciones en el periodo" />
          <Cifra numero={resumen.horas} etiqueta="Horas-laboratorio apartadas" />
          <Cifra numero={resumen.perdidas} etiqueta="Horas perdidas por inasistencia" />
        </div>
      )}

      {!eventos ? (
        <Cargando que="el calendario" />
      ) : eventos.length === 0 ? (
        <Aviso tipo="neutro">No hay reservaciones en el periodo seleccionado.</Aviso>
      ) : (
        <div className="calendario">
          {[...porFecha.entries()].map(([fecha, lista]) => (
            <div className="lab-fila" key={fecha}>
              <div className="lab-cab">
                <h3>{fechaLarga(fecha)}</h3>
                <span className="sitio">
                  {lista.length} {lista.length === 1 ? "reservación" : "reservaciones"}
                </span>
              </div>
              <div style={{ padding: "0 16px 8px" }}>
                <Tabla columnas={["Folio", "Laboratorio", "Horario", "Docente", "Estatus", "Asistencia", ""]}>
                  {lista.map((evento) => (
                    <tr key={evento.id}>
                      <td>{evento.folio}</td>
                      <td>{evento.laboratorio}</td>
                      <td className="num">
                        {evento.hora_inicio}–{evento.hora_fin}
                      </td>
                      <td>{evento.docente}</td>
                      <td>
                        <PastillaEstatus clave={evento.estatus_clave} nombre={evento.estatus} />
                      </td>
                      <td>
                        <Pastilla
                          texto={evento.asistencia}
                          color={COLOR_ASISTENCIA[evento.asistencia] ?? "gris"}
                        />
                      </td>
                      <td>
                        <button className="boton secundario chico" onClick={() => setDetalle(evento)}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </Tabla>
              </div>
            </div>
          ))}
        </div>
      )}

      {detalle && (
        <Modal
          titulo={`Reservación ${detalle.folio}`}
          onCerrar={() => setDetalle(null)}
          acciones={
            <button className="boton secundario" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          }
        >
          <Tabla columnas={["Dato", "Valor"]}>
            <tr>
              <td>Laboratorio</td>
              <td>
                {detalle.laboratorio} · {detalle.laboratorio_nombre}
              </td>
            </tr>
            <tr>
              <td>Fecha y horario</td>
              <td>
                {fechaLarga(detalle.fecha_uso)}, de {detalle.hora_inicio} a {detalle.hora_fin}
              </td>
            </tr>
            <tr>
              <td>Docente</td>
              <td>{detalle.docente}</td>
            </tr>
            <tr>
              <td>Grupo o materia</td>
              <td>{detalle.grupo_materia}</td>
            </tr>
            <tr>
              <td>Motivo de uso</td>
              <td>{detalle.motivo_uso}</td>
            </tr>
            <tr>
              <td>Estatus</td>
              <td>
                <PastillaEstatus clave={detalle.estatus_clave} nombre={detalle.estatus} />
              </td>
            </tr>
            <tr>
              <td>Asistencia</td>
              <td>
                <Pastilla
                  texto={detalle.asistencia}
                  color={COLOR_ASISTENCIA[detalle.asistencia] ?? "gris"}
                />
                {detalle.minutos_retraso !== null && (
                  <span className="ayuda"> · check-in con {detalle.minutos_retraso} min de retraso</span>
                )}
              </td>
            </tr>
          </Tabla>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// HU-10 · Bloqueo por mantenimiento o evento
// =====================================================================

export function Bloqueos({ api }: { api: Api }) {
  const laboratorios = usarLaboratorios(api);
  const [bloqueos, setBloqueos] = useState<Bloqueo[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [laboratorio, setLaboratorio] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [inicio, setInicio] = useState(enDias(1));
  const [fin, setFin] = useState(enDias(3));
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setBloqueos(await api.bloqueos());
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    setError("");
    try {
      await api.crearBloqueo({
        laboratorio_id: laboratorio || (laboratorios[0]?.id ?? 0),
        motivo,
        fecha_inicio: inicio,
        fecha_fin: fin,
      });
      setAbierto(false);
      setMotivo("");
      setMensaje(
        "Bloqueo registrado. El laboratorio dejó de ofrecerse en esas fechas y las reservaciones que tenía se cancelaron, sin contar como inasistencia.",
      );
      await cargar();
    } catch (problema) {
      setError((problema as Error).message);
    }
  }

  if (!bloqueos) return <Cargando que="los bloqueos" />;

  return (
    <>
      <Encabezado
        titulo="Bloqueos por mantenimiento"
        texto="Un laboratorio bloqueado deja de ofrecerse durante el periodo. Las reservaciones vigentes en esas fechas se cancelan y el docente recibe el aviso."
        accion={
          <button className="boton" onClick={() => setAbierto(true)}>
            Registrar un bloqueo
          </button>
        }
      />

      {mensaje && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="bien">{mensaje}</Aviso>
        </div>
      )}

      {bloqueos.length === 0 ? (
        <Aviso tipo="neutro">No hay bloqueos registrados.</Aviso>
      ) : (
        <Tarjeta>
          <Tabla columnas={["Laboratorio", "Motivo", "Desde", "Hasta", "Registró", "Estado"]}>
            {bloqueos.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.laboratorio}</strong>
                </td>
                <td>{b.motivo}</td>
                <td className="num">{fechaCorta(b.fecha_inicio)}</td>
                <td className="num">{fechaCorta(b.fecha_fin)}</td>
                <td>{b.registrado_por}</td>
                <td>
                  <Pastilla
                    texto={b.vigente ? "Vigente" : "Concluido"}
                    color={b.vigente ? "ambar" : "gris"}
                  />
                </td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      )}

      {abierto && (
        <Modal
          titulo="Registrar un bloqueo"
          onCerrar={() => setAbierto(false)}
          acciones={
            <>
              <button className="boton secundario" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button className="boton" onClick={() => void guardar()}>
                Registrar bloqueo
              </button>
            </>
          }
        >
          {error && (
            <div style={{ marginBottom: 12 }}>
              <Aviso tipo="mal">{error}</Aviso>
            </div>
          )}
          <div className="campos">
            <Campo id="b-lab" etiqueta="Laboratorio" ancho>
              <select
                id="b-lab"
                value={laboratorio || laboratorios[0]?.id || 0}
                onChange={(e) => setLaboratorio(Number(e.target.value))}
              >
                {laboratorios.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.clave} · {lab.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="b-motivo" etiqueta="Motivo" ancho>
              <input
                id="b-motivo"
                value={motivo}
                placeholder="Mantenimiento preventivo de equipos"
                onChange={(e) => setMotivo(e.target.value)}
              />
            </Campo>
            <Campo id="b-inicio" etiqueta="Desde">
              <input id="b-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </Campo>
            <Campo id="b-fin" etiqueta="Hasta">
              <input id="b-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
            </Campo>
          </div>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// HU-21 · Configuración de las reglas de préstamo
// =====================================================================

export function Parametros({ api }: { api: Api }) {
  const [parametros, setParametros] = useState<Parametro[] | null>(null);
  const [bitacora, setBitacora] = useState<CambioParametro[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    const [lista, historial] = await Promise.all([api.parametros(), api.bitacoraParametros()]);
    setParametros(lista);
    setBitacora(historial);
    setValores(Object.fromEntries(lista.map((p) => [p.clave, p.valor])));
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(clave: string) {
    setMensaje("");
    setErrores((previo) => ({ ...previo, [clave]: "" }));
    try {
      await api.guardarParametro(clave, valores[clave] ?? "");
      setMensaje(`${clave} guardado. Las nuevas reservaciones ya se validan con el valor actualizado.`);
      await cargar();
    } catch (problema) {
      setErrores((previo) => ({ ...previo, [clave]: (problema as Error).message }));
    }
  }

  if (!parametros) return <Cargando que="los parámetros" />;

  return (
    <>
      <Encabezado
        titulo="Reglas de préstamo"
        texto="Los nueve parámetros que gobiernan el préstamo. Cambiarlos no requiere tocar el código: las validaciones los leen en cada operación."
      />

      {mensaje && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="bien">{mensaje}</Aviso>
        </div>
      )}

      <div className="rejilla">
        {parametros.map((p) => (
          <Tarjeta key={p.clave}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "start" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <h3 style={{ fontSize: 16 }}>
                  {p.clave} · {p.nombre}
                </h3>
                <p style={{ fontSize: 14, color: "var(--tinta-suave)", margin: "6px 0 0" }}>
                  {p.descripcion}
                </p>
                {p.minimo !== null && (
                  <p className="ayuda" style={{ marginTop: 6 }}>
                    Valor permitido: de {p.minimo} a {p.maximo} {p.unidad}.
                  </p>
                )}
                {errores[p.clave] && (
                  <p className="ayuda mal" style={{ marginTop: 6 }}>
                    {errores[p.clave]}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <Campo id={`p-${p.clave}`} etiqueta={p.unidad ?? "Valor"}>
                  <input
                    id={`p-${p.clave}`}
                    value={valores[p.clave] ?? ""}
                    style={{ width: 110 }}
                    onChange={(e) =>
                      setValores((previo) => ({ ...previo, [p.clave]: e.target.value }))
                    }
                  />
                </Campo>
                <button
                  className="boton"
                  disabled={(valores[p.clave] ?? "") === p.valor}
                  onClick={() => void guardar(p.clave)}
                >
                  Guardar
                </button>
              </div>
            </div>
          </Tarjeta>
        ))}
      </div>

      <div className="seccion">
        <h2>Historial de cambios</h2>
        <Tarjeta>
          {bitacora.length === 0 ? (
            <p className="vacio">Aún no se ha modificado ningún parámetro.</p>
          ) : (
            <Tabla columnas={["Cuándo", "Parámetro", "Antes", "Después", "Quién"]}>
              {bitacora.map((c, i) => (
                <tr key={`${c.clave}-${i}`}>
                  <td>{new Date(c.ocurrido_en).toLocaleString("es-MX")}</td>
                  <td>
                    {c.clave} · {c.nombre}
                  </td>
                  <td className="num">{c.valor_anterior}</td>
                  <td className="num">
                    <strong>{c.valor_nuevo}</strong>
                  </td>
                  <td>{c.usuario}</td>
                </tr>
              ))}
            </Tabla>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

// =====================================================================
// HU-19 · Control de inasistencias reincidentes
// =====================================================================

export function Docentes({ api }: { api: Api }) {
  const [docentes, setDocentes] = useState<DocenteResumen[] | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [detalle, setDetalle] = useState<{
    docente: DocenteResumen;
    situacion: SituacionDocente;
    historial: RenglonHistorial[];
  } | null>(null);

  const cargar = useCallback(async () => {
    setDocentes(await api.docentes());
  }, [api]);

  useEffect(() => {
    void cargar().catch(() => setDocentes([]));
  }, [cargar]);

  /* El servidor revisa la tolerancia cada minuto por su cuenta. Este botón
     dispara la misma revisión en el momento, para poder demostrarla. */
  async function revisarTolerancias() {
    const liberadas = await api.liberarInasistencias();
    setMensaje(
      liberadas.length === 0
        ? "No hay reservaciones vencidas: ninguna tolerancia expiró sin check-in."
        : `Se liberaron ${liberadas.length} reservaciones por inasistencia: ` +
          liberadas
            .map((l) => `${l.ret_folio} (${l.ret_laboratorio}, ${l.ret_horas_perdidas} h perdidas)`)
            .join(", ") + ".",
    );
    await cargar();
  }

  async function abrir(docente: DocenteResumen) {
    const { situacion, historial } = await api.historialDocente(docente.id);
    setDetalle({ docente, situacion, historial });
  }

  if (!docentes) return <Cargando que="los docentes" />;

  return (
    <>
      <Encabezado
        titulo="Asistencia por docente"
        texto="Inasistencias dentro del periodo vigente y la restricción que le corresponde a cada quien. Las faltas dejan de pesar al salir del periodo configurado en P-02."
        accion={
          <button className="boton secundario" onClick={() => void revisarTolerancias()}>
            Revisar tolerancias ahora
          </button>
        }
      />

      {mensaje && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="neutro">{mensaje}</Aviso>
        </div>
      )}

      <Tarjeta>
        <Tabla columnas={["Docente", "Correo", "Reservaciones", "Faltas vigentes", "Situación", ""]}>
          {docentes.map((d) => (
            <tr key={d.id}>
              <td>{d.nombre}</td>
              <td>{d.correo}</td>
              <td className="num">{d.reservaciones}</td>
              <td className="num">{d.faltas}</td>
              <td>
                <Pastilla texto={TEXTO_NIVEL[d.nivel]} color={COLOR_NIVEL[d.nivel]} />
              </td>
              <td>
                <button className="boton secundario chico" onClick={() => void abrir(d)}>
                  Ver historial
                </button>
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>

      {detalle && (
        <Modal
          titulo={detalle.docente.nombre}
          onCerrar={() => setDetalle(null)}
          acciones={
            <button className="boton secundario" onClick={() => setDetalle(null)}>
              Cerrar
            </button>
          }
        >
          <div style={{ marginBottom: 14 }}>
            <Aviso tipo={detalle.situacion.nivel === "ninguna" ? "bien" : "mal"}>
              {detalle.situacion.mensaje}
            </Aviso>
          </div>

          {detalle.historial.length === 0 ? (
            <p className="vacio">Este docente no tiene reservaciones registradas.</p>
          ) : (
            <Tabla columnas={["Folio", "Lab", "Fecha", "Horario", "Estatus", "Asistencia"]}>
              {detalle.historial.map((r) => (
                <tr key={r.folio}>
                  <td>{r.folio}</td>
                  <td>{r.laboratorio}</td>
                  <td className="num">{fechaCorta(r.fecha_uso)}</td>
                  <td className="num">
                    {r.hora_inicio}–{r.hora_fin}
                  </td>
                  <td>
                    <PastillaEstatus clave={r.estatus_clave} nombre={r.estatus} />
                  </td>
                  <td style={{ fontSize: 13.5 }}>
                    {r.checkin_en
                      ? `Check-in con ${r.minutos_retraso} min de retraso`
                      : r.horas_perdidas
                        ? `${r.horas_perdidas} h perdidas`
                        : "—"}
                  </td>
                </tr>
              ))}
            </Tabla>
          )}
        </Modal>
      )}
    </>
  );
}
