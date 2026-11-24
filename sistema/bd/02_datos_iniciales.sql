-- =====================================================================
-- Datos iniciales del Sistema de Préstamo de Laboratorios
-- Entregable : E-05 · Sprint 1 · Arnulfo Vásquez Romero
--
-- Carga los catálogos indispensables para que el sistema opere: roles,
-- estados de la reservación, parámetros de préstamo con los valores
-- sugeridos de la sección 2.6.6, los laboratorios de la FCA con sus
-- horarios y los usuarios de prueba de cada rol.
-- =====================================================================

SET search_path TO prestamo, extensions, public;

-- ---------------------------------------------------------------------
-- Roles (RNF-03)
-- ---------------------------------------------------------------------
INSERT INTO rol (id, clave, nombre, descripcion) VALUES
 (1, 'docente',       'Docente',
     'Consulta disponibilidad, registra y cancela sus solicitudes y registra su asistencia.'),
 (2, 'administrador', 'Encargado de laboratorios',
     'Aprueba o rechaza solicitudes, administra el catálogo de laboratorios, bloqueos y parámetros.'),
 (3, 'coordinacion',  'Coordinación',
     'Consulta reportes, indicadores de aprovechamiento y exporta información. No opera solicitudes.');

-- ---------------------------------------------------------------------
-- Ciclo de vida de la reservación (sección 2.7.1)
-- ---------------------------------------------------------------------
INSERT INTO estatus_reservacion (id, clave, nombre, descripcion, ocupa_horario, cuenta_falta, es_final) VALUES
 (1, 'solicitada', 'Solicitada', 'El docente la registró y espera resolución del encargado.',              false, false, false),
 (2, 'aprobada',   'Aprobada',   'El encargado la autorizó y el horario queda bloqueado en el calendario.', true,  false, false),
 (3, 'rechazada',  'Rechazada',  'El encargado la negó. Exige motivo capturado.',                           false, false, true),
 (4, 'confirmada', 'Confirmada', 'El docente confirmó su asistencia al recibir el recordatorio (P-09).',    true,  false, false),
 (5, 'en_curso',   'En curso',   'Se registró el check-in dentro de la tolerancia configurada (P-01).',     true,  false, false),
 (6, 'cumplida',   'Cumplida',   'El horario concluyó y el laboratorio fue efectivamente utilizado.',       true,  false, true),
 (7, 'cancelada',  'Cancelada',  'El docente la canceló dentro del plazo permitido (P-08). Libera el horario y no cuenta como falta.', false, false, true),
 (8, 'no_asistio', 'No asistió', 'Venció la tolerancia (P-01) sin check-in. Libera el laboratorio y contabiliza la falta.',            false, true,  true);

-- ---------------------------------------------------------------------
-- Parámetros de las reglas de préstamo (sección 2.6.6, RNF-08)
-- Valores sugeridos de arranque. La coordinación define los definitivos.
-- ---------------------------------------------------------------------
INSERT INTO parametro (clave, nombre, valor, tipo_dato, unidad, descripcion) VALUES
 ('P-01', 'Tolerancia para registrar el check-in después del inicio del horario', '15',       'entero', 'minutos', 'Transcurrido este tiempo sin check-in, la reservación pasa a No asistió y el laboratorio se libera.'),
 ('P-02', 'Periodo en el que se contabilizan las inasistencias',                  '30',       'entero', 'días',    'Ventana móvil sobre la que se cuentan las faltas de un docente.'),
 ('P-03', 'Inasistencias antes de requerir autorización manual del encargado',    '2',        'entero', 'faltas',  'Al alcanzarlo, las nuevas solicitudes del docente requieren autorización manual.'),
 ('P-04', 'Inasistencias antes de suspender el apartado con antelación',          '3',        'entero', 'faltas',  'Al alcanzarlo, el docente pierde temporalmente la posibilidad de apartar con antelación.'),
 ('P-05', 'Duración de la suspensión por reincidencia',                           '15',       'entero', 'días',    'Tiempo que dura la suspensión derivada de P-04.'),
 ('P-06', 'Reservaciones activas simultáneas por docente',                        '3',        'entero', 'reservas','Límite de reservaciones vigentes al mismo tiempo.'),
 ('P-07', 'Anticipación máxima para apartar un laboratorio',                      '30',       'entero', 'días',    'No se admiten solicitudes para fechas más lejanas que este plazo.'),
 ('P-08', 'Plazo mínimo para cancelar sin que cuente como falta',                 '2',        'entero', 'horas',   'Cancelar con menos tiempo requiere intervención del encargado.'),
 ('P-09', 'Momentos de envío de recordatorio',                                    '24,1',    'lista',  'horas',   'Horas de antelación con que se envía cada recordatorio antes del horario reservado.');

-- ---------------------------------------------------------------------
-- Usuarios de prueba, uno por rol (HU-02)
-- La contraseña se almacena como hash bcrypt generado por pgcrypto.
-- Contraseña de los tres usuarios de prueba: Lab2026$fca
-- ---------------------------------------------------------------------
INSERT INTO usuario (numero_empleado, nombre, correo, contrasena_hash, rol_id) VALUES
 ('30125', 'Arnulfo Vásquez Romero',    'arnulfo.vasquez@uabc.edu.mx',  crypt('Lab2026$fca', gen_salt('bf', 10)), 1),
 ('28470', 'Encargado de Laboratorios', 'laboratorios.fca@uabc.edu.mx', crypt('Lab2026$fca', gen_salt('bf', 10)), 2),
 ('19003', 'Coordinación FCA',          'coordinacion.fca@uabc.edu.mx', crypt('Lab2026$fca', gen_salt('bf', 10)), 3),
 -- Segundo docente. Permite demostrar el criterio de HU-12 en el que dos
 -- docentes solicitan el mismo horario y el sistema señala el conflicto.
 ('30488', 'Docente de Prueba',        'docente.prueba@uabc.edu.mx',    crypt('Lab2026$fca', gen_salt('bf', 10)), 1);

-- ---------------------------------------------------------------------
-- Catálogo de laboratorios (HU-09, T-04)
-- Las claves, capacidades y ubicaciones quedan sujetas a la confirmación
-- del encargado de laboratorios en la revisión del sprint.
-- ---------------------------------------------------------------------
INSERT INTO laboratorio (clave, nombre, capacidad, ubicacion, equipamiento) VALUES
 ('LAB-01', 'Laboratorio de Cómputo 1',  30, 'Edificio A, planta baja', 'Equipos de escritorio, proyector y pizarrón'),
 ('LAB-02', 'Laboratorio de Cómputo 2',  30, 'Edificio A, planta baja', 'Equipos de escritorio y proyector'),
 ('LAB-03', 'Laboratorio de Cómputo 3',  25, 'Edificio A, primer piso',  'Equipos de escritorio y pantalla'),
 ('LAB-04', 'Laboratorio de Cómputo 4',  25, 'Edificio B, primer piso',  'Equipos de escritorio y proyector'),
 ('LAB-05', 'Centro de Autoacceso',      20, 'Edificio B, planta baja',  'Equipos de escritorio y audífonos');

-- ---------------------------------------------------------------------
-- Horarios ofertados (HU-09, T-05)
-- Bloques de dos horas, de lunes a viernes, de 07:00 a 21:00.
-- ---------------------------------------------------------------------
INSERT INTO horario_laboratorio (laboratorio_id, dia_semana, hora_inicio, hora_fin)
SELECT l.id,
       d.dia,
       make_time(h.inicio, 0, 0),
       make_time(h.inicio + 2, 0, 0)
FROM laboratorio l
CROSS JOIN generate_series(1, 5) AS d(dia)
CROSS JOIN generate_series(7, 19, 2) AS h(inicio)
WHERE l.clave <> 'LAB-05';

-- El centro de autoacceso opera en un horario más corto.
INSERT INTO horario_laboratorio (laboratorio_id, dia_semana, hora_inicio, hora_fin)
SELECT l.id,
       d.dia,
       make_time(h.inicio, 0, 0),
       make_time(h.inicio + 2, 0, 0)
FROM laboratorio l
CROSS JOIN generate_series(1, 5) AS d(dia)
CROSS JOIN generate_series(9, 15, 2) AS h(inicio)
WHERE l.clave = 'LAB-05';
