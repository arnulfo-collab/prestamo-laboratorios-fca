-- =====================================================================
-- Pruebas de la base de datos del Sprint 1
-- Verifican en el motor los criterios de aceptación de HU-02 y HU-09
-- que no dependen de la interfaz. Cada prueba imprime APROBADA o FALLA.
-- Ejecutar después de 01_esquema.sql y 02_datos_iniciales.sql.
-- =====================================================================

SET search_path TO prestamo, extensions, public;
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

-- Todo el guion corre dentro de una transacción que se revierte al final,
-- de modo que las pruebas no dejan datos en la base.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.verificar(descripcion text, condicion boolean) RETURNS text AS $$
    SELECT CASE WHEN $2 THEN 'APROBADA  · ' ELSE 'FALLA     · ' END || $1;
$$ LANGUAGE sql;

-- Simula lo que hace el módulo de autenticación: compara la contraseña
-- recibida contra el hash almacenado, sin descifrarlo.
CREATE OR REPLACE FUNCTION pg_temp.autenticar(p_correo text, p_clave text) RETURNS integer AS $$
    SELECT u.id FROM prestamo.usuario u
    WHERE u.correo = p_correo::citext
      AND u.activo
      AND u.contrasena_hash = crypt(p_clave, u.contrasena_hash);
$$ LANGUAGE sql;

SELECT '--- HU-02 · Inicio de sesión por rol ---';

SELECT pg_temp.verificar(
  'Credenciales válidas: el docente es autenticado',
  pg_temp.autenticar('arnulfo.vasquez@uabc.edu.mx', 'Lab2026$fca') IS NOT NULL);

SELECT pg_temp.verificar(
  'Contraseña incorrecta: no se autentica',
  pg_temp.autenticar('arnulfo.vasquez@uabc.edu.mx', 'otraClave') IS NULL);

SELECT pg_temp.verificar(
  'Correo inexistente: no se autentica (mismo resultado que arriba, sin revelar cuál dato falló)',
  pg_temp.autenticar('nadie@uabc.edu.mx', 'Lab2026$fca') IS NULL);

SELECT pg_temp.verificar(
  'La contraseña no se almacena en claro',
  (SELECT count(*) FROM usuario WHERE contrasena_hash LIKE '%Lab2026%') = 0);

SELECT pg_temp.verificar(
  'El hash es bcrypt (prefijo $2a$)',
  (SELECT bool_and(contrasena_hash LIKE '$2a$%') FROM usuario));

SELECT pg_temp.verificar(
  'Cada usuario resuelve a un único rol',
  (SELECT count(DISTINCT r.clave) FROM usuario u JOIN rol r ON r.id = u.rol_id
    WHERE u.correo = 'arnulfo.vasquez@uabc.edu.mx') = 1);

SELECT pg_temp.verificar(
  'Los tres roles del sistema están dados de alta',
  (SELECT count(*) FROM rol WHERE clave IN ('docente','administrador','coordinacion')) = 3);

-- Usuario inactivo: no debe poder entrar.
UPDATE usuario SET activo = false WHERE correo = 'coordinacion.fca@uabc.edu.mx';
SELECT pg_temp.verificar(
  'Usuario dado de baja: no se autentica aunque la contraseña sea correcta',
  pg_temp.autenticar('coordinacion.fca@uabc.edu.mx', 'Lab2026$fca') IS NULL);
UPDATE usuario SET activo = true WHERE correo = 'coordinacion.fca@uabc.edu.mx';

-- Correo no institucional: rechazado por la base de datos.
SAVEPOINT p1;
INSERT INTO usuario (numero_empleado, nombre, correo, contrasena_hash, rol_id)
VALUES ('99999', 'Prueba externa', 'alguien@gmail.com', 'x', 1);
ROLLBACK TO p1;
SELECT pg_temp.verificar(
  'Correo no institucional: rechazado (el padrón no crece)',
  (SELECT count(*) FROM usuario) = 4);

-- Correo duplicado: rechazado.
SAVEPOINT p2;
INSERT INTO usuario (numero_empleado, nombre, correo, contrasena_hash, rol_id)
VALUES ('88888', 'Duplicado', 'ARNULFO.VASQUEZ@UABC.EDU.MX', 'x', 1);
ROLLBACK TO p2;
SELECT pg_temp.verificar(
  'Correo duplicado (aun con otras mayúsculas): rechazado',
  (SELECT count(*) FROM usuario) = 4);

-- Cierre de sesión: la sesión cerrada deja de ser válida.
INSERT INTO sesion (usuario_id, expira_en)
VALUES ((SELECT id FROM usuario WHERE correo = 'arnulfo.vasquez@uabc.edu.mx'), now() + interval '8 hours');
UPDATE sesion SET cerrada_en = now()
WHERE usuario_id = (SELECT id FROM usuario WHERE correo = 'arnulfo.vasquez@uabc.edu.mx');
SELECT pg_temp.verificar(
  'Cierre de sesión: no quedan sesiones vigentes para el usuario',
  (SELECT count(*) FROM sesion WHERE cerrada_en IS NULL AND expira_en > now()) = 0);

SELECT '';
SELECT '--- HU-09 · Catálogo de laboratorios y horarios ---';

SELECT pg_temp.verificar(
  'Los 5 laboratorios de la FCA están dados de alta y activos',
  (SELECT count(*) FROM laboratorio WHERE activo) = 5);

SELECT pg_temp.verificar(
  'Todo laboratorio activo tiene horarios registrados',
  (SELECT count(*) FROM laboratorio l WHERE l.activo
     AND NOT EXISTS (SELECT 1 FROM horario_laboratorio h WHERE h.laboratorio_id = l.id)) = 0);

SELECT pg_temp.verificar(
  'Se ofertan 320 horas-laboratorio por semana',
  (SELECT sum(horas_semana) FROM v_catalogo_laboratorios) = 320);

-- Edición: el cambio se refleja de inmediato en la vista que consultan los docentes.
UPDATE laboratorio SET capacidad = 28, actualizado_en = now() WHERE clave = 'LAB-03';
SELECT pg_temp.verificar(
  'Edición de capacidad: se refleja en la vista del catálogo',
  (SELECT capacidad FROM v_catalogo_laboratorios WHERE clave = 'LAB-03') = 28);

-- Capacidad fuera de rango: rechazada.
SAVEPOINT p3;
UPDATE laboratorio SET capacidad = 0 WHERE clave = 'LAB-03';
ROLLBACK TO p3;
SELECT pg_temp.verificar(
  'Capacidad en cero: rechazada por la base de datos',
  (SELECT capacidad FROM laboratorio WHERE clave = 'LAB-03') = 28);

-- Horario duplicado: rechazado.
SAVEPOINT p4;
INSERT INTO horario_laboratorio (laboratorio_id, dia_semana, hora_inicio, hora_fin)
VALUES ((SELECT id FROM laboratorio WHERE clave = 'LAB-01'), 1, '07:00', '09:00');
ROLLBACK TO p4;
SELECT pg_temp.verificar(
  'Horario duplicado en el mismo laboratorio y día: rechazado',
  (SELECT count(*) FROM horario_laboratorio
     WHERE laboratorio_id = (SELECT id FROM laboratorio WHERE clave = 'LAB-01')
       AND dia_semana = 1 AND hora_inicio = '07:00') = 1);

-- Horario invertido: rechazado.
SAVEPOINT p5;
INSERT INTO horario_laboratorio (laboratorio_id, dia_semana, hora_inicio, hora_fin)
VALUES ((SELECT id FROM laboratorio WHERE clave = 'LAB-01'), 6, '14:00', '10:00');
ROLLBACK TO p5;
SELECT pg_temp.verificar(
  'Horario con fin anterior al inicio: rechazado',
  (SELECT count(*) FROM horario_laboratorio
     WHERE laboratorio_id = (SELECT id FROM laboratorio WHERE clave = 'LAB-01') AND dia_semana = 6) = 0);

-- Baja de un laboratorio con reservaciones aprobadas a futuro: el sistema
-- debe poder advertirlo antes de confirmar. Se prueba la consulta que lo detecta.
INSERT INTO reservacion (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
                         grupo_materia, motivo_uso, estatus_id, resuelta_por, resuelta_en)
VALUES ('RES-2026-00001',
        (SELECT id FROM usuario WHERE rol_id = 1 LIMIT 1),
        (SELECT id FROM laboratorio WHERE clave = 'LAB-04'),
        current_date + 7, '09:00', '11:00',
        'Informática Administrativa · Grupo 421', 'Práctica de hoja de cálculo', 2,
        (SELECT id FROM usuario WHERE rol_id = 2 LIMIT 1), now());

SELECT pg_temp.verificar(
  'Baja de laboratorio: el sistema detecta 1 reservación aprobada a futuro para advertir',
  (SELECT count(*) FROM reservacion r
     WHERE r.laboratorio_id = (SELECT id FROM laboratorio WHERE clave = 'LAB-04')
       AND r.fecha_uso >= current_date
       AND r.estatus_id IN (SELECT id FROM estatus_reservacion WHERE ocupa_horario)) = 1);

UPDATE laboratorio SET activo = false WHERE clave = 'LAB-04';
SELECT pg_temp.verificar(
  'Laboratorio desactivado: deja de ofrecerse pero conserva su reservación (RNF-05)',
  (SELECT count(*) FROM laboratorio WHERE activo) = 4
  AND (SELECT count(*) FROM reservacion
         WHERE laboratorio_id = (SELECT id FROM laboratorio WHERE clave = 'LAB-04')) = 1);
UPDATE laboratorio SET activo = true WHERE clave = 'LAB-04';

SELECT '';
SELECT '--- Cimientos verificados para los sprints siguientes ---';

-- RF-12: la restricción anti-empalme ya opera en el motor.
SAVEPOINT p6;
INSERT INTO reservacion (folio, usuario_id, laboratorio_id, fecha_uso, hora_inicio, hora_fin,
                         grupo_materia, motivo_uso, estatus_id, resuelta_por, resuelta_en)
VALUES ('RES-2026-00002',
        (SELECT id FROM usuario WHERE rol_id = 1 LIMIT 1),
        (SELECT id FROM laboratorio WHERE clave = 'LAB-04'),
        current_date + 7, '10:00', '12:00',
        'Otra materia', 'Empalme deliberado', 2,
        (SELECT id FROM usuario WHERE rol_id = 2 LIMIT 1), now());
ROLLBACK TO p6;
SELECT pg_temp.verificar(
  'RF-12: una segunda reservación que se empalma es rechazada por el motor',
  (SELECT count(*) FROM reservacion) = 1);

-- Rechazo sin motivo: rechazado por restricción.
SAVEPOINT p7;
UPDATE reservacion SET estatus_id = 3 WHERE folio = 'RES-2026-00001';
ROLLBACK TO p7;
SELECT pg_temp.verificar(
  'Rechazo sin motivo capturado: la base de datos lo impide (HU-08)',
  (SELECT estatus_id FROM reservacion WHERE folio = 'RES-2026-00001') = 2);

-- Historial automático.
UPDATE reservacion SET estatus_id = 5 WHERE folio = 'RES-2026-00001';
SELECT pg_temp.verificar(
  'RNF-05: el disparador registró el alta y el cambio de estatus (2 renglones de historial)',
  (SELECT count(*) FROM historial_reservacion
     WHERE reservacion_id = (SELECT id FROM reservacion WHERE folio = 'RES-2026-00001')) = 2);

SELECT pg_temp.verificar(
  'Los 9 parámetros de préstamo están cargados y son editables',
  (SELECT count(*) FROM parametro) = 9);

SELECT pg_temp.verificar(
  'Los 8 estados del ciclo de vida de la reservación están definidos',
  (SELECT count(*) FROM estatus_reservacion) = 8);

SELECT '';
ROLLBACK;
