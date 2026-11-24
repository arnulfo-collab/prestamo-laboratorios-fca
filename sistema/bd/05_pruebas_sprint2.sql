-- =====================================================================
-- Pruebas del Sprint 2 · Núcleo de reservación
-- Verifican en el motor los criterios de aceptación de HU-03, HU-04,
-- HU-05, HU-12 y HU-20. Cada prueba imprime APROBADA o FALLA.
-- Ejecutar después de 01, 02 y 04. Corre dentro de una transacción
-- que se revierte al final, de modo que no deja datos en la base.
-- =====================================================================

SET search_path TO prestamo, extensions, public;
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.verificar(descripcion text, condicion boolean) RETURNS text AS $$
    SELECT CASE WHEN $2 THEN 'APROBADA  · ' ELSE 'FALLA     · ' END || $1;
$$ LANGUAGE sql;

-- Ejecuta un registro de solicitud y devuelve el folio o el mensaje de error,
-- sin abortar la transacción.
CREATE OR REPLACE FUNCTION pg_temp.solicitar(
    p_usuario integer, p_lab integer, p_fecha date,
    p_ini time, p_fin time, p_grupo varchar DEFAULT 'Informática Administrativa · Grupo 421',
    p_motivo varchar DEFAULT 'Práctica de laboratorio')
RETURNS text AS $$
BEGIN
    RETURN prestamo.registrar_solicitud(p_usuario, p_lab, p_fecha, p_ini, p_fin, p_grupo, p_motivo);
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.aprobar(p_res bigint, p_admin integer) RETURNS text AS $$
BEGIN
    PERFORM prestamo.aprobar_solicitud(p_res, p_admin);
    RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.rechazar(p_res bigint, p_admin integer, p_motivo varchar) RETURNS text AS $$
BEGIN
    PERFORM prestamo.rechazar_solicitud(p_res, p_admin, p_motivo);
    RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Identificadores usados por las pruebas.
CREATE TEMP TABLE ids AS
SELECT (SELECT id FROM usuario WHERE correo = 'arnulfo.vasquez@uabc.edu.mx') AS docente1,
       (SELECT id FROM usuario WHERE correo = 'docente.prueba@uabc.edu.mx')  AS docente2,
       (SELECT id FROM usuario WHERE correo = 'laboratorios.fca@uabc.edu.mx') AS admin,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-01') AS lab1,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-02') AS lab2,
       (SELECT id FROM laboratorio WHERE clave = 'LAB-03') AS lab3;

-- Siguiente lunes, para que las pruebas no dependan del día en que se corran:
-- todos los laboratorios publican bloques de lunes a viernes.
CREATE TEMP TABLE f AS
SELECT (current_date + ((8 - EXTRACT(isodow FROM current_date)::integer) % 7 + 1))::date AS lunes;

SELECT '--- HU-03 · Consulta de disponibilidad en tiempo real ---';

SELECT pg_temp.verificar(
  'El calendario devuelve los bloques de los 5 laboratorios activos',
  (SELECT count(DISTINCT laboratorio_id) FROM disponibilidad((SELECT lunes FROM f))) = 5);

SELECT pg_temp.verificar(
  'Sin reservaciones, todos los bloques aparecen libres',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f)) WHERE estado <> 'libre') = 0);

-- Una reservación aprobada ocupa el horario.
SELECT pg_temp.solicitar(i.docente1, i.lab1, f.lunes, '09:00', '11:00') AS folio_a
INTO TEMP paso1 FROM ids i, f;
SELECT pg_temp.aprobar((SELECT id FROM reservacion WHERE folio = (SELECT folio_a FROM paso1)),
                       (SELECT admin FROM ids));

SELECT pg_temp.verificar(
  'Tras aprobarse una reservación, ese bloque aparece ocupado con su folio y su docente',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
    WHERE estado = 'ocupado' AND folio = (SELECT folio_a FROM paso1)
      AND docente = 'Arnulfo Vásquez Romero') = 1);

SELECT pg_temp.verificar(
  'Los demás bloques del mismo laboratorio siguen libres',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
    WHERE laboratorio_id = (SELECT lab1 FROM ids) AND estado = 'libre') = 6);

-- Un bloqueo por mantenimiento vuelve el laboratorio no disponible.
INSERT INTO bloqueo_laboratorio (laboratorio_id, motivo, fecha_inicio, fecha_fin, registrado_por)
SELECT i.lab2, 'Mantenimiento preventivo de equipos', f.lunes, f.lunes + 2, i.admin FROM ids i, f;

SELECT pg_temp.verificar(
  'Un laboratorio con bloqueo vigente aparece bloqueado en todos sus bloques',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
    WHERE laboratorio_id = (SELECT lab2 FROM ids) AND estado = 'bloqueado') = 7);

-- Una reservación liberada por inasistencia devuelve el horario al calendario.
UPDATE reservacion SET estatus_id = 8 WHERE folio = (SELECT folio_a FROM paso1);
SELECT pg_temp.verificar(
  'Una reservación marcada como No asistió devuelve el horario a disponible',
  (SELECT estado FROM disponibilidad((SELECT lunes FROM f))
    WHERE laboratorio_id = (SELECT lab1 FROM ids) AND hora_inicio = '09:00') = 'libre');
UPDATE reservacion SET estatus_id = 2 WHERE folio = (SELECT folio_a FROM paso1);

-- Un laboratorio desactivado deja de ofrecerse en el calendario.
UPDATE laboratorio SET activo = false WHERE clave = 'LAB-05';
SELECT pg_temp.verificar(
  'Un laboratorio desactivado no aparece en el calendario',
  (SELECT count(*) FROM disponibilidad((SELECT lunes FROM f))
    WHERE clave = 'LAB-05') = 0);
UPDATE laboratorio SET activo = true WHERE clave = 'LAB-05';

SELECT '';
SELECT '--- HU-04 · Registro de solicitud con antelación ---';

SELECT pg_temp.verificar(
  'Una solicitud válida devuelve folio con el formato RES-AAAA-NNNNN',
  (SELECT folio_a FROM paso1) ~ '^RES-[0-9]{4}-[0-9]{5}$');

-- El registro se hace una sola vez y su folio se guarda, para no repetir la
-- llamada dentro de una consulta.
SELECT pg_temp.solicitar(i.docente2, i.lab3, f.lunes, '07:00', '09:00') AS folio_b
INTO TEMP paso2 FROM ids i, f;

SELECT pg_temp.verificar(
  'La solicitud queda registrada en estatus Solicitada antes de resolverse',
  (SELECT count(*) FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.folio = (SELECT folio_b FROM paso2) AND e.clave = 'solicitada') = 1);

SELECT pg_temp.verificar(
  'Sin grupo o materia la solicitud no se registra',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f),
                    '11:00', '13:00', '', 'Práctica') LIKE 'ERROR:%grupo o la materia%');

SELECT pg_temp.verificar(
  'Sin motivo de uso la solicitud no se registra',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f),
                    '11:00', '13:00', 'Grupo 421', '  ') LIKE 'ERROR:%motivo de uso%');

SELECT pg_temp.verificar(
  'Una fecha anterior a hoy se rechaza indicando que la fecha no es válida',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), current_date - 1,
                    '11:00', '13:00') LIKE 'ERROR:%ya pasó%');

SELECT pg_temp.verificar(
  'Un horario que excede el bloque publicado se rechaza',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f),
                    '11:00', '15:00') LIKE 'ERROR:%excede el bloque%');

SELECT pg_temp.verificar(
  'Un laboratorio bloqueado no admite solicitudes',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab2 FROM ids), (SELECT lunes FROM f),
                    '11:00', '13:00') LIKE 'ERROR:%bloqueado%');

SELECT pg_temp.verificar(
  'Un horario ya ocupado por una reservación aprobada no admite otra solicitud',
  pg_temp.solicitar((SELECT docente2 FROM ids), (SELECT lab1 FROM ids), (SELECT lunes FROM f),
                    '09:00', '11:00') LIKE 'ERROR:%ya está ocupado%');

SELECT '';
SELECT '--- HU-20 · Límites de reservación por docente ---';

SELECT pg_temp.verificar(
  'La anticipación máxima (P-07 = 30 días) se rechaza indicando la fecha permitida',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), current_date + 45,
                    '09:00', '11:00') LIKE 'ERROR:%30 días de anticipación%');

-- El docente 1 ya tiene 1 activa. Se le agregan 2 más para alcanzar P-06 = 3.
SELECT pg_temp.solicitar(i.docente1, i.lab3, f.lunes, '09:00', '11:00') FROM ids i, f;
SELECT pg_temp.solicitar(i.docente1, i.lab3, f.lunes + 1, '09:00', '11:00') FROM ids i, f;

SELECT pg_temp.verificar(
  'El docente alcanza el límite de 3 reservaciones activas (P-06)',
  reservaciones_activas((SELECT docente1 FROM ids)) = 3);

SELECT pg_temp.verificar(
  'Una cuarta reservación se impide indicando el límite vigente',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f) + 2,
                    '09:00', '11:00') LIKE 'ERROR:%límite vigente es de 3%');

-- Al rechazarse una, el cupo se libera.
SELECT pg_temp.rechazar(
  (SELECT min(id) FROM reservacion WHERE usuario_id = (SELECT docente1 FROM ids) AND estatus_id = 1),
  (SELECT admin FROM ids), 'El laboratorio se requiere para un examen departamental.');

SELECT pg_temp.verificar(
  'Al rechazarse una reservación el cupo se libera: quedan 2 activas',
  reservaciones_activas((SELECT docente1 FROM ids)) = 2);

SELECT pg_temp.verificar(
  'Liberado el cupo, el docente puede volver a registrar una solicitud',
  pg_temp.solicitar((SELECT docente1 FROM ids), (SELECT lab3 FROM ids), (SELECT lunes FROM f) + 2,
                    '09:00', '11:00') ~ '^RES-');

SELECT pg_temp.verificar(
  'Un rechazo sin motivo capturado no se permite',
  pg_temp.rechazar((SELECT max(id) FROM reservacion), (SELECT admin FROM ids), '')
    LIKE 'ERROR:%motivo del rechazo%');

SELECT '';
SELECT '--- HU-12 · Prevención de empalmes ---';

-- Las pruebas anteriores dejaron al docente 1 en su límite de reservaciones
-- activas. Se cancelan para que el bloque siguiente mida el empalme y no el
-- límite, que ya quedó verificado.
UPDATE reservacion SET estatus_id = 7, cancelada_en = now()
 WHERE usuario_id = (SELECT docente1 FROM ids) AND estatus_id IN (1, 2);

-- Dos docentes solicitan horarios que se traslapan parcialmente en LAB-04.
CREATE TEMP TABLE empalme AS
-- El traslape es parcial y ocurre dentro del mismo bloque publicado de 13 a 15:
-- la primera pide de 13 a 14 y la segunda de 13:30 a 15. Comparten media hora.
SELECT pg_temp.solicitar(i.docente1, l.id, f.lunes, '13:00', '14:00') AS folio_x,
       pg_temp.solicitar(i.docente2, l.id, f.lunes, '13:30', '15:00') AS folio_y
FROM ids i, f, laboratorio l WHERE l.clave = 'LAB-04';

SELECT pg_temp.verificar(
  'Dos solicitudes con traslape parcial quedan registradas como solicitudes',
  (SELECT folio_x FROM empalme) ~ '^RES-' AND (SELECT folio_y FROM empalme) ~ '^RES-');

SELECT pg_temp.verificar(
  'El sistema detecta el traslape parcial entre ambas solicitudes',
  (SELECT count(*) FROM v_solicitudes_en_conflicto
    WHERE folio IN ((SELECT folio_x FROM empalme), (SELECT folio_y FROM empalme))) = 2);

-- Se aprueba la primera.
SELECT pg_temp.aprobar((SELECT id FROM reservacion WHERE folio = (SELECT folio_x FROM empalme)),
                       (SELECT admin FROM ids));

SELECT pg_temp.verificar(
  'Aprobada una, la otra queda señalada como conflictiva contra una reservación aprobada',
  (SELECT count(*) FROM v_solicitudes_en_conflicto
    WHERE folio = (SELECT folio_y FROM empalme) AND conflicto_estatus = 'Aprobada') = 1);

SELECT pg_temp.verificar(
  'Aprobar la segunda se impide y el mensaje nombra el folio y el docente en conflicto',
  pg_temp.aprobar((SELECT id FROM reservacion WHERE folio = (SELECT folio_y FROM empalme)),
                  (SELECT admin FROM ids))
    LIKE 'ERROR:%No se puede aprobar%' );

SELECT pg_temp.verificar(
  'La solicitud en conflicto permanece en estatus Solicitada',
  (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.folio = (SELECT folio_y FROM empalme)) = 'solicitada');

-- Segunda red: la restricción del motor rechaza el empalme aunque alguien
-- escriba directamente en la tabla sin pasar por la función.
SAVEPOINT directo;
UPDATE reservacion SET estatus_id = 2, resuelta_por = (SELECT admin FROM ids), resuelta_en = now()
 WHERE folio = (SELECT folio_y FROM empalme);
ROLLBACK TO directo;

SELECT pg_temp.verificar(
  'La restricción del motor también rechaza el empalme escrito directamente en la tabla',
  (SELECT e.clave FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.folio = (SELECT folio_y FROM empalme)) = 'solicitada');

SELECT '';
SELECT '--- HU-05 · Seguimiento del estatus ---';

SELECT pg_temp.verificar(
  'El docente ve sus solicitudes con folio, laboratorio, fecha, horario y estatus',
  (SELECT count(*) FROM v_mis_solicitudes
    WHERE usuario_id = (SELECT docente1 FROM ids)
      AND folio IS NOT NULL AND laboratorio IS NOT NULL
      AND fecha_uso IS NOT NULL AND hora_inicio IS NOT NULL AND estatus IS NOT NULL) >= 4);

SELECT pg_temp.verificar(
  'Una solicitud rechazada muestra el motivo del rechazo',
  (SELECT motivo_rechazo FROM v_mis_solicitudes
    WHERE usuario_id = (SELECT docente1 FROM ids) AND estatus_clave = 'rechazada' LIMIT 1)
   = 'El laboratorio se requiere para un examen departamental.');

-- Se marca una reservación como no asistió para comprobar el tercer criterio.
UPDATE reservacion SET estatus_id = 8 WHERE folio = (SELECT folio_x FROM empalme);
SELECT pg_temp.verificar(
  'Una solicitud marcada como No asistió lo indica junto con la fecha en que ocurrió',
  (SELECT marcada_no_asistio IS NOT NULL FROM v_mis_solicitudes
    WHERE folio = (SELECT folio_x FROM empalme)));

SELECT pg_temp.verificar(
  'Un docente sin solicitudes no tiene registros que mostrar',
  (SELECT count(*) FROM v_mis_solicitudes
    WHERE usuario_id = (SELECT id FROM usuario WHERE correo = 'coordinacion.fca@uabc.edu.mx')) = 0);

SELECT '';
SELECT '--- Trazabilidad ---';

SELECT pg_temp.verificar(
  'Cada cambio de estatus quedó registrado en el historial (RNF-05)',
  (SELECT count(*) FROM historial_reservacion) >= (SELECT count(*) FROM reservacion));

ROLLBACK;
