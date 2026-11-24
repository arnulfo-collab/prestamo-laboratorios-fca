/**
 * Reportes de uso para coordinación · HU-13, HU-14, HU-15 y HU-22.
 *
 * Las gráficas se dibujan en SVG, sin biblioteca de terceros: son tres formas
 * sencillas y una dependencia más costaría más de lo que resuelve.
 *
 * Sobre los colores: el par verde–morado no es decorativo. El par intuitivo
 * para "aprovechado / desperdiciado" sería verde y ámbar, pero esos dos se
 * confunden en la deficiencia más común de visión del color (protanopia), así
 * que se eligió un par verificado. Además la identidad nunca depende solo del
 * color: cada segmento lleva su cifra escrita y la tabla de abajo repite los
 * mismos datos en texto.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Api } from "../api";
import { ErrorApi } from "../api";
import { Aviso, Campo, Cargando, Encabezado, Tabla, Tarjeta } from "../componentes";
import type { DemandaHorario, DemandaLaboratorio, Laboratorio, PuntoSerie, Reportes as Datos } from "../tipos";

const USADO = "#2a8a5c";
const PERDIDO = "#8c4bbd";
const REJILLA = "#d7e0dc";

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function ReportesUso({ api }: { api: Api }) {
  const [desde, setDesde] = useState(haceDias(90));
  const [hasta, setHasta] = useState(hoy());
  const [laboratorio, setLaboratorio] = useState<number | null>(null);
  const [labs, setLabs] = useState<Laboratorio[]>([]);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.laboratorios().then(setLabs).catch(() => setLabs([]));
  }, [api]);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setDatos(await api.reportes(desde, hasta, laboratorio));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No fue posible generar el reporte.");
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [api, desde, hasta, laboratorio]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const exportar = (tipo: string) => {
    const url = api.urlExportacion(desde, hasta, tipo, laboratorio);
    if (!url) return;
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `reporte_${tipo}_${desde}_a_${hasta}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  };

  const nombreLab = useMemo(
    () => labs.find((l) => l.id === laboratorio)?.clave ?? "todos los laboratorios",
    [labs, laboratorio],
  );
  const alcance = laboratorio === null
    ? "todas las reservaciones del periodo seleccionado"
    : `únicamente las de ${nombreLab} en el periodo seleccionado`;

  return (
    <>
      <Encabezado
        titulo="Reportes de uso"
        texto="Qué laboratorios se piden, en qué horarios y cuánto del tiempo apartado se aprovecha."
      />

      <Tarjeta className="filtros">
        <div className="campos">
          <Campo id="desde" etiqueta="Desde">
            <input id="desde" type="date" value={desde} max={hasta}
                   onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo id="hasta" etiqueta="Hasta">
            <input id="hasta" type="date" value={hasta} min={desde}
                   onChange={(e) => setHasta(e.target.value)} />
          </Campo>
          <Campo id="lab" etiqueta="Laboratorio">
            <select id="lab" value={laboratorio ?? ""}
                    onChange={(e) => setLaboratorio(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>{l.clave} · {l.nombre}</option>
              ))}
            </select>
          </Campo>
        </div>
      </Tarjeta>

      {error && <Aviso tipo="mal">{error}</Aviso>}

      {cargando ? (
        <Cargando que="el reporte" />
      ) : !datos ? null : datos.indicadores.total === 0 ? (
        <Tarjeta>
          <p className="vacio">
            No hay reservaciones de {nombreLab} entre el {desde.split("-").reverse().join("/")} y el{" "}
            {hasta.split("-").reverse().join("/")}. Amplía el rango de fechas o quita el filtro de
            laboratorio para ver información.
          </p>
        </Tarjeta>
      ) : (
        <>
          <Tarjetas datos={datos} />
          <GraficaLaboratorios filas={datos.laboratorios} />
          <GraficaHorarios filas={datos.horarios} />
          <GraficaSerie puntos={datos.serie} />
          <TablaLaboratorios filas={datos.laboratorios} />

          <Tarjeta>
            <h2>Exportar</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>
              Los archivos respetan el filtro aplicado: contienen {alcance}.
            </p>
            <div className="aviso-acciones">
              <button className="boton secundario" onClick={() => exportar("laboratorios")}>
                Demanda por laboratorio (CSV)
              </button>
              <button className="boton secundario" onClick={() => exportar("horarios")}>
                Demanda por horario (CSV)
              </button>
              <button className="boton secundario" onClick={() => exportar("detalle")}>
                Detalle de reservaciones (CSV)
              </button>
            </div>
          </Tarjeta>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Cifras de cabecera · HU-22
// ---------------------------------------------------------------------

function Tarjetas({ datos }: { datos: Datos }) {
  const i = datos.indicadores;
  return (
    <div className="rejilla cifras-4">
      <div className="tarjeta cifra">
        <div className="n">{i.tasa_asistencia === null ? "—" : `${i.tasa_asistencia} %`}</div>
        <div className="e">Tasa de asistencia</div>
        <div className="ayuda">
          {i.cumplidas} de {i.cumplidas + i.no_asistio} reservaciones que apartaron horario
        </div>
      </div>
      <div className="tarjeta cifra">
        <div className="n">{i.horas_perdidas}</div>
        <div className="e">Horas-laboratorio desperdiciadas</div>
        <div className="ayuda">Apartadas y no utilizadas: {i.no_asistio} reservaciones</div>
      </div>
      <div className="tarjeta cifra">
        <div className="n chico">{i.lab_mas_solicitado ?? "—"}</div>
        <div className="e">Laboratorio más solicitado</div>
        <div className="ayuda">De {datos.laboratorios.length} laboratorios en el catálogo</div>
      </div>
      <div className="tarjeta cifra">
        <div className="n chico">{i.horario_mas_demandado ?? "—"}</div>
        <div className="e">Horario de mayor demanda</div>
        <div className="ayuda">{i.total} solicitudes en el periodo</div>
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="leyenda">
      <span><i style={{ background: USADO }} /> Horario aprovechado</span>
      <span><i style={{ background: PERDIDO }} /> Horario desperdiciado</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// HU-14 · Demanda por laboratorio
// ---------------------------------------------------------------------

function GraficaLaboratorios({ filas }: { filas: DemandaLaboratorio[] }) {
  const alto = 34;
  const anchoEtiqueta = 74;
  const anchoBarras = 560;
  const maximo = Math.max(1, ...filas.map((f) => f.cumplidas + f.no_asistio));
  const escala = (v: number) => (v / maximo) * anchoBarras;

  return (
    <Tarjeta>
      <h2>Demanda por laboratorio</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Ordenados de mayor a menor número de solicitudes. La barra separa lo que se usó de lo que
        se apartó y nadie ocupó.
      </p>
      <Leyenda />
      <svg
        className="gráfica"
        viewBox={`0 0 ${anchoEtiqueta + anchoBarras + 58} ${filas.length * alto + 10}`}
        role="img"
        aria-label="Reservaciones cumplidas y no asistidas por laboratorio"
      >
        {filas.map((f, n) => {
          const y = n * alto + 6;
          const usado = escala(f.cumplidas);
          const perdido = escala(f.no_asistio);
          const total = f.cumplidas + f.no_asistio;
          return (
            <g key={f.laboratorio_id}>
              <text x={0} y={y + 14} className="eje">{f.clave}</text>
              {total === 0 ? (
                <text x={anchoEtiqueta} y={y + 14} className="eje suave">sin solicitudes</text>
              ) : (
                <>
                  <rect x={anchoEtiqueta} y={y} width={Math.max(usado, 2)} height={20}
                        rx={4} fill={USADO}>
                    <title>{f.clave}: {f.cumplidas} reservaciones cumplidas</title>
                  </rect>
                  {f.no_asistio > 0 && (
                    /* El +2 es el respiro entre segmentos: sin él, dos colores
                       contiguos se leen como uno solo. */
                    <rect x={anchoEtiqueta + usado + 2} y={y} width={Math.max(perdido, 2)}
                          height={20} rx={4} fill={PERDIDO}>
                      <title>{f.clave}: {f.no_asistio} reservaciones sin asistencia</title>
                    </rect>
                  )}
                  <text x={anchoEtiqueta + usado + perdido + 10} y={y + 14} className="eje">
                    {f.cumplidas} · {f.no_asistio}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
// HU-14 · Demanda por horario
// ---------------------------------------------------------------------

function GraficaHorarios({ filas }: { filas: DemandaHorario[] }) {
  const ancho = 640;
  const alto = 220;
  const piso = alto - 34;
  const maximo = Math.max(1, ...filas.map((f) => f.solicitudes));
  const paso = ancho / Math.max(1, filas.length);
  const anchoBarra = Math.min(54, paso - 14);

  return (
    <Tarjeta>
      <h2>Demanda por horario</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Solicitudes recibidas en cada bloque, en el orden en que transcurre el día.
      </p>
      <svg className="gráfica" viewBox={`0 0 ${ancho} ${alto}`} role="img"
           aria-label="Solicitudes por bloque horario">
        <line x1={0} y1={piso} x2={ancho} y2={piso} stroke={REJILLA} strokeWidth={1} />
        {filas.map((f, n) => {
          const altura = (f.solicitudes / maximo) * (piso - 26);
          const x = n * paso + (paso - anchoBarra) / 2;
          return (
            <g key={f.bloque}>
              <rect x={x} y={piso - altura} width={anchoBarra} height={Math.max(altura, 2)}
                    rx={4} fill={USADO}>
                <title>{f.bloque}: {f.solicitudes} solicitudes, {f.cumplidas} cumplidas</title>
              </rect>
              <text x={x + anchoBarra / 2} y={piso - altura - 7} className="eje medio">
                {f.solicitudes}
              </text>
              <text x={x + anchoBarra / 2} y={piso + 16} className="eje medio suave">
                {f.bloque.split("–")[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
// HU-13 · Evolución en el periodo
// ---------------------------------------------------------------------

function GraficaSerie({ puntos }: { puntos: PuntoSerie[] }) {
  const ancho = 640;
  const alto = 190;
  const piso = alto - 26;
  const techo = 16;
  const maximo = Math.max(1, ...puntos.map((p) => p.solicitudes));
  const x = (n: number) => (n / Math.max(1, puntos.length - 1)) * (ancho - 10) + 5;
  const y = (v: number) => piso - (v / maximo) * (piso - techo);

  const trazo = puntos.map((p, n) => `${n === 0 ? "M" : "L"}${x(n).toFixed(1)},${y(p.solicitudes).toFixed(1)}`).join(" ");
  const area = `${trazo} L${x(puntos.length - 1).toFixed(1)},${piso} L${x(0).toFixed(1)},${piso} Z`;

  // Con muchos días, etiquetar todos sería ilegible: se marcan cinco cortes.
  const cortes = puntos.length <= 1 ? [0]
    : [0, Math.floor(puntos.length / 4), Math.floor(puntos.length / 2),
       Math.floor((3 * puntos.length) / 4), puntos.length - 1];

  return (
    <Tarjeta>
      <h2>Solicitudes por día</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Evolución en el periodo seleccionado. Los días sin movimiento se dibujan en cero.
      </p>
      <svg className="gráfica" viewBox={`0 0 ${ancho} ${alto}`} role="img"
           aria-label="Solicitudes por día en el periodo">
        <line x1={0} y1={piso} x2={ancho} y2={piso} stroke={REJILLA} strokeWidth={1} />
        <path d={area} fill={USADO} opacity={0.12} />
        <path d={trazo} fill="none" stroke={USADO} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((p, n) => (
          <circle key={p.dia} cx={x(n)} cy={y(p.solicitudes)} r={8} fill="transparent">
            <title>{p.dia.split("-").reverse().join("/")}: {p.solicitudes} solicitudes</title>
          </circle>
        ))}
        {cortes.map((n) => (
          <text key={n} x={x(n)} y={piso + 17} className="eje medio suave">
            {puntos[n]?.dia.slice(8)}/{puntos[n]?.dia.slice(5, 7)}
          </text>
        ))}
        <text x={5} y={techo - 4} className="eje suave">máximo {maximo}</text>
      </svg>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
// Los mismos datos en texto, para quien no pueda leer la gráfica
// ---------------------------------------------------------------------

function TablaLaboratorios({ filas }: { filas: DemandaLaboratorio[] }) {
  return (
    <Tarjeta>
      <h2>Detalle por laboratorio</h2>
      <Tabla columnas={["Laboratorio", "Solicitudes", "Apartaron horario", "Cumplidas",
                        "No asistió", "Horas usadas", "Horas perdidas"]}>
        {filas.map((f) => (
          <tr key={f.laboratorio_id}>
            <td>
              <strong>{f.clave}</strong>
              <div className="ayuda">{f.nombre}</div>
            </td>
            <td>{f.solicitudes}</td>
            <td>{f.aprobadas}</td>
            <td>{f.cumplidas}</td>
            <td>{f.no_asistio}</td>
            <td>{f.horas_usadas}</td>
            <td>{f.horas_perdidas}</td>
          </tr>
        ))}
      </Tabla>
    </Tarjeta>
  );
}
