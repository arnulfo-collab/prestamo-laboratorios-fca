-- =====================================================================
-- 11 · Programación de los procesos periódicos con pg_cron
--
-- Sistema de préstamo de laboratorios de cómputo
-- Facultad de Ciencias Administrativas · UABC Mexicali
--
-- Hasta el Sprint 4 los dos procesos de 60 segundos vivían en el servidor,
-- en dos setInterval. Eso los ataba a que el proceso de Node estuviera
-- encendido: si el servidor dormía o se reiniciaba, los laboratorios no se
-- liberaban y los recordatorios no salían.
--
-- Aquí se mueven al planificador del propio motor. Tres consecuencias:
--
--   1. Corren aunque nadie haya abierto el portal en días.
--   2. Quedan registrados: cron.job_run_details guarda cada ejecución con su
--      duración y su error, que es mejor evidencia que un console.log.
--   3. Ese tráfico cada minuto es lo que impide que el plan gratuito de
--      Supabase suspenda el proyecto por inactividad.
--
-- Se ejecuta UNA vez, contra la base de producción, desde el editor SQL del
-- panel de Supabase. No forma parte de 01..10: aquellos construyen el
-- sistema, este lo pone en operación.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensión
-- ---------------------------------------------------------------------
-- En Supabase ya está disponible; esto solo la habilita en el proyecto.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------
-- 2. Los dos trabajos
-- ---------------------------------------------------------------------
-- Se programan por separado, no juntos en un solo trabajo, por la misma
-- razón por la que eran dos setInterval distintos: si uno falla, el otro
-- debe seguir corriendo.

-- HU-17 · vence la tolerancia del check-in y libera lo que nadie usó.
SELECT cron.schedule(
  'prestamo-liberar-inasistencias',
  '* * * * *',
  $$SELECT prestamo.liberar_inasistencias()$$
);

-- HU-06 y HU-18 · genera los recordatorios que ya están a tiro y entrega los
-- avisos que esperaban su hora.
SELECT cron.schedule(
  'prestamo-procesar-avisos',
  '* * * * *',
  $$SELECT prestamo.procesar_avisos()$$
);

-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
-- Debe devolver exactamente dos renglones, los dos con activo = true.
SELECT jobid, jobname, schedule, active, command
  FROM cron.job
 WHERE jobname LIKE 'prestamo-%'
 ORDER BY jobname;

-- Espera dos minutos y corre esto: debe haber cuatro ejecuciones o más,
-- todas con status = 'succeeded'. Es la prueba de que quedó operando.
SELECT j.jobname,
       d.status,
       d.start_time,
       d.end_time - d.start_time AS duracion,
       d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname LIKE 'prestamo-%'
 ORDER BY d.start_time DESC
 LIMIT 20;

-- ---------------------------------------------------------------------
-- 4. Cómo deshacerlo
-- ---------------------------------------------------------------------
-- Si hiciera falta detenerlos, por mantenimiento o para volver a los
-- setInterval del servidor:
--
--   SELECT cron.unschedule('prestamo-liberar-inasistencias');
--   SELECT cron.unschedule('prestamo-procesar-avisos');
--
-- Para suspenderlos sin borrarlos:
--
--   UPDATE cron.job SET active = false WHERE jobname LIKE 'prestamo-%';
--
-- ADVERTENCIA: no dejes los dos setInterval del servidor corriendo junto con
-- estos trabajos. No corrompe nada —el índice único ux_notificacion_recordatorio
-- impide que un recordatorio se duplique— pero duplica el trabajo sin razón y
-- ensucia la bitácora.
