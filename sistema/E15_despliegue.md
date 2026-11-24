## Qué se despliega y dónde

El sistema entra en operación repartido en dos servicios, no en uno. La razón no es técnica sino de naturaleza del trabajo: una parte atiende peticiones de personas y la otra tiene que correr sola cada minuto, y esas dos cosas se pagan y se vigilan distinto.

| Pieza | Dónde queda | Plan | Costo |
|---|---|---|---|
| Base de datos | Supabase | Gratuito | $0 |
| Los dos procesos de 60 segundos | `pg_cron`, dentro de la misma base | Incluido | $0 |
| API y portal | Render, un solo servicio web | Gratuito | $0 |

El portal no necesita servicio propio. El servidor de la API ya lo sirve desde el mismo origen, decisión tomada en el Sprint 1 y documentada en `index.ts`: con portal y API bajo el mismo dominio, la cookie de sesión viaja sin configurar CORS y sin depender de cookies de terceros, que los navegadores bloquean cada vez más. Separarlos en dos servicios habría obligado a reglas de reescritura o a `SameSite=None`, y además habría consumido dos veces el cupo de horas del plan gratuito.

### Lo que cambió respecto del Sprint 4

Hasta el cierre del Sprint 4 los dos procesos periódicos vivían en el servidor, en dos `setInterval`. Eso los ataba a que el proceso de Node estuviera encendido. En un plan gratuito el servicio se suspende cuando nadie lo usa, de modo que mantener ahí los procesos significaba que **los laboratorios dejarían de liberarse y los recordatorios dejarían de salir justo en los periodos de poco uso**, que es cuando más falta hace que el sistema trabaje solo.

Se movieron a `pg_cron`, el planificador del propio motor de PostgreSQL. Tres consecuencias:

1. Corren aunque nadie haya abierto el portal en días.
2. Quedan registrados. La tabla `cron.job_run_details` guarda cada ejecución con su duración y su error, que es mejor evidencia operativa que un `console.log` perdido en la bitácora del servidor.
3. Ese tráfico cada minuto es lo que impide que el plan gratuito de Supabase suspenda el proyecto por inactividad.

El tercer punto merece una nota, porque invierte un razonamiento que parece sólido. El plan gratuito de Supabase suspende los proyectos con poca actividad en una ventana de siete días, y basta con unas pocas consultas diarias para evitarlo. Un sistema que consulta su base 1,440 veces al día no está cerca de ese umbral. El riesgo no era que el plan gratuito no aguantara la operación: era que el reloj viviera en un lugar que se apaga.

## Requisitos previos

- Cuenta de Supabase con el proyecto ya creado y los guiones `01` a `09` aplicados.
- Cuenta de GitHub con el repositorio del sistema.
- Cuenta de Render. No pide tarjeta para el plan gratuito.
- La contraseña de la base de datos de Supabase. Si se perdió, se restablece en *Project Settings → Database → Reset database password*.

## Procedimiento

### Paso 1 · Subir el repositorio

La carpeta `sistema` debe quedar en la raíz del repositorio, con `render.yaml` dentro de ella. Si se sube el contenido de `sistema` directamente a la raíz, hay que borrar la línea `rootDir: sistema` de `render.yaml`.

Antes del primer `git push`, confirmar que el archivo de credenciales no va incluido:

```bash
git check-ignore -v sistema/servidor/.env
```

Debe responder señalando la regla de `.gitignore` que lo excluye. Si no responde nada, el archivo **no** está ignorado y no se debe subir nada hasta corregirlo.

### Paso 2 · Obtener la cadena de conexión correcta

Este es el paso donde es más fácil equivocarse, y la equivocación no da un error claro.

En el panel de Supabase, botón **Connect**, hay que elegir **Session pooler** y copiar esa cadena. Es la que apunta al puerto **5432** del anfitrión `pooler.supabase.com`.

```
postgresql://postgres.[REF]:[CONTRASEÑA]@aws-[N]-[REGIÓN].pooler.supabase.com:5432/postgres
```

**No usar la de 6543**, que es el *Transaction pooler*. El servidor fija `search_path=prestamo,extensions,public` como parámetro de arranque de la conexión, porque sin `extensions` en la ruta no se resuelven `crypt()` ni el tipo `citext` y **el inicio de sesión deja de funcionar**. El pooler en modo transacción descarta ese estado de sesión entre transacciones.

**Tampoco usar la conexión directa** a `db.[REF].supabase.co`. En el plan gratuito solo responde por IPv6, y la mayoría de los proveedores de hospedaje salen por IPv4.

| Opción | Puerto | IPv4 | Conserva `search_path` | Sirve aquí |
|---|---|---|---|---|
| Conexión directa | 5432 | No | Sí | No, por IPv6 |
| Session pooler | 5432 | Sí | Sí | **Sí** |
| Transaction pooler | 6543 | Sí | No | No |

### Paso 3 · Programar los dos procesos

En el panel de Supabase, *SQL Editor*, pegar y ejecutar el contenido de `bd/11_pg_cron.sql`.

El guion habilita `pg_cron`, programa los dos trabajos y termina con dos consultas de verificación. La primera debe devolver exactamente dos renglones con `active = true`. La segunda, corrida dos minutos después, debe mostrar cuatro ejecuciones o más, todas con `status = 'succeeded'`.

Si esa segunda consulta no devuelve nada, los trabajos están programados pero no se están ejecutando, y no hay que continuar hasta resolverlo.

### Paso 4 · Crear el servicio en Render

1. *New → Blueprint*, conectar el repositorio. Render lee `render.yaml` y propone el servicio.
2. Pedirá el valor de `DATABASE_URL`, porque está marcada con `sync: false` precisamente para que la credencial no viva en el repositorio. Pegar la cadena del Paso 2.
3. Confirmar que las otras cuatro variables quedaron puestas: `BD_SSL=true`, `NODE_ENV=production`, `HORAS_DE_SESION=8`, `NODE_VERSION=22`.
4. Desplegar.

`NODE_ENV=production` no es decorativo: de él depende que la cookie de sesión se marque como `Secure`, es decir, que solo viaje por HTTPS.

### Paso 5 · Verificar

La bitácora del primer arranque debe mostrar estas tres líneas:

```
[bd] conectada · N laboratorios en el catálogo
[procesos] 2 trabajos de pg_cron activos
[servidor] escuchando en el puerto 10000
```

La segunda línea es la que importa. Si en su lugar aparece `ATENCIÓN: solo 0 de 2 trabajos de pg_cron están activos`, el Paso 3 no se aplicó contra esta base: el sistema atenderá usuarios pero no liberará horarios ni enviará avisos. Esa comprobación al arranque existe justamente porque es la clase de falla que no se nota hasta que alguien reclama.

Después, contra la dirección pública:

```bash
curl https://TU-SERVICIO.onrender.com/api/estado
```

Debe responder `{"servicio":"prestamo-laboratorios","version":"2.0.0","entorno":"production","bd":true}`. Si `bd` viene en `false`, el servicio está vivo pero no alcanza la base: revisar el Paso 2.

Por último, entrar al portal e iniciar sesión. Si el acceso falla con credenciales correctas, el síntoma apunta al `search_path`, es decir, a haber usado la cadena de 6543.

### Paso 6 · Evitar que el servicio se duerma

El plan gratuito de Render suspende el servicio tras quince minutos sin tráfico y tarda cerca de un minuto en volver. Los procesos periódicos ya no dependen de eso, pero el primer docente que entre después de un rato esperaría ese minuto.

Un servicio gratuito de pings cada diez minutos a `/api/estado` lo mantiene despierto. La aritmética cuadra con el cupo: Render otorga 750 horas de servicio al mes y un mes de 31 días tiene 744, así que un único servicio encendido todo el tiempo cabe con seis horas de margen.

Dos advertencias sobre ese margen:

- Es de seis horas. Un **segundo** servicio gratuito en el mismo espacio de trabajo rompe el cupo y suspende a los dos hasta el primero del mes siguiente.
- Render puede reiniciar los servicios gratuitos en cualquier momento. Un plan de pago no lo hace.

Por eso `/api/estado` consulta la base con un `SELECT 1`: así ese mismo ping, que existe para mantener despierto a Render, cuenta como actividad en Supabase y evita la suspensión por inactividad. Un solo mecanismo cubre las dos cosas.

## Lista de verificación

| # | Comprobación | Cómo se confirma |
|---|---|---|
| 1 | `.env` no está en el repositorio | `git check-ignore -v sistema/servidor/.env` responde |
| 2 | La cadena es la del Session pooler | Termina en `:5432/postgres` y el anfitrión dice `pooler` |
| 3 | Los dos trabajos están programados | `cron.job` devuelve 2 renglones con `active = true` |
| 4 | Los trabajos sí se ejecutan | `cron.job_run_details` crece cada minuto, `status = succeeded` |
| 5 | El servicio arranca | La bitácora muestra las tres líneas del Paso 5 |
| 6 | El servicio alcanza la base | `/api/estado` responde `bd: true` |
| 7 | El acceso funciona | Inicio de sesión con una cuenta real del catálogo |
| 8 | La cookie es segura | En el navegador, la cookie `sesion_prestamo` tiene `Secure` y `HttpOnly` |
| 9 | El portal se sirve | La raíz del dominio devuelve el portal, no un 404 |
| 10 | No hay doble ejecución | `index.ts` ya no tiene `setInterval` |

## Diagnóstico de fallas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El despliegue queda en *Deploy failed* sin arrancar | El servidor no escucha el puerto que Render asignó | Confirmar que `config.ts` lee `process.env.PORT` |
| El acceso rechaza credenciales correctas | `search_path` perdido: se usó el pooler de 6543 | Cambiar `DATABASE_URL` al Session pooler, 5432 |
| `ENOTFOUND` o `ETIMEDOUT` al conectar | Se usó la conexión directa, que es IPv6 | Cambiar al Session pooler |
| `self signed certificate` | Falta `BD_SSL=true` | Agregar la variable y redesplegar |
| La sesión se pierde al recargar | `NODE_ENV` no es `production`, la cookie no es `Secure` | Corregir la variable |
| Los horarios no se liberan | Los trabajos de `pg_cron` no están activos | Aplicar `bd/11_pg_cron.sql` |
| Recordatorios duplicados | Quedaron los `setInterval` **y** los trabajos de `pg_cron` | Quitar los `setInterval`. El índice `ux_notificacion_recordatorio` ya impide el duplicado, así que es desperdicio, no corrupción |
| El proyecto de Supabase aparece suspendido | Pasó una semana sin actividad | Reactivarlo desde el panel y revisar por qué se detuvieron los trabajos |
| Todos los servicios gratuitos suspendidos | Se agotaron las 750 horas del mes | Dejar un solo servicio gratuito en el espacio de trabajo |

## Cómo revertirlo

El despliegue es reversible en los dos frentes y por separado.

**Los procesos**, de vuelta al servidor:

```sql
SELECT cron.unschedule('prestamo-liberar-inasistencias');
SELECT cron.unschedule('prestamo-procesar-avisos');
```

y restituir los dos `setInterval` en `index.ts`. El historial de Git conserva la versión del Sprint 4.

**El servicio**: Render guarda los despliegues anteriores y permite volver a cualquiera con *Rollback*. Como la base es externa al servicio, volver atrás en el código no toca los datos.

## Lo que queda pendiente después de desplegar

Desplegar no es terminar. Tres cosas quedan fuera del alcance de este procedimiento y conviene no confundirlas con él:

1. **El catálogo de laboratorios es ficticio.** Los diez laboratorios de la demostración se deben sustituir por el inventario real de la Facultad. Es carga de datos, no desarrollo, y hasta que ocurra el sistema no es usable por nadie.
2. **RNF-02 sigue sin verificar.** Su criterio de aceptación es una medición cronometrada con al menos cinco docentes, y eso exige coordinación con la Facultad. Es el único de los veintinueve requerimientos sin verificar, y no se resuelve programando.
3. **Los datos de demostración no deben ir a producción.** El guion `10_datos_demostracion.sql` genera 650 reservaciones y ocho docentes falsos. Tiene un resguardo que se niega a correr si encuentra reservaciones reales, pero no hay razón para aplicarlo en la base de operación.
