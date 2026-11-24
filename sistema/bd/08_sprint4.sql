-- =====================================================================
-- Sprint 4 · Avisos, recordatorios y reportes de uso
-- Sistema de Préstamo de Laboratorios de Cómputo · FCA, UABC Mexicali
--
-- Entregables : E-08 Módulo de solicitud y seguimiento (avisos)
--               E-10 Reportes y estadísticas de uso
--               E-11 Módulo de notificaciones
--               E-17 Control de asistencia (recordatorios)
-- Historias   : HU-06, HU-13, HU-14, HU-15, HU-18, HU-22
-- Periodo     : 9 al 20 de noviembre de 2026
-- Responsable : Arnulfo Vásquez Romero
--
-- Los tres sprints anteriores construyeron el trámite y su medición.
-- Este cierra las dos puntas que faltaban: avisarle al docente sin que
-- tenga que entrar a revisar, y entregarle a la coordinación lo que el
-- sistema ya sabe pero todavía no sabía contar.
-- =====================================================================

SET search_path TO prestamo, extensions, public;

-- ---------------------------------------------------------------------
-- 1. La tabla de notificaciones crece  ·  HU-06, HU-18, T-01
-- ---------------------------------------------------------------------
-- El Sprint 1 la dejó con lo mínimo: a quién, de qué reservación y un
-- asunto. Para avisar de verdad hacen falta tres cosas más: el texto
-- completo, saber si ya se leyó y, sobre todo, cuándo debe aparecer,
-- porque un recordatorio se escribe hoy y se entrega mañana.

ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS cuerpo text;
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS creada_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS programada_para timestamptz NOT NULL DEFAULT now();
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS leida_en timestamptz;
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS accion varchar(20);

COMMENT ON COLUMN notificacion.cuerpo IS 'Texto completo del aviso. El asunto es el resumen que se lee en la bandeja.';
COMMENT ON COLUMN notificacion.programada_para IS 'Momento en que el aviso debe entregarse. Igual a la creación en los avisos inmediatos, posterior en los recordatorios.';
COMMENT ON COLUMN notificacion.leida_en IS 'Momento en que el docente abrió el aviso. Nulo mientras no lo haya visto.';
COMMENT ON COLUMN notificacion.accion IS 'Acción que el aviso ofrece. Hoy solo confirmar_cancelar, que usan los recordatorios de HU-18.';

ALTER TABLE notificacion DROP CONSTRAINT IF EXISTS notificacion_estatus_envio_valido;
ALTER TABLE notificacion ADD CONSTRAINT notificacion_estatus_envio_valido
    CHECK (estatus_envio IN ('pendiente', 'entregada'));

-- Un recordatorio por reservación y por momento. Es la red que evita que
-- el proceso programado mande el mismo aviso cada minuto durante una hora.
CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacion_recordatorio
    ON notificacion (reservacion_id, tipo)
    WHERE tipo LIKE 'recordatorio_%';

CREATE INDEX IF NOT EXISTS ix_notificacion_bandeja
    ON notificacion (usuario_id, programada_para DESC);

-- ---------------------------------------------------------------------
-- 2. Encolar un aviso  ·  T-02
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION encolar_aviso(
        p_usuario     integer,
        p_reservacion bigint,
        p_tipo        varchar,
        p_asunto      varchar,
        p_cuerpo      text,
        p_para        timestamptz DEFAULT NULL,
        p_accion      varchar     DEFAULT NULL)
RETURNS bigint AS $$
DECLARE
    v_para timestamptz := coalesce(p_para, now());
    v_id   bigint;
BEGIN
    INSERT INTO prestamo.notificacion
           (usuario_id, reservacion_id, tipo, asunto, cuerpo,
            programada_para, accion, estatus_envio, enviada_en)
    VALUES (p_usuario, p_reservacion, p_tipo, p_asunto, p_cuerpo,
            v_para, p_accion,
            CASE WHEN v_para <= now() THEN 'entregada' ELSE 'pendiente' END,
            CASE WHEN v_para <= now() THEN now()       ELSE NULL        END)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;   -- nulo si el aviso ya existía
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION encolar_aviso(integer, bigint, varchar, varchar, text, timestamptz, varchar) IS
  'Da de alta un aviso. Si el momento de entrega ya pasó queda entregado de una
   vez; si es futuro queda pendiente y lo libera procesar_avisos(). El ON CONFLICT
   hace que repetir un recordatorio no sea un error, solo no haga nada.';

-- ---------------------------------------------------------------------
-- 3. Avisos automáticos al cambiar el estatus  ·  HU-06, T-03 y T-04
-- ---------------------------------------------------------------------
-- El docente no debería tener que entrar al sistema para enterarse. El
-- disparador cuelga del mismo cambio de estatus que ya alimenta el
-- historial, así que ningún camino puede saltárselo: ni la aprobación
-- desde el panel, ni la liberación automática del proceso programado.

CREATE OR REPLACE FUNCTION avisar_cambio_estatus() RETURNS trigger AS $$
DECLARE
    v_lab    varchar;
    v_cuando varchar;
BEGIN
    SELECT l.clave || ' · ' || l.nombre INTO v_lab
      FROM prestamo.laboratorio l WHERE l.id = NEW.laboratorio_id;

    v_cuando := to_char(NEW.fecha_uso, 'DD/MM/YYYY') || ' de ' ||
                to_char(NEW.hora_inicio, 'HH24:MI') || ' a ' ||
                to_char(NEW.hora_fin, 'HH24:MI');

    IF TG_OP = 'INSERT' THEN
        PERFORM prestamo.encolar_aviso(
            NEW.usuario_id, NEW.id, 'solicitud_registrada',
            'Recibimos tu solicitud ' || NEW.folio,
            'Tu solicitud del laboratorio ' || v_lab || ' para el ' || v_cuando ||
            ' quedó registrada con el folio ' || NEW.folio ||
            '. Te avisamos en cuanto el encargado de laboratorios la resuelva.');
        RETURN NEW;
    END IF;

    IF NEW.estatus_id IS NOT DISTINCT FROM OLD.estatus_id THEN
        RETURN NEW;
    END IF;

    IF NEW.estatus_id = 2 THEN
        PERFORM prestamo.encolar_aviso(
            NEW.usuario_id, NEW.id, 'aprobada',
            'Aprobada la reservación ' || NEW.folio,
            'El laboratorio ' || v_lab || ' quedó apartado a tu nombre el ' || v_cuando ||
            '. Recuerda registrar tu asistencia al llegar.');

    ELSIF NEW.estatus_id = 3 THEN
        PERFORM prestamo.encolar_aviso(
            NEW.usuario_id, NEW.id, 'rechazada',
            'No se autorizó la reservación ' || NEW.folio,
            'Tu solicitud del laboratorio ' || v_lab || ' para el ' || v_cuando ||
            ' no fue autorizada. Motivo: ' ||
            coalesce(NEW.motivo_rechazo, 'no se indicó.'));

    ELSIF NEW.estatus_id = 8 THEN
        PERFORM prestamo.encolar_aviso(
            NEW.usuario_id, NEW.id, 'liberada',
            'Se liberó la reservación ' || NEW.folio,
            'Nadie registró asistencia en el laboratorio ' || v_lab || ' el ' || v_cuando ||
            ', así que el horario se liberó y la falta quedó registrada.');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION avisar_cambio_estatus() IS
  'Encola el aviso que corresponde a cada cambio de estatus. Cuelga del mismo
   evento que el historial para que ninguna ruta de la aplicación pueda
   quedarse sin notificar (HU-06).';

DROP TRIGGER IF EXISTS tr_reservacion_aviso ON reservacion;
CREATE TRIGGER tr_reservacion_aviso
    AFTER INSERT OR UPDATE OF estatus_id ON reservacion
    FOR EACH ROW EXECUTE FUNCTION avisar_cambio_estatus();

-- ---------------------------------------------------------------------
-- 4. Recordatorios y entrega programada  ·  HU-18, T-05 a T-08
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION momentos_de_recordatorio()
RETURNS TABLE (horas integer) AS $$
    SELECT trim(t)::integer
      FROM regexp_split_to_table(
             (SELECT valor FROM prestamo.parametro WHERE clave = 'P-09'), ',') AS t
     WHERE trim(t) <> ''
     ORDER BY 1 DESC;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION momentos_de_recordatorio() IS
  'Lee P-09 y devuelve las horas de antelación de cada recordatorio, de la más
   lejana a la más cercana. Cambiar el parámetro cambia los envíos sin tocar código.';

DROP FUNCTION IF EXISTS procesar_avisos();
CREATE FUNCTION procesar_avisos()
RETURNS TABLE (ret_recordatorios integer, ret_entregados integer) AS $$
DECLARE
    v_nuevos      integer := 0;
    v_entregados  integer := 0;
    v_momento     integer;
    v_creado      bigint;
    v_res         record;
BEGIN
    -- 4.1 Un recordatorio por cada momento de P-09 que ya esté a tiro.
    FOR v_momento IN SELECT horas FROM prestamo.momentos_de_recordatorio() LOOP
        FOR v_res IN
            SELECT r.id, r.folio, r.usuario_id, r.fecha_uso, r.hora_inicio, r.hora_fin,
                   l.clave || ' · ' || l.nombre AS laboratorio,
                   (r.fecha_uso + r.hora_inicio)
                       AT TIME ZONE current_setting('TimeZone') AS inicio
              FROM prestamo.reservacion r
              JOIN prestamo.laboratorio l ON l.id = r.laboratorio_id
             WHERE r.estatus_id IN (2, 4)
               AND (r.fecha_uso + r.hora_inicio)
                       AT TIME ZONE current_setting('TimeZone') > now()
               AND (r.fecha_uso + r.hora_inicio)
                       AT TIME ZONE current_setting('TimeZone')
                   <= now() + (v_momento || ' hours')::interval
        LOOP
            v_creado := prestamo.encolar_aviso(
                v_res.usuario_id, v_res.id,
                'recordatorio_' || v_momento || 'h',
                'Tu reservación ' || v_res.folio || ' es ' ||
                CASE WHEN v_momento >= 24 THEN 'mañana' ELSE 'en menos de ' || v_momento || ' h' END,
                'Tienes apartado el laboratorio ' || v_res.laboratorio || ' el ' ||
                to_char(v_res.fecha_uso, 'DD/MM/YYYY') || ' de ' ||
                to_char(v_res.hora_inicio, 'HH24:MI') || ' a ' ||
                to_char(v_res.hora_fin, 'HH24:MI') ||
                '. Confírmala para conservar el horario o cancélala si ya no la vas a usar.',
                now(), 'confirmar_cancelar');
            IF v_creado IS NOT NULL THEN
                v_nuevos := v_nuevos + 1;
            END IF;
        END LOOP;
    END LOOP;

    -- 4.2 Los avisos con fecha futura que ya les llegó su hora.
    WITH liberados AS (
        UPDATE prestamo.notificacion
           SET estatus_envio = 'entregada', enviada_en = now()
         WHERE estatus_envio = 'pendiente' AND programada_para <= now()
        RETURNING 1)
    SELECT count(*) INTO v_entregados FROM liberados;

    RETURN QUERY SELECT v_nuevos, v_entregados;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION procesar_avisos() IS
  'Proceso programado del Sprint 4. Genera los recordatorios de HU-18 y entrega
   los avisos que estaban esperando su hora. Es idempotente: llamarlo cada
   minuto no duplica nada, porque el índice único lo impide.';

CREATE OR REPLACE FUNCTION confirmar_reservacion(p_reservacion bigint, p_usuario integer)
RETURNS void AS $$
DECLARE
    v_res    prestamo.reservacion%ROWTYPE;
    v_inicio timestamptz;
BEGIN
    SELECT * INTO v_res FROM prestamo.reservacion WHERE id = p_reservacion;
    IF NOT FOUND OR v_res.usuario_id <> p_usuario THEN
        RAISE EXCEPTION 'La reservación no existe o no es tuya.' USING ERRCODE = 'check_violation';
    END IF;

    IF v_res.estatus_id = 4 THEN
        RETURN;   -- ya estaba confirmada; confirmar dos veces no es un error
    END IF;

    IF v_res.estatus_id <> 2 THEN
        RAISE EXCEPTION 'Solo puedes confirmar una reservación aprobada.'
            USING ERRCODE = 'check_violation';
    END IF;

    v_inicio := (v_res.fecha_uso + v_res.hora_inicio) AT TIME ZONE current_setting('TimeZone');
    IF v_inicio <= now() THEN
        RAISE EXCEPTION 'El horario de esta reservación ya empezó. Registra tu asistencia en el laboratorio.'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE prestamo.reservacion
       SET estatus_id = 4, confirmada_en = now()
     WHERE id = p_reservacion;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION confirmar_reservacion(bigint, integer) IS
  'Pasa una reservación aprobada a Confirmada desde el recordatorio. Conserva el
   horario y no altera el mecanismo de check-in: confirmar no sustituye asistir.';

CREATE OR REPLACE VIEW v_mis_avisos AS
SELECT n.id,
       n.usuario_id,
       n.reservacion_id,
       r.folio,
       n.tipo,
       n.asunto,
       n.cuerpo,
       n.accion,
       n.programada_para,
       n.leida_en IS NOT NULL AS leida,
       r.estatus_id           AS reservacion_estatus
  FROM prestamo.notificacion n
  LEFT JOIN prestamo.reservacion r ON r.id = n.reservacion_id
 WHERE n.estatus_envio = 'entregada'
 ORDER BY n.programada_para DESC, n.id DESC;
COMMENT ON VIEW v_mis_avisos IS
  'Bandeja de avisos de un docente. Solo muestra lo ya entregado: un recordatorio
   programado para mañana no se asoma hoy.';

-- ---------------------------------------------------------------------
-- 5. Reportes de uso  ·  HU-13, HU-14, HU-22, T-09 a T-16
-- ---------------------------------------------------------------------
-- Las cuatro funciones comparten el mismo filtro: un rango de fechas y,
-- opcionalmente, un laboratorio. Se cuenta sobre fecha_uso y no sobre la
-- fecha de solicitud, porque a la coordinación le interesa cuándo se
-- ocupó el laboratorio, no cuándo se tramitó el papel.

CREATE OR REPLACE FUNCTION reporte_demanda_laboratorio(
        p_desde date, p_hasta date, p_laboratorio integer DEFAULT NULL)
RETURNS TABLE (
    laboratorio_id  integer,
    clave           varchar,
    nombre          varchar,
    solicitudes     bigint,
    aprobadas       bigint,
    cumplidas       bigint,
    no_asistio      bigint,
    horas_usadas    numeric,
    horas_perdidas  numeric) AS $$
    SELECT l.id, l.clave, l.nombre,
           count(r.id),
           count(*) FILTER (WHERE r.estatus_id IN (2, 4, 5, 6, 8)),
           count(*) FILTER (WHERE r.estatus_id = 6),
           count(*) FILTER (WHERE r.estatus_id = 8),
           coalesce(sum(EXTRACT(epoch FROM r.hora_fin - r.hora_inicio) / 3600.0)
                    FILTER (WHERE r.estatus_id = 6), 0)::numeric(8,1),
           coalesce(sum(EXTRACT(epoch FROM r.hora_fin - r.hora_inicio) / 3600.0)
                    FILTER (WHERE r.estatus_id = 8), 0)::numeric(8,1)
      FROM prestamo.laboratorio l
      LEFT JOIN prestamo.reservacion r
             ON r.laboratorio_id = l.id
            AND r.fecha_uso BETWEEN p_desde AND p_hasta
     WHERE p_laboratorio IS NULL OR l.id = p_laboratorio
     GROUP BY l.id, l.clave, l.nombre
     ORDER BY count(r.id) DESC, l.clave;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION reporte_demanda_laboratorio(date, date, integer) IS
  'Demanda por laboratorio, del más solicitado al menos (HU-14). Incluye los
   laboratorios sin movimiento, porque un cero también es información para
   decidir dónde invertir.';

CREATE OR REPLACE FUNCTION reporte_demanda_horario(
        p_desde date, p_hasta date, p_laboratorio integer DEFAULT NULL)
RETURNS TABLE (
    hora_inicio  time,
    hora_fin     time,
    bloque       text,
    solicitudes  bigint,
    cumplidas    bigint) AS $$
    SELECT h.hora_inicio, h.hora_fin,
           to_char(h.hora_inicio, 'HH24:MI') || '–' || to_char(h.hora_fin, 'HH24:MI'),
           count(r.id),
           count(*) FILTER (WHERE r.estatus_id = 6)
      FROM (SELECT DISTINCT hora_inicio, hora_fin FROM prestamo.horario_laboratorio) h
      LEFT JOIN prestamo.reservacion r
             ON r.hora_inicio = h.hora_inicio
            AND r.hora_fin    = h.hora_fin
            AND r.fecha_uso BETWEEN p_desde AND p_hasta
            AND (p_laboratorio IS NULL OR r.laboratorio_id = p_laboratorio)
     GROUP BY h.hora_inicio, h.hora_fin
     ORDER BY h.hora_inicio;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION reporte_demanda_horario(date, date, integer) IS
  'Ocupación por franja horaria (HU-14). Se ordena por hora y no por demanda
   para que la gráfica se lea como el día transcurre.';

CREATE OR REPLACE FUNCTION reporte_solicitudes_periodo(
        p_desde date, p_hasta date, p_laboratorio integer DEFAULT NULL)
RETURNS TABLE (
    dia          date,
    solicitudes  bigint,
    cumplidas    bigint,
    no_asistio   bigint) AS $$
    SELECT d::date,
           count(r.id),
           count(*) FILTER (WHERE r.estatus_id = 6),
           count(*) FILTER (WHERE r.estatus_id = 8)
      FROM generate_series(p_desde, p_hasta, interval '1 day') AS d
      LEFT JOIN prestamo.reservacion r
             ON r.fecha_uso = d::date
            AND (p_laboratorio IS NULL OR r.laboratorio_id = p_laboratorio)
     GROUP BY d
     ORDER BY d;
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION reporte_solicitudes_periodo(date, date, integer) IS
  'Serie diaria de solicitudes para la gráfica de evolución (HU-13). Los días sin
   movimiento aparecen en cero para que la línea no mienta saltándoselos.';

CREATE OR REPLACE FUNCTION indicadores_uso(
        p_desde date, p_hasta date, p_laboratorio integer DEFAULT NULL)
RETURNS TABLE (
    total             bigint,
    aprobadas         bigint,
    cumplidas         bigint,
    no_asistio        bigint,
    canceladas        bigint,
    rechazadas        bigint,
    tasa_asistencia   numeric,
    horas_perdidas    numeric,
    lab_mas_solicitado text,
    horario_mas_demandado text) AS $$
DECLARE
    v_aprobadas bigint;
BEGIN
    SELECT count(*),
           count(*) FILTER (WHERE r.estatus_id IN (2, 4, 5, 6, 8)),
           count(*) FILTER (WHERE r.estatus_id = 6),
           count(*) FILTER (WHERE r.estatus_id = 8),
           count(*) FILTER (WHERE r.estatus_id = 7),
           count(*) FILTER (WHERE r.estatus_id = 3),
           coalesce(sum(EXTRACT(epoch FROM r.hora_fin - r.hora_inicio) / 3600.0)
                    FILTER (WHERE r.estatus_id = 8), 0)::numeric(8,1)
      INTO total, aprobadas, cumplidas, no_asistio, canceladas, rechazadas, horas_perdidas
      FROM prestamo.reservacion r
     WHERE r.fecha_uso BETWEEN p_desde AND p_hasta
       AND (p_laboratorio IS NULL OR r.laboratorio_id = p_laboratorio);

    -- La tasa se mide sobre lo que llegó a ocupar el horario: una solicitud
    -- rechazada o cancelada a tiempo nunca apartó el laboratorio, así que
    -- incluirla castigaría al docente que sí avisó.
    v_aprobadas := cumplidas + no_asistio;
    tasa_asistencia := CASE WHEN v_aprobadas = 0 THEN NULL
                            ELSE round(100.0 * cumplidas / v_aprobadas, 1) END;

    SELECT d.clave || ' · ' || d.nombre INTO lab_mas_solicitado
      FROM prestamo.reporte_demanda_laboratorio(p_desde, p_hasta, p_laboratorio) d
     WHERE d.solicitudes > 0
     ORDER BY d.solicitudes DESC, d.clave LIMIT 1;

    SELECT h.bloque INTO horario_mas_demandado
      FROM prestamo.reporte_demanda_horario(p_desde, p_hasta, p_laboratorio) h
     WHERE h.solicitudes > 0
     ORDER BY h.solicitudes DESC, h.hora_inicio LIMIT 1;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION indicadores_uso(date, date, integer) IS
  'Tarjetas del dashboard (HU-13 y HU-22). La tasa de asistencia se calcula sobre
   las reservaciones que llegaron a ocupar el horario, no sobre todas las
   solicitudes, para no castigar a quien canceló a tiempo. Devuelve tasa nula
   cuando no hay nada que medir, y así el portal distingue "0 %" de "sin datos".';
