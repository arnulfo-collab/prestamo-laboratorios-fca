#!/usr/bin/env python3
"""Pruebas funcionales del incremento del Sprint 4.

Recorren los criterios de aceptación de HU-06, HU-13, HU-14, HU-15, HU-18 y
HU-22 sobre el portal servido por el servidor Node, contra la base de datos
real, y capturan las pantallas de evidencia.

Uso:  python3 -I pruebas_ui_sprint4.py [url]
"""
import csv
import io
import json
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
COORDINACION = "coordinacion.fca@uabc.edu.mx"

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


def reservar_en(usuario: int, lab: int, horas_al_inicio: float, estatus: int = 2) -> int:
    """Reservación situada a N horas de su hora de inicio."""
    return int(sql(f"""
        WITH t AS (SELECT date_trunc('minute', now() + interval '{horas_al_inicio} hours') AS ini)
        INSERT INTO prestamo.reservacion
              (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
               grupo_materia, motivo_uso, estatus_id, resuelta_por, resuelta_en)
        SELECT prestamo.folio_siguiente(), {usuario}, {lab}, t.ini::date, t.ini::time,
               (t.ini + interval '2 hours')::time,
               'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
               {estatus}, 2, now()
        FROM t RETURNING id""").splitlines()[0])


def historica(usuario: int, lab: int, dias_atras: int, estatus: int, hora: str) -> None:
    sql(f"""INSERT INTO prestamo.reservacion
              (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
               grupo_materia, motivo_uso, estatus_id, resuelta_por, resuelta_en)
            VALUES (prestamo.folio_siguiente(), {usuario}, {lab}, current_date - {dias_atras},
                    '{hora}', '{hora}'::time + interval '2 hours',
                    'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
                    {estatus}, 2, now())""")


def sembrar_historial() -> None:
    """Un mes de uso en LAB-03 y LAB-01, para que los reportes tengan materia."""
    for dia, estatus, hora in [
        (20, 6, "09:00"), (19, 6, "09:00"), (18, 6, "11:00"), (17, 6, "11:00"),
        (16, 8, "09:00"), (15, 8, "13:00"), (14, 6, "09:00"), (13, 6, "11:00"),
    ]:
        historica(1, 3, dia, estatus, hora)
    for dia, estatus, hora in [(20, 6, "13:00"), (19, 8, "13:00"), (18, 6, "15:00")]:
        historica(4, 1, dia, estatus, hora)


def entrar(pagina, correo: str) -> None:
    pagina.context.clear_cookies()
    pagina.goto(URL)
    pagina.wait_for_selector("#correo", timeout=15000)
    pagina.fill("#correo", correo)
    pagina.fill("#clave", CLAVE)
    pagina.click("button[type=submit]")
    pagina.wait_for_selector("nav a", timeout=15000)


def ir(pagina, seccion: str) -> None:
    if pagina.evaluate("location.hash") == f"#{seccion}":
        pagina.evaluate("location.hash = 'inicio'")
        pagina.wait_for_timeout(450)
    pagina.evaluate(f"location.hash = '{seccion}'")
    pagina.wait_for_timeout(1000)


def elegir_fecha(pagina, selector: str, fecha: str) -> None:
    if pagina.input_value(selector) == fecha:
        pagina.fill(selector, "2026-01-05")
        pagina.wait_for_timeout(500)
    pagina.fill(selector, fecha)
    pagina.wait_for_timeout(1100)


def descargar_csv(pagina, etiqueta: str) -> list[list[str]]:
    """Oprime un botón de exportación y devuelve el archivo ya interpretado."""
    with pagina.expect_download(timeout=15000) as espera:
        pagina.get_by_role("button", name=etiqueta).click()
    ruta = espera.value.path()
    texto = Path(ruta).read_text(encoding="utf-8-sig")
    return list(csv.reader(io.StringIO(texto)))


def main() -> int:
    reiniciar_base()
    hace = lambda n: sql(f"SELECT (current_date - {n})::text")

    with sync_playwright() as p:
        navegador = p.chromium.launch()
        ctx = navegador.new_context(viewport={"width": 1440, "height": 1000},
                                    device_scale_factor=2, accept_downloads=True)
        pag = ctx.new_page()

        # =============================================================
        # HU-06 · Confirmación y avisos
        # =============================================================
        entrar(pag, DOCENTE1)
        ir(pag, "avisos")
        sin_avisos = pag.locator(".aviso-fila").count()
        comprobar("HU-06", "La bandeja arranca sin avisos cuando no hay movimiento",
                  sin_avisos == 0 and pag.locator(".vacio").count() == 1)
        pag.screenshot(path=CAPTURAS / "s4-01-avisos-vacio.png", full_page=True)

        # El docente registra una solicitud desde la pantalla de disponibilidad.
        ir(pag, "calendario")
        lunes = sql("SELECT (current_date + ((8 - EXTRACT(isodow FROM current_date)::int) % 7 + 1))::text")
        elegir_fecha(pag, "#fecha", lunes)
        pag.locator("button.bloque.libre").first.click()
        pag.wait_for_selector(".modal", timeout=10000)
        pag.fill("#s-grupo", "Informática Administrativa · Grupo 421")
        pag.fill("#s-motivo", "Práctica de hoja de cálculo")
        pag.get_by_role("button", name="Registrar solicitud").click()
        pag.wait_for_timeout(1400)
        folio = sql("SELECT folio FROM prestamo.reservacion ORDER BY id DESC LIMIT 1")

        ir(pag, "avisos")
        comprobar("HU-06", f"Al registrar la solicitud llega la confirmación con el folio ({folio})",
                  pag.locator(".aviso-fila", has_text=folio).count() >= 1
                  and pag.locator(".aviso-fila", has_text="Recibimos tu solicitud").count() == 1)

        comprobar("HU-06", "El aviso nuevo aparece marcado como no leído",
                  pag.locator(".aviso-fila.sin-leer").count() >= 1)

        distintivo = pag.locator("nav a", has_text="Avisos").locator(".cuenta")
        comprobar("HU-06", "El menú muestra el número de avisos sin leer",
                  distintivo.count() == 1 and distintivo.inner_text().strip() == "1")
        pag.screenshot(path=CAPTURAS / "s4-02-aviso-confirmacion.png", full_page=True)

        # El encargado aprueba y el docente recibe el resultado.
        entrar(pag, ADMIN)
        ir(pag, "pendientes")
        pag.get_by_role("button", name="Aprobar").first.click()
        pag.wait_for_timeout(1300)

        entrar(pag, DOCENTE1)
        ir(pag, "avisos")
        comprobar("HU-06", "Al cambiar el estatus llega la notificación con el resultado",
                  pag.locator(".aviso-fila", has_text="Aprobada la reservación").count() == 1)

        aprobado = pag.locator(".aviso-fila", has_text="Aprobada la reservación").first
        comprobar("HU-06", "El aviso de aprobación dice qué laboratorio y qué horario quedaron apartados",
                  "LAB-" in aprobado.inner_text() and " a " in aprobado.inner_text())

        # Marcar como leído y comprobar que el distintivo baja.
        aprobado.click()
        pag.wait_for_timeout(900)
        comprobar("HU-06", "Al abrir un aviso deja de contarse como no leído",
                  pag.locator("nav a", has_text="Avisos").locator(".cuenta").inner_text().strip() == "1")

        pag.get_by_role("button", name="Marcar todo como leído").click()
        pag.wait_for_timeout(1100)
        comprobar("HU-06", "Al marcar todo como leído el distintivo desaparece",
                  pag.locator("nav a", has_text="Avisos").locator(".cuenta").count() == 0)

        # Rechazo con motivo.
        rechazable = reservar_en(1, 4, 60, 1)
        entrar(pag, ADMIN)
        ir(pag, "pendientes")
        pag.get_by_role("button", name="Rechazar").first.click()
        pag.wait_for_selector(".modal", timeout=10000)
        pag.fill("#r-motivo", "El laboratorio tiene mantenimiento programado ese día.")
        pag.get_by_role("button", name="Rechazar solicitud").click()
        pag.wait_for_timeout(1300)

        entrar(pag, DOCENTE1)
        ir(pag, "avisos")
        rechazo = pag.locator(".aviso-fila", has_text="No se autorizó")
        comprobar("HU-06", "El aviso de rechazo incluye el motivo que capturó el encargado",
                  rechazo.count() == 1 and "mantenimiento" in rechazo.first.inner_text())

        # Liberación por inasistencia.
        reservar_en(1, 5, -4, 2)
        sql("SELECT count(*) FROM prestamo.liberar_inasistencias()")
        ir(pag, "avisos")
        comprobar("HU-06", "Cuando el sistema libera la reservación por inasistencia, el docente recibe el aviso",
                  pag.locator(".aviso-fila", has_text="Se liberó la reservación").count() == 1)
        pag.screenshot(path=CAPTURAS / "s4-03-bandeja-avisos.png", full_page=True)

        # =============================================================
        # HU-18 · Recordatorio previo a la reservación
        # =============================================================
        proxima = reservar_en(1, 2, 20, 2)
        lejana = reservar_en(1, 3, 72, 2)
        sql("SELECT * FROM prestamo.procesar_avisos()")

        ir(pag, "avisos")
        recordatorio = pag.locator(".aviso-fila", has_text="es mañana")
        comprobar("HU-18", "Al cumplirse el momento configurado (P-09) llega el recordatorio",
                  recordatorio.count() == 1)

        comprobar("HU-18", "El recordatorio ofrece confirmar o cancelar",
                  recordatorio.first.get_by_role("button", name="Confirmar").count() == 1
                  and recordatorio.first.get_by_role("button", name="Cancelar la reservación").count() == 1)

        comprobar("HU-18", "Una reservación todavía lejana no genera recordatorio",
                  sql(f"SELECT count(*) FROM prestamo.notificacion "
                      f"WHERE reservacion_id = {lejana} AND tipo LIKE 'recordatorio%'") == "0")
        pag.screenshot(path=CAPTURAS / "s4-04-recordatorio.png", full_page=True)

        recordatorio.first.get_by_role("button", name="Confirmar").click()
        pag.wait_for_timeout(1500)
        comprobar("HU-18", "Al confirmar, la reservación pasa a Confirmada y conserva el horario",
                  sql(f"SELECT estatus_id FROM prestamo.reservacion WHERE id = {proxima}") == "4"
                  and sql(f"SELECT confirmada_en IS NOT NULL FROM prestamo.reservacion "
                          f"WHERE id = {proxima}") == "t")

        comprobar("HU-18", "La confirmación se avisa en pantalla con el folio",
                  pag.locator(".nota.bien").count() == 1
                  and "Confirmaste" in pag.locator(".nota.bien").inner_text())
        pag.screenshot(path=CAPTURAS / "s4-05-confirmada.png", full_page=True)

        # Cancelar desde el recordatorio de otra reservación.
        otra = reservar_en(1, 4, 18, 2)
        sql("SELECT * FROM prestamo.procesar_avisos()")
        faltas_antes = sql("SELECT prestamo.inasistencias_vigentes(1)")
        ir(pag, "avisos")
        pendiente = pag.locator(".aviso-fila", has_text="es mañana").first
        pendiente.get_by_role("button", name="Cancelar la reservación").click()
        pag.wait_for_timeout(1600)
        comprobar("HU-18", "Al cancelar desde el recordatorio el horario se libera",
                  sql(f"SELECT estatus_id FROM prestamo.reservacion WHERE id = {otra}") == "7")
        comprobar("HU-18", "Cancelar dentro del plazo no se contabiliza como falta",
                  sql("SELECT prestamo.inasistencias_vigentes(1)") == faltas_antes)

        ir(pag, "mis-solicitudes")
        comprobar("HU-18", "La reservación confirmada se ve como Confirmada en el seguimiento",
                  pag.locator("tr", has_text="Confirmada").count() >= 1)

        # =============================================================
        # HU-13 · Dashboard de uso
        # =============================================================
        # El historial se siembra hasta aquí: darlo de alta antes llenaría la
        # bandeja de avisos y estropearía el primer criterio de HU-06.
        sembrar_historial()

        entrar(pag, COORDINACION)
        ir(pag, "reportes")
        elegir_fecha(pag, "#desde", hace(25))
        elegir_fecha(pag, "#hasta", hace(10))

        cifras = pag.locator(".cifra .n")
        comprobar("HU-13", "El dashboard presenta las cuatro cifras de cabecera",
                  cifras.count() == 4)

        comprobar("HU-13", "El dashboard identifica el laboratorio más solicitado",
                  "LAB-03" in pag.locator(".cifra", has_text="Laboratorio más solicitado").inner_text())

        comprobar("HU-13", "El dashboard identifica el horario de mayor demanda",
                  ":" in pag.locator(".cifra", has_text="Horario de mayor demanda")
                            .locator(".n").inner_text())

        comprobar("HU-13", "El dashboard presenta las horas desperdiciadas",
                  pag.locator(".cifra", has_text="Horas-laboratorio desperdiciadas")
                     .locator(".n").inner_text().strip() not in ("", "—"))

        comprobar("HU-13", "El dashboard dibuja las tres gráficas",
                  pag.locator("svg.gráfica").count() == 3)
        pag.screenshot(path=CAPTURAS / "s4-06-dashboard.png",
                       clip={"x": 0, "y": 0, "width": 1440, "height": 1000})
        pag.screenshot(path=CAPTURAS / "s4-06b-graficas.png",
                       full_page=True, clip={"x": 0, "y": 980, "width": 1440, "height": 1150})

        antes = pag.locator(".cifra", has_text="Tasa de asistencia").locator(".ayuda").inner_text()
        elegir_fecha(pag, "#desde", hace(18))
        despues = pag.locator(".cifra", has_text="Tasa de asistencia").locator(".ayuda").inner_text()
        comprobar("HU-13", "Al cambiar el rango de fechas las gráficas se recalculan",
                  antes != despues)

        elegir_fecha(pag, "#desde", hace(3000))
        elegir_fecha(pag, "#hasta", hace(2900))
        comprobar("HU-13", "Sin registros en el periodo, el sistema lo indica en lugar de "
                           "mostrar gráficas vacías",
                  pag.locator(".vacio").count() == 1 and pag.locator("svg.gráfica").count() == 0)
        pag.screenshot(path=CAPTURAS / "s4-07-sin-datos.png", full_page=True)

        # =============================================================
        # HU-14 · Identificación de demanda
        # =============================================================
        elegir_fecha(pag, "#desde", hace(25))
        elegir_fecha(pag, "#hasta", hace(10))
        filas = pag.locator("table tbody tr")
        primera = filas.first.inner_text()
        comprobar("HU-14", "Los laboratorios aparecen ordenados por número de solicitudes",
                  primera.startswith("LAB-03"))

        numeros = [int(filas.nth(i).locator("td").nth(1).inner_text())
                   for i in range(filas.count())]
        comprobar("HU-14", "El orden descendente se respeta en todo el reporte",
                  numeros == sorted(numeros, reverse=True))

        comprobar("HU-14", "Un laboratorio sin movimiento aparece en cero y no se omite",
                  0 in numeros and filas.count() == int(sql(
                      "SELECT count(*) FROM prestamo.laboratorio")))

        # inner_text() no sirve sobre SVG: sus nodos no son HTMLElement.
        horarios_svg = pag.locator("svg.gráfica").nth(1).text_content() or ""
        comprobar("HU-14", "La gráfica por horario lista las franjas en el orden del día",
                  0 <= horarios_svg.find("07:00") < horarios_svg.find("19:00"))

        # =============================================================
        # HU-22 · Indicador de aprovechamiento
        # =============================================================
        tasa = pag.locator(".cifra", has_text="Tasa de asistencia").locator(".n").inner_text()
        esperada = sql(f"SELECT tasa_asistencia FROM prestamo.indicadores_uso("
                       f"'{hace(25)}'::date, '{hace(10)}'::date)")
        comprobar("HU-22", f"La tasa de asistencia que muestra el portal ({tasa.strip()}) "
                           f"coincide con la que calcula la base",
                  tasa.replace("%", "").strip() == esperada.strip())

        horas = pag.locator(".cifra", has_text="Horas-laboratorio desperdiciadas").locator(".n").inner_text()
        esperadas = sql(f"SELECT horas_perdidas FROM prestamo.indicadores_uso("
                        f"'{hace(25)}'::date, '{hace(10)}'::date)")
        comprobar("HU-22", f"Las horas desperdiciadas ({horas.strip()}) coinciden con la base",
                  float(horas) == float(esperadas))

        pag.select_option("#lab", label=sql(
            "SELECT clave || ' · ' || nombre FROM prestamo.laboratorio WHERE clave = 'LAB-01'"))
        pag.wait_for_timeout(1300)
        comprobar("HU-22", "Al filtrar por laboratorio los indicadores se recalculan",
                  pag.locator("table tbody tr").count() == 1
                  and pag.locator("table tbody tr").first.inner_text().startswith("LAB-01"))
        pag.screenshot(path=CAPTURAS / "s4-08-filtro-laboratorio.png", full_page=True)

        # =============================================================
        # HU-15 · Exportación de información
        # =============================================================
        pag.select_option("#lab", value="")
        pag.wait_for_timeout(1300)

        archivo = descargar_csv(pag, "Demanda por laboratorio (CSV)")
        comprobar("HU-15", "La exportación genera un archivo descargable con la información mostrada",
                  archivo[0][0] == "Clave"
                  and len(archivo) - 1 == int(sql("SELECT count(*) FROM prestamo.laboratorio")))

        comprobar("HU-15", "El archivo trae las mismas cifras que la pantalla",
                  archivo[1][0] == "LAB-03"
                  and archivo[1][2] == pag.locator("table tbody tr").first
                                          .locator("td").nth(1).inner_text().strip())

        pag.select_option("#lab", label=sql(
            "SELECT clave || ' · ' || nombre FROM prestamo.laboratorio WHERE clave = 'LAB-01'"))
        pag.wait_for_timeout(1300)
        filtrado = descargar_csv(pag, "Detalle de reservaciones (CSV)")
        laboratorios_en_archivo = {f[1] for f in filtrado[1:]}
        comprobar("HU-15", "Con un filtro aplicado, el archivo contiene únicamente lo filtrado",
                  laboratorios_en_archivo == {"LAB-01"})

        comprobar("HU-15", "El detalle exporta folio, docente, fecha, horario y estatus",
                  filtrado[0] == ["Folio", "Clave", "Laboratorio", "Docente", "Fecha",
                                  "Inicio", "Fin", "Grupo o materia", "Estatus"])

        # =============================================================
        # Permisos y adaptación a pantalla chica
        # =============================================================
        entrar(pag, DOCENTE1)
        pag.evaluate("location.hash = 'reportes'")
        pag.wait_for_timeout(900)
        comprobar("HU-13", "Un docente no puede abrir los reportes escribiendo la dirección",
                  pag.locator("h1", has_text="Acceso denegado").count() == 1)

        movil = navegador.new_context(viewport={"width": 390, "height": 844},
                                      device_scale_factor=2)
        pm = movil.new_page()
        entrar(pm, COORDINACION)
        ir(pm, "reportes")
        pm.wait_for_timeout(1200)
        ancho = pm.evaluate("document.documentElement.scrollWidth")
        comprobar("HU-01", f"Los reportes no se desbordan en 390 px (miden {ancho} px)",
                  ancho <= 390)
        pm.screenshot(path=CAPTURAS / "s4-09-movil-reportes.png")

        entrar(pm, DOCENTE1)
        ir(pm, "avisos")
        pm.wait_for_timeout(900)
        ancho2 = pm.evaluate("document.documentElement.scrollWidth")
        comprobar("HU-06", f"La bandeja de avisos no se desborda en 390 px (mide {ancho2} px)",
                  ancho2 <= 390)
        pm.screenshot(path=CAPTURAS / "s4-10-movil-avisos.png")

        # =============================================================
        # HU-01 · Segundo incremento: portal instalable en el teléfono
        # =============================================================
        manifiesto = json.loads(pm.evaluate("""
            fetch('./manifest.webmanifest').then(r => r.text())
        """))
        comprobar("HU-01", "El portal declara su manifiesto de aplicación instalable",
                  manifiesto.get("display") == "standalone"
                  and manifiesto.get("start_url", "").endswith("/")
                  and len(manifiesto.get("icons", [])) >= 2)

        comprobar("HU-01", "El manifiesto incluye un icono recortable, que es el que Android exige",
                  any(i.get("purpose") == "maskable" for i in manifiesto["icons"]))

        iconos_ok = pm.evaluate("""
            Promise.all(%s.map(u => fetch(u).then(r => r.ok && r.headers.get('content-type'))))
        """ % json.dumps([i["src"] for i in manifiesto["icons"]]))
        comprobar("HU-01", "Los iconos declarados existen y se sirven como imagen",
                  all(c and "image/png" in c for c in iconos_ok))

        pm.reload()
        pm.wait_for_timeout(2500)
        registrado = pm.evaluate(
            "navigator.serviceWorker.getRegistration().then(r => !!r)")
        comprobar("HU-01", "El portal registra su trabajador de servicio al abrirse",
                  bool(registrado))

        sin_red = pm.evaluate("""
            fetch('/api/laboratorios').then(r => r.ok).catch(() => false)
        """)
        comprobar("HU-01", "Con el trabajador activo, la API sigue respondiendo desde la red",
                  bool(sin_red))

        navegador.close()

    aprobadas = sum(1 for *_, ok in resultados if ok)
    print(f"\nCriterios comprobados: {len(resultados)} · aprobados: {aprobadas} · "
          f"fallidos: {len(resultados) - aprobadas}")
    print(f"Capturas en: {CAPTURAS}")
    return 0 if aprobadas == len(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
