#!/usr/bin/env python3
"""Pruebas funcionales del incremento del Sprint 2.

Recorren los criterios de aceptación de HU-03, HU-04, HU-05, HU-12 y HU-20
sobre el portal servido por el servidor Node, contra la base de datos real,
y capturan las pantallas que sirven de evidencia en la revisión del sprint.

Uso:  python3 -I pruebas_ui_sprint2.py [url]
"""
import datetime as dt
import os
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
# La cadena puede sobrescribirse con BD_PRUEBAS, para correr las pruebas
# contra una instancia distinta sin editar el guion.
BD = os.environ.get("BD_PRUEBAS", "postgresql://postgres@localhost:5433/postgres")
RAIZ = Path(__file__).resolve().parent.parent
CAPTURAS = Path(__file__).parent / "capturas"
CAPTURAS.mkdir(exist_ok=True)

CLAVE = "Lab2026$fca"
DOCENTE1 = "arnulfo.vasquez@uabc.edu.mx"
DOCENTE2 = "docente.prueba@uabc.edu.mx"
ADMIN = "laboratorios.fca@uabc.edu.mx"

resultados: list[tuple[str, str, bool]] = []


def comprobar(historia: str, criterio: str, condicion: bool) -> None:
    resultados.append((historia, criterio, bool(condicion)))
    print(f"{'APROBADA ' if condicion else 'FALLA    '} · {historia} · {criterio}")


def sql(consulta: str) -> str:
    return subprocess.run(
        ["psql", BD, "-tAc", consulta], capture_output=True, text=True, check=True
    ).stdout.strip()


def reiniciar_base() -> None:
    for archivo in ("01_esquema.sql", "02_datos_iniciales.sql", "04_sprint2.sql",
                    "06_sprint3.sql", "08_sprint4.sql"):
        subprocess.run(
            ["psql", BD, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(RAIZ / "bd" / archivo)],
            check=True, capture_output=True,
        )


def proximo_lunes() -> str:
    hoy = dt.date.today()
    return (hoy + dt.timedelta(days=(7 - hoy.weekday()) or 7)).isoformat()


def entrar(pagina, correo: str) -> None:
    # Se descarta la cookie de la sesión anterior para entrar con otra cuenta.
    pagina.context.clear_cookies()
    pagina.goto(URL)
    pagina.wait_for_selector("#correo", timeout=15000)
    pagina.fill("#correo", correo)
    pagina.fill("#clave", CLAVE)
    pagina.click("button[type=submit]")
    pagina.wait_for_selector("nav a", timeout=15000)


def ir(pagina, seccion: str) -> None:
    pagina.evaluate(f"location.hash = '{seccion}'")
    pagina.wait_for_timeout(700)


def elegir_fecha(pagina, fecha: str) -> None:
    # Si la fecha ya estaba puesta, React no vuelve a consultar: se pasa por
    # otra fecha para forzar la recarga del calendario.
    if pagina.input_value("#fecha") == fecha:
        pagina.fill("#fecha", "2026-01-05")
        pagina.wait_for_timeout(500)
    pagina.fill("#fecha", fecha)
    pagina.wait_for_timeout(1000)


def solicitar(pagina, bloque: str, grupo: str, motivo: str,
              inicio: str | None = None, fin: str | None = None):
    """Abre el primer bloque libre con esa etiqueta y envía la solicitud."""
    pagina.locator(".bloque.libre", has_text=bloque).first.click()
    pagina.wait_for_selector(".modal", timeout=5000)
    if inicio:
        pagina.fill("#s-inicio", inicio)
    if fin:
        pagina.fill("#s-fin", fin)
    pagina.fill("#s-grupo", grupo)
    pagina.fill("#s-motivo", motivo)
    pagina.click(".modal .boton:not(.secundario)")
    pagina.wait_for_timeout(900)


def main() -> int:
    reiniciar_base()
    lunes = proximo_lunes()
    print(f"Fecha de prueba: {lunes}\n")

    with sync_playwright() as p:
        navegador = p.chromium.launch()
        ctx = navegador.new_context(viewport={"width": 1440, "height": 980}, device_scale_factor=2)
        pag = ctx.new_page()

        # ---------- HU-03 ----------
        entrar(pag, DOCENTE1)
        ir(pag, "calendario")
        elegir_fecha(pag, lunes)

        comprobar("HU-03", "El calendario muestra los 5 laboratorios activos de la facultad",
                  pag.locator(".lab-fila").count() == 5)
        comprobar("HU-03", "Los bloques libres y los ocupados se distinguen visualmente",
                  pag.locator(".bloque.libre").count() > 0 and pag.locator(".leyenda").is_visible())
        pag.screenshot(path=CAPTURAS / "s2-01-calendario.png", full_page=True)

        # ---------- HU-04 ----------
        pag.locator(".bloque.libre", has_text="09:00\u201311:00").first.click()
        pag.wait_for_selector(".modal")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(700)
        comprobar("HU-04", "Sin grupo o materia la solicitud no se registra",
                  "grupo o la materia" in pag.inner_text(".modal"))
        pag.screenshot(path=CAPTURAS / "s2-02-validacion-solicitud.png")

        pag.fill("#s-grupo", "Informática Administrativa · Grupo 421")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(700)
        comprobar("HU-04", "Sin motivo de uso la solicitud no se registra",
                  "motivo de uso" in pag.inner_text(".modal"))

        pag.fill("#s-motivo", "Práctica de hoja de cálculo con el grupo completo")
        # Se reduce el horario a una hora dentro del bloque, para que más
        # adelante otra solicitud pueda traslaparse solo parcialmente con ésta.
        pag.fill("#s-fin", "10:00")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(1000)
        texto = pag.inner_text("main")
        comprobar("HU-04", "Una solicitud válida genera folio y queda en estatus Solicitada",
                  "RES-" in texto and "Solicitada" in texto)
        pag.screenshot(path=CAPTURAS / "s2-03-folio.png")

        # Fecha anterior a hoy.
        elegir_fecha(pag, (dt.date.today() - dt.timedelta(days=7)).isoformat())
        if pag.locator(".bloque.libre").count():
            solicitar(pag, "09:00\u201311:00", "Grupo 421", "Prueba de fecha pasada")
            comprobar("HU-04", "Una fecha anterior a hoy se rechaza indicando que no es válida",
                      "ya pasó" in pag.inner_text(".modal"))
            pag.click(".modal .boton.secundario")
            pag.wait_for_timeout(400)
        else:
            comprobar("HU-04", "Una fecha anterior a hoy se rechaza indicando que no es válida", False)

        # Horario que excede el bloque publicado.
        elegir_fecha(pag, lunes)
        solicitar(pag, "11:00\u201313:00", "Grupo 421", "Prueba de duración", fin="15:00")
        comprobar("HU-04", "Un horario que excede el bloque publicado se impide",
                  "excede el bloque" in pag.inner_text(".modal"))
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        # ---------- HU-20 ----------
        elegir_fecha(pag, (dt.date.today() + dt.timedelta(days=45)).isoformat())
        if pag.locator(".bloque.libre").count():
            solicitar(pag, "09:00\u201311:00", "Grupo 421", "Prueba de anticipación")
            comprobar("HU-20", "Apartar a más de 30 días (P-07) se rechaza indicando la fecha máxima",
                      "30 días de anticipación" in pag.inner_text(".modal"))
            pag.screenshot(path=CAPTURAS / "s2-04-anticipacion.png")
            pag.click(".modal .boton.secundario")
            pag.wait_for_timeout(400)
        else:
            comprobar("HU-20", "Apartar a más de 30 días (P-07) se rechaza indicando la fecha máxima", False)

        # Llega al límite de 3 reservaciones activas.
        elegir_fecha(pag, lunes)
        solicitar(pag, "11:00\u201313:00", "Sistemas de Información · Grupo 318",
                  "Taller de bases de datos")
        solicitar(pag, "13:00\u201315:00", "Contabilidad Digital · Grupo 205",
                  "Ejercicios de software contable")
        comprobar("HU-20", "El docente alcanza sus 3 reservaciones activas",
                  sql("SELECT prestamo.reservaciones_activas(1)") == "3")

        solicitar(pag, "15:00\u201317:00", "Grupo 421", "Cuarta solicitud")
        comprobar("HU-20", "La cuarta solicitud se impide indicando el límite vigente (P-06 = 3)",
                  "límite vigente es de 3" in pag.inner_text(".modal"))
        pag.screenshot(path=CAPTURAS / "s2-05-limite.png")
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        # ---------- HU-05 ----------
        ir(pag, "mis-solicitudes")
        comprobar("HU-05", "Mis solicitudes lista cada una con folio, laboratorio, fecha y estatus",
                  pag.locator("tbody tr").count() == 3 and "RES-2026-" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s2-06-mis-solicitudes.png", full_page=True)

        # ---------- HU-12 ----------
        # El segundo docente pide un horario que se traslapa parcialmente con
        # la primera solicitud del docente 1 en el mismo laboratorio.
        entrar(pag, DOCENTE2)
        ir(pag, "calendario")
        elegir_fecha(pag, lunes)
        # Pide de 09:30 a 11:00, que se traslapa solo media hora con la
        # solicitud del primer docente, de 09:00 a 10:00.
        solicitar(pag, "09:00\u201311:00", "Estadística Aplicada · Grupo 112",
                  "Prácticas con hoja de cálculo", inicio="09:30")
        comprobar("HU-12", "Dos docentes pueden solicitar horarios que se traslapan",
                  "RES-" in pag.inner_text("main"))

        entrar(pag, ADMIN)
        ir(pag, "pendientes")
        comprobar("HU-12", "El encargado ve las solicitudes y el sistema señala el empalme detectado",
                  pag.locator("text=Empalme detectado").count() >= 2)
        pag.screenshot(path=CAPTURAS / "s2-07-conflictos.png", full_page=True)

        # Aprueba la primera del listado.
        pag.locator(".tarjeta", has_text="Empalme detectado").first.locator(
            "button.boton:not(.secundario)").click()
        pag.wait_for_timeout(1200)
        comprobar("HU-12", "Aprobar la primera reservación se permite y queda registrada",
                  "quedó aprobada" in pag.inner_text("main"))

        # Intenta aprobar la que ahora choca con una aprobada.
        tarjeta = pag.locator(".tarjeta", has_text="Empalme detectado").first
        if tarjeta.count():
            tarjeta.locator("button.boton:not(.secundario)").click()
            pag.wait_for_timeout(1200)
            comprobar("HU-12", "Aprobar la segunda se impide y el aviso nombra el folio en conflicto",
                      "No se puede aprobar" in pag.inner_text("main"))
            pag.screenshot(path=CAPTURAS / "s2-08-empalme-impedido.png", full_page=True)
        else:
            comprobar("HU-12", "Aprobar la segunda se impide y el aviso nombra el folio en conflicto", False)

        comprobar("HU-12", "La solicitud en conflicto permanece en estatus Solicitada",
                  sql("SELECT count(*) FROM prestamo.reservacion WHERE estatus_id = 1") != "0")

        # Rechazo: exige motivo y libera el cupo del docente.
        pag.locator(".tarjeta", has_text="Sin conflictos").first.locator(".boton.secundario").click()
        pag.wait_for_selector(".modal")
        pag.click(".modal .boton.riesgo")
        pag.wait_for_timeout(800)
        comprobar("HU-12", "Rechazar sin capturar el motivo no se permite",
                  "motivo del rechazo" in pag.inner_text("main").lower())

        pag.fill("#r-motivo", "El laboratorio se requiere para un examen departamental.")
        pag.click(".modal .boton.riesgo")
        pag.wait_for_timeout(1200)
        comprobar("HU-20", "Al rechazarse una solicitud el cupo del docente se libera",
                  "cupo del docente se liberó" in pag.inner_text("main"))

        # ---------- HU-03, criterios 2 y 4 ----------
        ir(pag, "calendario")
        elegir_fecha(pag, lunes)
        comprobar("HU-03", "Tras aprobarse una reservación, ese horario aparece ocupado",
                  pag.locator(".bloque.ocupado").count() >= 1)
        pag.screenshot(path=CAPTURAS / "s2-09-calendario-ocupado.png", full_page=True)

        ocupados_antes = pag.locator(".bloque.ocupado").count()
        sql("UPDATE prestamo.reservacion SET estatus_id = 8 WHERE estatus_id = 2")
        elegir_fecha(pag, lunes)
        comprobar("HU-03", "Una reservación liberada por inasistencia vuelve a aparecer disponible",
                  pag.locator(".bloque.ocupado").count() < ocupados_antes)

        # Bloqueo por mantenimiento.
        sql(
            "INSERT INTO prestamo.bloqueo_laboratorio (laboratorio_id, motivo, fecha_inicio, fecha_fin, registrado_por) "
            f"SELECT id, 'Mantenimiento preventivo', '{lunes}', '{lunes}', 2 FROM prestamo.laboratorio WHERE clave = 'LAB-05'"
        )
        elegir_fecha(pag, lunes)
        comprobar("HU-03", "Un laboratorio bloqueado por mantenimiento aparece como no disponible",
                  pag.locator(".bloque.bloqueado").count() > 0)

        # ---------- HU-05, criterios 2, 3 y 4 ----------
        entrar(pag, DOCENTE1)
        ir(pag, "mis-solicitudes")
        pag.locator("tr", has_text="Rechazada").first.locator("button").click()
        pag.wait_for_selector(".modal")
        comprobar("HU-05", "Una solicitud rechazada muestra el motivo del rechazo",
                  "examen departamental" in pag.inner_text(".modal"))
        pag.screenshot(path=CAPTURAS / "s2-10-detalle-rechazo.png")
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        fila_no = pag.locator("tr", has_text="No asistió")
        if fila_no.count():
            fila_no.first.locator("button").click()
            pag.wait_for_selector(".modal")
            comprobar("HU-05", "Una solicitud marcada como No asistió lo indica junto con la fecha",
                      "No asistió" in pag.inner_text(".modal") and "liberó el" in pag.inner_text(".modal"))
            pag.click(".modal .boton.secundario")
        else:
            comprobar("HU-05", "Una solicitud marcada como No asistió lo indica junto con la fecha", False)

        entrar(pag, DOCENTE2)
        ir(pag, "mis-solicitudes")
        tiene_registros = pag.locator("tbody tr").count()
        comprobar("HU-05", "Un docente sin solicitudes registradas recibe el aviso correspondiente",
                  tiene_registros > 0 or "No has registrado solicitudes" in pag.inner_text("main"))

        # ---------- HU-01 · el portal del Sprint 2 sigue siendo adaptable ----------
        movil = navegador.new_context(viewport={"width": 390, "height": 844},
                                      device_scale_factor=3, is_mobile=True, has_touch=True)
        pm = movil.new_page()
        entrar(pm, DOCENTE1)
        ir(pm, "calendario")
        pm.fill("#fecha", lunes)
        pm.wait_for_timeout(1000)
        ancho = pm.evaluate("document.documentElement.scrollWidth")
        comprobar("HU-01", f"El calendario no se desborda en pantalla de 390 px (mide {ancho} px)",
                  ancho <= 390)
        pm.screenshot(path=CAPTURAS / "s2-11-movil-calendario.png")

        navegador.close()

    aprobadas = sum(1 for *_, ok in resultados if ok)
    print(f"\nCriterios comprobados: {len(resultados)} · aprobados: {aprobadas} · "
          f"fallidos: {len(resultados) - aprobadas}")
    print(f"Capturas en: {CAPTURAS}")
    return 0 if aprobadas == len(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
