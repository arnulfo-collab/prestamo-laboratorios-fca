-- =====================================================================
-- Sistema de Préstamo de Laboratorios de Cómputo
-- Facultad de Ciencias Administrativas · UABC Mexicali
--
-- Entregable  : E-05 Base de datos implementada
-- Tareas      : T-01 (esquema de usuarios, roles y permisos)
--               T-10 (implementación de la base de datos)
-- Sprint      : 1 (28 de septiembre al 9 de octubre de 2026)
-- Responsable : Arnulfo Vásquez Romero
-- Motor       : PostgreSQL 16
--
-- Alcance del archivo: estructura completa del modelo de datos, incluidos
-- desde el inicio los estados de la reservación y la tabla de parámetros,
-- conforme a la sección 10.3.2 del plan del proyecto. Las tablas que
-- corresponden a sprints posteriores se crean en este sprint para no
-- rehacer el modelo después; se marcan en su comentario.
-- =====================================================================

DROP SCHEMA IF EXISTS prestamo CASCADE;
CREATE SCHEMA prestamo;

-- Supabase instala las extensiones en un esquema propio llamado "extensions".
-- Se crea aquí por si la base es un PostgreSQL común, donde ese esquema no
-- existe; en Supabase ya está y la instrucción no hace nada. Así el mismo
-- guion sirve para las dos.
CREATE SCHEMA IF NOT EXISTS extensions;

SET search_path TO prestamo, extensions, public;

CREATE EXTENSION IF NOT EXISTS citext     WITH SCHEMA extensions;  -- correo sin distinción de mayúsculas
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;  -- hash de contraseñas (bcrypt)
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;  -- soporte de la restricción anti-empalme

-- PostgreSQL no trae un tipo de rango para la hora del día. Se define aquí
-- porque la restricción que impide empalmes (RF-12) compara rangos horarios.
-- Vive en public, que toda conexión trae en su ruta de búsqueda, para que su
-- constructor sea visible sin configurar nada.
DROP TYPE IF EXISTS public.timerange CASCADE;
CREATE TYPE public.timerange AS RANGE (subtype = time);

-- ---------------------------------------------------------------------
-- 1. CATÁLOGOS
-- ---------------------------------------------------------------------

CREATE TABLE rol (
    id          smallint     PRIMARY KEY,
    clave       varchar(20)  NOT NULL UNIQUE,
    nombre      varchar(60)  NOT NULL,
    descripcion text         NOT NULL
);
COMMENT ON TABLE  rol IS 'Roles de acceso al sistema (RNF-03). Define qué funciones puede usar cada usuario.';
COMMENT ON COLUMN rol.clave IS 'Identificador corto usado por la aplicación para evaluar permisos.';

CREATE TABLE estatus_reservacion (
    id             smallint     PRIMARY KEY,
    clave          varchar(20)  NOT NULL UNIQUE,
    nombre         varchar(40)  NOT NULL,
    descripcion    text         NOT NULL,
    ocupa_horario  boolean      NOT NULL,
    cuenta_falta   boolean      NOT NULL DEFAULT false,
    es_final       boolean      NOT NULL DEFAULT false
);
COMMENT ON TABLE  estatus_reservacion IS 'Ciclo de vida de la reservación (sección 2.7.1). Permite medir el desperdicio de laboratorios.';
COMMENT ON COLUMN estatus_reservacion.ocupa_horario IS 'Verdadero si el estatus mantiene el horario bloqueado en el calendario.';
COMMENT ON COLUMN estatus_reservacion.cuenta_falta IS 'Verdadero si al llegar a este estatus se contabiliza una inasistencia al docente.';
COMMENT ON COLUMN estatus_reservacion.es_final IS 'Verdadero si el estatus cierra el ciclo y no admite transiciones posteriores.';

-- ---------------------------------------------------------------------
-- 2. USUARIOS Y ACCESO  ·  HU-02, T-01
-- ---------------------------------------------------------------------

CREATE TABLE usuario (
    id               serial       PRIMARY KEY,
    numero_empleado  varchar(15)  NOT NULL UNIQUE,
    nombre           varchar(120) NOT NULL,
    correo           citext       NOT NULL UNIQUE,
    contrasena_hash  text         NOT NULL,
    rol_id           smallint     NOT NULL REFERENCES rol(id),
    activo           boolean      NOT NULL DEFAULT true,
    ultimo_acceso    timestamptz,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT usuario_correo_institucional CHECK (correo ~* '^[a-z0-9._+-]+@uabc\.edu\.mx$')
);
COMMENT ON TABLE  usuario IS 'Usuarios del sistema. Conforme a RNF-04 almacena únicamente los datos personales indispensables: nombre, número de empleado, correo institucional y rol. No se almacenan domicilio, teléfono personal, CURP, RFC ni fotografía.';
COMMENT ON COLUMN usuario.contrasena_hash IS 'Hash bcrypt generado con pgcrypto (crypt + gen_salt). Nunca se almacena la contraseña en claro.';
COMMENT ON COLUMN usuario.activo IS 'Baja lógica. Un usuario inactivo no puede iniciar sesión pero conserva su historial (RNF-05).';
COMMENT ON COLUMN usuario.ultimo_acceso IS 'Fecha del último inicio de sesión exitoso.';

CREATE INDEX ix_usuario_rol ON usuario(rol_id) WHERE activo;

CREATE TABLE sesion (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    integer      NOT NULL REFERENCES usuario(id),
    iniciada_en   timestamptz  NOT NULL DEFAULT now(),
    expira_en     timestamptz  NOT NULL,
    cerrada_en    timestamptz,
    CONSTRAINT sesion_vigencia CHECK (expira_en > iniciada_en)
);
COMMENT ON TABLE  sesion IS 'Sesiones activas. Soporta el cierre de sesión seguro de HU-02: al cerrarse se invalida el token y el botón de retroceso del navegador exige autenticarse de nuevo (T-03).';
COMMENT ON COLUMN sesion.cerrada_en IS 'Momento del cierre de sesión. Una sesión con este campo lleno ya no es válida aunque no haya expirado.';

CREATE INDEX ix_sesion_usuario ON sesion(usuario_id) WHERE cerrada_en IS NULL;

CREATE TABLE intento_acceso (
    id          bigserial    PRIMARY KEY,
    correo      citext       NOT NULL,
    exitoso     boolean      NOT NULL,
    ocurrido_en timestamptz  NOT NULL DEFAULT now(),
    origen      varchar(45)
);
COMMENT ON TABLE  intento_acceso IS 'Registro de intentos de inicio de sesión. Soporta el criterio de HU-02 de no revelar cuál credencial es la incorrecta y permite detectar intentos repetidos.';
COMMENT ON COLUMN intento_acceso.origen IS 'Dirección IP de origen del intento.';

-- ---------------------------------------------------------------------
-- 3. CATÁLOGO DE LABORATORIOS  ·  HU-09, T-04, T-05
-- ---------------------------------------------------------------------

CREATE TABLE laboratorio (
    id          serial       PRIMARY KEY,
    clave       varchar(15)  NOT NULL UNIQUE,
    nombre      varchar(80)  NOT NULL,
    capacidad   smallint     NOT NULL,
    ubicacion   varchar(80)  NOT NULL,
    equipamiento text,
    activo      boolean      NOT NULL DEFAULT true,
    creado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_en timestamptz,
    CONSTRAINT laboratorio_capacidad_valida CHECK (capacidad BETWEEN 1 AND 100)
);
COMMENT ON TABLE  laboratorio IS 'Catálogo de laboratorios de cómputo de la FCA (RF-09). Sin catálogo no es posible reservar, por eso HU-09 se adelanta al Sprint 1.';
COMMENT ON COLUMN laboratorio.clave IS 'Clave corta con la que la facultad identifica el espacio, por ejemplo LAB-01.';
COMMENT ON COLUMN laboratorio.capacidad IS 'Número de equipos disponibles para los alumnos.';
COMMENT ON COLUMN laboratorio.activo IS 'Baja lógica. Un laboratorio inactivo deja de ofrecerse pero conserva su historial de reservaciones.';

CREATE TABLE horario_laboratorio (
    id             serial     PRIMARY KEY,
    laboratorio_id integer    NOT NULL REFERENCES laboratorio(id) ON DELETE CASCADE,
    dia_semana     smallint   NOT NULL,
    hora_inicio    time       NOT NULL,
    hora_fin       time       NOT NULL,
    CONSTRAINT horario_dia_valido   CHECK (dia_semana BETWEEN 1 AND 7),
    CONSTRAINT horario_rango_valido CHECK (hora_fin > hora_inicio),
    CONSTRAINT horario_sin_duplicado UNIQUE (laboratorio_id, dia_semana, hora_inicio)
);
COMMENT ON TABLE  horario_laboratorio IS 'Bloques horarios en que cada laboratorio se ofrece a préstamo (T-05). Un laboratorio sin horarios registrados no aparece como disponible.';
COMMENT ON COLUMN horario_laboratorio.dia_semana IS 'Día de la semana, 1 = lunes a 7 = domingo (ISO 8601).';

CREATE TABLE bloqueo_laboratorio (
    id             serial       PRIMARY KEY,
    laboratorio_id integer      NOT NULL REFERENCES laboratorio(id),
    motivo         varchar(200) NOT NULL,
    fecha_inicio   date         NOT NULL,
    fecha_fin      date         NOT NULL,
    registrado_por integer      NOT NULL REFERENCES usuario(id),
    registrado_en  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT bloqueo_rango_valido CHECK (fecha_fin >= fecha_inicio)
);
COMMENT ON TABLE  bloqueo_laboratorio IS 'Bloqueos por mantenimiento o evento (RF-10, HU-10). Se construye en el Sprint 3; la tabla se crea aquí para no rehacer el modelo.';

-- ---------------------------------------------------------------------
-- 4. RESERVACIONES  ·  Sprint 2 y 3 (tabla creada en el Sprint 1)
-- ---------------------------------------------------------------------

CREATE TABLE reservacion (
    id              bigserial    PRIMARY KEY,
    folio           varchar(16)  NOT NULL UNIQUE,
    usuario_id      integer      NOT NULL REFERENCES usuario(id),
    laboratorio_id  integer      NOT NULL REFERENCES laboratorio(id),
    fecha_uso       date         NOT NULL,
    hora_inicio     time         NOT NULL,
    hora_fin        time         NOT NULL,
    grupo_materia   varchar(80)  NOT NULL,
    motivo_uso      varchar(300) NOT NULL,
    estatus_id      smallint     NOT NULL REFERENCES estatus_reservacion(id),
    solicitada_en   timestamptz  NOT NULL DEFAULT now(),
    resuelta_por    integer      REFERENCES usuario(id),
    resuelta_en     timestamptz,
    motivo_rechazo  varchar(300),
    confirmada_en   timestamptz,
    cancelada_en    timestamptz,
    CONSTRAINT reservacion_rango_valido   CHECK (hora_fin > hora_inicio),
    CONSTRAINT reservacion_rechazo_motivado CHECK (
        estatus_id <> 3 OR (motivo_rechazo IS NOT NULL AND btrim(motivo_rechazo) <> '')
    ),
    CONSTRAINT reservacion_resolucion_completa CHECK (
        (resuelta_por IS NULL) = (resuelta_en IS NULL)
    )
);
COMMENT ON TABLE  reservacion IS 'Solicitudes de préstamo y su ciclo de vida (RF-04, RF-05, RF-08). Se construye a partir del Sprint 2.';
COMMENT ON COLUMN reservacion.folio IS 'Folio visible para el docente, con el formato RES-AAAA-NNNNN.';
COMMENT ON COLUMN reservacion.resuelta_por IS 'Usuario administrador que aprobó o rechazó la solicitud. Deja registrado quién resolvió y cuándo (HU-08).';
COMMENT ON COLUMN reservacion.motivo_rechazo IS 'Obligatorio cuando el estatus es Rechazada, por restricción de la propia base de datos.';

-- RF-12: impide dos reservaciones vigentes en el mismo laboratorio y horario.
-- Se implementa en el motor para que la validación no dependa de la aplicación.
-- Los estatus 2, 4, 5 y 6 son Aprobada, Confirmada, En curso y Cumplida: los
-- cuatro que ocupan el horario según estatus_reservacion.ocupa_horario.
ALTER TABLE reservacion ADD CONSTRAINT reservacion_sin_empalme
    EXCLUDE USING gist (
        laboratorio_id WITH =,
        fecha_uso      WITH =,
        public.timerange(hora_inicio, hora_fin) WITH &&
    ) WHERE (estatus_id IN (2, 4, 5, 6));

CREATE INDEX ix_reservacion_usuario   ON reservacion(usuario_id, solicitada_en DESC);
CREATE INDEX ix_reservacion_calendario ON reservacion(laboratorio_id, fecha_uso);
CREATE INDEX ix_reservacion_estatus    ON reservacion(estatus_id);

CREATE TABLE historial_reservacion (
    id               bigserial    PRIMARY KEY,
    reservacion_id   bigint       NOT NULL REFERENCES reservacion(id) ON DELETE CASCADE,
    estatus_anterior smallint     REFERENCES estatus_reservacion(id),
    estatus_nuevo    smallint     NOT NULL REFERENCES estatus_reservacion(id),
    usuario_id       integer      REFERENCES usuario(id),
    ocurrido_en      timestamptz  NOT NULL DEFAULT now(),
    nota             varchar(300)
);
COMMENT ON TABLE historial_reservacion IS 'Historial completo de cambios de estatus (RNF-05). Lo escribe un disparador, de modo que ningún cambio puede quedar sin registrar.';

CREATE TABLE asistencia (
    id             bigserial    PRIMARY KEY,
    reservacion_id bigint       NOT NULL UNIQUE REFERENCES reservacion(id),
    registrada_en  timestamptz  NOT NULL DEFAULT now(),
    registrada_por integer      NOT NULL REFERENCES usuario(id),
    minutos_retraso smallint    NOT NULL DEFAULT 0
);
COMMENT ON TABLE asistencia IS 'Check-in al inicio del horario reservado (RF-16, HU-16). Se construye en el Sprint 3.';

CREATE TABLE inasistencia (
    id             bigserial    PRIMARY KEY,
    reservacion_id bigint       NOT NULL UNIQUE REFERENCES reservacion(id),
    usuario_id     integer      NOT NULL REFERENCES usuario(id),
    ocurrida_en    timestamptz  NOT NULL DEFAULT now(),
    horas_perdidas numeric(4,2) NOT NULL,
    contabiliza    boolean      NOT NULL DEFAULT true
);
COMMENT ON TABLE  inasistencia IS 'Inasistencias contabilizadas por docente (RF-18, HU-19) y horas-laboratorio desperdiciadas (RF-21). Se construye en el Sprint 3.';
COMMENT ON COLUMN inasistencia.contabiliza IS 'Falso cuando el encargado justifica la falta, de modo que no afecte las restricciones del docente.';

CREATE TABLE notificacion (
    id             bigserial    PRIMARY KEY,
    usuario_id     integer      NOT NULL REFERENCES usuario(id),
    reservacion_id bigint       REFERENCES reservacion(id),
    tipo           varchar(30)  NOT NULL,
    asunto         varchar(150) NOT NULL,
    enviada_en     timestamptz,
    estatus_envio  varchar(20)  NOT NULL DEFAULT 'pendiente'
);
COMMENT ON TABLE notificacion IS 'Avisos y recordatorios al docente (RF-06, RF-20). Se construye en el Sprint 4.';

-- ---------------------------------------------------------------------
-- 5. PARÁMETROS DE LAS REGLAS DE PRÉSTAMO  ·  RNF-08, sección 2.6.6
-- ---------------------------------------------------------------------

CREATE TABLE parametro (
    clave           varchar(6)   PRIMARY KEY,
    nombre          varchar(150) NOT NULL,
    valor           varchar(40)  NOT NULL,
    tipo_dato       varchar(15)  NOT NULL,
    unidad          varchar(20),
    descripcion     text         NOT NULL,
    actualizado_en  timestamptz  NOT NULL DEFAULT now(),
    actualizado_por integer      REFERENCES usuario(id),
    CONSTRAINT parametro_tipo_valido CHECK (tipo_dato IN ('entero','decimal','texto','lista','booleano'))
);
COMMENT ON TABLE parametro IS 'Reglas de préstamo configurables por el administrador sin modificar el código (RNF-08). Los valores cargados son los valores sugeridos de arranque de la sección 2.6.6; la coordinación de la FCA define los definitivos.';

-- ---------------------------------------------------------------------
-- 6. DISPARADOR DE TRAZABILIDAD
-- ---------------------------------------------------------------------

-- Las tablas se nombran con su esquema: el disparador se dispara desde
-- cualquier conexión, y no todas traen prestamo en su search_path.
CREATE FUNCTION registrar_cambio_estatus() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO prestamo.historial_reservacion
               (reservacion_id, estatus_anterior, estatus_nuevo, usuario_id, nota)
        VALUES (NEW.id, NULL, NEW.estatus_id, NEW.usuario_id, 'Solicitud registrada');
        RETURN NEW;
    END IF;

    IF NEW.estatus_id IS DISTINCT FROM OLD.estatus_id THEN
        INSERT INTO prestamo.historial_reservacion
               (reservacion_id, estatus_anterior, estatus_nuevo, usuario_id, nota)
        VALUES (NEW.id, OLD.estatus_id, NEW.estatus_id, NEW.resuelta_por, NEW.motivo_rechazo);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION registrar_cambio_estatus() IS 'Escribe en historial_reservacion cada alta y cada cambio de estatus, para cumplir RNF-05 sin depender de la aplicación.';

CREATE TRIGGER tr_reservacion_historial
    AFTER INSERT OR UPDATE OF estatus_id ON reservacion
    FOR EACH ROW EXECUTE FUNCTION registrar_cambio_estatus();

-- ---------------------------------------------------------------------
-- 7. VISTA DE APOYO AL CATÁLOGO
-- ---------------------------------------------------------------------

CREATE VIEW v_catalogo_laboratorios AS
SELECT l.id,
       l.clave,
       l.nombre,
       l.capacidad,
       l.ubicacion,
       l.activo,
       count(h.id)                                   AS bloques_horario,
       coalesce(sum(EXTRACT(epoch FROM (h.hora_fin - h.hora_inicio)) / 3600), 0)::numeric(6,1) AS horas_semana
FROM laboratorio l
LEFT JOIN horario_laboratorio h ON h.laboratorio_id = l.id
GROUP BY l.id;
COMMENT ON VIEW v_catalogo_laboratorios IS 'Catálogo con el número de bloques y las horas ofertadas por semana. Alimenta la pantalla de catálogo del panel de administración (HU-09).';
