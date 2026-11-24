/**
 * Armazón del portal: sesión, navegación por rol y disposición general.
 *
 * La navegación usa el fragmento de la dirección (#inicio, #calendario, …).
 * Escribir a mano una dirección ajena al rol no da acceso: la vista se decide
 * contra los permisos del usuario, no contra lo que diga la barra.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { elegirApi, type Api } from "./api";
import { Cargando } from "./componentes";
import { SECCIONES_POR_ROL, type Usuario } from "./tipos";
import { Acceso } from "./vistas/Acceso";
import { Avisos } from "./vistas/Avisos";
import { ReportesUso } from "./vistas/Reportes";
import { Agenda, Bloqueos, Docentes, Parametros } from "./vistas/Administracion";
import { Catalogo, Usuarios } from "./vistas/Catalogo";
import { Criterios, Inicio, Laboratorios } from "./vistas/General";
import { Calendario, MisSolicitudes, Pendientes } from "./vistas/Reservacion";

const ETIQUETAS: Record<string, string> = {
  inicio: "Inicio",
  calendario: "Disponibilidad",
  "mis-solicitudes": "Mis solicitudes",
  avisos: "Avisos",
  pendientes: "Solicitudes por resolver",
  agenda: "Calendario general",
  reportes: "Reportes de uso",
  catalogo: "Catálogo",
  bloqueos: "Bloqueos",
  docentes: "Asistencia por docente",
  parametros: "Reglas de préstamo",
  usuarios: "Usuarios y roles",
  laboratorios: "Laboratorios",
  criterios: "Criterios de aceptación",
};

function vistaDeLaDireccion(): string {
  return window.location.hash.replace("#", "") || "inicio";
}

export default function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [vista, setVista] = useState(vistaDeLaDireccion);
  const [sinRed, setSinRed] = useState(!navigator.onLine);
  const [pendientesPorResolver, setPendientesPorResolver] = useState(0);
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);

  useEffect(() => {
    void (async () => {
      const elegida = await elegirApi();
      setApi(elegida);
      setUsuario(await elegida.sesion());
      setCargandoSesion(false);
    })();
  }, []);

  useEffect(() => {
    const alCambiar = () => setVista(vistaDeLaDireccion());
    const conectado = () => setSinRed(false);
    const desconectado = () => setSinRed(true);
    window.addEventListener("hashchange", alCambiar);
    window.addEventListener("online", conectado);
    window.addEventListener("offline", desconectado);
    return () => {
      window.removeEventListener("hashchange", alCambiar);
      window.removeEventListener("online", conectado);
      window.removeEventListener("offline", desconectado);
    };
  }, []);

  const permitidas = useMemo(
    () => (usuario ? SECCIONES_POR_ROL[usuario.rol] : []),
    [usuario],
  );

  // Cuenta de solicitudes por resolver, para el distintivo del menú.
  const refrescarPendientes = useCallback(async () => {
    if (!api || usuario?.rol !== "administrador") return;
    try {
      setPendientesPorResolver((await api.pendientes()).length);
    } catch {
      setPendientesPorResolver(0);
    }
  }, [api, usuario]);

  // Cuenta de avisos sin leer, para el distintivo del menú (HU-06).
  const refrescarAvisos = useCallback(async () => {
    if (!api || usuario?.rol !== "docente") return;
    try {
      setAvisosSinLeer((await api.avisos()).sinLeer);
    } catch {
      setAvisosSinLeer(0);
    }
  }, [api, usuario]);

  useEffect(() => {
    void refrescarPendientes();
    void refrescarAvisos();
  }, [refrescarPendientes, refrescarAvisos, vista]);

  if (!api || cargandoSesion) {
    return (
      <main>
        <Cargando que="el sistema" />
      </main>
    );
  }

  if (!usuario) {
    return <Acceso api={api} sinRed={sinRed} onEntrar={setUsuario} />;
  }

  const salir = async () => {
    await api.salir();
    setUsuario(null);
    // Se reemplaza la entrada del historial para que el botón de retroceso no
    // devuelva a una pantalla con sesión iniciada.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.location.hash = "";
    setVista("inicio");
  };

  const autorizada = permitidas.includes(vista);

  return (
    <>
      {sinRed && (
        <div className="barra-sin-red">
          Sin conexión a internet. No es posible consultar ni guardar información hasta que se
          restablezca.
        </div>
      )}
      <div className="cinta-sprint">
        {api.modo === "demostracion"
          ? "Modo de demostración · los datos viven en esta pestaña y se reinician al recargar"
          : "Conectado a la base de datos"}
        {" · "}Incremento del Sprint 4: avisos, recordatorios y reportes de uso
      </div>

      <div className="app">
        <aside className="lateral">
          <div className="marca">
            <div className="inst">UABC · Facultad de Ciencias Administrativas</div>
            <div className="nom">Préstamo de laboratorios</div>
          </div>
          <nav>
            {permitidas.map((seccion, i) => (
              <span key={seccion} style={{ display: "contents" }}>
                {seccion === "catalogo" && <div className="grupo">Administración</div>}
                {seccion === "criterios" && i > 0 && <div className="grupo">Sprint 4</div>}
                <a href={`#${seccion}`} className={vista === seccion ? "activo" : ""}>
                  {ETIQUETAS[seccion]}
                  {seccion === "pendientes" && pendientesPorResolver > 0 && (
                    <span className="cuenta">{pendientesPorResolver}</span>
                  )}
                  {seccion === "avisos" && avisosSinLeer > 0 && (
                    <span className="cuenta">{avisosSinLeer}</span>
                  )}
                </a>
              </span>
            ))}
          </nav>
          <div className="sesion-pie">
            <div>
              <div className="quien">{usuario.nombre}</div>
              {usuario.rol_nombre.toLowerCase() !== usuario.nombre.toLowerCase() && (
                <div className="rol">{usuario.rol_nombre}</div>
              )}
            </div>
            <button className="salir" onClick={() => void salir()}>
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main>
          {!autorizada ? (
            <Denegada vista={vista} usuario={usuario} permitidas={permitidas} />
          ) : vista === "inicio" ? (
            <Inicio api={api} usuario={usuario} />
          ) : vista === "calendario" ? (
            <Calendario api={api} usuario={usuario} />
          ) : vista === "mis-solicitudes" ? (
            <MisSolicitudes api={api} />
          ) : vista === "avisos" ? (
            <Avisos api={api} onCambio={refrescarAvisos} />
          ) : vista === "reportes" ? (
            <ReportesUso api={api} />
          ) : vista === "pendientes" ? (
            <Pendientes api={api} onCambio={refrescarPendientes} />
          ) : vista === "agenda" ? (
            <Agenda api={api} />
          ) : vista === "bloqueos" ? (
            <Bloqueos api={api} />
          ) : vista === "docentes" ? (
            <Docentes api={api} />
          ) : vista === "parametros" ? (
            <Parametros api={api} />
          ) : vista === "catalogo" ? (
            <Catalogo api={api} />
          ) : vista === "usuarios" ? (
            <Usuarios api={api} />
          ) : vista === "laboratorios" ? (
            <Laboratorios api={api} />
          ) : (
            <Criterios />
          )}
        </main>
      </div>
    </>
  );
}

function Denegada({
  vista,
  usuario,
  permitidas,
}: {
  vista: string;
  usuario: Usuario;
  permitidas: string[];
}) {
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Acceso denegado</h1>
          <p>
            Tu rol es <strong>{usuario.rol_nombre}</strong> y no tiene permiso para abrir{" "}
            <code>#{vista}</code>. El sistema bloquea la dirección aunque se escriba a mano en el
            navegador.
          </p>
        </div>
      </div>
      <div className="tarjeta">
        <p style={{ margin: "0 0 12px" }}>
          Las secciones disponibles para tu rol son:{" "}
          {permitidas.map((v, i) => (
            <span key={v}>
              {i > 0 && ", "}
              <code>#{v}</code>
            </span>
          ))}
          .
        </p>
        <a className="boton" href="#inicio" style={{ textDecoration: "none" }}>
          Volver al inicio
        </a>
      </div>
    </>
  );
}
