/**
 * Bandeja de avisos del docente · HU-06 y HU-18.
 *
 * El aviso de recordatorio trae acciones: confirmar conserva el horario y
 * cancelar lo libera. Las dos llaman a la misma API que ya usan "Mis
 * solicitudes", de modo que no hay una segunda regla que mantener.
 */
import { useCallback, useEffect, useState } from "react";
import type { Api } from "../api";
import { ErrorApi } from "../api";
import { Aviso, Cargando, Encabezado, Tarjeta } from "../componentes";
import type { Notificacion } from "../tipos";

const ICONO: Record<string, string> = {
  solicitud_registrada: "Solicitud",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  liberada: "Liberada",
};

const COLOR: Record<string, string> = {
  solicitud_registrada: "azul",
  aprobada: "verde",
  rechazada: "roja",
  liberada: "ambar",
};

/** "hace 3 h", "ayer", "12/11/2026": lo más corto que siga siendo claro. */
function cuando(iso: string): string {
  const minutos = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export function Avisos({ api, onCambio }: { api: Api; onCambio?: () => void }) {
  const [avisos, setAvisos] = useState<Notificacion[] | null>(null);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState("");
  const [trabajando, setTrabajando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setAvisos((await api.avisos()).avisos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No fue posible consultar tus avisos.");
      setAvisos([]);
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const marcarTodos = async () => {
    await api.marcarAvisosLeidos();
    await cargar();
    onCambio?.();
  };

  const abrir = async (a: Notificacion) => {
    if (a.leida) return;
    await api.marcarAvisoLeido(a.id);
    setAvisos((previos) =>
      previos?.map((x) => (x.id === a.id ? { ...x, leida: true } : x)) ?? null);
    onCambio?.();
  };

  const actuar = async (a: Notificacion, que: "confirmar" | "cancelar") => {
    if (!a.reservacion_id) return;
    setTrabajando(a.id);
    setError("");
    setResultado("");
    try {
      if (que === "confirmar") {
        await api.confirmarReservacion(a.reservacion_id);
        setResultado(`Confirmaste la reservación ${a.folio}. El horario queda apartado a tu nombre.`);
      } else {
        await api.cancelar(a.reservacion_id);
        setResultado(`Cancelaste la reservación ${a.folio}. El horario quedó libre y no cuenta como falta.`);
      }
      await api.marcarAvisoLeido(a.id);
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No fue posible completar la operación.");
    } finally {
      setTrabajando(null);
    }
  };

  if (!avisos) return <Cargando que="tus avisos" />;

  const sinLeer = avisos.filter((a) => !a.leida).length;

  return (
    <>
      <Encabezado
        titulo="Avisos"
        texto="El sistema te avisa aquí cuando una solicitud cambia de estatus y te recuerda tus reservaciones antes de que ocurran."
        accion={
          sinLeer > 0 ? (
            <button className="boton secundario" onClick={() => void marcarTodos()}>
              Marcar todo como leído
            </button>
          ) : undefined
        }
      />

      {error && <Aviso tipo="mal">{error}</Aviso>}
      {resultado && <Aviso tipo="bien">{resultado}</Aviso>}

      {avisos.length === 0 ? (
        <Tarjeta>
          <p className="vacio">
            Todavía no tienes avisos. Aquí aparecerán la confirmación de cada solicitud que
            registres, el resultado cuando el encargado la resuelva y los recordatorios antes de
            tus reservaciones.
          </p>
        </Tarjeta>
      ) : (
        <ul className="avisos">
          {avisos.map((a) => {
            const recordatorio = a.accion === "confirmar_cancelar";
            const yaResuelta = a.reservacion_estatus !== null && a.reservacion_estatus !== 2;
            return (
              <li
                key={a.id}
                className={`aviso-fila${a.leida ? "" : " sin-leer"}`}
                onClick={() => void abrir(a)}
              >
                <div className="aviso-marca">
                  <span className={`pastilla ${COLOR[a.tipo] ?? "gris"}`}>
                    {ICONO[a.tipo] ?? "Recordatorio"}
                  </span>
                  {!a.leida && <span className="punto" aria-label="sin leer" />}
                </div>
                <div className="aviso-texto">
                  <div className="aviso-asunto">{a.asunto}</div>
                  <p>{a.cuerpo}</p>
                  {recordatorio && (
                    yaResuelta ? (
                      <div className="ayuda">
                        Esta reservación ya no está pendiente de confirmar.
                      </div>
                    ) : (
                      <div className="aviso-acciones">
                        <button
                          className="boton"
                          disabled={trabajando === a.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void actuar(a, "confirmar");
                          }}
                        >
                          Confirmar
                        </button>
                        <button
                          className="boton secundario"
                          disabled={trabajando === a.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void actuar(a, "cancelar");
                          }}
                        >
                          Cancelar la reservación
                        </button>
                      </div>
                    )
                  )}
                </div>
                <time className="aviso-cuando" dateTime={a.programada_para}>
                  {cuando(a.programada_para)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
