-- =====================================================================
-- Datos de demostración · opcional
-- Sistema de Préstamo de Laboratorios de Cómputo · FCA, UABC Mexicali
--
-- Este archivo NO forma parte del sistema. Siembra un semestre de
-- actividad ficticia para que los reportes del Sprint 4 tengan algo que
-- mostrar en la demostración. En producción no debe ejecutarse: el
-- primer bloque lo impide si detecta que ya hay reservaciones reales.
--
-- Se carga con los disparadores activos, de modo que el historial y los
-- avisos se generan por el mismo camino que seguiría el sistema en uso.
-- =====================================================================

SET search_path TO prestamo, extensions, public;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM prestamo.reservacion
                WHERE usuario_id NOT IN (SELECT id FROM prestamo.usuario
                                          WHERE correo LIKE 'demo.%')) THEN
        RAISE EXCEPTION 'Hay reservaciones que no son de demostración. '
                        'Este archivo no debe ejecutarse sobre datos reales.';
    END IF;
END $$;

-- Se limpia lo que haya dejado una corrida anterior.
DELETE FROM notificacion       WHERE usuario_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM historial_reservacion WHERE reservacion_id IN
       (SELECT id FROM reservacion WHERE usuario_id IN
              (SELECT id FROM usuario WHERE correo LIKE 'demo.%'));
DELETE FROM asistencia         WHERE reservacion_id IN
       (SELECT id FROM reservacion WHERE usuario_id IN
              (SELECT id FROM usuario WHERE correo LIKE 'demo.%'));
DELETE FROM inasistencia       WHERE reservacion_id IN
       (SELECT id FROM reservacion WHERE usuario_id IN
              (SELECT id FROM usuario WHERE correo LIKE 'demo.%'));
DELETE FROM reservacion        WHERE usuario_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM sesion             WHERE usuario_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%');
DELETE FROM usuario            WHERE correo LIKE 'demo.%';

-- ---------------------------------------------------------------------
-- 1. Ocho docentes de demostración
-- ---------------------------------------------------------------------

INSERT INTO usuario (numero_empleado, nombre, correo, contrasena_hash, rol_id, activo)
SELECT (90000 + n)::varchar,
       nombre,
       'demo.' || slug || '@uabc.edu.mx',
       crypt('Lab2026$fca', gen_salt('bf')),
       1, true
  FROM (VALUES
      (1, 'María Elena Cárdenas Ruiz',      'cardenas'),
      (2, 'Jorge Alberto Peña Lugo',        'pena'),
      (3, 'Silvia Guadalupe Mora Beltrán',  'mora'),
      (4, 'Ricardo Alfonso Téllez Ibarra',  'tellez'),
      (5, 'Ana Cristina Robles Fierro',     'robles'),
      (6, 'Héctor Manuel Saldívar Nava',    'saldivar'),
      (7, 'Patricia Jazmín Olvera Cruz',    'olvera'),
      (8, 'Fernando Javier Quiroz Medina',  'quiroz')
  ) AS v(n, nombre, slug);

-- ---------------------------------------------------------------------
-- 2. Un semestre de reservaciones
-- ---------------------------------------------------------------------
-- La distribución no es uniforme a propósito: LAB-01 y LAB-03 son los
-- más disputados y los bloques de media mañana concentran la demanda,
-- que es justo lo que los reportes deben hacer visible. El sorteo usa
-- el hash de la fecha y el laboratorio, así que la carga es siempre la
-- misma y la demostración es reproducible.

DO $$
DECLARE
    v_dia       date;
    v_lab       record;
    v_bloque    record;
    v_docentes  integer[];
    v_usuario   integer;
    v_semilla   double precision;
    v_estatus   smallint;
    v_folio     varchar;
    v_id        bigint;
    v_peso      double precision;
    v_sorteo    double precision;
    v_folio_semilla text;
    v_admin     integer;
BEGIN
    SELECT array_agg(id ORDER BY id) INTO v_docentes
      FROM usuario WHERE correo LIKE 'demo.%';
    SELECT id INTO v_admin FROM usuario WHERE rol_id = 2 AND activo ORDER BY id LIMIT 1;

    FOR v_dia IN
        SELECT d::date FROM generate_series(DATE '2026-09-01', DATE '2026-11-20', interval '1 day') d
         WHERE EXTRACT(isodow FROM d) BETWEEN 1 AND 5
    LOOP
        FOR v_lab IN SELECT id, clave FROM laboratorio WHERE activo ORDER BY id LOOP
            -- Los laboratorios 1 y 3 se piden más que los demás.
            v_peso := CASE WHEN v_lab.id IN (1, 3) THEN 0.62 ELSE 0.34 END;

            FOR v_bloque IN
                SELECT DISTINCT hora_inicio, hora_fin
                  FROM horario_laboratorio
                 WHERE laboratorio_id = v_lab.id
                 ORDER BY hora_inicio
            LOOP
                -- Media mañana es la franja disputada.
                v_semilla := (hashtext(v_dia::text || v_lab.id || v_bloque.hora_inicio::text)
                              % 1000)::double precision / 1000.0;
                v_semilla := abs(v_semilla);

                CONTINUE WHEN v_semilla > v_peso *
                    CASE WHEN v_bloque.hora_inicio BETWEEN '09:00' AND '13:00' THEN 1.0 ELSE 0.55 END;

                v_folio_semilla := v_dia::text || v_lab.id || v_bloque.hora_inicio::text;
                v_usuario := v_docentes[1 + (abs(hashtext(v_folio_semilla || 'u'))
                                             % array_length(v_docentes, 1))];

                -- El estatus se sortea con su propio hash. Reutilizar el de
                -- arriba sesgaría el reparto, porque solo llegan hasta aquí las
                -- combinaciones cuyo valor quedó por debajo del umbral.
                v_sorteo := abs((hashtext(v_folio_semilla || 'estatus') % 1000)::double precision) / 1000.0;

                IF v_dia < DATE '2026-11-17' THEN
                    v_estatus := CASE
                        WHEN v_sorteo < 0.040 THEN 3    -- Rechazada
                        WHEN v_sorteo < 0.110 THEN 7    -- Cancelada
                        WHEN v_sorteo < 0.235 THEN 8    -- No asistió
                        ELSE 6                           -- Cumplida
                    END;
                ELSE
                    v_estatus := CASE
                        WHEN v_sorteo < 0.150 THEN 1    -- Solicitada
                        WHEN v_sorteo < 0.450 THEN 4    -- Confirmada
                        ELSE 2                           -- Aprobada
                    END;
                END IF;

                v_folio := folio_siguiente();

                INSERT INTO reservacion
                       (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
                        grupo_materia, motivo_uso, estatus_id, solicitada_en,
                        resuelta_por, resuelta_en, motivo_rechazo, confirmada_en, cancelada_en)
                VALUES (v_folio, v_usuario, v_lab.id, v_dia,
                        v_bloque.hora_inicio, v_bloque.hora_fin,
                        CASE (abs(hashtext(v_folio)) % 6)
                            WHEN 0 THEN '2-A Informática Administrativa'
                            WHEN 1 THEN '3-B Sistemas de Información'
                            WHEN 2 THEN '1-C Contaduría'
                            WHEN 3 THEN '4-A Administración'
                            WHEN 4 THEN '5-B Negocios Internacionales'
                            ELSE '2-C Mercadotecnia' END,
                        CASE (abs(hashtext(v_folio || 'm')) % 5)
                            WHEN 0 THEN 'Práctica de hoja de cálculo'
                            WHEN 1 THEN 'Examen parcial en línea'
                            WHEN 2 THEN 'Taller de bases de datos'
                            WHEN 3 THEN 'Asesoría de proyecto integrador'
                            ELSE 'Clase con software especializado' END,
                        1::smallint,
                        (v_dia - 5) + time '10:00',
                        CASE WHEN v_estatus <> 1 THEN v_admin END,
                        CASE WHEN v_estatus <> 1 THEN (v_dia - 4) + time '09:30' END,
                        CASE WHEN v_estatus = 3 THEN 'El laboratorio tiene mantenimiento programado ese día.' END,
                        CASE WHEN v_estatus = 4 THEN (v_dia - 1) + time '18:00' END,
                        CASE WHEN v_estatus = 7 THEN (v_dia - 1) + time '12:00' END)
                RETURNING id INTO v_id;

                -- Toda reservación nace como Solicitada y avanza con un UPDATE
                -- por cada paso, igual que en la operación real. Importa: los
                -- disparadores de historial y de avisos cuelgan del cambio de
                -- estatus, así que insertarla ya resuelta dejaría al semestre
                -- sin historial y sin los avisos de aprobación y rechazo.
                IF v_estatus = 3 THEN
                    UPDATE reservacion SET estatus_id = 3 WHERE id = v_id;
                ELSIF v_estatus <> 1 THEN
                    UPDATE reservacion SET estatus_id = 2 WHERE id = v_id;
                    IF v_estatus <> 2 THEN
                        UPDATE reservacion SET estatus_id = v_estatus WHERE id = v_id;
                    END IF;
                    IF v_estatus = 6 THEN
                        INSERT INTO asistencia (reservacion_id, registrada_por, registrada_en, minutos_retraso)
                        VALUES (v_id, v_usuario, v_dia + v_bloque.hora_inicio + interval '6 minutes', 6);
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Las faltas quedan registradas
-- ---------------------------------------------------------------------
-- En operación real es liberar_inasistencias() quien escribe estas filas
-- al vencer la tolerancia. Aquí la reservación se marcó directamente, así
-- que la falta se asienta aparte; sin ella, el panel mostraría docentes
-- con reservaciones "No asistió" y cero faltas acumuladas.

INSERT INTO inasistencia (reservacion_id, usuario_id, ocurrida_en, horas_perdidas)
SELECT r.id, r.usuario_id,
       (r.fecha_uso + r.hora_inicio) AT TIME ZONE current_setting('TimeZone'),
       EXTRACT(epoch FROM r.hora_fin - r.hora_inicio) / 3600.0
  FROM reservacion r
 WHERE r.estatus_id = 8
   AND r.usuario_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%')
ON CONFLICT (reservacion_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Los avisos se fechan como habrían ocurrido
-- ---------------------------------------------------------------------
-- Los disparadores encolaron cada aviso con la fecha de hoy, porque la
-- carga corrió hoy. Dejarlo así haría que la bandeja mostrara medio
-- semestre llegando en el mismo minuto. Aquí se recorren a la fecha que
-- les habría tocado, y los de reservaciones ya pasadas se dan por leídos.

WITH fechas AS (
    SELECT n.id,
           r.fecha_uso,
           CASE n.tipo
               WHEN 'solicitud_registrada' THEN r.solicitada_en
               WHEN 'aprobada'             THEN r.resuelta_en
               WHEN 'rechazada'            THEN r.resuelta_en
               WHEN 'liberada'  THEN (r.fecha_uso + r.hora_inicio)
                                     AT TIME ZONE current_setting('TimeZone')
               ELSE r.solicitada_en
           END AS momento
      FROM notificacion n
      JOIN reservacion r ON r.id = n.reservacion_id
     WHERE r.usuario_id IN (SELECT id FROM usuario WHERE correo LIKE 'demo.%')
)
UPDATE notificacion n
   SET creada_en       = f.momento,
       programada_para = f.momento,
       enviada_en      = f.momento,
       leida_en        = CASE WHEN f.fecha_uso < current_date
                              THEN f.momento + interval '3 hours' END
  FROM fechas f
 WHERE f.id = n.id AND f.momento IS NOT NULL;

-- Los recordatorios de las reservaciones que todavía no ocurren.
SELECT * FROM procesar_avisos();

-- ---------------------------------------------------------------------
-- 5. Resumen de lo sembrado
-- ---------------------------------------------------------------------

SELECT e.nombre AS estatus, count(*) AS reservaciones
  FROM reservacion r JOIN estatus_reservacion e ON e.id = r.estatus_id
 GROUP BY e.id, e.nombre ORDER BY e.id;

SELECT tipo, count(*) AS avisos, count(*) FILTER (WHERE leida_en IS NOT NULL) AS leidos
  FROM notificacion GROUP BY tipo ORDER BY tipo;

SELECT count(*) AS faltas_registradas, round(sum(horas_perdidas), 1) AS horas_perdidas
  FROM inasistencia;
