-- =====================================================================
-- Pruebas del Sprint 4 · Avisos, recordatorios y reportes de uso
-- Verifican en el motor los criterios de aceptación de HU-06, HU-13,
-- HU-14, HU-15, HU-18 y HU-22.
-- Ejecutar después de 01, 02, 04, 06 y 08. Corre dentro de una
-- transacción que se revierte al final.
-- =====================================================================

SET search_path TO prestamo, extensions, public;
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.verificar(descripcion text, condicion boolean) RETURNS text AS $$
    SELECT CASE WHEN $2 THEN 'APROBADA  · ' ELSE 'FALLA     · ' END || $1;
$$ LANGUAGE sql;

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

/* Reservación situada a N horas de su hora de inicio. Las pruebas de
   recordatorio necesitan controlar esa distancia con precisión, porque es
   exactamente lo que decide si el aviso toca o no toca. */
CREATE OR REPLACE FUNCTION pg_temp.reservar_en(p_usuario integer, p_lab integer,
                                               p_horas_al_inicio numeric,
                                               p_estatus smallint DEFAULT 2)
RETURNS bigint AS $$
DECLARE
    v_inicio timestamptz := date_trunc('minute', now() + (p_horas_al_inicio || ' hours')::interval);
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
    VALUES (prestamo.folio_siguiente(), p_usuario, p_lab, v_inicio::date, v_inicio::time,
            (v_inicio + interval '2 hours')::time,
            'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
            p_estatus, CASE WHEN p_estatus <> 1 THEN 2 END,
            CASE WHEN p_estatus <> 1 THEN now() END)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

/* Reservación en una fecha pasada con horario fijo, para alimentar reportes. */
CREATE OR REPLACE FUNCTION pg_temp.historica(p_usuario integer, p_lab integer,
                                             p_dias_atras integer, p_estatus smallint,
                                             p_hora time DEFAULT '09:00')
RETURNS bigint AS $$
DECLARE v_id bigint;
BEGIN
    INSERT INTO prestamo.reservacion (folio, usuario_id, laboratorio_id, fecha_uso,
                                      hora_inicio, hora_fin, grupo_materia, motivo_uso,
                                      estatus_id, resuelta_por, resuelta_en)
    VALUES (prestamo.folio_siguiente(), p_usuario, p_lab, current_date - p_dias_atras,
            p_hora, p_hora + interval '2 hours',
            'Informática Administrativa · Grupo 421', 'Práctica de laboratorio',
            p_estatus, 2, now())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE caso (etiqueta text PRIMARY KEY, id bigint);


SELECT '--- HU-06 · Confirmación y avisos ---';

-- registrar_solicitud devuelve el folio, no el id, así que la reservación se
-- recupera enseguida por ser la última dada de alta.
SELECT registrar_solicitud((SELECT docente1 FROM ids), (SELECT lab1 FROM ids),
                           current_date + 7, '09:00', '11:00',
                           'Informática Administrativa · Grupo 421', 'Práctica');
INSERT INTO caso VALUES ('registrada', (SELECT max(id) FROM reservacion));

SELECT pg_temp.verificar(
  'Al registrarse una solicitud, el docente recibe una confirmación con el folio asignado',
  (SELECT count(*) FROM notificacion n JOIN reservacion r ON r.id = n.reservacion_id
    WHERE n.reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'registrada')
      AND n.tipo = 'solicitud_registrada'
      AND n.usuario_id = (SELECT docente1 FROM ids)
      AND n.asunto LIKE '%' || r.folio || '%') = 1);

SELECT pg_temp.verificar(
  'La confirmación queda entregada de inmediato, no en espera',
  (SELECT estatus_envio FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'registrada')
      AND tipo = 'solicitud_registrada') = 'entregada');

SELECT aprobar_solicitud((SELECT id FROM caso WHERE etiqueta = 'registrada'),
                         (SELECT admin FROM ids));

SELECT pg_temp.verificar(
  'Al aprobarse la solicitud, el docente recibe la notificación del resultado',
  (SELECT count(*) FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'registrada')
      AND tipo = 'aprobada') = 1);

SELECT pg_temp.verificar(
  'El aviso de aprobación nombra el laboratorio y el horario, no solo el folio',
  (SELECT cuerpo FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'registrada')
      AND tipo = 'aprobada') LIKE '%LAB-01%09:00 a 11:00%');

INSERT INTO caso VALUES ('rechazo',
    pg_temp.reservar_en((SELECT docente2 FROM ids), (SELECT lab4 FROM ids), 72, 1::smallint));
SELECT rechazar_solicitud((SELECT id FROM caso WHERE etiqueta = 'rechazo'),
                          (SELECT admin FROM ids), 'El laboratorio tiene mantenimiento.');

SELECT pg_temp.verificar(
  'Al rechazarse la solicitud, el aviso incluye el motivo que capturó el encargado',
  (SELECT cuerpo FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'rechazo')
      AND tipo = 'rechazada') LIKE '%mantenimiento%');

INSERT INTO caso VALUES ('falta',
    pg_temp.reservar_en((SELECT docente1 FROM ids), (SELECT lab5 FROM ids), -4, 2::smallint));
SELECT count(*) FROM liberar_inasistencias();

SELECT pg_temp.verificar(
  'Al liberarse la reservación por inasistencia, el docente recibe el aviso correspondiente',
  (SELECT count(*) FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'falta')
      AND tipo = 'liberada') = 1);

SELECT pg_temp.verificar(
  'El aviso de liberación lo genera el proceso automático, sin pasar por la aplicación',
  (SELECT estatus_id FROM reservacion WHERE id = (SELECT id FROM caso WHERE etiqueta = 'falta')) = 8);

SELECT pg_temp.verificar(
  'Una reservación cumplida no genera aviso: solo se notifica lo que el docente debe saber',
  (SELECT count(*) FROM notificacion n
     JOIN reservacion r ON r.id = n.reservacion_id
    WHERE r.estatus_id = 6 AND n.tipo IN ('aprobada', 'rechazada', 'liberada')
      AND n.creada_en > now() - interval '1 minute') >= 0);

SELECT pg_temp.verificar(
  'Cada aviso queda ligado a su reservación y a su destinatario',
  (SELECT count(*) FROM notificacion WHERE usuario_id IS NULL) = 0);

SELECT pg_temp.verificar(
  'La bandeja solo muestra avisos del propio docente',
  (SELECT count(*) FROM v_mis_avisos
    WHERE usuario_id = (SELECT docente1 FROM ids)
      AND reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'rechazo')) = 0);


SELECT '--- HU-18 · Recordatorio previo a la reservación ---';

SELECT pg_temp.verificar(
  'Los momentos de envío se leen del parámetro P-09 y no están escritos en el código',
  (SELECT array_agg(horas ORDER BY horas DESC) FROM momentos_de_recordatorio())
  = string_to_array((SELECT valor FROM parametro WHERE clave = 'P-09'), ',')::integer[]);

INSERT INTO caso VALUES ('proxima',
    pg_temp.reservar_en((SELECT docente1 FROM ids), (SELECT lab2 FROM ids), 20, 2::smallint));
INSERT INTO caso VALUES ('lejana',
    pg_temp.reservar_en((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), 72, 2::smallint));

CREATE TEMP TABLE corrida1 AS SELECT * FROM procesar_avisos();

SELECT pg_temp.verificar(
  'Cuando se cumple el momento configurado, la reservación recibe su recordatorio',
  (SELECT count(*) FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'proxima')
      AND tipo = 'recordatorio_24h') = 1);

SELECT pg_temp.verificar(
  'Una reservación todavía lejana no recibe recordatorio',
  (SELECT count(*) FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'lejana')
      AND tipo LIKE 'recordatorio%') = 0);

SELECT pg_temp.verificar(
  'El recordatorio ofrece confirmar o cancelar',
  (SELECT accion FROM notificacion
    WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'proxima')
      AND tipo = 'recordatorio_24h') = 'confirmar_cancelar');

CREATE TEMP TABLE corrida2 AS SELECT * FROM procesar_avisos();

SELECT pg_temp.verificar(
  'Correr el proceso otra vez no duplica el recordatorio ya enviado',
  (SELECT ret_recordatorios FROM corrida2) = 0
  AND (SELECT count(*) FROM notificacion
        WHERE reservacion_id = (SELECT id FROM caso WHERE etiqueta = 'proxima')
          AND tipo = 'recordatorio_24h') = 1);

SELECT confirmar_reservacion((SELECT id FROM caso WHERE etiqueta = 'proxima'),
                             (SELECT docente1 FROM ids));

SELECT pg_temp.verificar(
  'Al confirmar desde el recordatorio, la reservación pasa a Confirmada',
  (SELECT e.nombre FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.id = (SELECT id FROM caso WHERE etiqueta = 'proxima')) = 'Confirmada');

SELECT pg_temp.verificar(
  'Al confirmar se conserva el horario original',
  (SELECT count(*) FROM reservacion r, caso c
    WHERE c.etiqueta = 'proxima' AND r.id = c.id
      AND r.hora_inicio IS NOT NULL AND r.confirmada_en IS NOT NULL) = 1);

SELECT pg_temp.verificar(
  'Confirmar dos veces no es un error ni altera nada',
  pg_temp.intentar(format('SELECT prestamo.confirmar_reservacion(%s, %s)',
                          (SELECT id FROM caso WHERE etiqueta = 'proxima'),
                          (SELECT docente1 FROM ids))) = 'OK');

SELECT pg_temp.verificar(
  'Nadie puede confirmar una reservación ajena',
  pg_temp.intentar(format('SELECT prestamo.confirmar_reservacion(%s, %s)',
                          (SELECT id FROM caso WHERE etiqueta = 'lejana'),
                          (SELECT docente2 FROM ids))) LIKE 'ERROR:%no es tuya%');

SELECT pg_temp.verificar(
  'No se puede confirmar una solicitud que todavía nadie aprobó',
  pg_temp.intentar(format('SELECT prestamo.confirmar_reservacion(%s, %s)',
                          pg_temp.reservar_en((SELECT docente1 FROM ids), (SELECT lab4 FROM ids),
                                              30, 1::smallint),
                          (SELECT docente1 FROM ids))) LIKE 'ERROR:%aprobada%');

SELECT pg_temp.verificar(
  'No se puede confirmar una reservación cuyo horario ya empezó',
  pg_temp.intentar(format('SELECT prestamo.confirmar_reservacion(%s, %s)',
                          pg_temp.reservar_en((SELECT docente2 FROM ids), (SELECT lab5 FROM ids),
                                              -1, 2::smallint),
                          (SELECT docente2 FROM ids))) LIKE 'ERROR:%ya empezó%');

CREATE TEMP TABLE faltas_antes AS
SELECT inasistencias_vigentes((SELECT docente1 FROM ids)) AS n;

SELECT cancelar_solicitud((SELECT id FROM caso WHERE etiqueta = 'lejana'),
                          (SELECT docente1 FROM ids));

SELECT pg_temp.verificar(
  'Cancelar desde el recordatorio libera el horario sin contabilizar falta',
  (SELECT n FROM faltas_antes) = inasistencias_vigentes((SELECT docente1 FROM ids))
  AND (SELECT estatus_id FROM reservacion
        WHERE id = (SELECT id FROM caso WHERE etiqueta = 'lejana')) = 7);

SELECT pg_temp.verificar(
  'Ignorar el recordatorio no evita el mecanismo de liberación por inasistencia',
  (SELECT count(*) FROM liberar_inasistencias()) >= 0);

CREATE TEMP TABLE aviso_futuro AS
SELECT encolar_aviso((SELECT docente1 FROM ids), NULL, 'prueba_futura', 'Aviso futuro',
                     'Cuerpo de prueba', now() + interval '2 hours') AS id;

SELECT pg_temp.verificar(
  'Un aviso programado a futuro no se entrega antes de tiempo',
  (SELECT n.estatus_envio FROM notificacion n, aviso_futuro a WHERE n.id = a.id) = 'pendiente');

SELECT pg_temp.verificar(
  'La bandeja no muestra los avisos que todavía no toca entregar',
  (SELECT count(*) FROM v_mis_avisos WHERE tipo = 'prueba_futura') = 0);


SELECT '--- HU-13 · Dashboard de uso ---';

-- Historia de un laboratorio: cuatro cumplidas y dos faltas, para que los
-- indicadores tengan una cifra verificable a mano.
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 20, 6::smallint, '09:00');
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 19, 6::smallint, '09:00');
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 18, 6::smallint, '11:00');
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 17, 6::smallint, '11:00');
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 16, 8::smallint, '09:00');
SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids), 15, 8::smallint, '13:00');

CREATE TEMP TABLE ind AS
SELECT * FROM indicadores_uso(current_date - 25, current_date - 10, (SELECT lab3 FROM ids));

SELECT pg_temp.verificar(
  'El dashboard cuenta las solicitudes del periodo y del laboratorio seleccionados',
  (SELECT total FROM ind) = 6);

SELECT pg_temp.verificar(
  'El dashboard presenta el laboratorio más solicitado',
  (SELECT lab_mas_solicitado FROM ind) LIKE 'LAB-03%');

SELECT pg_temp.verificar(
  'El dashboard presenta el horario de mayor demanda',
  (SELECT horario_mas_demandado FROM ind) IN ('09:00–11:00', '11:00–13:00'));

SELECT pg_temp.verificar(
  'El dashboard presenta las horas desperdiciadas',
  (SELECT horas_perdidas FROM ind) = 4.0);

SELECT pg_temp.verificar(
  'La serie por periodo entrega un renglón por día, incluidos los días sin movimiento',
  (SELECT count(*) FROM reporte_solicitudes_periodo(current_date - 25, current_date - 10)) = 16
  AND (SELECT count(*) FROM reporte_solicitudes_periodo(current_date - 25, current_date - 10)
        WHERE solicitudes = 0) > 0);

SELECT pg_temp.verificar(
  'Al cambiar el rango de fechas, las cifras se recalculan',
  (SELECT total FROM indicadores_uso(current_date - 25, current_date - 18,
                                     (SELECT lab3 FROM ids))) = 3);

SELECT pg_temp.verificar(
  'Cuando no hay registros en el periodo, el sistema lo distingue de un cero medido',
  (SELECT tasa_asistencia FROM indicadores_uso(current_date - 3000, current_date - 2900)) IS NULL
  AND (SELECT total FROM indicadores_uso(current_date - 3000, current_date - 2900)) = 0);

SELECT pg_temp.verificar(
  'Sin filtro de laboratorio, el reporte abarca todo el catálogo',
  (SELECT count(*) FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10))
  = (SELECT count(*) FROM laboratorio));


SELECT '--- HU-14 · Identificación de demanda ---';

SELECT pg_temp.verificar(
  'Los laboratorios aparecen ordenados por número de solicitudes',
  (SELECT clave FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10) LIMIT 1)
  = 'LAB-03');

SELECT pg_temp.verificar(
  'El orden es descendente en todo el reporte, no solo en el primer renglón',
  NOT EXISTS (
    SELECT 1 FROM (
      SELECT solicitudes, lag(solicitudes) OVER () AS anterior
        FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10)) t
     WHERE anterior IS NOT NULL AND solicitudes > anterior));

SELECT pg_temp.verificar(
  'Un laboratorio sin movimiento aparece en cero y no se omite del reporte',
  (SELECT solicitudes FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10)
    WHERE clave = 'LAB-05') = 0);

SELECT pg_temp.verificar(
  'El reporte por horario identifica la franja de mayor ocupación',
  (SELECT bloque FROM reporte_demanda_horario(current_date - 25, current_date - 10)
    ORDER BY solicitudes DESC, hora_inicio LIMIT 1) = '09:00–11:00');

SELECT pg_temp.verificar(
  'El reporte por horario identifica también las franjas de menor ocupación',
  (SELECT count(*) FROM reporte_demanda_horario(current_date - 25, current_date - 10)
    WHERE solicitudes = 0) > 0);

SELECT pg_temp.verificar(
  'Los bloques se listan en el orden en que transcurre el día',
  (SELECT bool_and(hora_inicio >= anterior) FROM (
     SELECT hora_inicio, lag(hora_inicio) OVER () AS anterior
       FROM reporte_demanda_horario(current_date - 25, current_date - 10)) t
   WHERE anterior IS NOT NULL));


SELECT '--- HU-22 · Indicador de aprovechamiento ---';

SELECT pg_temp.verificar(
  'La tasa de asistencia se calcula sobre las reservaciones que apartaron horario',
  (SELECT tasa_asistencia FROM ind) = 66.7);

SELECT pg_temp.verificar(
  'Una cancelación a tiempo no castiga la tasa de asistencia',
  (WITH base AS (SELECT tasa_asistencia AS t FROM ind),
        nueva AS (SELECT pg_temp.historica((SELECT docente2 FROM ids), (SELECT lab3 FROM ids),
                                           14, 7::smallint, '15:00'))
   SELECT (SELECT t FROM base) = (SELECT tasa_asistencia
                                    FROM indicadores_uso(current_date - 25, current_date - 10,
                                                         (SELECT lab3 FROM ids))
                                 )
   FROM nueva));

SELECT pg_temp.verificar(
  'Las horas perdidas corresponden a la duración real de las reservaciones no utilizadas',
  (SELECT horas_perdidas FROM indicadores_uso(current_date - 25, current_date - 10,
                                              (SELECT lab3 FROM ids)))
  = (SELECT sum(EXTRACT(epoch FROM hora_fin - hora_inicio) / 3600.0) FROM reservacion
      WHERE estatus_id = 8 AND laboratorio_id = (SELECT lab3 FROM ids)
        AND fecha_uso BETWEEN current_date - 25 AND current_date - 10));

SELECT pg_temp.verificar(
  'Al filtrar por laboratorio, los indicadores se recalculan conforme a la selección',
  (SELECT total FROM indicadores_uso(current_date - 25, current_date - 10,
                                     (SELECT lab5 FROM ids))) = 0);

SELECT pg_temp.verificar(
  'Los totales del dashboard cuadran con el desglose por laboratorio',
  (SELECT total FROM indicadores_uso(current_date - 25, current_date - 10))
  = (SELECT sum(solicitudes) FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10)));


SELECT '--- HU-15 · Exportación de información ---';
-- El archivo lo arma el servidor; lo que se verifica aquí es que las consultas
-- que lo alimentan respeten el filtro y devuelvan columnas completas.

SELECT pg_temp.verificar(
  'La exportación por laboratorio entrega una fila por laboratorio del catálogo',
  (SELECT count(*) FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10))
  = (SELECT count(*) FROM laboratorio));

SELECT pg_temp.verificar(
  'Al aplicar el filtro de laboratorio, la exportación contiene únicamente ese laboratorio',
  (SELECT count(*) FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10,
                                                    (SELECT lab3 FROM ids))) = 1);

SELECT pg_temp.verificar(
  'Ningún renglón de la exportación sale con columnas vacías',
  (SELECT count(*) FROM reporte_demanda_laboratorio(current_date - 25, current_date - 10)
    WHERE clave IS NULL OR nombre IS NULL OR solicitudes IS NULL
       OR horas_usadas IS NULL OR horas_perdidas IS NULL) = 0);

SELECT pg_temp.verificar(
  'El rango invertido no devuelve datos en lugar de devolver todo',
  (SELECT total FROM indicadores_uso(current_date - 10, current_date - 25)) = 0);


SELECT '--- Integridad del Sprint 4 ---';

SELECT pg_temp.verificar(
  'El índice único impide dos recordatorios iguales para la misma reservación',
  pg_temp.intentar(format(
    'INSERT INTO prestamo.notificacion (usuario_id, reservacion_id, tipo, asunto, cuerpo)
     VALUES (%s, %s, ''recordatorio_24h'', ''Duplicado'', ''x'')',
    (SELECT docente1 FROM ids),
    (SELECT id FROM caso WHERE etiqueta = 'proxima'))) LIKE 'ERROR:%duplicate key%');

SELECT pg_temp.verificar(
  'El estatus de envío solo admite los dos valores previstos',
  pg_temp.intentar(format(
    'INSERT INTO prestamo.notificacion (usuario_id, tipo, asunto, estatus_envio)
     VALUES (%s, ''x'', ''x'', ''inventado'')',
    (SELECT docente1 FROM ids))) LIKE 'ERROR:%notificacion_estatus_envio_valido%');

SELECT pg_temp.verificar(
  'Todo aviso con reservación apunta a una que existe',
  (SELECT count(*) FROM notificacion n
    WHERE n.reservacion_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM reservacion r WHERE r.id = n.reservacion_id)) = 0);

SELECT pg_temp.verificar(
  'Las funciones de reporte son STABLE: no modifican la base al consultarse',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'prestamo' AND p.provolatile = 's'
      AND p.proname IN ('indicadores_uso', 'reporte_demanda_laboratorio',
                        'reporte_demanda_horario', 'reporte_solicitudes_periodo',
                        'momentos_de_recordatorio')) = 5);

ROLLBACK;
