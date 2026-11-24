/** HU-02 · Inicio de sesión por rol. */
import { useState, type FormEvent } from "react";
import type { Api } from "../api";
import { Aviso } from "../componentes";
import type { Usuario } from "../tipos";

const CUENTAS = [
  { correo: "arnulfo.vasquez@uabc.edu.mx", rol: "Docente" },
  { correo: "docente.prueba@uabc.edu.mx", rol: "Docente" },
  { correo: "laboratorios.fca@uabc.edu.mx", rol: "Encargado de laboratorios" },
  { correo: "coordinacion.fca@uabc.edu.mx", rol: "Coordinación" },
];

const CLAVE_DEMOSTRACION = "Lab2026$fca";

export function Acceso({
  api,
  sinRed,
  onEntrar,
}: {
  api: Api;
  sinRed: boolean;
  onEntrar: (usuario: Usuario) => void;
}) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEntrando(true);
    setError("");
    try {
      onEntrar(await api.acceso(correo, clave));
    } catch (problema) {
      setError((problema as Error).message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="acceso">
      <div className="acceso-caja">
        <div className="acceso-cab">
          <div className="inst">Universidad Autónoma de Baja California</div>
          <h1>Préstamo de laboratorios de cómputo</h1>
          <div style={{ fontSize: 13, color: "#dfe9e4", marginTop: 6 }}>
            Facultad de Ciencias Administrativas · Mexicali
          </div>
        </div>

        <form className="acceso-cuerpo" onSubmit={(e) => void enviar(e)} noValidate>
          {sinRed && (
            <Aviso tipo="mal">Sin conexión a internet. Conéctate para poder iniciar sesión.</Aviso>
          )}
          {error && <Aviso tipo="mal">{error}</Aviso>}

          <div className="campo">
            <label htmlFor="correo">Correo institucional</label>
            <input
              id="correo"
              name="correo"
              type="email"
              autoComplete="username"
              placeholder="nombre.apellido@uabc.edu.mx"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              name="clave"
              type="password"
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </div>

          <button className="boton" type="submit" disabled={entrando}>
            {entrando ? "Entrando…" : "Entrar"}
          </button>

          <div className="cuentas">
            Cuentas de prueba. La contraseña de las cuatro es <code>{CLAVE_DEMOSTRACION}</code>.
            <ul>
              {CUENTAS.map((cuenta) => (
                <li key={cuenta.correo}>
                  <button
                    type="button"
                    onClick={() => {
                      setCorreo(cuenta.correo);
                      setClave(CLAVE_DEMOSTRACION);
                    }}
                  >
                    {cuenta.correo}
                  </button>{" "}
                  · {cuenta.rol}
                </li>
              ))}
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
}
