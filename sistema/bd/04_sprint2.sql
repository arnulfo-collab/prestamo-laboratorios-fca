-- =====================================================================
-- Sprint 2 · Núcleo de reservación
-- Sistema de Préstamo de Laboratorios de Cómputo · FCA, UABC Mexicali
--
-- Entregables : E-07 Módulo de consulta de disponibilidad
--               E-08 Módulo de registro y seguimiento de solicitudes
-- Tareas      : T-11 a T-22
-- Periodo     : 12 al 23 de octubre de 2026
-- Responsable : Arnulfo Vásquez Romero
--
-- Este archivo agrega al esquema del Sprint 1 la lógica de reservación:
-- la consulta de disponibilidad, el registro de solicitudes con folio y
-- las dos validaciones que evitan el mal uso desde el origen, la
-- prevención de empalmes (RF-12) y los límites por docente (RF-19).
--
-- Las reglas viven aquí, en el motor, y no en la aplicación, para que
-- sigan vigentes sin importar qué programa escriba en la base.
-- =====================================================================

SET search_path TO prestamo, extensions, public;

-- ---------------------------------------------------------------------
-- 1. Lectura de los parámetros de préstamo
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION parametro_entero(p_clave varchar) RETURNS integer AS $$
    SELECT valor::integer FROM prestamo.parametro WHERE clave = p_clave;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION parametro_entero(varchar) IS
  'Lee un parámetro de préstamo como número entero. Las reglas se consultan siempre
   por esta vía, de modo que cambiar un valor en la tabla cambie el comportamiento
   del sistema sin tocar el código (RNF-08).';

-- ---------------------------------------------------------------------
-- 2. Folio de la reservación  ·  T-15
-- ---------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS folio_reservacion START 1;

CREATE OR REPLACE FUNCTION folio_siguiente() RETURNS varchar AS $$
    SELECT 'RES-' || to_char(current_date, 'YYYY') || '-' ||
           lpad(nextval('prestamo.folio_reservacion')::text, 5, '0');
$$ LANGUAGE sql;
COMMENT ON FUNCTION folio_siguiente() IS
  'Genera el folio visible para el docente con el formato RES-AAAA-NNNNN.';

-- ---------------------------------------------------------------------
-- 3. Consulta de disponibilidad  ·  HU-03, T-11 a T-13
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION disponibilidad(p_fecha date)
RETURNS TABLE (
    laboratorio_id  integer,
    clave           varchar,
    laboratorio     varchar,
    capacidad       smallint,
    hora_inicio     time,
    hora_fin        time,
    estado          varchar,
    folio           varchar,
    docente         varchar,
    grupo_materia   varchar
) AS $$
    SELECT l.id,
           l.clave,
           l.nombre,
           l.capacidad,
           h.hora_inicio,
           h.hora_fin,
           CASE
             WHEN b.id IS NOT NULL THEN 'bloqueado'
             WHEN r.id IS NOT NULL THEN 'ocupado'
             ELSE 'libre'
           END::varchar,
           r.folio,
           u.nombre,
           r.grupo_materia
    FROM prestamo.laboratorio l
    JOIN prestamo.horario_laboratorio h
      ON h.laboratorio_id = l.id
     AND h.dia_semana = EXTRACT(isodow FROM p_fecha)
    -- Un bloqueo por mantenimiento vuelve el espacio no disponible (HU-10).
    LEFT JOIN prestamo.bloqueo_laboratorio b
      ON b.laboratorio_id = l.id
     AND p_fecha BETWEEN b.fecha_inicio AND b.fecha_fin
    -- Solo las reservaciones cuyo estatus ocupa el horario lo marcan ocupado;
    -- una liberada por inasistencia o cancelada vuelve a aparecer libre.
    LEFT JOIN prestamo.reservacion r
      ON r.laboratorio_id = l.id
     AND r.fecha_uso = p_fecha
     AND r.estatus_id IN (SELECT e.id FROM prestamo.estatus_reservacion e WHERE e.ocupa_horario)
     AND public.timerange(r.hora_inicio, r.hora_fin) && public.timerange(h.hora_inicio, h.hora_fin)
    LEFT JOIN prestamo.usuario u ON u.id = r.usuario_id
    WHERE l.activo
    ORDER BY l.clave, h.hora_inicio;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION disponibilidad(date) IS
  'Devuelve, para una fecha, cada bloque horario de cada laboratorio activo con su
   estado: libre, ocupado o bloqueado. Es la fuente del calendario de HU-03.';

-- ---------------------------------------------------------------------
-- 4. Reservaciones activas de un docente  ·  HU-20, T-21
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reservaciones_activas(p_usuario integer) RETURNS integer AS $$
    SELECT count(*)::integer
    FROM prestamo.reservacion r
    JOIN prestamo.estatus_reservacion e ON e.id = r.estatus_id
    WHERE r.usuario_id = p_usuario
      AND r.fecha_uso >= current_date
      AND NOT e.es_final;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION reservaciones_activas(integer) IS
  'Cuenta las reservaciones vigentes de un docente. Una reservación rechazada,
   cancelada, cumplida o marcada como no asistió ya no cuenta, de modo que el cupo
   se libera solo (tercer criterio de HU-20).';

-- ---------------------------------------------------------------------
-- 5. Registro de una solicitud  ·  HU-04, T-14 a T-16; HU-20, T-21 y T-22
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_solicitud(
    p_usuario       integer,
    p_laboratorio   integer,
    p_fecha         date,
    p_hora_inicio   time,
    p_hora_fin      time,
    p_grupo_materia varchar,
    p_motivo_uso    varchar
) RETURNS varchar AS $$
DECLARE
    v_folio     varchar;
    v_lab       prestamo.laboratorio%ROWTYPE;
    v_max_dias  integer := prestamo.parametro_entero('P-07');
    v_max_act   integer := prestamo.parametro_entero('P-06');
    v_activas   integer;
BEGIN
    -- Campos obligatorios (T-16).
    IF p_grupo_materia IS NULL OR btrim(p_grupo_materia) = '' THEN
        RAISE EXCEPTION 'Indica el grupo o la materia para la que usarás el laboratorio.'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_motivo_uso IS NULL OR btrim(p_motivo_uso) = '' THEN
        RAISE EXCEPTION 'Indica el motivo de uso del laboratorio.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Fecha no pasada (T-16).
    IF p_fecha < current_date THEN
        RAISE EXCEPTION 'La fecha % ya pasó. Elige una fecha a partir de hoy.', to_char(p_fecha, 'DD/MM/YYYY')
            USING ERRCODE = 'check_violation';
    END IF;

    -- Anticipación máxima, parámetro P-07 (T-22).
    IF p_fecha > current_date + v_max_dias THEN
        RAISE EXCEPTION 'Solo puedes apartar con % días de anticipación. La fecha máxima permitida es el %.',
            v_max_dias, to_char(current_date + v_max_dias, 'DD/MM/YYYY')
            USING ERRCODE = 'check_violation';
    END IF;

    -- El laboratorio debe estar en servicio.
    SELECT * INTO v_lab FROM prestamo.laboratorio WHERE id = p_laboratorio;
    IF NOT FOUND OR NOT v_lab.activo THEN
        RAISE EXCEPTION 'El laboratorio seleccionado no está disponible para préstamo.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- El horario solicitado debe caber dentro de un bloque publicado por el
    -- laboratorio. El bloque es la duración máxima permitida.
    IF NOT EXISTS (
        SELECT 1 FROM prestamo.horario_laboratorio h
        WHERE h.laboratorio_id = p_laboratorio
          AND h.dia_semana = EXTRACT(isodow FROM p_fecha)
          AND p_hora_inicio >= h.hora_inicio
          AND p_hora_fin    <= h.hora_fin
    ) THEN
        RAISE EXCEPTION 'El horario solicitado excede el bloque que este laboratorio ofrece ese día.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Bloqueo por mantenimiento o evento vigente.
    IF EXISTS (
        SELECT 1 FROM prestamo.bloqueo_laboratorio b
        WHERE b.laboratorio_id = p_laboratorio
          AND p_fecha BETWEEN b.fecha_inicio AND b.fecha_fin
    ) THEN
        RAISE EXCEPTION 'El laboratorio está bloqueado en esa fecha y no admite reservaciones.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Límite de reservaciones activas, parámetro P-06 (T-21).
    v_activas := prestamo.reservaciones_activas(p_usuario);
    IF v_activas >= v_max_act THEN
        RAISE EXCEPTION 'Ya tienes % reservaciones activas y el límite vigente es de %. Cancela una para registrar otra.',
            v_activas, v_max_act
            USING ERRCODE = 'check_violation';
    END IF;

    -- El horario no debe estar ya ocupado por una reservación vigente.
    IF EXISTS (
        SELECT 1 FROM prestamo.reservacion r
        JOIN prestamo.estatus_reservacion e ON e.id = r.estatus_id
        WHERE r.laboratorio_id = p_laboratorio
          AND r.fecha_uso = p_fecha
          AND e.ocupa_horario
          AND public.timerange(r.hora_inicio, r.hora_fin) && public.timerange(p_hora_inicio, p_hora_fin)
    ) THEN
        RAISE EXCEPTION 'Ese horario ya está ocupado. Elige otro bloque del calendario.'
            USING ERRCODE = 'check_violation';
    END IF;

    v_folio := prestamo.folio_siguiente();

    INSERT INTO prestamo.reservacion (folio, usuario_id, laboratorio_id, fecha_uso,
                                      hora_inicio, hora_fin, grupo_materia, motivo_uso, estatus_id)
    VALUES (v_folio, p_usuario, p_laboratorio, p_fecha,
            p_hora_inicio, p_hora_fin, btrim(p_grupo_materia), btrim(p_motivo_uso), 1);

    RETURN v_folio;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION registrar_solicitud(integer, integer, date, time, time, varchar, varchar) IS
  'Registra una solicitud en estatus Solicitada y devuelve su folio. Aplica las ocho
   validaciones de HU-04 y HU-20 antes de insertar. Cada una levanta un mensaje
   redactado para que el docente sepa qué corregir.';

-- ---------------------------------------------------------------------
-- 6. Detección de empalmes  ·  HU-12, T-19
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_solicitudes_en_conflicto AS
SELECT r.id,
       r.folio,
       r.laboratorio_id,
       l.clave            AS laboratorio,
       r.fecha_uso,
       r.hora_inicio,
       r.hora_fin,
       u.nombre           AS docente,
       otra.id            AS conflicto_id,
       otra.folio         AS conflicto_folio,
       otro_u.nombre      AS conflicto_docente,
       otra.hora_inicio   AS conflicto_inicio,
       otra.hora_fin      AS conflicto_fin,
       e_otra.nombre      AS conflicto_estatus
FROM prestamo.reservacion r
JOIN prestamo.laboratorio l ON l.id = r.laboratorio_id
JOIN prestamo.usuario u     ON u.id = r.usuario_id
JOIN prestamo.reservacion otra
  ON otra.laboratorio_id = r.laboratorio_id
 AND otra.fecha_uso      = r.fecha_uso
 AND otra.id <> r.id
 AND public.timerange(otra.hora_inicio, otra.hora_fin) && public.timerange(r.hora_inicio, r.hora_fin)
JOIN prestamo.estatus_reservacion e_otra ON e_otra.id = otra.estatus_id
JOIN prestamo.usuario otro_u             ON otro_u.id = otra.usuario_id
WHERE r.estatus_id = 1               -- la solicitud en revisión
  AND NOT e_otra.es_final;           -- contra otra que sigue viva
COMMENT ON VIEW v_solicitudes_en_conflicto IS
  'Solicitudes pendientes que se traslapan con otra reservación viva en el mismo
   laboratorio y fecha. Detecta el traslape total y el parcial, porque compara
   rangos horarios y no horas de inicio (T-19).';

-- ---------------------------------------------------------------------
-- 7. Resolución de solicitudes  ·  HU-12, T-20
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION aprobar_solicitud(p_reservacion bigint, p_administrador integer)
RETURNS void AS $$
DECLARE
    v_conflicto record;
BEGIN
    SELECT * INTO v_conflicto
    FROM prestamo.v_solicitudes_en_conflicto c
    WHERE c.id = p_reservacion
      AND c.conflicto_estatus IN ('Aprobada', 'Confirmada', 'En curso', 'Cumplida')
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'No se puede aprobar: el laboratorio % ya tiene la reservación % de % el % de %:% a %:%.',
            v_conflicto.laboratorio, v_conflicto.conflicto_folio, v_conflicto.conflicto_docente,
            to_char(v_conflicto.fecha_uso, 'DD/MM/YYYY'),
            to_char(v_conflicto.conflicto_inicio, 'HH24'), to_char(v_conflicto.conflicto_inicio, 'MI'),
            to_char(v_conflicto.conflicto_fin, 'HH24'), to_char(v_conflicto.conflicto_fin, 'MI')
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE prestamo.reservacion
       SET estatus_id = 2, resuelta_por = p_administrador, resuelta_en = now()
     WHERE id = p_reservacion AND estatus_id = 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La solicitud no existe o ya fue resuelta.' USING ERRCODE = 'check_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION aprobar_solicitud(bigint, integer) IS
  'Aprueba una solicitud. Antes verifica que no exista un empalme con una reservación
   que ocupe el horario y, si lo hay, lo impide mostrando el conflicto (T-20). La
   restricción reservacion_sin_empalme del esquema es la segunda red: aunque alguien
   escribiera en la tabla sin pasar por esta función, el motor rechazaría el empalme.';

CREATE OR REPLACE FUNCTION rechazar_solicitud(p_reservacion bigint, p_administrador integer,
                                              p_motivo varchar)
RETURNS void AS $$
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'Captura el motivo del rechazo.' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE prestamo.reservacion
       SET estatus_id = 3, resuelta_por = p_administrador, resuelta_en = now(),
           motivo_rechazo = btrim(p_motivo)
     WHERE id = p_reservacion AND estatus_id = 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La solicitud no existe o ya fue resuelta.' USING ERRCODE = 'check_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 8. Seguimiento del estatus  ·  HU-05, T-17 y T-18
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_mis_solicitudes AS
SELECT r.id,
       r.usuario_id,
       r.folio,
       l.clave          AS laboratorio_clave,
       l.nombre         AS laboratorio,
       r.fecha_uso,
       r.hora_inicio,
       r.hora_fin,
       r.grupo_materia,
       r.motivo_uso,
       e.nombre         AS estatus,
       e.clave          AS estatus_clave,
       r.solicitada_en,
       r.motivo_rechazo,
       -- Fecha en que la reservación se marcó como no asistió, para el tercer
       -- criterio de HU-05.
       (SELECT max(hr.ocurrido_en) FROM prestamo.historial_reservacion hr
         WHERE hr.reservacion_id = r.id AND hr.estatus_nuevo = 8) AS marcada_no_asistio,
       quien.nombre     AS resuelta_por
FROM prestamo.reservacion r
JOIN prestamo.laboratorio l          ON l.id = r.laboratorio_id
JOIN prestamo.estatus_reservacion e  ON e.id = r.estatus_id
LEFT JOIN prestamo.usuario quien     ON quien.id = r.resuelta_por
ORDER BY r.fecha_uso DESC, r.hora_inicio;
COMMENT ON VIEW v_mis_solicitudes IS
  'Solicitudes de un docente con todo lo que la pantalla de seguimiento necesita:
   folio, laboratorio, fecha, horario, estatus, motivo de rechazo y fecha en que se
   marcó la inasistencia (HU-05).';
