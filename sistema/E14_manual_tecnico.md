## Objeto de este manual

Este documento permite a una persona con conocimientos de administración de
sistemas instalar, operar, respaldar y mantener el sistema de préstamo de
laboratorios sin asistencia de quien lo construyó. No explica cómo usar el
sistema —eso está en el manual de usuario— sino cómo sostenerlo.

Todos los procedimientos de este manual se ejecutaron tal como están escritos
antes de documentarlos.

---

## Arquitectura

El sistema tiene tres piezas y una decisión de diseño que explica a las otras.

| Pieza | Tecnología | Qué hace |
|---|---|---|
| Base de datos | PostgreSQL 16 | Guarda la información y **aplica las reglas de negocio** |
| Servidor | Node.js 22 · TypeScript · Express | Expone la API y verifica el rol de cada petición |
| Portal | React 18 · TypeScript · Vite | Lo único que el usuario ve |

**La decisión que lo explica todo: las reglas que deben cumplirse siempre viven
en el motor de base de datos, no en la aplicación.** No empalmar horarios, no
exceder límites, dejar constancia de cada cambio de estado: son restricciones,
disparadores e índices del propio PostgreSQL. La consecuencia práctica es que
ninguna ruta de la aplicación, ni una consulta hecha a mano, ni un error de
programación futuro puede saltárselas.

El portal se compila a archivos estáticos que sirve el mismo servidor de la API.
Eso evita configurar CORS y permite que la cookie de sesión viaje sin ajustes.

```
Navegador  ──HTTPS──▶  Servidor Node (Express)  ──TLS──▶  PostgreSQL
  portal                 · verifica la sesión              · aplica las reglas
  React                  · verifica el rol                 · guarda el historial
  estático               · sirve el portal                 · procesos programados
```

---

## Requisitos

| Componente | Versión mínima | Nota |
|---|---|---|
| PostgreSQL | 16 | Con las extensiones `citext`, `pgcrypto` y `btree_gist` |
| Node.js | 22 LTS | El servidor y la compilación del portal |
| npm | 10 | Viene con Node |
| Navegador | Cualquiera actual | El portal usa estándares de 2023 en adelante |

Para el entorno de desarrollo se añaden Python 3.11 y Playwright, que son lo que
usan las pruebas de interfaz.

---

## Instalación de la base de datos

Los guiones están en `bd/` y se aplican **en este orden**. Cada uno supone que
los anteriores ya corrieron.

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `01_esquema.sql` | El esquema `prestamo` con sus 15 tablas, tipos, índices y disparadores |
| 2 | `02_datos_iniciales.sql` | Roles, estados, los nueve parámetros, usuarios y laboratorios |
| 3 | `04_sprint2.sql` | Disponibilidad, folios y reglas de reservación |
| 4 | `06_sprint3.sql` | Asistencia, inasistencias, bloqueos y configuración |
| 5 | `08_sprint4.sql` | Avisos, recordatorios y funciones de reporte |

Sobre una base local:

```bash
createdb prestamo_laboratorios
psql prestamo_laboratorios \
  -f bd/01_esquema.sql \
  -f bd/02_datos_iniciales.sql \
  -f bd/04_sprint2.sql \
  -f bd/06_sprint3.sql \
  -f bd/08_sprint4.sql
```

### La zona horaria no es opcional

El control de asistencia compara la hora de cada reservación contra el reloj de
la base de datos. Si la base corre en UTC —como hacen casi todos los servicios
en la nube— el check-in se abrirá y cerrará con ocho horas de diferencia.

```sql
ALTER DATABASE prestamo_laboratorios SET timezone = 'America/Tijuana';
```

El cambio aplica a las conexiones nuevas, así que hay que reiniciar el servidor
después.

### Puesta en marcha en Supabase

El esquema no usa nada propio de Supabase: es PostgreSQL estándar y corre igual
en Neon, en Render o en un servidor de la facultad. Lo específico de Supabase
está en `SUPABASE.md`, dentro del código. Tres puntos que conviene no pasar por
alto:

1. **Las extensiones van en el esquema `extensions`**, que es donde Supabase las
   coloca. Los guiones ya lo contemplan y crean ese esquema si no existe.
2. **Usa la conexión directa o el *session pooler*, no el *transaction
   pooler*.** El servidor fija su ruta de búsqueda al conectarse y el pooler de
   transacciones no la conserva entre consultas: `crypt()` deja de resolverse y
   nadie puede autenticarse.
3. **El esquema `prestamo` no queda expuesto a la API automática.** Supabase
   solo expone `public`, `storage` y `graphql_public`. Verifícalo en
   *Integrations → Data API → Settings*: `prestamo` **no** debe aparecer en
   *Exposed schemas*.

---

## Configuración y arranque del servidor

El servidor lee su configuración de un archivo `.env` en `servidor/`. El
repositorio trae `.env.ejemplo` con las variables y sin valores.

| Variable | Qué es | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión completa | `postgresql://usuario:clave@host:5432/base` |
| `BD_SSL` | TLS contra la base | `true` en la nube, `false` en local |
| `PUERTO` | Puerto donde escucha | `3000` |
| `HORAS_DE_SESION` | Duración de la sesión | `8` |
| `NODE_ENV` | Entorno | `production` |

**El archivo `.env` no va al control de versiones.** Contiene la contraseña de
la base de datos.

```bash
cd servidor && npm install && npm run build
cd ../portal   && npm install && npm run build
cd ../servidor && npm start
```

El portal se compila a `portal/dist`, que es la carpeta que el servidor sirve.
Cada vez que se cambie el portal hay que recompilarlo: el servidor no transpila
en caliente en producción.

Al arrancar, el servidor comprueba la conexión y lo reporta:

```
[bd] conectada · 5 laboratorios en el catálogo
[servidor] escuchando en http://localhost:3000
[asistencia] vigilando la tolerancia de check-in cada minuto
[avisos] generando recordatorios y entregas cada minuto
```

Si no puede conectarse, **no arranca**. Es deliberado: un servidor que responde
sin base de datos solo produce errores confusos.

---

## Procesos programados

El servidor ejecuta dos funciones cada minuto, en intervalos separados para que
la falla de una no detenga a la otra.

| Función | Qué hace | Si falla |
|---|---|---|
| `prestamo.liberar_inasistencias()` | Marca como *No asistió* las reservaciones cuya tolerancia venció sin check-in, libera el horario y registra la falta | Las reservaciones no se liberan; los horarios quedan bloqueados |
| `prestamo.procesar_avisos()` | Genera los recordatorios que marca P-09 y entrega los avisos que esperaban su hora | Los docentes dejan de recibir recordatorios |

Ambas son **idempotentes**: llamarlas de más no duplica nada. En el caso de los
recordatorios, un índice único parcial lo impide a nivel de motor.

Las dos pueden ejecutarse a mano, lo que es útil para diagnosticar:

```sql
SELECT * FROM prestamo.liberar_inasistencias();
SELECT * FROM prestamo.procesar_avisos();
```

---

## Respaldo y restauración

Este procedimiento se ejecutó completo —respaldo, borrado del esquema,
restauración y verificación— el 21 de noviembre de 2026 sobre una base con 650
reservaciones. Los resultados que se citan son los de esa ejecución.

### Respaldo

```bash
pg_dump "$DATABASE_URL" \
  --schema=prestamo \
  --format=custom \
  --file="prestamo_$(date +%Y%m%d).dump"
```

El formato `custom` comprime y permite restaurar objetos por separado. Sobre la
base de prueba el archivo pesó **171 KB** y el respaldo tomó **1.1 segundos**.
Una base con un año de operación real no debería pasar de unos pocos megabytes.

**Frecuencia recomendada:** diaria, conservando los últimos 30 respaldos. Si la
facultad contrata el plan de pago de Supabase, el proveedor hace respaldos
diarios automáticos y este procedimiento queda como respaldo adicional fuera del
proveedor, que es lo que protege contra un problema del propio proveedor.

### Restauración

```bash
pg_restore --dbname="$DATABASE_URL" --exit-on-error prestamo_20261121.dump
```

> **No agregues `--schema=prestamo` al restaurar.** Parece simétrico con el
> respaldo y no lo es: ese filtro excluye la creación del propio esquema, de
> modo que `pg_restore` intenta crear las tablas dentro de un esquema que no
> existe y falla. En la prueba produjo 288 errores y no restauró nada. El
> respaldo ya contiene únicamente ese esquema, así que no hace falta filtrar.

Si el esquema todavía existe y se quiere reemplazar, hay que borrarlo primero:

```sql
DROP SCHEMA prestamo CASCADE;
```

### Verificación de la restauración

Restaurar sin verificar no es respaldar. Después de cada restauración conviene
comprobar tres cosas, en este orden.

**Primero, que los datos estén completos.**

```sql
SELECT 'reservaciones', count(*) FROM prestamo.reservacion
UNION ALL SELECT 'usuarios',      count(*) FROM prestamo.usuario
UNION ALL SELECT 'notificaciones',count(*) FROM prestamo.notificacion
UNION ALL SELECT 'asistencias',   count(*) FROM prestamo.asistencia
UNION ALL SELECT 'historial',     count(*) FROM prestamo.historial_reservacion;
```

En la prueba: 650 reservaciones, 12 usuarios, 1 392 notificaciones, 473
asistencias y 1 902 renglones de historial, idénticos a los de antes del
borrado.

**Segundo, que la estructura esté completa**, no solo los renglones:

```sql
SELECT count(*) FILTER (WHERE table_type = 'BASE TABLE') AS tablas
  FROM information_schema.tables WHERE table_schema = 'prestamo';
SELECT count(*) AS funciones FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'prestamo';
SELECT count(*) AS anti_empalme FROM pg_constraint
 WHERE conname = 'reservacion_sin_empalme';
```

En la prueba: 15 tablas, 25 funciones y la restricción anti-empalme presente.

**Tercero, y es el que de verdad importa, que las reglas sigan vigentes.** Una
restauración puede traer todos los renglones y dejar fuera un disparador, y
entonces el sistema se ve bien y miente. La comprobación mínima:

```sql
BEGIN;
-- Debe generar folio y encolar el aviso de registro.
SELECT prestamo.registrar_solicitud(4, 2, current_date + 9, '09:00', '11:00',
       'Prueba de restauración', 'Verificación del respaldo');
SELECT count(*) FROM prestamo.notificacion
 WHERE reservacion_id = (SELECT max(id) FROM prestamo.reservacion);
SELECT prestamo.aprobar_solicitud((SELECT max(id) FROM prestamo.reservacion), 2);

-- Debe fallar: el horario quedó ocupado por la línea anterior.
INSERT INTO prestamo.reservacion (folio, usuario_id, laboratorio_id, fecha_uso,
       hora_inicio, hora_fin, grupo_materia, motivo_uso, estatus_id)
VALUES (prestamo.folio_siguiente(), 1, 2, current_date + 9, '09:00', '11:00',
        'x', 'y', 2);
ROLLBACK;
```

Si el `INSERT` **no** falla con `conflicting key value violates exclusion
constraint "reservacion_sin_empalme"`, la restauración está incompleta aunque
los conteos cuadren.

---

## Ejecutar las pruebas

El sistema trae 281 comprobaciones automatizadas. Ejecutarlas después de
cualquier cambio es la forma de saber que no se rompió nada.

**Pruebas sobre el motor.** Corren dentro de una transacción que se revierte, así
que no dejan datos:

```bash
psql "$DATABASE_URL" -f bd/03_pruebas.sql          # 25 · Sprint 1
psql "$DATABASE_URL" -f bd/05_pruebas_sprint2.sql  # 32 · Sprint 2
psql "$DATABASE_URL" -f bd/07_pruebas_sprint3.sql  # 44 · Sprint 3
psql "$DATABASE_URL" -f bd/09_pruebas_sprint4.sql  # 52 · Sprint 4
```

Cada comprobación imprime `APROBADA` o `FALLA` con su descripción. Los mensajes
`ERROR:` que aparecen en medio son esperados: varias pruebas verifican
precisamente que una operación inválida sea rechazada.

**Pruebas de interfaz.** Requieren el servidor corriendo y reconstruyen la base
desde cero, así que **no se ejecutan contra producción**:

```bash
cd pruebas
python3 -I pruebas_ui_sprint2.py   # 25 comprobaciones
python3 -I pruebas_ui_sprint3.py   # 37
python3 -I pruebas_ui_sprint4.py   # 44
```

---

## Operación cotidiana

### Dar de alta usuarios

Desde el sistema, en *Usuarios y roles*. Los tres roles son `docente`,
`administrador` —el encargado de laboratorios— y `coordinacion`. El correo debe
terminar en `@uabc.edu.mx`: hay una restricción en la base que lo exige.

### Cambiar las reglas de préstamo

Desde el sistema, en *Reglas de préstamo*. No requiere tocar código ni
reiniciar. Cada cambio queda en `prestamo.bitacora_parametro` con quién, cuándo
y de qué valor a cuál.

### Datos de demostración

`bd/10_datos_demostracion.sql` siembra un semestre ficticio de 650
reservaciones para que los reportes tengan algo que mostrar. **Es opcional y no
forma parte del sistema**: se niega a ejecutarse si encuentra reservaciones que
no sean de demostración.

---

## Diagnóstico de fallas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `no pg_hba.conf entry … no encryption` | Falta TLS | Poner `BD_SSL=true` |
| `type "citext" does not exist` | El guion 01 no corrió, o corrió en otra base | Verificar `DATABASE_URL` y volver a aplicarlo |
| `function crypt(...) does not exist` | La conexión no trae `extensions` en su ruta de búsqueda | No usar el *transaction pooler* |
| Nadie puede autenticarse | Lo anterior, casi siempre | Revisar el registro del servidor al arrancar |
| El check-in dice que aún no empieza el horario | La zona horaria de la base está en UTC | Aplicar el `ALTER DATABASE` de la sección de instalación |
| Las reservaciones no se liberan solas | El servidor está caído o el proceso falla | Revisar el registro; ejecutar la función a mano |
| No llegan recordatorios | Igual que lo anterior, o P-09 vacío | Revisar el parámetro y el registro |
| La base no responde y el panel dice *Paused* | Pausa por inactividad del plan gratuito | Reactivar desde el panel del proveedor |
| El portal muestra una versión vieja | No se recompiló | `npm run build` en `portal/` |

---

## Mantenimiento y evolución

**Dónde tocar según lo que se quiera cambiar.** El sistema está organizado para
que esta tabla sea corta, y conviene que siga siéndolo.

| Lo que se quiere cambiar | Dónde |
|---|---|
| Un valor de una regla (tolerancia, límites, plazos) | En el sistema, sin tocar código |
| Una regla nueva que deba cumplirse siempre | En la base de datos: restricción, disparador o función |
| Una pantalla | `portal/src/vistas/` |
| Una ruta de la API | `servidor/src/rutas.ts` |
| El texto de un aviso | La función `avisar_cambio_estatus()` en `08_sprint4.sql` |

**La regla de oro para quien reciba el sistema:** si una regla debe cumplirse en
todos los caminos posibles, va en el motor de base de datos. Ponerla en la
aplicación obliga a recordarla en cada ruta nueva, y tarde o temprano se olvida
en una.

**Antes de dar por buena cualquier modificación**, ejecutar las 281
comprobaciones. Esa disciplina detectó dos regresiones durante el desarrollo que
de otro modo habrían llegado a operación.

---

## Lo que queda pendiente de la facultad

| Pendiente | Qué implica |
|---|---|
| Sustituir el catálogo ficticio | Capturar los laboratorios reales con sus claves, capacidades y ubicaciones |
| Decidir sobre el plan de pago de la base de datos | El plan gratuito pausa el proyecto tras una semana sin actividad |
| Contratar el servicio de correo | Los avisos hoy se entregan dentro del sistema; el modelo ya contempla el canal de correo |
| Programar el respaldo diario | El procedimiento está probado; falta automatizarlo en el servidor que lo aloje |
