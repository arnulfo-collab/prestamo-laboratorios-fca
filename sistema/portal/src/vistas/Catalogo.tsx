/** HU-09 · Catálogo de laboratorios y horarios. Incluye la vista de usuarios y roles. */
import { useCallback, useEffect, useState } from "react";
import type { Api } from "../api";
import {
  Aviso,
  Campo,
  Cargando,
  Encabezado,
  Modal,
  Pastilla,
  Tabla,
  Tarjeta,
  fechaCorta,
} from "../componentes";
import {
  DIAS,
  type BloqueHorario,
  type DatosLaboratorio,
  type Laboratorio,
  type ReservacionFutura,
  type UsuarioListado,
} from "../tipos";

const VACIO: DatosLaboratorio = {
  clave: "",
  nombre: "",
  capacidad: 0,
  ubicacion: "",
  equipamiento: "",
  horarios: [],
};

export function Catalogo({ api }: { api: Api }) {
  const [laboratorios, setLaboratorios] = useState<Laboratorio[] | null>(null);
  const [edicion, setEdicion] = useState<{ id: number | null; datos: DatosLaboratorio } | null>(null);
  const [baja, setBaja] = useState<{ lab: Laboratorio; afectadas: ReservacionFutura[] } | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLaboratorios(await api.laboratorios());
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function pedirBaja(lab: Laboratorio) {
    setBaja({ lab, afectadas: await api.reservacionesFuturas(lab.id) });
  }

  async function cambiarEstado(lab: Laboratorio, activo: boolean) {
    await api.cambiarEstadoLaboratorio(lab.id, activo);
    setBaja(null);
    setMensaje(
      activo
        ? `${lab.clave} volvió a ofrecerse en el catálogo.`
        : `${lab.clave} quedó desactivado y dejó de ofrecerse. Su historial se conserva.`,
    );
    await cargar();
  }

  if (edicion) {
    return (
      <Formulario
        titulo={edicion.id === null ? "Alta de laboratorio" : `Editar ${edicion.datos.clave}`}
        inicial={edicion.datos}
        onCancelar={() => setEdicion(null)}
        onGuardar={async (datos) => {
          if (edicion.id === null) await api.crearLaboratorio(datos);
          else await api.actualizarLaboratorio(edicion.id, datos);
          setEdicion(null);
          setMensaje(
            edicion.id === null
              ? `Laboratorio ${datos.clave.toUpperCase()} dado de alta. Ya aparece para los docentes.`
              : `Cambios de ${datos.clave.toUpperCase()} guardados. La vista de los docentes ya los refleja.`,
          );
          await cargar();
        }}
      />
    );
  }

  if (!laboratorios) return <Cargando que="el catálogo" />;

  return (
    <>
      <Encabezado
        titulo="Catálogo de laboratorios"
        texto="Alta, edición y baja de los espacios con su capacidad y sus horarios."
        accion={
          <button className="boton" onClick={() => setEdicion({ id: null, datos: { ...VACIO } })}>
            Dar de alta un laboratorio
          </button>
        }
      />

      {mensaje && (
        <div className="seccion" style={{ marginTop: 0, marginBottom: 16 }}>
          <Aviso tipo="bien">{mensaje}</Aviso>
        </div>
      )}
      {error && (
        <div className="seccion" style={{ marginTop: 0, marginBottom: 16 }}>
          <Aviso tipo="mal">{error}</Aviso>
        </div>
      )}

      <Tarjeta>
        <Tabla
          columnas={[
            "Clave",
            "Nombre",
            "Capacidad",
            "Ubicación",
            "Bloques",
            "Horas/semana",
            "Estado",
            "Acciones",
          ]}
        >
          {laboratorios.map((lab) => (
            <tr key={lab.id}>
              <td>
                <strong>{lab.clave}</strong>
              </td>
              <td>{lab.nombre}</td>
              <td className="num">{lab.capacidad}</td>
              <td>{lab.ubicacion}</td>
              <td className="num">{lab.bloques_horario}</td>
              <td className="num">{lab.horas_semana}</td>
              <td>
                <Pastilla texto={lab.activo ? "Activo" : "Inactivo"} color={lab.activo ? "verde" : "gris"} />
              </td>
              <td>
                <div className="acciones">
                  <button
                    className="boton secundario chico"
                    onClick={() =>
                      setEdicion({
                        id: lab.id,
                        datos: {
                          clave: lab.clave,
                          nombre: lab.nombre,
                          capacidad: lab.capacidad,
                          ubicacion: lab.ubicacion,
                          equipamiento: lab.equipamiento,
                          horarios: lab.horarios.map((h) => ({ ...h })),
                        },
                      })
                    }
                  >
                    Editar
                  </button>
                  {lab.activo ? (
                    <button className="boton secundario chico" onClick={() => void pedirBaja(lab)}>
                      Desactivar
                    </button>
                  ) : (
                    <button
                      className="boton secundario chico"
                      onClick={() => void cambiarEstado(lab, true).catch((e) => setError((e as Error).message))}
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>

      {baja && (
        <Modal
          titulo={`Desactivar ${baja.lab.clave}`}
          onCerrar={() => setBaja(null)}
          acciones={
            <>
              <button className="boton secundario" onClick={() => setBaja(null)}>
                Cancelar
              </button>
              <button
                className={`boton${baja.afectadas.length ? " riesgo" : ""}`}
                onClick={() => void cambiarEstado(baja.lab, false)}
              >
                {baja.afectadas.length ? "Desactivar de todos modos" : "Desactivar"}
              </button>
            </>
          }
        >
          {baja.afectadas.length === 0 ? (
            <p>
              Este laboratorio no tiene reservaciones aprobadas a futuro. Al desactivarlo dejará de
              ofrecerse a los docentes y su historial se conserva.
            </p>
          ) : (
            <>
              <p>
                <strong>Atención.</strong> {baja.lab.nombre} tiene {baja.afectadas.length}{" "}
                {baja.afectadas.length === 1 ? "reservación aprobada" : "reservaciones aprobadas"} a
                futuro. Si lo desactivas,{" "}
                {baja.afectadas.length === 1 ? "esa reservación quedará" : "esas reservaciones quedarán"}{" "}
                sin espacio asignado y habrá que avisar al docente.
              </p>
              <Tabla columnas={["Folio", "Fecha", "Horario", "Docente"]}>
                {baja.afectadas.map((r) => (
                  <tr key={r.folio}>
                    <td>{r.folio}</td>
                    <td className="num">{fechaCorta(r.fecha_uso)}</td>
                    <td className="num">
                      {r.hora_inicio}–{r.hora_fin}
                    </td>
                    <td>{r.docente}</td>
                  </tr>
                ))}
              </Tabla>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Formulario({
  titulo,
  inicial,
  onGuardar,
  onCancelar,
}: {
  titulo: string;
  inicial: DatosLaboratorio;
  onGuardar: (datos: DatosLaboratorio) => Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosLaboratorio>(inicial);
  const [dia, setDia] = useState(1);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [errorHorario, setErrorHorario] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo: keyof DatosLaboratorio, valor: string | number) =>
    setDatos((previo) => ({ ...previo, [campo]: valor }));

  const minutos = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h! * 60 + (m ?? 0);
  };

  function agregarBloque() {
    if (!inicio || !fin) {
      setErrorHorario("Indica la hora de inicio y la de fin.");
      return;
    }
    if (minutos(fin) <= minutos(inicio)) {
      setErrorHorario("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    if (datos.horarios.some((h) => h.dia_semana === dia && h.hora_inicio === inicio)) {
      setErrorHorario(`Ya existe un bloque de ${DIAS[dia]} que empieza a las ${inicio}.`);
      return;
    }
    setErrorHorario("");
    const nuevo: BloqueHorario = { dia_semana: dia, hora_inicio: inicio, hora_fin: fin };
    setDatos((previo) => ({
      ...previo,
      horarios: [...previo.horarios, nuevo].sort(
        (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio),
      ),
    }));
  }

  const horasSemana =
    Math.round(
      datos.horarios.reduce((s, h) => s + (minutos(h.hora_fin) - minutos(h.hora_inicio)) / 60, 0) * 10,
    ) / 10;

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ ...datos, capacidad: Number(datos.capacidad) });
    } catch (problema) {
      setError((problema as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Encabezado
        titulo={titulo}
        texto="Las mismas reglas están declaradas en la base de datos, de modo que un dato inválido se rechaza aunque no pase por esta pantalla."
      />

      {error && (
        <div className="seccion" style={{ marginTop: 0, marginBottom: 16 }}>
          <Aviso tipo="mal">{error}</Aviso>
        </div>
      )}

      <Tarjeta>
        <div className="campos">
          <Campo id="f-clave" etiqueta="Clave">
            <input id="f-clave" value={datos.clave} onChange={(e) => cambiar("clave", e.target.value)} />
          </Campo>
          <Campo id="f-nombre" etiqueta="Nombre">
            <input id="f-nombre" value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
          </Campo>
          <Campo id="f-capacidad" etiqueta="Capacidad (1 a 100 equipos)">
            <input
              id="f-capacidad"
              type="number"
              value={datos.capacidad || ""}
              onChange={(e) => cambiar("capacidad", Number(e.target.value))}
            />
          </Campo>
          <Campo id="f-ubicacion" etiqueta="Ubicación">
            <input
              id="f-ubicacion"
              value={datos.ubicacion}
              onChange={(e) => cambiar("ubicacion", e.target.value)}
            />
          </Campo>
          <Campo id="f-equipamiento" etiqueta="Equipamiento" ancho>
            <input
              id="f-equipamiento"
              value={datos.equipamiento ?? ""}
              onChange={(e) => cambiar("equipamiento", e.target.value)}
            />
          </Campo>
        </div>

        <div className="seccion">
          <h2>Horarios ofertados</h2>
          <div className="campos" style={{ alignItems: "end" }}>
            <Campo id="h-dia" etiqueta="Día">
              <select id="h-dia" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {DIAS[d]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="h-inicio" etiqueta="Inicio">
              <input id="h-inicio" type="time" step={900} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </Campo>
            <Campo id="h-fin" etiqueta="Fin">
              <input id="h-fin" type="time" step={900} value={fin} onChange={(e) => setFin(e.target.value)} />
            </Campo>
            <Campo id="h-agregar" etiqueta="&nbsp;">
              <button id="h-agregar" className="boton secundario" onClick={agregarBloque}>
                Agregar bloque
              </button>
            </Campo>
          </div>
          {errorHorario && (
            <div className="ayuda mal" style={{ marginTop: 8 }}>
              {errorHorario}
            </div>
          )}

          {datos.horarios.length === 0 ? (
            <div style={{ marginTop: 14 }}>
              <Aviso tipo="neutro">
                Este laboratorio aún no tiene horarios. Mientras no los tenga, no aparecerá como
                disponible para los docentes.
              </Aviso>
            </div>
          ) : (
            <>
              <div style={{ marginTop: 14 }}>
                <Tabla columnas={["Día", "Inicio", "Fin", "Horas", ""]}>
                  {datos.horarios.map((h, i) => (
                    <tr key={`${h.dia_semana}-${h.hora_inicio}`}>
                      <td>{DIAS[h.dia_semana]}</td>
                      <td className="num">{h.hora_inicio}</td>
                      <td className="num">{h.hora_fin}</td>
                      <td className="num">{(minutos(h.hora_fin) - minutos(h.hora_inicio)) / 60}</td>
                      <td>
                        <button
                          className="boton secundario chico"
                          onClick={() =>
                            setDatos((previo) => ({
                              ...previo,
                              horarios: previo.horarios.filter((_, j) => j !== i),
                            }))
                          }
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </Tabla>
              </div>
              <p className="ayuda" style={{ marginTop: 8 }}>
                {datos.horarios.length} bloques · {horasSemana} horas por semana.
              </p>
            </>
          )}
        </div>

        <div className="acciones" style={{ marginTop: 22 }}>
          <button className="boton" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button className="boton secundario" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </Tarjeta>
    </>
  );
}

export function Usuarios({ api }: { api: Api }) {
  const [usuarios, setUsuarios] = useState<UsuarioListado[] | null>(null);

  useEffect(() => {
    void api.usuarios().then(setUsuarios).catch(() => setUsuarios([]));
  }, [api]);

  if (!usuarios) return <Cargando que="los usuarios" />;

  return (
    <>
      <Encabezado
        titulo="Usuarios y roles"
        texto="Cada usuario tiene un solo rol y el rol determina a qué secciones puede entrar. La contraseña no se guarda: se almacena su hash y la comparación se hace sobre el hash."
      />
      <Tarjeta>
        <Tabla columnas={["Empleado", "Nombre", "Correo institucional", "Rol", "Estado"]}>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td className="num">{u.numero_empleado}</td>
              <td>{u.nombre}</td>
              <td>{u.correo}</td>
              <td>{u.rol_nombre}</td>
              <td>
                <Pastilla texto={u.activo ? "Activo" : "Inactivo"} color={u.activo ? "verde" : "gris"} />
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </>
  );
}
