/** Piezas de interfaz compartidas por las vistas. */
import type { ReactNode } from "react";

export function Encabezado({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {texto && <p>{texto}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`tarjeta ${className}`.trim()}>{children}</div>;
}

export function Cifra({ numero, etiqueta }: { numero: ReactNode; etiqueta: string }) {
  return (
    <div className="tarjeta cifra">
      <div className="n">{numero}</div>
      <div className="e">{etiqueta}</div>
    </div>
  );
}

const COLOR_ESTATUS: Record<string, string> = {
  solicitada: "azul",
  aprobada: "verde",
  confirmada: "verde",
  en_curso: "verde",
  cumplida: "gris",
  rechazada: "roja",
  cancelada: "gris",
  no_asistio: "ambar",
};

export function Pastilla({ texto, color = "gris" }: { texto: string; color?: string }) {
  return <span className={`pastilla ${color}`}>{texto}</span>;
}

export function PastillaEstatus({ clave, nombre }: { clave: string; nombre: string }) {
  return <Pastilla texto={nombre} color={COLOR_ESTATUS[clave] ?? "gris"} />;
}

export function Aviso({ tipo, children }: { tipo: "bien" | "mal" | "neutro"; children: ReactNode }) {
  const clase = tipo === "neutro" ? "nota" : `nota ${tipo}`;
  return <div className={clase}>{children}</div>;
}

export function Campo({
  id,
  etiqueta,
  error,
  ancho = false,
  ayuda,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ancho?: boolean;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className={`campo${ancho ? " ancho" : ""}${error ? " error" : ""}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {error ? <div className="ayuda mal">{error}</div> : ayuda ? <div className="ayuda">{ayuda}</div> : null}
    </div>
  );
}

export function Modal({
  titulo,
  children,
  onCerrar,
  acciones,
}: {
  titulo: string;
  children: ReactNode;
  onCerrar: () => void;
  acciones: ReactNode;
}) {
  return (
    <div
      className="velo"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
        <div className="acciones">{acciones}</div>
      </div>
    </div>
  );
}

export function Tabla({ columnas, children }: { columnas: string[]; children: ReactNode }) {
  return (
    <div className="tabla-contenedor">
      <table>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cargando({ que }: { que: string }) {
  return <p className="cargando">Cargando {que}…</p>;
}

/** Convierte 2026-10-12 en "lunes 12 de octubre de 2026". */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Convierte 2026-10-12 en "12/10/2026". */
export function fechaCorta(iso: string): string {
  return iso.split("-").reverse().join("/");
}
