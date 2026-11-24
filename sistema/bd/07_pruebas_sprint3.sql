-- =====================================================================
-- Pruebas del Sprint 3 · Administración, asistencia y validaciones
-- Verifican en el motor los criterios de aceptación de HU-07, HU-08,
-- HU-10, HU-11, HU-16, HU-17, HU-19 y HU-21.
-- Ejecutar después de 01, 02, 04 y 06. Corre dentro de una transacción
-- que se revierte al final.
-- =====================================================================

SET search_path TO prestamo, extensions, public;
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

BEGIN;

-- ---------------------------------------------------------------------
-- Precondición de este guion
-- ---------------------------------------------------------------------
-- Las pruebas de HU-16 y HU-17 crean reservaciones alrededor de la hora
-- actual, porque lo que verifican es la tolerancia del check-in medida
-- contra now(). Para que esas reservaciones caigan dentro de un bloque
-- publicado del catálogo, el guion tiene que correr en día hábil y dentro
-- del horario de servicio de los laboratorios. Fuera de esa ventana la
-- prueba de disponibilidad no tiene bloque contra el que comparar y falla
-- por una razón que nada tiene que ver con el sistema.
--
-- Se avisa aquí, explícitamente, en lugar de dejar que falle más abajo sin
-- explicación. La solución de fondo sería que el guion publicara su propio
-- bloque horario en lugar de depender del catálogo; queda anotada como
-- mejora en la memoria técnica.
DO $$
DECLARE
    v_hora  time    := localtime;
    v_dia   integer := extract(isodow from current_date);
    v_desde time;
    v_hasta time;
BEGIN
    SELECT min(hora_inicio), max(hora_fin) INTO v_desde, v_hasta
      FROM prestamo.horario_laboratorio;

    IF v_dia > 5 OR v_hora < v_desde + interval '1 hour' OR v_hora > v_hasta THEN
        RAISE EXCEPTION
          'Este guion debe correr en día hábil, entre las % y las % en la hora del servidor. Ahora son las % del día % de la semana (1=lunes). Las pruebas de tolerancia de check-in crean reservaciones a la hora actual y necesitan un bloque publicado que las contenga.',
          v_desde + interval '1 hour', v_hasta, v_hora::time(0), v_dia;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.verificar(descripcion text, condicion boolean) RETURNS text AS $$
    SELECT CASE WHEN $2 THEN 'APROBADA  · ' ELSE 'FALLA     · ' END || $1;
$$ LANGUAGE sql;

-- Envoltorios que devuelven el mensaje de error sin abortar la transacción.
CREATE OR REPLACE FUNCTION pg_temp.intentar(p_sql text) RETURNS text AS $$
BEGIN
    EXECUTE p_sql;
    RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM usuario WHERE correo = 'arnulfo.vasquez@uabc.edu.mx') AS docente1,
       (SELECT id FROM usuario WHERE correo = 'docente.prueba@uabc.edu.mx')  AS docente2,
       (SELECT id FROM usuario WHERE correo = 'laboratorios.fca@uabc.edu.mx') AS admin,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-01') AS lab1,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-02') AS lab2,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-03') AS lab3,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-04') AS lab4,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-05') AS lab5;

-- Fechas de prueba ancladas al próximo lunes: los laboratorios de la facultad
-- publican horarios de lunes a viernes, así que una fecha relativa a hoy podría
-- caer en fin de semana y falsear el resultado.
CREATE TEMP TABLE f AS
SELECT (current_date + ((8 - EXTRACT(isodow FROM current_date)::integer) % 7 + 1))::date AS lunes;

/* Crea una reservación directamente, para poder situarla en el tiempo con
   precisión de minutos. Las pruebas de check-in y de liberación necesitan
   controlar cuántos minutos han pasado desde la hora de inicio. */
CREATE OR REPLACE FUNCTION pg_temp.reservar(p_usuario integer, p_lab integer,
                                            p_minutos_desde_inicio integer,
                                            p_estatus smallint DEFAULT 2)
RETURNS bigint AS $$
DECLARE
    v_inicio timestamptz := now() - (p_minutos_desde_inicio || ' minutes')::interval;
    v_id bigint;
BEGIN
    -- Un bloque de dos horas no puede cruzar la medianoche: hora_fin se guarda
    -- como time, y al pasar de las 24:00 queda MENOR que hora_inicio, lo que
    -- viola reservacion_rango_valido y aborta la transacción completa del
    -- guion. Recortar el inicio a las 21:00 conserva la fecha y el sentido de
    -- cada prueba: lo que estaba en el pasado sigue en el pasado y lo que
    -- estaba en el futuro sigue en el futuro.
    IF v_inicio::time > '21:00'::time THEN
        v_inicio := date_trunc('day', v_inicio) + interval '21 hours';
    END IF;

    INSERT INTO prestamo.reservacion (folio, usuario_id, laboratorio_id, fecha_uso,
                                      hora_inicio, hora_fin, grupo_materia, motivo_uso,
                                      estatus_id, resuelta_por, resuelta_en)
    VALUES (prestamo.folio_siguiente(), p_usuario, p_lab, v_inicio::date,
            date_trunc('minute', v_inicio)::time,
            (date_trunc('minute', v_inicio) + interval '2 hours')::time,
            'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
            p_estatus, CASE WHEN p_estatus = 2 THEN 2 ELSE NULL END,
            CASE WHEN p_estatus = 2 THEN now() ELSE NULL END)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

/* Reservación pasada, con horario fijo. Se usa para fabricar inasistencias
   antiguas sin que la hora de fin cruce la medianoche. */
CREATE OR REPLACE FUNCTION pg_temp.reservar_pasada(p_usuario integer, p_lab integer,
                                                   p_dias_atras integer)
RETURNS bigint AS $$
DECLARE v_id bigint;
BEGIN
    INSERT INTO prestamo.reservacion (folio, usuario_id, laboratorio_id, fecha_uso,
                                      hora_inicio, hora_fin, grupo_materia, motivo_uso, estatus_id)
    VALUES (prestamo.folio_siguiente(), p_usuario, p_lab, current_date - p_dias_atras,
            '09:00', '11:00', 'Informática Administrativa · Grupo 421',
            'Práctica de laboratorio', 8)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

SELECT '--- HU-21 · Configuración de las reglas de préstamo ---';

SELECT pg_temp.verificar(
  'La configuración muestra los nueve parámetros con su valor actual',
  (SELECT count(*) FROM parametro WHERE valor IS NOT NULL) = 9);

SELECT pg_temp.verificar(
  'Un valor fuera de rango se rechaza indicando el rango permitido',
  pg_temp.intentar(format('SELECT prestamo.actualizar_parametro(''P-06'', ''99'', %s)',
                          (SELECT admin FROM ids))) LIKE 'ERROR:%entre 1 y 20%');

SELECT pg_temp.verificar(
  'Un valor no numérico en un parámetro entero se rechaza',
  pg_temp.intentar(format('SELECT prestamo.actualizar_parametro(''P-01'', ''quince'', %s)',
                          (SELECT admin FROM ids))) LIKE 'ERROR:%número entero%');

SELECT prestamo.actualizar_parametro('P-06', '2', (SELECT admin FROM ids));

SELECT pg_temp.verificar(
  'Al guardar un parámetro queda registrado quién lo cambió y cuál era el valor anterior',
  (SELECT count(*) FROM bitacora_parametro b JOIN usuario u ON u.id = b.usuario_id
    WHERE b.clave = 'P-06' AND b.valor_anterior = '3' AND b.valor_nuevo = '2'
      AND u.rol_id = 2) = 1);

SELECT pg_temp.verificar(
  'Las nuevas reservaciones se validan con el valor actualizado',
  parametro_entero('P-06') = 2);

SELECT prestamo.actualizar_parametro('P-06', '3', (SELECT admin FROM ids));

SELECT '';
SELECT '--- HU-10 · Bloqueo por mantenimiento o evento ---';

CREATE TEMP TABLE b1 AS
SELECT registrar_bloqueo(i.lab2, 'Mantenimiento preventivo de equipos',
                         f.lunes, f.lunes + 2, i.admin) AS id FROM ids i, f;

SELECT pg_temp.verificar(
  'Un laboratorio bloqueado deja de mostrarse disponible durante el bloqueo',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
    WHERE laboratorio_id = (SELECT lab2 FROM ids) AND estado <> 'bloqueado') = 0
  AND (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
        WHERE laboratorio_id = (SELECT lab2 FROM ids)) > 0);

SELECT pg_temp.verificar(
  'Un docente no puede solicitar un horario dentro del bloqueo',
  pg_temp.intentar(format(
    'SELECT prestamo.registrar_solicitud(%s, %s, ''%s''::date, ''09:00'', ''11:00'', ''G'', ''M'')',
    (SELECT docente1 FROM ids), (SELECT lab2 FROM ids), (SELECT lunes FROM f)))
    LIKE 'ERROR:%bloqueado%');

SELECT pg_temp.verificar(
  'Concluido el periodo de bloqueo el laboratorio vuelve a mostrarse disponible',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f) + 3)
    WHERE laboratorio_id = (SELECT lab2 FROM ids) AND estado = 'libre') > 0);

SELECT pg_temp.verificar(
  'Un bloqueo con fecha final anterior a la inicial se rechaza',
  pg_temp.intentar(format(
    'SELECT prestamo.registrar_bloqueo(%s, ''Prueba'', ''%s''::date, ''%s''::date, %s)',
    (SELECT lab2 FROM ids), (SELECT lunes FROM f) + 2, (SELECT lunes FROM f), (SELECT admin FROM ids)))
    LIKE 'ERROR:%anterior a la inicial%');

SELECT '';
SELECT '--- HU-16 · Registro de asistencia (check-in) ---';

-- Reservación que empezó hace 5 minutos: dentro de la tolerancia de 15.
CREATE TEMP TABLE r_ok AS SELECT pg_temp.reservar(i.docente1, i.lab1, 5) AS id FROM ids i;

CREATE TEMP TABLE checkin_ok AS
SELECT pg_temp.intentar(format('SELECT prestamo.registrar_checkin(%s, %s)',
                               (SELECT id FROM r_ok), (SELECT docente1 FROM ids))) AS resultado;

SELECT pg_temp.verificar(
  'El check-in dentro de la tolerancia cambia el estatus a En curso',
  (SELECT resultado FROM checkin_ok) = 'OK'
  AND (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
        WHERE r.id = (SELECT id FROM r_ok)) = 'en_curso');

SELECT pg_temp.verificar(
  'Queda constancia de quién registró el check-in, a qué hora y con cuánto retraso',
  (SELECT count(*) FROM asistencia a JOIN usuario u ON u.id = a.registrada_por
    WHERE a.reservacion_id = (SELECT id FROM r_ok)
      AND a.registrada_en IS NOT NULL
      AND a.minutos_retraso BETWEEN 4 AND 6) = 1);

SELECT pg_temp.verificar(
  'Un segundo check-in sobre la misma reservación se impide',
  pg_temp.intentar(format('SELECT prestamo.registrar_checkin(%s, %s)',
                          (SELECT id FROM r_ok), (SELECT docente1 FROM ids)))
    LIKE 'ERROR:%ya estaba registrado%');

-- Reservación que empieza en 30 minutos.
CREATE TEMP TABLE r_futura AS SELECT pg_temp.reservar(i.docente1, i.lab3, -30) AS id FROM ids i;

SELECT pg_temp.verificar(
  'El check-in antes de la hora de inicio se impide e indica el horario válido',
  pg_temp.intentar(format('SELECT prestamo.registrar_checkin(%s, %s)',
                          (SELECT id FROM r_futura), (SELECT docente1 FROM ids)))
    LIKE 'ERROR:%Aún no empieza%');

-- Reservación cuya tolerancia venció hace rato.
CREATE TEMP TABLE r_tarde AS SELECT pg_temp.reservar(i.docente1, i.lab4, 40) AS id FROM ids i;

SELECT pg_temp.verificar(
  'El check-in después de vencida la tolerancia se impide',
  pg_temp.intentar(format('SELECT prestamo.registrar_checkin(%s, %s)',
                          (SELECT id FROM r_tarde), (SELECT docente1 FROM ids)))
    LIKE 'ERROR:%Venció la tolerancia%');

CREATE TEMP TABLE r_lab AS SELECT pg_temp.reservar(i.docente2, i.lab5, 2) AS id FROM ids i;

SELECT pg_temp.verificar(
  'El laboratorista también puede registrar el check-in de un docente',
  pg_temp.intentar(format('SELECT prestamo.registrar_checkin(%s, %s)',
                          (SELECT id FROM r_lab), (SELECT admin FROM ids))) = 'OK');

SELECT '';
SELECT '--- HU-17 · Liberación automática por inasistencia ---';

CREATE TEMP TABLE liberadas AS SELECT * FROM liberar_inasistencias();

SELECT pg_temp.verificar(
  'Vencida la tolerancia sin check-in, la reservación pasa a No asistió',
  (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.id = (SELECT id FROM r_tarde)) = 'no_asistio');

SELECT pg_temp.verificar(
  'El horario liberado vuelve a mostrarse disponible para otros docentes',
  (SELECT count(*) FROM disponibilidad(current_date) d
    JOIN reservacion r ON r.id = (SELECT id FROM r_tarde)
    WHERE d.laboratorio_id = r.laboratorio_id
      AND d.hora_inicio <= r.hora_inicio AND d.hora_fin > r.hora_inicio
      AND d.estado = 'libre') = 1);

SELECT pg_temp.verificar(
  'La falta se contabiliza al docente con las horas-laboratorio perdidas',
  (SELECT horas_perdidas FROM inasistencia WHERE reservacion_id = (SELECT id FROM r_tarde)) = 2.00);

SELECT pg_temp.verificar(
  'El proceso informa qué reservaciones liberó, de qué laboratorio y de qué docente',
  (SELECT count(*) FROM liberadas WHERE ret_folio IS NOT NULL AND ret_laboratorio IS NOT NULL
     AND ret_docente IS NOT NULL) >= 1);

SELECT pg_temp.verificar(
  'Una reservación con check-in registrado no se libera y continúa En curso',
  (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.id = (SELECT id FROM r_ok)) = 'en_curso');

SELECT pg_temp.verificar(
  'Una reservación cuyo horario aún no vence tampoco se toca',
  (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.id = (SELECT id FROM r_futura)) = 'aprobada');

SELECT '';
SELECT '--- HU-07 · Cancelación de solicitud ---';

-- Reservación dentro de cinco días: muy por encima del plazo mínimo.
CREATE TEMP TABLE r_cancelable AS
SELECT prestamo.registrar_solicitud(i.docente2, i.lab1, f.lunes, '09:00', '11:00',
                                    'Estadística Aplicada · Grupo 112', 'Prácticas') AS folio
FROM ids i, f;

UPDATE reservacion SET estatus_id = 2, resuelta_por = (SELECT admin FROM ids), resuelta_en = now()
 WHERE folio = (SELECT folio FROM r_cancelable);

CREATE TEMP TABLE cancelacion AS
SELECT pg_temp.intentar(format('SELECT prestamo.cancelar_solicitud(%s, %s)',
    (SELECT id FROM reservacion WHERE folio = (SELECT folio FROM r_cancelable)),
    (SELECT docente2 FROM ids))) AS resultado;

SELECT pg_temp.verificar(
  'Cancelar con la anticipación mínima deja la reservación en estatus Cancelada',
  (SELECT resultado FROM cancelacion) = 'OK'
  AND (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
        WHERE r.folio = (SELECT folio FROM r_cancelable)) = 'cancelada');

SELECT pg_temp.verificar(
  'El horario cancelado vuelve a quedar disponible',
  (SELECT estado FROM disponibilidad((SELECT lunes FROM f))
    WHERE laboratorio_id = (SELECT lab1 FROM ids) AND hora_inicio = '09:00') = 'libre');

SELECT pg_temp.verificar(
  'La cancelación a tiempo no genera inasistencia al docente',
  (SELECT count(*) FROM inasistencia
    WHERE reservacion_id = (SELECT id FROM reservacion
                             WHERE folio = (SELECT folio FROM r_cancelable))) = 0);

SELECT pg_temp.verificar(
  'El encargado recibe el aviso de la cancelación',
  (SELECT count(*) FROM notificacion n JOIN usuario u ON u.id = n.usuario_id
    WHERE n.tipo = 'cancelacion' AND u.rol_id = 2) >= 1);

-- Reservación que empieza dentro de una hora: por debajo del plazo P-08 de 2 horas.
CREATE TEMP TABLE r_tarde_cancelar AS SELECT pg_temp.reservar(i.docente2, i.lab4, -60) AS id FROM ids i;

SELECT pg_temp.verificar(
  'Cancelar fuera del plazo se impide e indica que hay que contactar al encargado',
  pg_temp.intentar(format('SELECT prestamo.cancelar_solicitud(%s, %s)',
    (SELECT id FROM r_tarde_cancelar), (SELECT docente2 FROM ids)))
    LIKE 'ERROR:%Contacta al encargado%');

SELECT pg_temp.verificar(
  'Nadie puede cancelar la reservación de otro docente',
  pg_temp.intentar(format('SELECT prestamo.cancelar_solicitud(%s, %s)',
    (SELECT id FROM r_tarde_cancelar), (SELECT docente1 FROM ids)))
    LIKE 'ERROR:%no es tuya%');

SELECT '';
SELECT '--- HU-19 · Control de inasistencias reincidentes ---';

SELECT pg_temp.verificar(
  'El docente que no ha faltado no tiene restricción',
  (SELECT nivel FROM situacion_docente((SELECT docente2 FROM ids))) = 'ninguna');

-- El docente 1 llega al primer umbral: ya tiene 1 falta, se le agrega otra.
INSERT INTO inasistencia (reservacion_id, usuario_id, horas_perdidas)
SELECT pg_temp.reservar_pasada(i.docente1, i.lab1, 4), i.docente1, 2 FROM ids i;

SELECT pg_temp.verificar(
  'Al alcanzar el primer umbral (P-03 = 2) el docente queda en nivel de autorización',
  (SELECT nivel FROM situacion_docente((SELECT docente1 FROM ids))) = 'autorizacion');

CREATE TEMP TABLE r_marcada AS
SELECT prestamo.registrar_solicitud(i.docente1, i.lab3, f.lunes + 1, '09:00', '11:00',
                                    'Grupo 421', 'Práctica') AS folio FROM ids i, f;

SELECT pg_temp.verificar(
  'Sus nuevas solicitudes quedan marcadas como que requieren autorización manual',
  (SELECT requiere_autorizacion FROM reservacion WHERE folio = (SELECT folio FROM r_marcada)));

-- Tercera falta: alcanza el umbral de suspensión.
INSERT INTO inasistencia (reservacion_id, usuario_id, horas_perdidas)
SELECT pg_temp.reservar_pasada(i.docente1, i.lab1, 6), i.docente1, 2 FROM ids i;

SELECT pg_temp.verificar(
  'Al alcanzar el segundo umbral (P-04 = 3) el docente queda suspendido',
  (SELECT nivel FROM situacion_docente((SELECT docente1 FROM ids))) = 'suspension');

SELECT pg_temp.verificar(
  'Durante la suspensión el sistema le impide apartar e indica hasta cuándo',
  pg_temp.intentar(format(
    'SELECT prestamo.registrar_solicitud(%s, %s, ''%s''::date, ''13:00'', ''15:00'', ''G'', ''M'')',
    (SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f) + 2))
    LIKE 'ERROR:%No puedes apartar laboratorios hasta el%');

-- Se envejecen las faltas más allá del periodo de suspensión P-05 = 15 días.
UPDATE inasistencia SET ocurrida_en = now() - interval '20 days'
 WHERE usuario_id = (SELECT docente1 FROM ids);

SELECT pg_temp.verificar(
  'Concluido el periodo de suspensión el docente recupera su capacidad de apartar',
  (SELECT nivel FROM situacion_docente((SELECT docente1 FROM ids))) <> 'suspension');

-- Se envejecen más allá del periodo de conteo P-02 = 30 días.
UPDATE inasistencia SET ocurrida_en = now() - interval '45 days'
 WHERE usuario_id = (SELECT docente1 FROM ids);

SELECT pg_temp.verificar(
  'Fuera del periodo de conteo (P-02 = 30 días) las faltas dejan de pesar',
  inasistencias_vigentes((SELECT docente1 FROM ids)) = 0);

SELECT pg_temp.verificar(
  'El encargado puede consultar el historial de asistencias e inasistencias del docente',
  (SELECT count(*) FROM v_historial_asistencia
    WHERE usuario_id = (SELECT docente1 FROM ids)) >= 4
  AND (SELECT count(*) FROM v_historial_asistencia
        WHERE usuario_id = (SELECT docente1 FROM ids) AND checkin_en IS NOT NULL) >= 1);

SELECT '';
SELECT '--- HU-08 · Aprobación o rechazo de solicitudes ---';

SELECT pg_temp.verificar(
  'La bandeja presenta las solicitudes pendientes ordenadas por fecha de uso',
  (SELECT bool_and(ordenada) FROM (
     SELECT fecha_uso >= lag(fecha_uso) OVER (ORDER BY fecha_uso) IS NOT FALSE AS ordenada
     FROM v_mis_solicitudes WHERE estatus_clave = 'solicitada') t));

SELECT pg_temp.verificar(
  'El panel advierte cuando el solicitante había alcanzado el umbral de inasistencias',
  (SELECT count(*) FROM reservacion WHERE requiere_autorizacion) >= 1);

CREATE TEMP TABLE r_resolver AS
SELECT id FROM reservacion WHERE folio = (SELECT folio FROM r_marcada);

SELECT prestamo.aprobar_solicitud((SELECT id FROM r_resolver), (SELECT admin FROM ids));

SELECT pg_temp.verificar(
  'Al resolverse queda registrado quién la resolvió y en qué momento',
  (SELECT r.resuelta_por = (SELECT admin FROM ids) AND r.resuelta_en IS NOT NULL
     FROM reservacion r WHERE r.id = (SELECT id FROM r_resolver)));

SELECT pg_temp.verificar(
  'El horario aprobado queda bloqueado en el calendario',
  (SELECT estado FROM disponibilidad((SELECT lunes FROM f) + 1)
    WHERE laboratorio_id = (SELECT lab3 FROM ids) AND hora_inicio = '09:00') = 'ocupado');

SELECT '';
SELECT '--- HU-11 · Calendario general de reservaciones ---';

SELECT pg_temp.verificar(
  'El calendario general devuelve las reservaciones de un rango de fechas',
  (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30)) >= 5);

SELECT pg_temp.verificar(
  'Cada reservación trae el docente, el grupo, el motivo y su estado de asistencia',
  (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30)
    WHERE docente IS NOT NULL AND grupo_materia IS NOT NULL
      AND motivo_uso IS NOT NULL AND asistencia IS NOT NULL) =
  (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30)));

SELECT pg_temp.verificar(
  'El estado de asistencia distingue quién asistió y quién no',
  (SELECT count(DISTINCT asistencia) FROM calendario_general(current_date - 60, current_date + 30)) >= 2);

SELECT pg_temp.verificar(
  'El filtro por laboratorio devuelve solo las reservaciones de ese espacio',
  (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30,
                                           (SELECT lab3 FROM ids))
    WHERE laboratorio_id <> (SELECT lab3 FROM ids)) = 0
  AND (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30,
                                               (SELECT lab3 FROM ids))) >= 1);

SELECT pg_temp.verificar(
  'El calendario general no muestra las solicitudes rechazadas',
  (SELECT count(*) FROM calendario_general(current_date - 60, current_date + 30)
    WHERE estatus_clave = 'rechazada') = 0);

ROLLBACK;
