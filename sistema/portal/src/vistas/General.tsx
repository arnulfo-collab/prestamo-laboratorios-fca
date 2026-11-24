/** Inicio, laboratorios disponibles y criterios de aceptación. */
import { useEffect, useState } from "react";
import type { Api } from "../api";
import { Aviso, Cargando, Cifra, Encabezado, Pastilla, Tabla, Tarjeta } from "../componentes";
import { DIAS, type Laboratorio, type Parametro, type Usuario } from "../tipos";

function usarLaboratorios(api: Api) {
  const [laboratorios, setLaboratorios] = useState<Laboratorio[] | null>(null);
  useEffect(() => {
    void api
      .laboratorios()
      .then(setLaboratorios)
      .catch(() => setLaboratorios([]));
  }, [api]);
  return laboratorios;
}

export function Inicio({ api, usuario }: { api: Api; usuario: Usuario }) {
  const laboratorios = usarLaboratorios(api);
  const [parametros, setParametros] = useState<Parametro[]>([]);

  useEffect(() => {
    void api.parametros().then(setParametros).catch(() => setParametros([]));
  }, [api]);

  if (!laboratorios) return <Cargando que="el resumen" />;

  const activos = laboratorios.filter((l) => l.activo);
  const lugares = activos.reduce((suma, l) => suma + l.capacidad, 0);
  const horas = activos.reduce((suma, l) => suma + l.horas_semana, 0);
  const bloques = activos.reduce((suma, l) => suma + l.bloques_horario, 0);

  const siguiente: Record<Usuario["rol"], string> = {
    docente:
      "Ya puedes apartar, cancelar a tiempo y registrar tu asistencia. Si no registras el check-in dentro de la tolerancia, el laboratorio se libera solo para otro docente.",
    administrador:
      "Desde el menú resuelves solicitudes, consultas el calendario general, registras bloqueos por mantenimiento, das seguimiento a la asistencia, ajustas las reglas de préstamo y consultas los reportes de uso.",
    coordinacion:
      "Desde el menú consultas el calendario general, la asistencia por docente y los reportes de uso con los indicadores de aprovechamiento, exportables a CSV.",
  };

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario.nombre.split(" ")[0]}`}
        texto={`Entraste como ${usuario.rol_nombre}. El menú muestra únicamente las funciones de tu rol.`}
      />

      <div className="rejilla cifras">
        <Cifra numero={activos.length} etiqueta="Laboratorios en servicio" />
        <Cifra numero={lugares} etiqueta="Lugares disponibles" />
        <Cifra numero={horas} etiqueta="Horas-laboratorio por semana" />
        <Cifra numero={bloques} etiqueta="Bloques horarios ofertados" />
      </div>

      <div className="seccion">
        <Aviso tipo="neutro">
          <strong>Lo que puedes hacer.</strong> {siguiente[usuario.rol]}
        </Aviso>
      </div>

      <div className="seccion">
        <h2>Reglas de préstamo vigentes</h2>
        <Tarjeta>
          <p style={{ margin: "0 0 12px", color: "var(--tinta-suave)", fontSize: 14.5 }}>
            El sistema aplica estas reglas al registrar cada solicitud. El encargado de laboratorios
            las ajusta desde Reglas de préstamo, con los valores que define la coordinación de la FCA.
          </p>
          <Tabla columnas={["Clave", "Parámetro", "Valor vigente"]}>
            {parametros.map((p) => (
              <tr key={p.clave}>
                <td>
                  <strong>{p.clave}</strong>
                </td>
                <td>{p.nombre}</td>
                <td>
                  {p.valor}
                  {p.unidad ? ` ${p.unidad}` : ""}
                </td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
    </>
  );
}

export function Laboratorios({ api }: { api: Api }) {
  const laboratorios = usarLaboratorios(api);
  if (!laboratorios) return <Cargando que="los laboratorios" />;
  const activos = laboratorios.filter((l) => l.activo);

  return (
    <>
      <Encabezado
        titulo="Laboratorios"
        texto="Los espacios en servicio con los horarios registrados en el catálogo. Cualquier cambio del encargado se refleja aquí de inmediato."
      />

      {activos.length === 0 && <Aviso tipo="neutro">No hay laboratorios en servicio por el momento.</Aviso>}

      <div className="rejilla" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
        {activos.map((lab) => {
          const porDia = new Map<number, string[]>();
          for (const bloque of lab.horarios) {
            const lista = porDia.get(bloque.dia_semana) ?? [];
            lista.push(`${bloque.hora_inicio}–${bloque.hora_fin}`);
            porDia.set(bloque.dia_semana, lista);
          }
          return (
            <Tarjeta key={lab.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <h2 style={{ fontSize: 17 }}>{lab.nombre}</h2>
                  <div style={{ color: "var(--tinta-suave)", fontSize: 14 }}>
                    {lab.clave} · {lab.ubicacion}
                  </div>
                </div>
                <Pastilla texto={`${lab.capacidad} lugares`} color="verde" />
              </div>
              <p style={{ fontSize: 14, color: "var(--tinta-suave)", margin: "10px 0 12px" }}>
                {lab.equipamiento || "Sin equipamiento capturado."}
              </p>
              <Tabla columnas={["Día", "Bloques"]}>
                {[...porDia.entries()]
                  .sort(([a], [b]) => a - b)
                  .map(([dia, horas]) => (
                    <tr key={dia}>
                      <td>{DIAS[dia]}</td>
                      <td style={{ fontSize: 13.5 }}>{horas.join(" · ")}</td>
                    </tr>
                  ))}
              </Tabla>
              <p className="ayuda" style={{ marginTop: 10 }}>
                {lab.horas_semana} horas por semana.
              </p>
            </Tarjeta>
          );
        })}
      </div>
    </>
  );
}

const HISTORIAS = [
  {
    clave: "HU-07",
    titulo: "Cancelación de solicitud",
    criterios: [
      ["Cancelar con la anticipación mínima (P-08) deja la reservación en Cancelada, libera el horario y no cuenta como inasistencia.", "Entra como docente, abre Mis solicitudes y cancela una reservación futura."],
      ["Cancelar fuera del plazo se impide e indica que hay que contactar al encargado.", "Una reservación que empieza en menos de dos horas ya no muestra el botón de cancelar."],
      ["Al cancelar, el encargado recibe el aviso correspondiente.", "La cancelación genera una notificación para el encargado de laboratorios."],
    ],
  },
  {
    clave: "HU-08",
    titulo: "Aprobación o rechazo de solicitudes",
    criterios: [
      ["Las solicitudes pendientes se presentan ordenadas por fecha de uso con los datos del docente.", "Abre Solicitudes por resolver como encargado."],
      ["Aprobar cambia el estatus y bloquea el horario en el calendario.", "Aprueba una y revisa el calendario de esa fecha."],
      ["Rechazar exige capturar un motivo antes de guardar.", "Intenta rechazar dejando el motivo vacío."],
      ["Si el solicitante alcanzó el umbral de inasistencias (P-03), el sistema lo advierte antes de aprobar.", "Las solicitudes de un docente con faltas aparecen marcadas como que requieren autorización."],
      ["Al resolverse queda registrado quién la resolvió y en qué momento.", "El detalle de la solicitud muestra quién la resolvió."],
    ],
  },
  {
    clave: "HU-10",
    titulo: "Bloqueo por mantenimiento o evento",
    criterios: [
      ["Un bloqueo con rango de fechas hace que el laboratorio deje de mostrarse disponible.", "Registra un bloqueo en Bloqueos y revisa el calendario de esas fechas."],
      ["Un docente no puede solicitar un horario dentro del bloqueo.", "El bloque aparece en gris y no es seleccionable."],
      ["Al concluir el bloqueo, el laboratorio vuelve a mostrarse disponible automáticamente.", "Consulta una fecha posterior a la fecha final del bloqueo."],
    ],
  },
  {
    clave: "HU-11",
    titulo: "Calendario general de reservaciones",
    criterios: [
      ["Seleccionando un rango de fechas se visualizan todas las reservaciones por laboratorio y horario.", "Abre Calendario general como encargado."],
      ["El detalle de una reservación muestra docente, grupo, motivo y estado de asistencia.", "Toca Ver detalle en cualquier renglón."],
      ["El filtro por laboratorio muestra solo las reservaciones de ese espacio.", "Elige un laboratorio en el selector."],
    ],
  },
  {
    clave: "HU-16",
    titulo: "Registro de asistencia (check-in)",
    criterios: [
      ["El check-in dentro de la tolerancia (P-01) cambia el estatus a En curso.", "El botón de registrar asistencia aparece desde la hora de inicio y durante 15 minutos."],
      ["Antes de la hora de inicio el sistema lo impide e indica el horario válido.", "El botón no aparece antes de tiempo."],
      ["Después de vencida la tolerancia se impide, porque la reservación ya fue liberada.", "El sistema avisa que el laboratorio ya se liberó."],
      ["Queda constancia de quién registró el check-in y a qué hora.", "El historial del docente muestra el check-in y los minutos de retraso."],
    ],
  },
  {
    clave: "HU-17",
    titulo: "Liberación automática por inasistencia",
    criterios: [
      ["Vencida la tolerancia sin check-in, el estatus cambia solo a No asistió.", "El servidor revisa la tolerancia cada minuto."],
      ["El horario liberado vuelve a mostrarse disponible para otros docentes.", "Consulta el calendario de esa fecha después de la liberación."],
      ["La falta se contabiliza al docente y se conserva en el historial.", "Revisa Asistencia por docente."],
      ["Una reservación con check-in registrado no se libera y continúa En curso.", "Registra el check-in y espera a que venza la tolerancia."],
    ],
  },
  {
    clave: "HU-19",
    titulo: "Control de inasistencias reincidentes",
    criterios: [
      ["Al alcanzar el primer umbral (P-03), las nuevas solicitudes requieren autorización manual.", "Revisa Asistencia por docente y la marca en el panel de solicitudes."],
      ["Al alcanzar el segundo umbral (P-04), el sistema impide apartar durante el periodo P-05.", "El docente suspendido recibe el aviso al intentar registrar."],
      ["Concluido el periodo de suspensión, el docente recupera su capacidad de apartar.", "La suspensión se calcula desde la última falta y vence sola."],
      ["Una cancelación a tiempo no se contabiliza como inasistencia.", "Cancela una reservación y revisa que el conteo no cambie."],
      ["El encargado puede consultar el historial de asistencias e inasistencias de cada docente.", "Toca Ver historial en Asistencia por docente."],
    ],
  },
  {
    clave: "HU-21",
    titulo: "Configuración de las reglas de préstamo",
    criterios: [
      ["La configuración muestra los nueve parámetros con su valor actual.", "Abre Reglas de préstamo como encargado."],
      ["Al modificar un parámetro, las nuevas reservaciones se validan con el valor actualizado.", "Cambia P-06 a 1 e intenta registrar una segunda reservación."],
      ["Un valor negativo o fuera de rango se rechaza indicando el rango permitido.", "Captura 99 en P-06."],
      ["Todo cambio registra quién lo hizo, cuándo y cuál era el valor anterior.", "Revisa el historial de cambios al pie de la pantalla."],
    ],
  },
];

export function Criterios() {
  return (
    <>
      <Encabezado
        titulo="Criterios de aceptación del Sprint 3"
        texto="Los criterios Dado / Cuando / Entonces de las ocho historias comprometidas, con la forma de comprobar cada uno en este incremento."
      />

      {HISTORIAS.map((historia) => (
        <div className="seccion" key={historia.clave}>
          <h2>
            {historia.clave} · {historia.titulo}
          </h2>
          <Tarjeta>
            {historia.criterios.map(([criterio, comprobacion]) => (
              <div className="criterio" key={criterio}>
                <div className="marca-ok">✓</div>
                <div>
                  <div>{criterio}</div>
                  <div className="ayuda" style={{ marginTop: 3 }}>
                    Cómo comprobarlo: {comprobacion}
                  </div>
                </div>
              </div>
            ))}
          </Tarjeta>
        </div>
      ))}

      <div className="seccion">
        <Aviso tipo="neutro">
          <strong>Fuera del alcance del Sprint 3.</strong> Las notificaciones y los recordatorios,
          la aplicación móvil, el módulo de reportes con los cuatro indicadores de aprovechamiento,
          las pruebas de aceptación con docentes, los manuales y el despliegue corresponden al
          Sprint 4.
        </Aviso>
      </div>
    </>
  );
}
