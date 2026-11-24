/**
 * Núcleo de reservación del Sprint 2.
 *
 *   Calendario      · HU-03 consulta de disponibilidad
 *   NuevaSolicitud  · HU-04 registro con folio, HU-20 límites por docente
 *   MisSolicitudes  · HU-05 seguimiento del estatus
 *   Pendientes      · HU-12 prevención de empalmes
 */
import { useCallback, useEffect, useState } from "react";
import type { Api } from "../api";
import {
  Aviso,
  Campo,
  Cargando,
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
  BloqueDisponibilidad,
  SituacionDocente,
  Solicitud,
  SolicitudPendiente,
  Usuario,
} from "../tipos";

// =====================================================================
// HU-03 · Calendario de disponibilidad
// =====================================================================

export function Calendario({ api, usuario }: { api: Api; usuario: Usuario }) {
  const [fecha, setFecha] = useState(enDias(1));
  const [bloques, setBloques] = useState<BloqueDisponibilidad[] | null>(null);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState<BloqueDisponibilidad | null>(null);
  const [folio, setFolio] = useState("");

  const cargar = useCallback(async () => {
    setBloques(null);
    setError("");
    try {
      setBloques(await api.disponibilidad(fecha));
    } catch (problema) {
      setError((problema as Error).message);
      setBloques([]);
    }
  }, [api, fecha]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porLaboratorio = new Map<number, BloqueDisponibilidad[]>();
  for (const bloque of bloques ?? []) {
    const lista = porLaboratorio.get(bloque.laboratorio_id) ?? [];
    lista.push(bloque);
    porLaboratorio.set(bloque.laboratorio_id, lista);
  }

  const libres = (bloques ?? []).filter((b) => b.estado === "libre").length;
  const ocupados = (bloques ?? []).filter((b) => b.estado === "ocupado").length;

  return (
    <>
      <Encabezado
        titulo="Disponibilidad de laboratorios"
        texto={
          usuario.rol === "docente"
            ? "Elige una fecha y selecciona un bloque libre para registrar tu solicitud."
            : "Estado de cada bloque horario en la fecha seleccionada."
        }
      />

      {folio && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="bien">
            Tu solicitud quedó registrada con el folio <strong>{folio}</strong> en estatus
            Solicitada. El encargado de laboratorios la revisará.
          </Aviso>
        </div>
      )}

      <div className="barra-fecha">
        <Campo id="fecha" etiqueta="Fecha">
          <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <div style={{ paddingBottom: 2 }}>
          <div style={{ fontSize: 14.5 }}>{fechaLarga(fecha)}</div>
          {bloques && (
            <div className="ayuda">
              {libres} bloques libres · {ocupados} ocupados
            </div>
          )}
        </div>
      </div>

      <div className="leyenda">
        <span>
          <i className="muestra libre" /> Libre
        </span>
        <span>
          <i className="muestra ocupado" /> Ocupado
        </span>
        <span>
          <i className="muestra bloqueado" /> Bloqueado por mantenimiento
        </span>
      </div>

      {error && <Aviso tipo="mal">{error}</Aviso>}
      {!bloques ? (
        <Cargando que="la disponibilidad" />
      ) : bloques.length === 0 ? (
        <Aviso tipo="neutro">
          Ningún laboratorio publica horarios para ese día. Los laboratorios de la facultad operan de
          lunes a viernes.
        </Aviso>
      ) : (
        <div className="calendario">
          {[...porLaboratorio.values()].map((lista) => {
            const primero = lista[0]!;
            return (
              <div className="lab-fila" key={primero.laboratorio_id}>
                <div className="lab-cab">
                  <h3>
                    {primero.clave} · {primero.laboratorio}
                  </h3>
                  <span className="sitio">{primero.capacidad} lugares</span>
                </div>
                <div className="bloques">
                  {lista.map((bloque) => {
                    const etiqueta = `${bloque.hora_inicio}–${bloque.hora_fin}`;
                    const contenido = (
                      <>
                        <div className="hora">{etiqueta}</div>
                        <div className="quien">
                          {bloque.estado === "libre"
                            ? usuario.rol === "docente"
                              ? "Disponible · apartar"
                              : "Disponible"
                            : bloque.estado === "bloqueado"
                              ? "No disponible"
                              : `${bloque.docente} · ${bloque.grupo_materia}`}
                        </div>
                      </>
                    );
                    return bloque.estado === "libre" && usuario.rol === "docente" ? (
                      <button
                        key={etiqueta}
                        className="bloque libre"
                        onClick={() => setEligiendo(bloque)}
                      >
                        {contenido}
                      </button>
                    ) : (
                      <div key={etiqueta} className={`bloque ${bloque.estado}`}>
                        {contenido}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {eligiendo && (
        <NuevaSolicitud
          api={api}
          fecha={fecha}
          bloque={eligiendo}
          onCerrar={() => setEligiendo(null)}
          onRegistrada={async (nuevoFolio) => {
            setEligiendo(null);
            setFolio(nuevoFolio);
            await cargar();
          }}
        />
      )}
    </>
  );
}

// =====================================================================
// HU-04 · Registro de solicitud  ·  HU-20 · Límites por docente
// =====================================================================

function NuevaSolicitud({
  api,
  fecha,
  bloque,
  onCerrar,
  onRegistrada,
}: {
  api: Api;
  fecha: string;
  bloque: BloqueDisponibilidad;
  onCerrar: () => void;
  onRegistrada: (folio: string) => Promise<void>;
}) {
  const [inicio, setInicio] = useState(bloque.hora_inicio);
  const [fin, setFin] = useState(bloque.hora_fin);
  const [grupo, setGrupo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const folio = await api.crearSolicitud({
        laboratorio_id: bloque.laboratorio_id,
        fecha_uso: fecha,
        hora_inicio: inicio,
        hora_fin: fin,
        grupo_materia: grupo,
        motivo_uso: motivo,
      });
      await onRegistrada(folio);
    } catch (problema) {
      setError((problema as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={`Solicitar ${bloque.clave}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <button className="boton secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="boton" onClick={() => void enviar()} disabled={enviando}>
            {enviando ? "Registrando…" : "Registrar solicitud"}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: "var(--tinta-suave)", fontSize: 14.5 }}>
        {bloque.laboratorio} · {fechaLarga(fecha)} · bloque de {bloque.hora_inicio} a{" "}
        {bloque.hora_fin}
      </p>

      {error && (
        <div style={{ margin: "12px 0" }}>
          <Aviso tipo="mal">{error}</Aviso>
        </div>
      )}

      <div className="campos">
        <Campo id="s-inicio" etiqueta="Hora de inicio">
          <input id="s-inicio" type="time" step={900} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo
          id="s-fin"
          etiqueta="Hora de fin"
          ayuda="No puede exceder el bloque publicado."
        >
          <input id="s-fin" type="time" step={900} value={fin} onChange={(e) => setFin(e.target.value)} />
        </Campo>
        <Campo id="s-grupo" etiqueta="Grupo o materia" ancho>
          <input
            id="s-grupo"
            value={grupo}
            placeholder="Informática Administrativa · Grupo 421"
            onChange={(e) => setGrupo(e.target.value)}
          />
        </Campo>
        <Campo id="s-motivo" etiqueta="Motivo de uso" ancho>
          <textarea
            id="s-motivo"
            value={motivo}
            placeholder="Práctica de hoja de cálculo con el grupo completo"
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      </div>
    </Modal>
  );
}

// =====================================================================
// HU-05 · Seguimiento del estatus
// =====================================================================

export function MisSolicitudes({ api }: { api: Api }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [situacion, setSituacion] = useState<SituacionDocente | null>(null);
  const [detalle, setDetalle] = useState<Solicitud | null>(null);
  const [cancelando, setCancelando] = useState<Solicitud | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [lista, mia] = await Promise.all([api.misSolicitudes(), api.miSituacion()]);
    setSolicitudes(lista);
    setSituacion(mia);
  }, [api]);

  useEffect(() => {
    void cargar().catch(() => setSolicitudes([]));
  }, [cargar]);

  async function cancelar() {
    if (!cancelando) return;
    setError("");
    try {
      await api.cancelar(cancelando.id);
      setMensaje(
        `La reservación ${cancelando.folio} quedó cancelada. El horario volvió a estar disponible y no se te contabiliza como inasistencia.`,
      );
      setCancelando(null);
      await cargar();
    } catch (problema) {
      setError((problema as Error).message);
      setCancelando(null);
    }
  }

  async function checkin(solicitud: Solicitud) {
    setError("");
    setMensaje("");
    try {
      const retraso = await api.checkin(solicitud.id);
      setMensaje(
        `Check-in registrado para ${solicitud.folio}` +
          (retraso > 0 ? `, con ${retraso} minuto(s) de retraso.` : ", puntual.") +
          " La reservación pasó a En curso.",
      );
      await cargar();
    } catch (problema) {
      setError((problema as Error).message);
    }
  }

  if (!solicitudes) return <Cargando que="tus solicitudes" />;

  const activas = solicitudes.filter((s) =>
    ["solicitada", "aprobada", "confirmada", "en_curso"].includes(s.estatus_clave),
  ).length;

  return (
    <>
      <Encabezado
        titulo="Mis solicitudes"
        texto="Cada solicitud con su folio, su laboratorio y su estatus. Desde aquí registras tu asistencia o cancelas la que ya no usarás."
      />

      {mensaje && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="bien">{mensaje}</Aviso>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="mal">{error}</Aviso>
        </div>
      )}
      {situacion && situacion.nivel !== "ninguna" && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="mal">
            <strong>Atención.</strong> {situacion.mensaje}
          </Aviso>
        </div>
      )}

      {solicitudes.length === 0 ? (
        <Aviso tipo="neutro">
          No has registrado solicitudes. Entra a <strong>Disponibilidad</strong>, elige una fecha y
          selecciona un bloque libre para apartar un laboratorio.
        </Aviso>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <Aviso tipo="neutro">
              Tienes <strong>{activas}</strong> {activas === 1 ? "reservación activa" : "reservaciones activas"} de
              un límite de 3 (parámetro P-06). Una reservación rechazada, cancelada o concluida libera
              el cupo.
            </Aviso>
          </div>

          <Tarjeta>
            <Tabla columnas={["Folio", "Laboratorio", "Fecha", "Horario", "Estatus", "Acciones"]}>
              {solicitudes.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.folio}</strong>
                    <div className="ayuda">{s.grupo_materia}</div>
                  </td>
                  <td>{s.laboratorio_clave}</td>
                  <td className="num">{fechaCorta(s.fecha_uso)}</td>
                  <td className="num">
                    {s.hora_inicio}–{s.hora_fin}
                  </td>
                  <td>
                    <PastillaEstatus clave={s.estatus_clave} nombre={s.estatus} />
                  </td>
                  <td>
                    <div className="acciones">
                      {s.puede_checkin && (
                        <button className="boton chico" onClick={() => void checkin(s)}>
                          Registrar asistencia
                        </button>
                      )}
                      {s.puede_cancelar && (
                        <button className="boton secundario chico" onClick={() => setCancelando(s)}>
                          Cancelar
                        </button>
                      )}
                      <button className="boton secundario chico" onClick={() => setDetalle(s)}>
                        Detalle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Tabla>
          </Tarjeta>
        </>
      )}

      {detalle && (
        <Modal
          titulo={`Solicitud ${detalle.folio}`}
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
                {detalle.laboratorio_clave} · {detalle.laboratorio}
              </td>
            </tr>
            <tr>
              <td>Fecha y horario</td>
              <td>
                {fechaLarga(detalle.fecha_uso)}, de {detalle.hora_inicio} a {detalle.hora_fin}
              </td>
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
            {detalle.resuelta_por && (
              <tr>
                <td>Resuelta por</td>
                <td>{detalle.resuelta_por}</td>
              </tr>
            )}
          </Tabla>

          {detalle.motivo_rechazo && (
            <div style={{ marginTop: 14 }}>
              <Aviso tipo="mal">
                <strong>Motivo del rechazo.</strong> {detalle.motivo_rechazo}
              </Aviso>
            </div>
          )}

          {detalle.marcada_no_asistio && (
            <div style={{ marginTop: 14 }}>
              <Aviso tipo="neutro">
                <strong>No asistió.</strong> El laboratorio se liberó el{" "}
                {new Date(detalle.marcada_no_asistio).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                porque no se registró el check-in dentro de la tolerancia. La falta se contabiliza
                conforme al parámetro P-02.
              </Aviso>
            </div>
          )}
        </Modal>
      )}

      {cancelando && (
        <Modal
          titulo={`Cancelar ${cancelando.folio}`}
          onCerrar={() => setCancelando(null)}
          acciones={
            <>
              <button className="boton secundario" onClick={() => setCancelando(null)}>
                Conservar la reservación
              </button>
              <button className="boton riesgo" onClick={() => void cancelar()}>
                Cancelar la reservación
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            {cancelando.laboratorio_clave} · {fechaLarga(cancelando.fecha_uso)}, de{" "}
            {cancelando.hora_inicio} a {cancelando.hora_fin}.
          </p>
          <Aviso tipo="neutro">
            El horario volverá a quedar disponible para otro docente y{" "}
            <strong>no se te contabilizará como inasistencia</strong>, porque cancelas dentro del
            plazo permitido.
          </Aviso>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// HU-12 · Prevención de empalmes
// =====================================================================

export function Pendientes({ api, onCambio }: { api: Api; onCambio: () => Promise<void> }) {
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[] | null>(null);
  const [rechazando, setRechazando] = useState<SolicitudPendiente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setSolicitudes(await api.pendientes());
    await onCambio();
  }, [api, onCambio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aprobar(solicitud: SolicitudPendiente) {
    setError("");
    setMensaje("");
    try {
      await api.aprobar(solicitud.id);
      setMensaje(`La reservación ${solicitud.folio} quedó aprobada y su horario ya aparece ocupado.`);
      await cargar();
    } catch (problema) {
      setError((problema as Error).message);
    }
  }

  async function rechazar() {
    if (!rechazando) return;
    setError("");
    setMensaje("");
    try {
      await api.rechazar(rechazando.id, motivo);
      setMensaje(`La solicitud ${rechazando.folio} quedó rechazada y el cupo del docente se liberó.`);
      setRechazando(null);
      setMotivo("");
      await cargar();
    } catch (problema) {
      setError((problema as Error).message);
    }
  }

  if (!solicitudes) return <Cargando que="las solicitudes" />;

  const enConflicto = solicitudes.filter((s) => s.conflictos.length > 0).length;

  return (
    <>
      <Encabezado
        titulo="Solicitudes por resolver"
        texto="Las solicitudes en espera, ordenadas por fecha de uso. El sistema marca las que se traslapan con otra reservación del mismo laboratorio y horario."
      />

      {mensaje && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="bien">{mensaje}</Aviso>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tipo="mal">{error}</Aviso>
        </div>
      )}

      {solicitudes.length === 0 ? (
        <Aviso tipo="neutro">No hay solicitudes en espera de resolución.</Aviso>
      ) : (
        <>
          {enConflicto > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Aviso tipo="neutro">
                <strong>
                  {enConflicto} {enConflicto === 1 ? "solicitud tiene" : "solicitudes tienen"} un
                  empalme detectado.
                </strong>{" "}
                Aprobar una bloquea automáticamente la aprobación de la otra.
              </Aviso>
            </div>
          )}

          <div className="rejilla">
            {solicitudes.map((s) => (
              <Tarjeta key={s.id}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "space-between",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 16 }}>
                      {s.folio} · {s.laboratorio_clave}
                    </h3>
                    <div style={{ fontSize: 14, color: "var(--tinta-suave)", marginTop: 3 }}>
                      {s.docente} · {fechaLarga(s.fecha_uso)}, de {s.hora_inicio} a {s.hora_fin}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 6 }}>
                      {s.grupo_materia} — {s.motivo_uso}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {s.requiere_autorizacion && (
                      <Pastilla texto="Requiere autorización" color="ambar" />
                    )}
                    {s.conflictos.length > 0 ? (
                      <Pastilla texto="Empalme detectado" color="roja" />
                    ) : (
                      <Pastilla texto="Sin conflictos" color="verde" />
                    )}
                  </div>
                </div>

                {s.requiere_autorizacion && (
                  <div style={{ marginTop: 12 }}>
                    <Aviso tipo="mal">
                      <strong>{s.docente}</strong> acumula {s.faltas_docente} inasistencias en el
                      periodo vigente. Por eso esta solicitud requiere tu autorización expresa antes
                      de aprobarse.
                    </Aviso>
                  </div>
                )}

                {s.conflictos.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Tabla columnas={["Folio en conflicto", "Docente", "Horario", "Estatus"]}>
                      {s.conflictos.map((c) => (
                        <tr key={c.conflicto_folio}>
                          <td>{c.conflicto_folio}</td>
                          <td>{c.conflicto_docente}</td>
                          <td className="num">
                            {c.conflicto_inicio}–{c.conflicto_fin}
                          </td>
                          <td>{c.conflicto_estatus}</td>
                        </tr>
                      ))}
                    </Tabla>
                  </div>
                )}

                <div className="acciones" style={{ marginTop: 14 }}>
                  <button className="boton" onClick={() => void aprobar(s)}>
                    Aprobar
                  </button>
                  <button className="boton secundario" onClick={() => setRechazando(s)}>
                    Rechazar
                  </button>
                </div>
              </Tarjeta>
            ))}
          </div>
        </>
      )}

      {rechazando && (
        <Modal
          titulo={`Rechazar ${rechazando.folio}`}
          onCerrar={() => setRechazando(null)}
          acciones={
            <>
              <button className="boton secundario" onClick={() => setRechazando(null)}>
                Cancelar
              </button>
              <button className="boton riesgo" onClick={() => void rechazar()}>
                Rechazar solicitud
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            El motivo es obligatorio y el docente lo verá en el detalle de su solicitud.
          </p>
          <Campo id="r-motivo" etiqueta="Motivo del rechazo" ancho>
            <textarea id="r-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </Modal>
      )}
    </>
  );
}
