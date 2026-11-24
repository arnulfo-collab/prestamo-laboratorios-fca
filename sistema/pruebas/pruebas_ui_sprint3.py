#!/usr/bin/env python3
"""Pruebas funcionales del incremento del Sprint 3.

Recorren los criterios de aceptación de HU-07, HU-08, HU-10, HU-11, HU-16,
HU-17, HU-19 y HU-21 sobre el portal servido por el servidor Node, contra la
base de datos real, y capturan las pantallas de evidencia.

Uso:  python3 -I pruebas_ui_sprint3.py [url]
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
    for archivo in ("01_esquema.sql", "02_datos_iniciales.sql", "04_sprint2.sql", "06_sprint3.sql", "08_sprint4.sql"):
        subprocess.run(
            ["psql", BD, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(RAIZ / "bd" / archivo)],
            check=True, capture_output=True,
        )


def reservar(usuario: int, lab: int, minutos_desde_inicio: int, estatus: int = 2) -> int:
    """Crea una reservación situada a N minutos de su hora de inicio."""
    return int(sql(f"""
        WITH t AS (SELECT date_trunc('minute', now() - interval '{minutos_desde_inicio} minutes') AS ini)
        INSERT INTO prestamo.reservacion
              (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
               grupo_materia, motivo_uso, estatus_id, resuelta_por, resuelta_en)
        SELECT prestamo.folio_siguiente(), {usuario}, {lab}, t.ini::date, t.ini::time,
               (t.ini + interval '2 hours')::time,
               'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
               {estatus}, 2, now()
        FROM t RETURNING id""").splitlines()[0])


def proximo_lunes() -> str:
    hoy = dt.date.today()
    return (hoy + dt.timedelta(days=(7 - hoy.weekday()) or 7)).isoformat()


def entrar(pagina, correo: str) -> None:
    pagina.context.clear_cookies()
    pagina.goto(URL)
    pagina.wait_for_selector("#correo", timeout=15000)
    pagina.fill("#correo", correo)
    pagina.fill("#clave", CLAVE)
    pagina.click("button[type=submit]")
    pagina.wait_for_selector("nav a", timeout=15000)


def ir(pagina, seccion: str) -> None:
    # Si ya estamos en la sección, el cambio de dirección no dispara nada: se
    # pasa por otra para forzar que la vista vuelva a consultar sus datos.
    if pagina.evaluate("location.hash") == f"#{seccion}":
        pagina.evaluate("location.hash = 'inicio'")
        pagina.wait_for_timeout(450)
    pagina.evaluate(f"location.hash = '{seccion}'")
    pagina.wait_for_timeout(900)


def elegir_fecha(pagina, selector: str, fecha: str) -> None:
    if pagina.input_value(selector) == fecha:
        pagina.fill(selector, "2026-01-05")
        pagina.wait_for_timeout(450)
    pagina.fill(selector, fecha)
    pagina.wait_for_timeout(950)


def main() -> int:
    reiniciar_base()
    lunes = proximo_lunes()
    print(f"Fecha de prueba: {lunes}\n")

    with sync_playwright() as p:
        navegador = p.chromium.launch()
        ctx = navegador.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        pag = ctx.new_page()

        # =============================================================
        # HU-21 · Configuración de las reglas de préstamo
        # =============================================================
        entrar(pag, ADMIN)
        ir(pag, "parametros")

        comprobar("HU-21", "La configuración muestra los nueve parámetros con su valor actual",
                  pag.locator(".rejilla > .tarjeta").count() == 9)

        pag.fill("#p-P-06", "99")
        pag.locator(".tarjeta", has_text="P-06").first.locator("button.boton").click()
        pag.wait_for_timeout(800)
        comprobar("HU-21", "Un valor fuera de rango se rechaza indicando el rango permitido",
                  "debe estar entre 1 y 20" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s3-01-parametros.png", full_page=True)

        pag.fill("#p-P-06", "2")
        pag.locator(".tarjeta", has_text="P-06").first.locator("button.boton").click()
        pag.wait_for_timeout(900)
        comprobar("HU-21", "Al guardar, las nuevas reservaciones se validan con el valor actualizado",
                  sql("SELECT prestamo.parametro_entero('P-06')") == "2")

        comprobar("HU-21", "El cambio queda registrado con quién, cuándo y el valor anterior",
                  "3" in pag.inner_text("main") and "Encargado" in pag.inner_text("main")
                  and sql("SELECT count(*) FROM prestamo.bitacora_parametro WHERE clave='P-06'") == "1")
        pag.screenshot(path=CAPTURAS / "s3-02-bitacora-parametros.png", full_page=True)

        pag.fill("#p-P-06", "3")
        pag.locator(".tarjeta", has_text="P-06").first.locator("button.boton").click()
        pag.wait_for_timeout(900)

        # =============================================================
        # HU-10 · Bloqueo por mantenimiento
        # =============================================================
        ir(pag, "bloqueos")
        pag.click("button.boton:has-text('Registrar un bloqueo')")
        pag.wait_for_selector(".modal")
        pag.select_option("#b-lab", label="LAB-05 · Centro de Autoacceso")
        pag.fill("#b-motivo", "Mantenimiento preventivo de equipos")
        pag.fill("#b-inicio", lunes)
        pag.fill("#b-fin", lunes)
        pag.click(".modal button.boton:not(.secundario)")
        pag.wait_for_timeout(1100)

        comprobar("HU-10", "El bloqueo queda registrado con su laboratorio, motivo y rango de fechas",
                  "Mantenimiento preventivo" in pag.inner_text("main")
                  and "LAB-05" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s3-03-bloqueos.png", full_page=True)

        ir(pag, "calendario")
        elegir_fecha(pag, "#fecha", lunes)
        comprobar("HU-10", "Durante el bloqueo el laboratorio deja de mostrarse disponible",
                  pag.locator(".bloque.bloqueado").count() > 0)

        elegir_fecha(pag, "#fecha", (dt.date.fromisoformat(lunes) + dt.timedelta(days=1)).isoformat())
        comprobar("HU-10", "Concluido el bloqueo el laboratorio vuelve a mostrarse disponible",
                  pag.locator(".bloque.bloqueado").count() == 0)

        # =============================================================
        # HU-16 · Registro de asistencia
        # =============================================================
        reciente = reservar(1, 1, 5)       # empezó hace 5 minutos
        reservar(1, 3, -45)                # empieza en 45 minutos
        vencida = reservar(1, 4, 40)       # venció la tolerancia

        entrar(pag, DOCENTE1)
        ir(pag, "mis-solicitudes")
        fila_reciente = pag.locator("tr", has_text=sql(
            f"SELECT folio FROM prestamo.reservacion WHERE id = {reciente}"))

        comprobar("HU-16", "La reservación en curso ofrece registrar la asistencia",
                  fila_reciente.locator("button:has-text('Registrar asistencia')").count() == 1)
        pag.screenshot(path=CAPTURAS / "s3-04-mis-solicitudes.png", full_page=True)

        fila_reciente.locator("button:has-text('Registrar asistencia')").click()
        pag.wait_for_timeout(1100)
        comprobar("HU-16", "El check-in dentro de la tolerancia cambia el estatus a En curso",
                  "Check-in registrado" in pag.inner_text("main")
                  and sql(f"SELECT e.clave FROM prestamo.reservacion r "
                          f"JOIN prestamo.estatus_reservacion e ON e.id=r.estatus_id "
                          f"WHERE r.id={reciente}") == "en_curso")
        pag.screenshot(path=CAPTURAS / "s3-05-checkin.png", full_page=True)

        comprobar("HU-16", "Queda constancia de quién registró el check-in y con cuánto retraso",
                  sql(f"SELECT count(*) FROM prestamo.asistencia WHERE reservacion_id={reciente} "
                      f"AND registrada_por IS NOT NULL AND minutos_retraso BETWEEN 4 AND 7") == "1")

        folio_futura = sql("SELECT folio FROM prestamo.reservacion WHERE laboratorio_id = 3 "
                           "ORDER BY id DESC LIMIT 1")
        comprobar("HU-16", "Antes de la hora de inicio no se ofrece registrar la asistencia",
                  pag.locator("tr", has_text=folio_futura)
                     .locator("button:has-text('Registrar asistencia')").count() == 0)

        folio_vencida = sql(f"SELECT folio FROM prestamo.reservacion WHERE id = {vencida}")
        comprobar("HU-16", "Vencida la tolerancia tampoco se ofrece: el laboratorio ya se liberó",
                  pag.locator("tr", has_text=folio_vencida)
                     .locator("button:has-text('Registrar asistencia')").count() == 0)

        # =============================================================
        # HU-17 · Liberación automática por inasistencia
        # =============================================================
        entrar(pag, ADMIN)
        ir(pag, "docentes")
        pag.click("button:has-text('Revisar tolerancias ahora')")
        pag.wait_for_timeout(1200)

        texto_liberacion = pag.inner_text("main")
        comprobar("HU-17", "El encargado puede disparar la revisión y el sistema informa el resultado",
                  "Se liberaron" in texto_liberacion or "No hay reservaciones vencidas" in texto_liberacion)
        pag.screenshot(path=CAPTURAS / "s3-06-liberacion.png", full_page=True)

        comprobar("HU-17", "Vencida la tolerancia sin check-in, el estatus cambia a No asistió",
                  sql(f"SELECT e.clave FROM prestamo.reservacion r "
                      f"JOIN prestamo.estatus_reservacion e ON e.id=r.estatus_id "
                      f"WHERE r.id={vencida}") == "no_asistio")

        comprobar("HU-17", "La falta se contabiliza con las horas-laboratorio perdidas",
                  sql(f"SELECT horas_perdidas FROM prestamo.inasistencia "
                      f"WHERE reservacion_id={vencida}") == "2.00")

        comprobar("HU-17", "La reservación con check-in registrado no se libera y sigue En curso",
                  sql(f"SELECT e.clave FROM prestamo.reservacion r "
                      f"JOIN prestamo.estatus_reservacion e ON e.id=r.estatus_id "
                      f"WHERE r.id={reciente}") == "en_curso")

        comprobar("HU-17", "El horario liberado vuelve a quedar disponible en el calendario",
                  sql(f"SELECT estado FROM prestamo.disponibilidad("
                      f"  (SELECT fecha_uso FROM prestamo.reservacion WHERE id={vencida})) d "
                      f"WHERE d.laboratorio_id = 4 AND d.hora_inicio <= "
                      f"  (SELECT hora_inicio FROM prestamo.reservacion WHERE id={vencida}) "
                      f"AND d.hora_fin > (SELECT hora_inicio FROM prestamo.reservacion WHERE id={vencida})"
                      ) == "libre")

        # =============================================================
        # HU-19 · Control de inasistencias reincidentes
        # =============================================================
        ir(pag, "docentes")
        comprobar("HU-19", "El encargado ve las faltas vigentes de cada docente",
                  "Arnulfo Vásquez Romero" in pag.inner_text("main")
                  and pag.locator("tbody tr").count() >= 2)

        pag.locator("tr", has_text="Arnulfo").first.locator("button:has-text('Ver historial')").click()
        pag.wait_for_selector(".modal")
        comprobar("HU-19", "El historial muestra las asistencias y las inasistencias del docente",
                  "min de retraso" in pag.inner_text(".modal")
                  and "h perdidas" in pag.inner_text(".modal"))
        pag.screenshot(path=CAPTURAS / "s3-07-historial-docente.png")
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        # Segunda falta: alcanza el umbral P-03 de autorización.
        sql("INSERT INTO prestamo.inasistencia (reservacion_id, usuario_id, horas_perdidas) "
            "SELECT id, usuario_id, 2 FROM prestamo.reservacion "
            "WHERE usuario_id = 1 AND estatus_id = 5 LIMIT 1")

        ir(pag, "docentes")
        comprobar("HU-19", "Al alcanzar el primer umbral (P-03) el docente queda en Requiere autorización",
                  "Requiere autorización" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s3-08-docentes.png", full_page=True)

        entrar(pag, DOCENTE1)
        ir(pag, "calendario")
        elegir_fecha(pag, "#fecha", lunes)
        pag.locator(".bloque.libre", has_text="09:00–11:00").first.click()
        pag.wait_for_selector(".modal")
        pag.fill("#s-grupo", "Informática Administrativa · Grupo 421")
        pag.fill("#s-motivo", "Práctica supervisada")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(1100)

        comprobar("HU-19", "Sus nuevas solicitudes quedan marcadas como que requieren autorización",
                  sql("SELECT requiere_autorizacion FROM prestamo.reservacion "
                      "ORDER BY id DESC LIMIT 1") == "t")

        entrar(pag, ADMIN)
        ir(pag, "pendientes")
        comprobar("HU-08", "El panel advierte que el solicitante alcanzó el umbral de inasistencias",
                  "Requiere autorización" in pag.inner_text("main")
                  and "inasistencias en el periodo vigente" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s3-09-advertencia-faltas.png", full_page=True)

        # Tercera falta: alcanza el umbral P-04 de suspensión.
        sql("INSERT INTO prestamo.inasistencia (reservacion_id, usuario_id, horas_perdidas) "
            "SELECT id, usuario_id, 2 FROM prestamo.reservacion "
            "WHERE usuario_id = 1 AND estatus_id = 3 LIMIT 1")
        if sql("SELECT prestamo.inasistencias_vigentes(1)") != "3":
            sql("INSERT INTO prestamo.inasistencia (reservacion_id, usuario_id, horas_perdidas) "
                "SELECT id, usuario_id, 2 FROM prestamo.reservacion "
                "WHERE usuario_id = 1 AND id NOT IN (SELECT reservacion_id FROM prestamo.inasistencia) "
                "LIMIT 1")

        entrar(pag, DOCENTE1)
        ir(pag, "mis-solicitudes")
        comprobar("HU-19", "El docente suspendido ve el aviso con la fecha hasta la que no puede apartar",
                  "No puedes apartar laboratorios hasta el" in pag.inner_text("main"))
        pag.screenshot(path=CAPTURAS / "s3-10-suspension.png", full_page=True)

        ir(pag, "calendario")
        elegir_fecha(pag, "#fecha", (dt.date.fromisoformat(lunes) + dt.timedelta(days=1)).isoformat())
        pag.locator(".bloque.libre", has_text="13:00–15:00").first.click()
        pag.wait_for_selector(".modal")
        pag.fill("#s-grupo", "Grupo 421")
        pag.fill("#s-motivo", "Intento durante la suspensión")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(1100)
        comprobar("HU-19", "Durante la suspensión el sistema le impide apartar",
                  "No puedes apartar laboratorios hasta el" in pag.inner_text(".modal"))
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        # Al envejecer las faltas más allá de P-05, la suspensión termina sola.
        sql("UPDATE prestamo.inasistencia SET ocurrida_en = now() - interval '20 days' "
            "WHERE usuario_id = 1")
        comprobar("HU-19", "Concluido el periodo de suspensión el docente la recupera automáticamente",
                  sql("SELECT nivel FROM prestamo.situacion_docente(1)") != "suspension")

        # =============================================================
        # HU-07 · Cancelación de solicitud
        # =============================================================
        entrar(pag, DOCENTE2)
        ir(pag, "calendario")
        elegir_fecha(pag, "#fecha", lunes)
        pag.locator(".bloque.libre", has_text="15:00–17:00").first.click()
        pag.wait_for_selector(".modal")
        pag.fill("#s-grupo", "Estadística Aplicada · Grupo 112")
        pag.fill("#s-motivo", "Prácticas con hoja de cálculo")
        pag.click(".modal .boton:not(.secundario)")
        pag.wait_for_timeout(1100)
        folio_cancelable = sql("SELECT folio FROM prestamo.reservacion ORDER BY id DESC LIMIT 1")
        sql(f"UPDATE prestamo.reservacion SET estatus_id = 2, resuelta_por = 2, resuelta_en = now() "
            f"WHERE folio = '{folio_cancelable}'")

        ir(pag, "mis-solicitudes")
        fila = pag.locator("tr", has_text=folio_cancelable)
        comprobar("HU-07", "Una reservación futura ofrece cancelarse",
                  fila.locator("button:has-text('Cancelar')").count() == 1)

        fila.locator("button:has-text('Cancelar')").click()
        pag.wait_for_selector(".modal")
        comprobar("HU-07", "El sistema advierte que cancelar a tiempo no cuenta como inasistencia",
                  "no se te contabilizará como inasistencia" in pag.inner_text(".modal"))
        pag.screenshot(path=CAPTURAS / "s3-11-cancelacion.png")

        pag.click(".modal .boton.riesgo")
        pag.wait_for_timeout(1200)
        comprobar("HU-07", "La reservación cancelada queda en estatus Cancelada",
                  sql(f"SELECT e.clave FROM prestamo.reservacion r "
                      f"JOIN prestamo.estatus_reservacion e ON e.id=r.estatus_id "
                      f"WHERE r.folio='{folio_cancelable}'") == "cancelada")

        comprobar("HU-07", "La cancelación a tiempo no genera inasistencia al docente",
                  sql(f"SELECT count(*) FROM prestamo.inasistencia i "
                      f"JOIN prestamo.reservacion r ON r.id = i.reservacion_id "
                      f"WHERE r.folio='{folio_cancelable}'") == "0")

        comprobar("HU-07", "El encargado recibe el aviso de la cancelación",
                  sql("SELECT count(*) FROM prestamo.notificacion n JOIN prestamo.usuario u "
                      "ON u.id = n.usuario_id WHERE n.tipo = 'cancelacion' AND u.rol_id = 2") == "1")

        ir(pag, "calendario")
        elegir_fecha(pag, "#fecha", lunes)
        comprobar("HU-07", "El horario cancelado vuelve a quedar disponible",
                  pag.locator(".bloque.libre", has_text="15:00–17:00").count() >= 1)

        # Una reservación que empieza en menos de dos horas ya no se cancela.
        # LAB-02 no tiene reservaciones de hoy: evita chocar con la regla anti-empalme.
        proxima = reservar(4, 2, -60)
        ir(pag, "mis-solicitudes")
        folio_proxima = sql(f"SELECT folio FROM prestamo.reservacion WHERE id={proxima}")
        comprobar("HU-07", "Dentro del plazo mínimo (P-08) el sistema ya no ofrece cancelar",
                  pag.locator("tr", has_text=folio_proxima)
                     .locator("button:has-text('Cancelar')").count() == 0)

        # =============================================================
        # HU-11 · Calendario general
        # =============================================================
        entrar(pag, ADMIN)
        ir(pag, "agenda")
        pag.wait_for_timeout(900)
        comprobar("HU-11", "El calendario general muestra las reservaciones del rango de fechas",
                  pag.locator(".lab-fila").count() >= 1)
        pag.screenshot(path=CAPTURAS / "s3-12-calendario-general.png", full_page=True)

        comprobar("HU-11", "Presenta el resumen de horas apartadas y de horas perdidas",
                  "Horas-laboratorio apartadas" in pag.inner_text("main")
                  and "Horas perdidas por inasistencia" in pag.inner_text("main"))

        pag.locator("button:has-text('Ver detalle')").first.click()
        pag.wait_for_selector(".modal")
        texto_modal = pag.inner_text(".modal")
        comprobar("HU-11", "El detalle muestra docente, grupo, motivo y estado de asistencia",
                  all(p in texto_modal for p in ("Docente", "Grupo o materia", "Motivo de uso", "Asistencia")))
        pag.screenshot(path=CAPTURAS / "s3-13-detalle-reservacion.png")
        pag.click(".modal .boton.secundario")
        pag.wait_for_timeout(400)

        antes = pag.locator(".lab-fila tbody tr").count()
        pag.select_option("#filtro-lab", index=1)
        pag.wait_for_timeout(1100)
        despues = pag.locator(".lab-fila tbody tr").count()
        comprobar("HU-11", "El filtro por laboratorio reduce la vista a ese espacio",
                  despues < antes and despues >= 0)

        # =============================================================
        # HU-01 · el portal sigue siendo adaptable
        # =============================================================
        movil = navegador.new_context(viewport={"width": 390, "height": 844},
                                      device_scale_factor=3, is_mobile=True, has_touch=True)
        pm = movil.new_page()
        entrar(pm, ADMIN)
        ir(pm, "agenda")
        pm.wait_for_timeout(1100)
        ancho = pm.evaluate("document.documentElement.scrollWidth")
        comprobar("HU-01", f"El calendario general no se desborda en 390 px (mide {ancho} px)",
                  ancho <= 390)
        pm.screenshot(path=CAPTURAS / "s3-14-movil-agenda.png")

        navegador.close()

    aprobadas = sum(1 for *_, ok in resultados if ok)
    print(f"\nCriterios comprobados: {len(resultados)} · aprobados: {aprobadas} · "
          f"fallidos: {len(resultados) - aprobadas}")
    print(f"Capturas en: {CAPTURAS}")
    return 0 if aprobadas == len(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
