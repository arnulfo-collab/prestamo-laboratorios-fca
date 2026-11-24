### Tablas del modelo

| # | Tabla | Campos | Propósito |
|---|---|---|---|
| 1 | `asistencia` | 5 | Check-in al inicio del horario reservado (RF-16, HU-16). Se construye en el Sprint 3. |
| 2 | `bitacora_parametro` | 6 | Historial de cambios de las reglas de préstamo: quién cambió qué, cuándo y cuál
   era el valor anterior. Es el cuarto criterio de aceptación de HU-21. |
| 3 | `bloqueo_laboratorio` | 7 | Bloqueos por mantenimiento o evento (RF-10, HU-10). Se construye en el Sprint 3; la tabla se crea aquí para no rehacer el modelo. |
| 4 | `estatus_reservacion` | 7 | Ciclo de vida de la reservación (sección 2.7.1). Permite medir el desperdicio de laboratorios. |
| 5 | `historial_reservacion` | 7 | Historial completo de cambios de estatus (RNF-05). Lo escribe un disparador, de modo que ningún cambio puede quedar sin registrar. |
| 6 | `horario_laboratorio` | 5 | Bloques horarios en que cada laboratorio se ofrece a préstamo (T-05). Un laboratorio sin horarios registrados no aparece como disponible. |
| 7 | `inasistencia` | 6 | Inasistencias contabilizadas por docente (RF-18, HU-19) y horas-laboratorio desperdiciadas (RF-21). Se construye en el Sprint 3. |
| 8 | `intento_acceso` | 5 | Registro de intentos de inicio de sesión. Soporta el criterio de HU-02 de no revelar cuál credencial es la incorrecta y permite detectar intentos repetidos. |
| 9 | `laboratorio` | 9 | Catálogo de laboratorios de cómputo de la FCA (RF-09). Sin catálogo no es posible reservar, por eso HU-09 se adelanta al Sprint 1. |
| 10 | `notificacion` | 7 | Avisos y recordatorios al docente (RF-06, RF-20). Se construye en el Sprint 4. |
| 11 | `parametro` | 10 | Reglas de préstamo configurables por el administrador sin modificar el código (RNF-08). Los valores cargados son los valores sugeridos de arranque de la sección 2.6.6; la coordinación de la FCA define los definitivos. |
| 12 | `reservacion` | 17 | Solicitudes de préstamo y su ciclo de vida (RF-04, RF-05, RF-08). Se construye a partir del Sprint 2. |
| 13 | `rol` | 4 | Roles de acceso al sistema (RNF-03). Define qué funciones puede usar cada usuario. |
| 14 | `sesion` | 5 | Sesiones activas. Soporta el cierre de sesión seguro de HU-02: al cerrarse se invalida el token y el botón de retroceso del navegador exige autenticarse de nuevo (T-03). |
| 15 | `usuario` | 9 | Usuarios del sistema. Conforme a RNF-04 almacena únicamente los datos personales indispensables: nombre, número de empleado, correo institucional y rol. No se almacenan domicilio, teléfono personal, CURP, RFC ni fotografía. |

### Detalle de los campos

**`asistencia`** — Check-in al inicio del horario reservado (RF-16, HU-16). Se construye en el Sprint 3.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.asistencia_id_seq'` | — |
| `reservacion_id` | entero largo | No | FK | — | — |
| `registrada_en` | timestamptz | No | — | `now()` | — |
| `registrada_por` | entero | No | FK | — | — |
| `minutos_retraso` | entero corto | No | — | `0` | — |

**`bitacora_parametro`** — Historial de cambios de las reglas de préstamo: quién cambió qué, cuándo y cuál
   era el valor anterior. Es el cuarto criterio de aceptación de HU-21.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.bitacora_parametro_id_seq'` | — |
| `clave` | varchar(6) | No | FK | — | — |
| `valor_anterior` | varchar(40) | No | — | — | — |
| `valor_nuevo` | varchar(40) | No | — | — | — |
| `usuario_id` | entero | No | FK | — | — |
| `ocurrido_en` | timestamptz | No | — | `now()` | — |

**`bloqueo_laboratorio`** — Bloqueos por mantenimiento o evento (RF-10, HU-10). Se construye en el Sprint 3; la tabla se crea aquí para no rehacer el modelo.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero | No | PK | `secuencia('prestamo.bloqueo_laboratorio_id_seq'` | — |
| `laboratorio_id` | entero | No | FK | — | — |
| `motivo` | varchar(200) | No | — | — | — |
| `fecha_inicio` | fecha | No | — | — | — |
| `fecha_fin` | fecha | No | — | — | — |
| `registrado_por` | entero | No | FK | — | — |
| `registrado_en` | timestamptz | No | — | `now()` | — |

**`estatus_reservacion`** — Ciclo de vida de la reservación (sección 2.7.1). Permite medir el desperdicio de laboratorios.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero corto | No | PK | — | — |
| `clave` | varchar(20) | No | UQ | — | — |
| `nombre` | varchar(40) | No | — | — | — |
| `descripcion` | texto | No | — | — | — |
| `ocupa_horario` | booleano | No | — | — | Verdadero si el estatus mantiene el horario bloqueado en el calendario. |
| `cuenta_falta` | booleano | No | — | `false` | Verdadero si al llegar a este estatus se contabiliza una inasistencia al docente. |
| `es_final` | booleano | No | — | `false` | Verdadero si el estatus cierra el ciclo y no admite transiciones posteriores. |

**`historial_reservacion`** — Historial completo de cambios de estatus (RNF-05). Lo escribe un disparador, de modo que ningún cambio puede quedar sin registrar.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.historial_reservacion_id_seq'` | — |
| `reservacion_id` | entero largo | No | FK | — | — |
| `estatus_anterior` | entero corto | Sí | FK | — | — |
| `estatus_nuevo` | entero corto | No | FK | — | — |
| `usuario_id` | entero | Sí | FK | — | — |
| `ocurrido_en` | timestamptz | No | — | `now()` | — |
| `nota` | varchar(300) | Sí | — | — | — |

**`horario_laboratorio`** — Bloques horarios en que cada laboratorio se ofrece a préstamo (T-05). Un laboratorio sin horarios registrados no aparece como disponible.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero | No | PK | `secuencia('prestamo.horario_laboratorio_id_seq'` | — |
| `laboratorio_id` | entero | No | FK | — | — |
| `dia_semana` | entero corto | No | UQ | — | Día de la semana, 1 = lunes a 7 = domingo (ISO 8601). |
| `hora_inicio` | time | No | UQ | — | — |
| `hora_fin` | time | No | — | — | — |

**`inasistencia`** — Inasistencias contabilizadas por docente (RF-18, HU-19) y horas-laboratorio desperdiciadas (RF-21). Se construye en el Sprint 3.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.inasistencia_id_seq'` | — |
| `reservacion_id` | entero largo | No | FK | — | — |
| `usuario_id` | entero | No | FK | — | — |
| `ocurrida_en` | timestamptz | No | — | `now()` | — |
| `horas_perdidas` | decimal(4,2) | No | — | — | — |
| `contabiliza` | booleano | No | — | `true` | Falso cuando el encargado justifica la falta, de modo que no afecte las restricciones del docente. |

**`intento_acceso`** — Registro de intentos de inicio de sesión. Soporta el criterio de HU-02 de no revelar cuál credencial es la incorrecta y permite detectar intentos repetidos.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.intento_acceso_id_seq'` | — |
| `correo` | extensions.citexto | No | — | — | — |
| `exitoso` | booleano | No | — | — | — |
| `ocurrido_en` | timestamptz | No | — | `now()` | — |
| `origen` | varchar(45) | Sí | — | — | Dirección IP de origen del intento. |

**`laboratorio`** — Catálogo de laboratorios de cómputo de la FCA (RF-09). Sin catálogo no es posible reservar, por eso HU-09 se adelanta al Sprint 1.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero | No | PK | `secuencia('prestamo.laboratorio_id_seq'` | — |
| `clave` | varchar(15) | No | UQ | — | Clave corta con la que la facultad identifica el espacio, por ejemplo LAB-01. |
| `nombre` | varchar(80) | No | — | — | — |
| `capacidad` | entero corto | No | — | — | Número de equipos disponibles para los alumnos. |
| `ubicacion` | varchar(80) | No | — | — | — |
| `equipamiento` | texto | Sí | — | — | — |
| `activo` | booleano | No | — | `true` | Baja lógica. Un laboratorio inactivo deja de ofrecerse pero conserva su historial de reservaciones. |
| `creado_en` | timestamptz | No | — | `now()` | — |
| `actualizado_en` | timestamptz | Sí | — | — | — |

**`notificacion`** — Avisos y recordatorios al docente (RF-06, RF-20). Se construye en el Sprint 4.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.notificacion_id_seq'` | — |
| `usuario_id` | entero | No | FK | — | — |
| `reservacion_id` | entero largo | Sí | FK | — | — |
| `tipo` | varchar(30) | No | — | — | — |
| `asunto` | varchar(150) | No | — | — | — |
| `enviada_en` | timestamptz | Sí | — | — | — |
| `estatus_envio` | varchar(20) | No | — | `'pendiente'` | — |

**`parametro`** — Reglas de préstamo configurables por el administrador sin modificar el código (RNF-08). Los valores cargados son los valores sugeridos de arranque de la sección 2.6.6; la coordinación de la FCA define los definitivos.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `clave` | varchar(6) | No | PK | — | — |
| `nombre` | varchar(150) | No | — | — | — |
| `valor` | varchar(40) | No | — | — | — |
| `tipo_dato` | varchar(15) | No | — | — | — |
| `unidad` | varchar(20) | Sí | — | — | — |
| `descripcion` | texto | No | — | — | — |
| `actualizado_en` | timestamptz | No | — | `now()` | — |
| `actualizado_por` | entero | Sí | FK | — | — |
| `minimo` | entero | Sí | — | — | Valor mínimo admisible. Nulo en los parámetros que no son numéricos. |
| `maximo` | entero | Sí | — | — | Valor máximo admisible. Nulo en los parámetros que no son numéricos. |

**`reservacion`** — Solicitudes de préstamo y su ciclo de vida (RF-04, RF-05, RF-08). Se construye a partir del Sprint 2.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero largo | No | PK | `secuencia('prestamo.reservacion_id_seq'` | — |
| `folio` | varchar(16) | No | UQ | — | Folio visible para el docente, con el formato RES-AAAA-NNNNN. |
| `usuario_id` | entero | No | FK | — | — |
| `laboratorio_id` | entero | No | FK | — | — |
| `fecha_uso` | fecha | No | — | — | — |
| `hora_inicio` | time | No | — | — | — |
| `hora_fin` | time | No | — | — | — |
| `grupo_materia` | varchar(80) | No | — | — | — |
| `motivo_uso` | varchar(300) | No | — | — | — |
| `estatus_id` | entero corto | No | FK | — | — |
| `solicitada_en` | timestamptz | No | — | `now()` | — |
| `resuelta_por` | entero | Sí | FK | — | Usuario administrador que aprobó o rechazó la solicitud. Deja registrado quién resolvió y cuándo (HU-08). |
| `resuelta_en` | timestamptz | Sí | — | — | — |
| `motivo_rechazo` | varchar(300) | Sí | — | — | Obligatorio cuando el estatus es Rechazada, por restricción de la propia base de datos. |
| `confirmada_en` | timestamptz | Sí | — | — | — |
| `cancelada_en` | timestamptz | Sí | — | — | — |
| `requiere_autorizacion` | booleano | No | — | `false` | Verdadero cuando el solicitante había alcanzado el umbral P-03 al registrarla.
   El panel del encargado lo advierte antes de aprobar (cuarto criterio de HU-08). |

**`rol`** — Roles de acceso al sistema (RNF-03). Define qué funciones puede usar cada usuario.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero corto | No | PK | — | — |
| `clave` | varchar(20) | No | UQ | — | Identificador corto usado por la aplicación para evaluar permisos. |
| `nombre` | varchar(60) | No | — | — | — |
| `descripcion` | texto | No | — | — | — |

**`sesion`** — Sesiones activas. Soporta el cierre de sesión seguro de HU-02: al cerrarse se invalida el token y el botón de retroceso del navegador exige autenticarse de nuevo (T-03).

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | PK | `gen_random_uuid()` | — |
| `usuario_id` | entero | No | FK | — | — |
| `iniciada_en` | timestamptz | No | — | `now()` | — |
| `expira_en` | timestamptz | No | — | — | — |
| `cerrada_en` | timestamptz | Sí | — | — | Momento del cierre de sesión. Una sesión con este campo lleno ya no es válida aunque no haya expirado. |

**`usuario`** — Usuarios del sistema. Conforme a RNF-04 almacena únicamente los datos personales indispensables: nombre, número de empleado, correo institucional y rol. No se almacenan domicilio, teléfono personal, CURP, RFC ni fotografía.

| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |
|---|---|---|---|---|---|
| `id` | entero | No | PK | `secuencia('prestamo.usuario_id_seq'` | — |
| `numero_empleado` | varchar(15) | No | UQ | — | — |
| `nombre` | varchar(120) | No | — | — | — |
| `correo` | extensions.citexto | No | UQ | — | — |
| `contrasena_hash` | texto | No | — | — | Hash bcrypt generado con pgcrypto (crypt + gen_salt). Nunca se almacena la contraseña en claro. |
| `rol_id` | entero corto | No | FK | — | — |
| `activo` | booleano | No | — | `true` | Baja lógica. Un usuario inactivo no puede iniciar sesión pero conserva su historial (RNF-05). |
| `ultimo_acceso` | timestamptz | Sí | — | — | Fecha del último inicio de sesión exitoso. |
| `creado_en` | timestamptz | No | — | `now()` | — |

### Reglas de integridad declaradas en el motor

Estas reglas no viven en el código de la aplicación, sino en la propia base de datos. Un dato que las incumpla es rechazado sin importar por dónde intente entrar, lo que evita que una pantalla mal programada corrompa la información.

| Restricción | Definición |
|---|---|
| `bloqueo_rango_valido` | `CHECK ((fecha_fin >= fecha_inicio))` |
| `horario_dia_valido` | `CHECK (((dia_semana >= 1) AND (dia_semana <= 7)))` |
| `horario_rango_valido` | `CHECK ((hora_fin > hora_inicio))` |
| `laboratorio_capacidad_valida` | `CHECK (((capacidad >= 1) AND (capacidad <= 100)))` |
| `parametro_tipo_valido` | `CHECK (((tipo_dato)::text = ANY ((ARRAY['entero'::character varying, 'decimal'::character varying, 'texto'::character varying, 'lista'::character varying, 'booleano'::character varying])::text[])))` |
| `reservacion_rango_valido` | `CHECK ((hora_fin > hora_inicio))` |
| `reservacion_rechazo_motivado` | `CHECK (((estatus_id <> 3) OR ((motivo_rechazo IS NOT NULL) AND (btrim((motivo_rechazo)::text) <> ''::text))))` |
| `reservacion_resolucion_completa` | `CHECK (((resuelta_por IS NULL) = (resuelta_en IS NULL)))` |
| `reservacion_sin_empalme` | `EXCLUDE USING gist (laboratorio_id WITH =, fecha_uso WITH =, timerange(hora_inicio, hora_fin) WITH &&) WHERE ((estatus_id = ANY (ARRAY[2, 4, 5, 6])))` |
| `sesion_vigencia` | `CHECK ((expira_en > iniciada_en))` |
| `usuario_correo_institucional` | `CHECK ((correo OPERATOR(extensions.~*) '^[a-z0-9._+-]+@uabc\.edu\.mx$'::extensions.citext))` |
