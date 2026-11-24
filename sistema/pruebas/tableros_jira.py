#!/usr/bin/env python3
"""Tableros de Jira por sprint, dibujados a partir de los datos reales del proyecto.

Los datos —clave, historia, puntos, prioridad, estatus, meta y periodo de cada
sprint— se tomaron del proyecto SCRUM del sitio sistemaprestamolabuabc.atlassian.net
mediante la API de Jira. Se dibujan aquí, y no se capturan de pantalla, para que
el tablero quepa legible en la página y para poder mostrar el estado que tenía
cada sprint en su cierre, que Jira ya no permite consultar una vez cerrado.

Genera: figuras/tablero_sprint1.png … tablero_sprint4.png
"""
import textwrap
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

SALIDA = Path(__file__).parent / "figuras_tableros"
SALIDA.mkdir(exist_ok=True)

TINTA, TINTA2, GRIS = "#1f2328", "#52514e", "#d6dade"
FONDO_COL = "#f4f6f7"
ENCABEZADO = "#2d3339"

COLOR_PRIORIDAD = {"Alta": "#eb6834", "Media": "#eda100", "Baja": "#1baf7a"}
COLUMNAS = ["Por hacer", "En curso", "En revisión", "Finalizado"]

# (clave Jira, historia, título, puntos, prioridad, columna)
SPRINTS = {
    1: {
        "nombre": "Sprint 1 · Cimientos del sistema",
        "periodo": "28 de septiembre al 9 de octubre de 2026",
        "meta": "El sistema permite iniciar sesión por rol y administrar el catálogo de laboratorios.",
        "estado": "Cerrado",
        "tarjetas": [
            ("SCRUM-6", "HU-02", "Inicio de sesión por rol", 6, "Alta", "Finalizado"),
            ("SCRUM-13", "HU-09", "Catálogo de laboratorios y horarios", 5, "Alta", "Finalizado"),
        ],
        "nota": "HU-01 se entrega en dos incrementos. Su maquetado adaptable se terminó en este "
                "sprint, pero la tarjeta permanece en el Sprint 4 porque la aplicación móvil "
                "sigue pendiente.",
    },
    2: {
        "nombre": "Sprint 2 · Núcleo de reservación",
        "periodo": "12 al 23 de octubre de 2026",
        "meta": "Un docente consulta disponibilidad y registra una solicitud sin generar empalmes "
                "ni exceder sus límites.",
        "estado": "Cerrado",
        "tarjetas": [
            ("SCRUM-7", "HU-03", "Consulta de disponibilidad en tiempo real", 8, "Alta", "Finalizado"),
            ("SCRUM-8", "HU-04", "Registro de solicitud con antelación", 8, "Alta", "Finalizado"),
            ("SCRUM-9", "HU-05", "Seguimiento del estatus", 4, "Alta", "Finalizado"),
            ("SCRUM-16", "HU-12", "Prevención de empalmes", 6, "Alta", "Finalizado"),
            ("SCRUM-24", "HU-20", "Límites de reservación por docente", 4, "Media", "Finalizado"),
        ],
        "nota": "Ninguna historia regresó al product backlog: las cinco comprometidas cumplieron "
                "la definición de terminado.",
    },
    3: {
        "nombre": "Sprint 3 · Administración y control de asistencia",
        "periodo": "26 de octubre al 6 de noviembre de 2026",
        "meta": "El encargado administra todas las solicitudes y el sistema libera automáticamente "
                "los laboratorios no utilizados.",
        "estado": "Cerrado",
        "tarjetas": [
            ("SCRUM-12", "HU-08", "Aprobación o rechazo de solicitudes", 6, "Alta", "Finalizado"),
            ("SCRUM-21", "HU-17", "Liberación automática por inasistencia", 5, "Alta", "Finalizado"),
            ("SCRUM-15", "HU-11", "Calendario general de reservaciones", 4, "Alta", "Finalizado"),
            ("SCRUM-20", "HU-16", "Registro de asistencia (check-in)", 4, "Alta", "Finalizado"),
            ("SCRUM-11", "HU-07", "Cancelación de solicitud", 3, "Media", "Finalizado"),
            ("SCRUM-14", "HU-10", "Bloqueo por mantenimiento o evento", 3, "Media", "Finalizado"),
            ("SCRUM-23", "HU-19", "Control de inasistencias reincidentes", 3, "Media", "Finalizado"),
            ("SCRUM-25", "HU-21", "Configuración de las reglas de préstamo", 2, "Alta", "Finalizado"),
        ],
        "nota": "Las ocho historias cerraron sin recurrir al plan de contingencia, que preveía "
                "mover HU-19 y HU-21 al Sprint 4.",
    },
    4: {
        "nombre": "Sprint 4 · Móvil, reportes y cierre",
        "periodo": "9 al 20 de noviembre de 2026",
        "meta": "Sistema desplegado, documentado y aceptado por el Product Owner.",
        "estado": "Planeado",
        "tarjetas": [
            ("SCRUM-5", "HU-01", "Acceso multiplataforma (app móvil)", 8, "Alta", "En curso"),
            ("SCRUM-17", "HU-13", "Dashboard de uso", 5, "Alta", "Por hacer"),
            ("SCRUM-10", "HU-06", "Confirmación y avisos", 3, "Media", "Por hacer"),
            ("SCRUM-22", "HU-18", "Recordatorio previo a la reservación", 3, "Media", "Por hacer"),
            ("SCRUM-26", "HU-22", "Indicador de aprovechamiento", 3, "Media", "Por hacer"),
            ("SCRUM-18", "HU-14", "Identificación de demanda", 2, "Media", "Por hacer"),
            ("SCRUM-19", "HU-15", "Exportación de información", 2, "Baja", "Por hacer"),
        ],
        "nota": "HU-01 aparece En curso porque su incremento web se terminó en el Sprint 1 y solo "
                "resta la aplicación móvil.",
    },
}

ANCHO, GAP = 1.78, 0.10
ENC, TARJETA, SEP, PAD_SUP = 0.40, 0.44, 0.08, 0.12


def dibujar_tarjeta(ax, x, y_top, clave, historia, titulo, puntos, prioridad):
    color = COLOR_PRIORIDAD[prioridad]
    ax.add_patch(FancyBboxPatch((x + 0.05, y_top - TARJETA), ANCHO - 0.10, TARJETA,
                                boxstyle="round,pad=0,rounding_size=0.035",
                                facecolor="white", edgecolor=GRIS, linewidth=0.8, zorder=3))
    ax.add_patch(Rectangle((x + 0.05, y_top - TARJETA), 0.045, TARJETA,
                           facecolor=color, edgecolor="none", zorder=4))

    ax.text(x + 0.15, y_top - 0.11, f"{clave}  ·  {historia}", fontsize=6.6,
            color=TINTA, fontweight="bold", va="center", zorder=5)

    # Pastilla de puntos de historia, a la derecha del encabezado de la tarjeta.
    ax.add_patch(FancyBboxPatch((x + ANCHO - 0.37, y_top - 0.165), 0.24, 0.11,
                                boxstyle="round,pad=0,rounding_size=0.055",
                                facecolor="#eef1f4", edgecolor="none", zorder=5))
    ax.text(x + ANCHO - 0.25, y_top - 0.11, str(puntos), fontsize=6.2, color=TINTA2,
            ha="center", va="center", fontweight="bold", zorder=6)

    # La prioridad se lee en la franja de color y en la leyenda; repetirla como
    # texto chocaba con la segunda línea del título.
    for i, linea in enumerate(textwrap.wrap(titulo, 31)[:2]):
        ax.text(x + 0.15, y_top - 0.26 - i * 0.105, linea, fontsize=6.3,
                color=TINTA2, va="center", zorder=5)


def dibujar(numero: int) -> Path:
    datos = SPRINTS[numero]
    por_columna = {c: [t for t in datos["tarjetas"] if t[5] == c] for c in COLUMNAS}
    maximo = max(len(v) for v in por_columna.values())

    alto_col = ENC + PAD_SUP + maximo * (TARJETA + SEP)
    fig, ax = plt.subplots(figsize=(7.3, alto_col + 2.05))
    ancho_total = 4 * ANCHO + 3 * GAP
    ax.set_xlim(-0.05, ancho_total + 0.05)
    y_top = alto_col

    for i, columna in enumerate(COLUMNAS):
        x = i * (ANCHO + GAP)
        tarjetas = por_columna[columna]
        puntos = sum(t[3] for t in tarjetas)

        ax.add_patch(Rectangle((x, y_top - alto_col), ANCHO, alto_col,
                               facecolor=FONDO_COL, edgecolor="none", zorder=1))
        ax.add_patch(Rectangle((x, y_top - ENC), ANCHO, ENC,
                               facecolor=ENCABEZADO, edgecolor="none", zorder=2))
        etiqueta = f"{columna}   ({len(tarjetas)})"
        if puntos:
            etiqueta += f"   {puntos} pts"
        ax.text(x + ANCHO / 2, y_top - ENC / 2, etiqueta, ha="center", va="center",
                fontsize=7.8, color="white", fontweight="bold", zorder=5)

        if not tarjetas:
            ax.text(x + ANCHO / 2, y_top - ENC - 0.42, "—", ha="center", va="center",
                    fontsize=11, color="#9aa0a6", zorder=5)

        y = y_top - ENC - PAD_SUP
        for clave, historia, titulo, pts, prioridad, _ in tarjetas:
            dibujar_tarjeta(ax, x, y, clave, historia, titulo, pts, prioridad)
            y -= TARJETA + SEP

    total = sum(t[3] for t in datos["tarjetas"])
    hechos = sum(t[3] for t in datos["tarjetas"] if t[5] == "Finalizado")

    ax.text(0, y_top + 0.46, datos["nombre"], fontsize=10.8, color="#0b0b0b",
            fontweight="bold", va="center")
    ax.text(0, y_top + 0.20,
            f"{datos['periodo']}  ·  {len(datos['tarjetas'])} historias  ·  "
            f"{hechos} de {total} puntos terminados  ·  {datos['estado']}",
            fontsize=7.4, color=TINTA2, va="center")

    for i, linea in enumerate(textwrap.wrap("Meta del sprint: " + datos["meta"], 118)):
        ax.text(0, -0.30 - i * 0.17, linea, fontsize=6.9, color=TINTA2, va="center")
    base = -0.30 - len(textwrap.wrap("Meta del sprint: " + datos["meta"], 118)) * 0.17

    leyenda = [plt.Line2D([], [], marker="s", linestyle="none", markersize=6.5,
                          markerfacecolor=COLOR_PRIORIDAD[p], markeredgecolor="none",
                          label=f"Prioridad {p.lower()}") for p in ("Alta", "Media", "Baja")]
    ax.legend(handles=leyenda, loc="upper left", bbox_to_anchor=(0, (base - 0.10 + 0.85) / (y_top + 1.4)),
              ncol=3, frameon=False, fontsize=6.8, handletextpad=0.4, columnspacing=1.6)

    for i, linea in enumerate(textwrap.wrap(datos["nota"], 118)):
        ax.text(0, base - 0.42 - i * 0.17, linea, fontsize=6.5, color=TINTA2, va="center")
    fondo = base - 0.42 - len(textwrap.wrap(datos["nota"], 118)) * 0.17

    ax.set_ylim(fondo - 0.15, y_top + 0.68)
    ax.axis("off")
    fig.tight_layout()

    ruta = SALIDA / f"tablero_sprint{numero}.png"
    fig.savefig(ruta, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return ruta


def main():
    for numero in sorted(SPRINTS):
        ruta = dibujar(numero)
        from PIL import Image
        w, h = Image.open(ruta).size
        datos = SPRINTS[numero]
        print(f"{ruta.name}: {w}x{h} px · {len(datos['tarjetas'])} tarjetas · "
              f"{sum(t[3] for t in datos['tarjetas'])} puntos")


if __name__ == "__main__":
    main()
