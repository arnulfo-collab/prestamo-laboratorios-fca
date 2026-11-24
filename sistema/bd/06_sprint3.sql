-- =====================================================================
-- Sprint 3 · Administración, asistencia y validaciones
-- Sistema de Préstamo de Laboratorios de Cómputo · FCA, UABC Mexicali
--
-- Entregables : E-09 Panel de administración
--               E-17 Control de asistencia y reglas configurables
-- Tareas      : T-01 a T-22 del Sprint 3
-- Periodo     : 26 de octubre al 6 de noviembre de 2026
-- Responsable : Arnulfo Vásquez Romero
--
-- Aquí está el corazón del proyecto. Lo anterior digitaliza el trámite;
-- esto mide el desperdicio: quién usó el laboratorio que apartó, qué
-- horas se perdieron y qué hacer con quien reincide.
-- =====================================================================

SET search_path TO prestamo, extensions, public;

-- ---------------------------------------------------------------------
-- 1. Rangos válidos y bitácora de los parámetros  ·  HU-21, T-22
-- ---------------------------------------------------------------------

ALTER TABLE parametro ADD COLUMN IF NOT EXISTS minimo integer;
ALTER TABLE parametro ADD COLUMN IF NOT EXISTS maximo integer;

COMMENT ON COLUMN parametro.minimo IS 'Valor mínimo admisible. Nulo en los parámetros que no son numéricos.';
COMMENT ON COLUMN parametro.maximo IS 'Valor máximo admisible. Nulo en los parámetros que no son numéricos.';

UPDATE parametro SET minimo = v.minimo, maximo = v.maximo
FROM (VALUES
    ('P-01',  0, 120),   -- minutos de tolerancia
    ('P-02',  1, 365),   -- días del periodo de conteo
    ('P-03',  1,  20),   -- faltas para autorización manual
    ('P-04',  1,  20),   -- faltas para suspensión
    ('P-05',  1, 180),   -- días de suspensión
    ('P-06',  1,  20),   -- reservaciones activas
    ('P-07',  1, 365),   -- días de anticipación
    ('P-08',  0,  72)    -- horas para cancelar sin falta
) AS v(clave, minimo, maximo)
WHERE parametro.clave = v.clave;

CREATE TABLE IF NOT EXISTS bitacora_parametro (
    id             bigserial    PRIMARY KEY,
    clave          varchar(6)   NOT NULL REFERENCES parametro(clave),
    valor_anterior varchar(40)  NOT NULL,
    valor_nuevo    varchar(40)  NOT NULL,
    usuario_id     integer      NOT NULL REFERENCES usuario(id),
    ocurrido_en    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE bitacora_parametro IS
  'Historial de cambios de las reglas de préstamo: quién cambió qué, cuándo y cuál
   era el valor anterior. Es el cuarto criterio de aceptación de HU-21.';

CREATE OR REPLACE FUNCTION actualizar_parametro(p_clave varchar, p_valor varchar,
                                                p_usuario integer)
RETURNS void AS $$
DECLARE
    v_param prestamo.parametro%ROWTYPE;
    v_num   integer;
BEGIN
    SELECT * INTO v_param FROM prestamo.parametro WHERE clave = p_clave;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El parámetro % no existe.', p_clave USING ERRCODE = 'check_violation';
    END IF;

    IF v_param.tipo_dato = 'entero' THEN
        BEGIN
            v_num := p_valor::integer;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'El valor de % debe ser un número entero.', p_clave
                USING ERRCODE = 'check_violation';
        END;
        IF v_num < v_param.minimo OR v_num > v_param.maximo THEN
            RAISE EXCEPTION 'El valor de % debe estar entre % y % %.',
                p_clave, v_param.minimo, v_param.maximo, coalesce(v_param.unidad, '')
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF v_param.tipo_dato = 'lista' THEN
        IF p_valor !~ '^[0-9]+(,[0-9]+)*$' THEN
            RAISE EXCEPTION 'El valor de % debe ser una lista de números separados por comas.', p_clave
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF v_param.valor = p_valor THEN
        RETURN;   -- nada que registrar
    END IF;

    INSERT INTO prestamo.bitacora_parametro (clave, valor_anterior, valor_nuevo, usuario_id)
    VALUES (p_clave, v_param.valor, p_valor, p_usuario);

    UPDATE prestamo.parametro
       SET valor = p_valor, actualizado_en = now(), actualizado_por = p_usuario
     WHERE clave = p_clave;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION actualizar_parametro(varchar, varchar, integer) IS
  'Cambia una regla de préstamo. Valida el rango permitido y deja constancia del
   cambio. Las validaciones que leen el parámetro usan el valor nuevo desde el
   instante en que se guarda, sin reiniciar nada (HU-21).';

-- ---------------------------------------------------------------------
-- 2. Cancelación por el docente  ·  HU-07, T-05 y T-06
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancelar_solicitud(p_reservacion bigint, p_usuario integer)
RETURNS void AS $$
DECLARE
    v_res     prestamo.reservacion%ROWTYPE;
    v_horas   integer := prestamo.parametro_entero('P-08');
    v_inicio  timestamptz;
    v_admin   integer;
BEGIN
    SELECT * INTO v_res FROM prestamo.reservacion WHERE id = p_reservacion;
    IF NOT FOUND OR v_res.usuario_id <> p_usuario THEN
        RAISE EXCEPTION 'La reservación no existe o no es tuya.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_res.estatus_id NOT IN (1, 2, 4) THEN
        RAISE EXCEPTION 'Solo puedes cancelar una solicitud que siga en espera, aprobada o confirmada.'
            USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := (v_res.fecha_uso + v_res.hora_inicio) AT TIME ZONE current_setting('TimeZone');

    -- El plazo solo aplica a lo que ya está autorizado: una solicitud que aún
    -- nadie aprobó puede retirarse en cualquier momento.
    IF v_res.estatus_id IN (2, 4) AND v_inicio - now() < (v_horas || ' hours')::interval THEN
        RAISE EXCEPTION 'Faltan menos de % horas para tu reservación. Contacta al encargado de laboratorios para cancelarla.',
            v_horas USING ERRCODE = 'check_violation';
    END IF;

    UPDATE prestamo.reservacion
       SET estatus_id = 7, cancelada_en = now()
     WHERE id = p_reservacion;

    -- Aviso al encargado de laboratorios (tercer criterio de HU-07).
    SELECT id INTO v_admin FROM prestamo.usuario WHERE rol_id = 2 AND activo ORDER BY id LIMIT 1;
    IF v_admin IS NOT NULL THEN
        INSERT INTO prestamo.notificacion (usuario_id, reservacion_id, tipo, asunto)
        VALUES (v_admin, p_reservacion, 'cancelacion',
                'El docente canceló la reservación ' || v_res.folio ||
                '. El horario volvió a quedar disponible.');
    END IF;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION cancelar_solicitud(bigint, integer) IS
  'Cancela una reservación propia dentro del plazo P-08. El estatus Cancelada no
   ocupa el horario ni cuenta como falta, de modo que cancelar a tiempo libera el
   laboratorio sin penalizar al docente, que es lo que el proyecto quiere premiar.';

-- ---------------------------------------------------------------------
-- 3. Registro de asistencia  ·  HU-16, T-12 a T-14
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_checkin(p_reservacion bigint, p_usuario integer)
RETURNS integer AS $$
DECLARE
    v_res        prestamo.reservacion%ROWTYPE;
    v_tolerancia integer := prestamo.parametro_entero('P-01');
    v_inicio     timestamptz;
    v_retraso    integer;
    v_rol        smallint;
BEGIN
    SELECT * INTO v_res FROM prestamo.reservacion WHERE id = p_reservacion;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reservación no existe.' USING ERRCODE = 'check_violation';
    END IF;

    -- Puede registrarlo el docente titular o el laboratorista.
    SELECT rol_id INTO v_rol FROM prestamo.usuario WHERE id = p_usuario;
    IF v_res.usuario_id <> p_usuario AND v_rol <> 2 THEN
        RAISE EXCEPTION 'Solo el docente titular o el encargado de laboratorios pueden registrar el check-in.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_res.estatus_id = 8 THEN
        RAISE EXCEPTION 'La reservación ya fue liberada por inasistencia y el laboratorio quedó disponible para otros docentes.'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_res.estatus_id = 5 THEN
        RAISE EXCEPTION 'El check-in de esta reservación ya estaba registrado.'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_res.estatus_id NOT IN (2, 4) THEN
        RAISE EXCEPTION 'Solo se registra el check-in de una reservación aprobada o confirmada.'
            USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := (v_res.fecha_uso + v_res.hora_inicio) AT TIME ZONE current_setting('TimeZone');
    v_retraso := floor(EXTRACT(epoch FROM (now() - v_inicio)) / 60);

    IF v_retraso < 0 THEN
        RAISE EXCEPTION 'Aún no empieza tu horario. Puedes registrar el check-in a partir de las % y hasta % minutos después.',
            to_char(v_res.hora_inicio, 'HH24:MI'), v_tolerancia
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_retraso > v_tolerancia THEN
        RAISE EXCEPTION 'Venció la tolerancia de % minutos. El laboratorio ya fue liberado.',
            v_tolerancia USING ERRCODE = 'check_violation';
    END IF;

    UPDATE prestamo.reservacion SET estatus_id = 5 WHERE id = p_reservacion;

    INSERT INTO prestamo.asistencia (reservacion_id, registrada_por, minutos_retraso)
    VALUES (p_reservacion, p_usuario, v_retraso);

    RETURN v_retraso;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION registrar_checkin(bigint, integer) IS
  'Registra el check-in dentro de la ventana que va de la hora de inicio hasta
   P-01 minutos después, y deja constancia de quién lo registró y con cuántos
   minutos de retraso (HU-16).';

-- ---------------------------------------------------------------------
-- 4. Liberación automática por inasistencia  ·  HU-17, T-15 a T-17
-- ---------------------------------------------------------------------

-- Las columnas de salida llevan prefijo para no chocar con los nombres de las
-- columnas de las tablas que la consulta recorre.
DROP FUNCTION IF EXISTS liberar_inasistencias();
CREATE FUNCTION liberar_inasistencias()
RETURNS TABLE (ret_folio varchar, ret_laboratorio varchar, ret_docente varchar,
               ret_horas_perdidas numeric) AS $$
DECLARE
    v_tolerancia integer := prestamo.parametro_entero('P-01');
BEGIN
    RETURN QUERY
    WITH vencidas AS (
        SELECT r.id, r.usuario_id,
               EXTRACT(epoch FROM (r.hora_fin - r.hora_inicio)) / 3600 AS horas
        FROM prestamo.reservacion r
        WHERE r.estatus_id IN (2, 4)
          AND (r.fecha_uso + r.hora_inicio) AT TIME ZONE current_setting('TimeZone')
              + (v_tolerancia || ' minutes')::interval < now()
          AND NOT EXISTS (SELECT 1 FROM prestamo.asistencia a WHERE a.reservacion_id = r.id)
    ),
    liberadas AS (
        UPDATE prestamo.reservacion r
           SET estatus_id = 8
          FROM vencidas v
         WHERE r.id = v.id
        RETURNING r.id, r.folio, r.usuario_id, r.laboratorio_id, v.horas
    ),
    faltas AS (
        INSERT INTO prestamo.inasistencia (reservacion_id, usuario_id, horas_perdidas)
        SELECT l.id, l.usuario_id, l.horas FROM liberadas l
        RETURNING reservacion_id, horas_perdidas
    )
    SELECT l.folio, lab.clave, u.nombre, f.horas_perdidas
    FROM liberadas l
    JOIN faltas f                 ON f.reservacion_id = l.id
    JOIN prestamo.laboratorio lab ON lab.id = l.laboratorio_id
    JOIN prestamo.usuario u       ON u.id = l.usuario_id;
    RETURN;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION liberar_inasistencias() IS
  'Vence la tolerancia de las reservaciones sin check-in: las pasa a No asistió,
   con lo que el horario vuelve a mostrarse disponible, y contabiliza la falta con
   las horas-laboratorio perdidas. El servidor la ejecuta cada minuto. Una
   reservación con check-in registrado no se toca (HU-17).';

-- ---------------------------------------------------------------------
-- 5. Control de reincidentes  ·  HU-19, T-18 a T-20
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION inasistencias_vigentes(p_usuario integer) RETURNS integer AS $$
    SELECT count(*)::integer
    FROM prestamo.inasistencia i
    WHERE i.usuario_id = p_usuario
      AND i.contabiliza
      AND i.ocurrida_en >= now() - (prestamo.parametro_entero('P-02') || ' days')::interval;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION inasistencias_vigentes(integer) IS
  'Faltas de un docente dentro del periodo móvil P-02. Una cancelación a tiempo no
   genera inasistencia, de modo que nunca entra en este conteo (cuarto criterio de
   HU-19).';

CREATE OR REPLACE FUNCTION situacion_docente(p_usuario integer)
RETURNS TABLE (
    faltas            integer,
    umbral_aviso      integer,
    umbral_suspension integer,
    nivel             varchar,
    suspendido_hasta  date,
    mensaje           text
) AS $$
DECLARE
    v_faltas  integer := prestamo.inasistencias_vigentes(p_usuario);
    v_p03     integer := prestamo.parametro_entero('P-03');
    v_p04     integer := prestamo.parametro_entero('P-04');
    v_p05     integer := prestamo.parametro_entero('P-05');
    v_ultima  timestamptz;
    v_hasta   date;
BEGIN
    SELECT max(i.ocurrida_en) INTO v_ultima
      FROM prestamo.inasistencia i
     WHERE i.usuario_id = p_usuario AND i.contabiliza;

    v_hasta := (v_ultima + (v_p05 || ' days')::interval)::date;

    IF v_faltas >= v_p04 AND v_hasta >= current_date THEN
        RETURN QUERY SELECT v_faltas, v_p03, v_p04, 'suspension'::varchar, v_hasta,
            format('Tienes %s inasistencias en los últimos %s días. No puedes apartar laboratorios hasta el %s.',
                   v_faltas, prestamo.parametro_entero('P-02'), to_char(v_hasta, 'DD/MM/YYYY'))::text;
    ELSIF v_faltas >= v_p03 THEN
        RETURN QUERY SELECT v_faltas, v_p03, v_p04, 'autorizacion'::varchar, NULL::date,
            format('Tienes %s inasistencias en los últimos %s días. Tus nuevas solicitudes requieren autorización del encargado.',
                   v_faltas, prestamo.parametro_entero('P-02'))::text;
    ELSE
        RETURN QUERY SELECT v_faltas, v_p03, v_p04, 'ninguna'::varchar, NULL::date,
            CASE WHEN v_faltas = 0
                 THEN 'No tienes inasistencias registradas.'
                 ELSE format('Tienes %s inasistencia(s) en los últimos %s días. Al llegar a %s, tus solicitudes requerirán autorización.',
                             v_faltas, prestamo.parametro_entero('P-02'), v_p03) END::text;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION situacion_docente(integer) IS
  'Situación de un docente frente a las reglas de reincidencia: cuántas faltas
   tiene, qué restricción le aplica y hasta cuándo. La suspensión termina sola al
   pasar P-05 días desde la última falta (tercer criterio de HU-19).';

CREATE OR REPLACE VIEW v_historial_asistencia AS
SELECT r.usuario_id,
       u.nombre        AS docente,
       r.id            AS reservacion_id,
       r.folio,
       l.clave         AS laboratorio,
       r.fecha_uso,
       r.hora_inicio,
       r.hora_fin,
       e.nombre        AS estatus,
       e.clave         AS estatus_clave,
       a.registrada_en AS checkin_en,
       a.minutos_retraso,
       i.horas_perdidas,
       i.contabiliza   AS falta_contabilizada
FROM prestamo.reservacion r
JOIN prestamo.usuario u              ON u.id = r.usuario_id
JOIN prestamo.laboratorio l          ON l.id = r.laboratorio_id
JOIN prestamo.estatus_reservacion e  ON e.id = r.estatus_id
LEFT JOIN prestamo.asistencia a      ON a.reservacion_id = r.id
LEFT JOIN prestamo.inasistencia i    ON i.reservacion_id = r.id
ORDER BY r.fecha_uso DESC, r.hora_inicio;
COMMENT ON VIEW v_historial_asistencia IS
  'Historial de asistencias e inasistencias por docente, para la consulta del
   encargado (quinto criterio de HU-19).';

-- ---------------------------------------------------------------------
-- 6. Las restricciones se aplican al registrar  ·  HU-19, T-19
-- ---------------------------------------------------------------------

ALTER TABLE reservacion ADD COLUMN IF NOT EXISTS requiere_autorizacion boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN reservacion.requiere_autorizacion IS
  'Verdadero cuando el solicitante había alcanzado el umbral P-03 al registrarla.
   El panel del encargado lo advierte antes de aprobar (cuarto criterio de HU-08).';

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
    v_situacion record;
BEGIN
    IF p_grupo_materia IS NULL OR btrim(p_grupo_materia) = '' THEN
        RAISE EXCEPTION 'Indica el grupo o la materia para la que usarás el laboratorio.'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_motivo_uso IS NULL OR btrim(p_motivo_uso) = '' THEN
        RAISE EXCEPTION 'Indica el motivo de uso del laboratorio.'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_fecha < current_date THEN
        RAISE EXCEPTION 'La fecha % ya pasó. Elige una fecha a partir de hoy.',
            to_char(p_fecha, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;

    IF p_fecha > current_date + v_max_dias THEN
        RAISE EXCEPTION 'Solo puedes apartar con % días de anticipación. La fecha máxima permitida es el %.',
            v_max_dias, to_char(current_date + v_max_dias, 'DD/MM/YYYY')
            USING ERRCODE = 'check_violation';
    END IF;

    -- Restricción por reincidencia (HU-19). Se evalúa antes que el resto de
    -- las reglas de cupo, porque es la que puede impedir apartar del todo.
    SELECT * INTO v_situacion FROM prestamo.situacion_docente(p_usuario);
    IF v_situacion.nivel = 'suspension' THEN
        RAISE EXCEPTION '%', v_situacion.mensaje USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_lab FROM prestamo.laboratorio WHERE id = p_laboratorio;
    IF NOT FOUND OR NOT v_lab.activo THEN
        RAISE EXCEPTION 'El laboratorio seleccionado no está disponible para préstamo.'
            USING ERRCODE = 'check_violation';
    END IF;

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

    IF EXISTS (
        SELECT 1 FROM prestamo.bloqueo_laboratorio b
        WHERE b.laboratorio_id = p_laboratorio
          AND p_fecha BETWEEN b.fecha_inicio AND b.fecha_fin
    ) THEN
        RAISE EXCEPTION 'El laboratorio está bloqueado en esa fecha y no admite reservaciones.'
            USING ERRCODE = 'check_violation';
    END IF;

    v_activas := prestamo.reservaciones_activas(p_usuario);
    IF v_activas >= v_max_act THEN
        RAISE EXCEPTION 'Ya tienes % reservaciones activas y el límite vigente es de %. Cancela una para registrar otra.',
            v_activas, v_max_act USING ERRCODE = 'check_violation';
    END IF;

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
                                      hora_inicio, hora_fin, grupo_materia, motivo_uso,
                                      estatus_id, requiere_autorizacion)
    VALUES (v_folio, p_usuario, p_laboratorio, p_fecha,
            p_hora_inicio, p_hora_fin, btrim(p_grupo_materia), btrim(p_motivo_uso), 1,
            v_situacion.nivel = 'autorizacion');

    RETURN v_folio;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 7. Bloqueo por mantenimiento  ·  HU-10, T-07 y T-08
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_bloqueo(p_laboratorio integer, p_motivo varchar,
                                             p_inicio date, p_fin date, p_usuario integer)
RETURNS bigint AS $$
DECLARE
    v_id        bigint;
    v_afectadas integer;
BEGIN
    IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'Captura el motivo del bloqueo.' USING ERRCODE = 'check_violation';
    END IF;
    IF p_fin < p_inicio THEN
        RAISE EXCEPTION 'La fecha final no puede ser anterior a la inicial.'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO prestamo.bloqueo_laboratorio (laboratorio_id, motivo, fecha_inicio, fecha_fin, registrado_por)
    VALUES (p_laboratorio, btrim(p_motivo), p_inicio, p_fin, p_usuario)
    RETURNING id INTO v_id;

    -- Las reservaciones ya aprobadas dentro del bloqueo se cancelan y se avisa
    -- a sus docentes: el espacio no estará disponible y no es su falta.
    WITH afectadas AS (
        UPDATE prestamo.reservacion r
           SET estatus_id = 7, cancelada_en = now()
          FROM prestamo.estatus_reservacion e
         WHERE e.id = r.estatus_id
           AND r.laboratorio_id = p_laboratorio
           AND r.fecha_uso BETWEEN p_inicio AND p_fin
           AND r.estatus_id IN (1, 2, 4)
        RETURNING r.id, r.usuario_id, r.folio
    )
    INSERT INTO prestamo.notificacion (usuario_id, reservacion_id, tipo, asunto)
    SELECT a.usuario_id, a.id, 'bloqueo',
           'Tu reservación ' || a.folio || ' se canceló porque el laboratorio quedó bloqueado por mantenimiento. No cuenta como inasistencia.'
    FROM afectadas a;

    GET DIAGNOSTICS v_afectadas = ROW_COUNT;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION registrar_bloqueo(integer, varchar, date, date, integer) IS
  'Bloquea un laboratorio por mantenimiento o evento. Las reservaciones vigentes
   dentro del rango se cancelan y sus docentes reciben el aviso; como quedan en
   estatus Cancelada, no se les contabiliza falta.';

-- ---------------------------------------------------------------------
-- 8. Calendario general  ·  HU-11, T-09 a T-11
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION calendario_general(p_desde date, p_hasta date,
                                              p_laboratorio integer DEFAULT NULL)
RETURNS TABLE (
    id              bigint,
    folio           varchar,
    laboratorio_id  integer,
    laboratorio     varchar,
    laboratorio_nombre varchar,
    fecha_uso       date,
    hora_inicio     time,
    hora_fin        time,
    docente         varchar,
    grupo_materia   varchar,
    motivo_uso      varchar,
    estatus         varchar,
    estatus_clave   varchar,
    asistencia      varchar,
    minutos_retraso smallint
) AS $$
    SELECT r.id, r.folio, l.id, l.clave, l.nombre, r.fecha_uso, r.hora_inicio, r.hora_fin,
           u.nombre, r.grupo_materia, r.motivo_uso, e.nombre, e.clave,
           CASE
             WHEN a.id IS NOT NULL THEN 'Asistió'
             WHEN e.clave = 'no_asistio' THEN 'No asistió'
             WHEN e.clave = 'cancelada' THEN 'Cancelada'
             ELSE 'Pendiente'
           END::varchar,
           a.minutos_retraso
    FROM prestamo.reservacion r
    JOIN prestamo.laboratorio l         ON l.id = r.laboratorio_id
    JOIN prestamo.usuario u             ON u.id = r.usuario_id
    JOIN prestamo.estatus_reservacion e ON e.id = r.estatus_id
    LEFT JOIN prestamo.asistencia a     ON a.reservacion_id = r.id
    WHERE r.fecha_uso BETWEEN p_desde AND p_hasta
      AND (p_laboratorio IS NULL OR r.laboratorio_id = p_laboratorio)
      AND e.clave <> 'rechazada'
    ORDER BY r.fecha_uso, l.clave, r.hora_inicio;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION calendario_general(date, date, integer) IS
  'Todas las reservaciones de un rango de fechas, con su estado de asistencia y
   filtro opcional por laboratorio. Es la vista única del uso de los espacios
   que pide HU-11.';
