# Sistema de préstamo de laboratorios de cómputo

Facultad de Ciencias Administrativas · UABC Mexicali
Maestría en Gestión de Tecnologías de la Información y la Comunicación
Autor: **Arnulfo Vásquez Romero**

Sistema para solicitar, autorizar y controlar el uso de los laboratorios de
cómputo de la facultad. Sustituye el trámite presencial y, sobre todo, detecta
y mide el desperdicio de espacios apartados que no se utilizan.

Estado: **los cuatro sprints terminados**. Operan el acceso por rol, el catálogo
de laboratorios, la consulta de disponibilidad, el registro de solicitudes con
folio, el seguimiento del estatus, la prevención de empalmes, los límites de
reservación, la cancelación con plazo, el panel de aprobación, los bloqueos por
mantenimiento, el calendario general, el check-in de asistencia, la liberación
automática del laboratorio no utilizado, las restricciones al reincidente, la
configuración de las nueve reglas de préstamo, los avisos y recordatorios al
docente, y los reportes de uso para coordinación con exportación a CSV.

El portal se instala en el teléfono como aplicación: trae su manifiesto, sus
iconos y un trabajador de servicio que guarda el armazón para que abra aunque la
red falle. No es una aplicación nativa de tienda; la diferencia práctica es que
no hay notificaciones al teléfono con la aplicación cerrada.

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 16 sobre **Supabase**, con las extensiones `citext`, `pgcrypto` y `btree_gist` |
| Servidor | Node.js 20 o superior, TypeScript, Express |
| Portal | React 18, TypeScript, Vite |
| Pruebas | SQL para las reglas del motor, Playwright para el portal |

Las reglas del negocio viven en la base de datos, no solo en la aplicación: un
dato inválido se rechaza sin importar por dónde intente entrar.

---

## Estructura

```
sistema/
├── bd/            Guiones de creación, carga inicial y pruebas de la base
├── servidor/      API en Node con TypeScript
├── portal/        Portal en React con TypeScript
├── pruebas/       Pruebas funcionales del portal con Playwright
├── README.md      Este archivo
└── SUPABASE.md    Puesta en marcha en Supabase, paso a paso
```

---

## Puesta en marcha

Necesitas **Node.js 20 o superior** y **PostgreSQL 16**.

### 1. Base de datos

**Si vas a usar Supabase**, sigue `SUPABASE.md`, que tiene los pasos del panel,
la cadena de conexión y lo que hay que saber del plan gratuito.

**Si la quieres local**, para desarrollo:

```bash
createdb prestamo_laboratorios

psql prestamo_laboratorios -v ON_ERROR_STOP=1 \
  -f bd/01_esquema.sql \
  -f bd/02_datos_iniciales.sql \
  -f bd/04_sprint2.sql \
  -f bd/06_sprint3.sql \
  -f bd/08_sprint4.sql
```

El control de asistencia compara la hora de cada reservación con el reloj del
servidor de base de datos, así que la base debe correr en la zona horaria de la
facultad:

```sql
ALTER DATABASE prestamo_laboratorios SET timezone = 'America/Tijuana';
```

Los guiones instalan las extensiones en el esquema `extensions`, que es donde
Supabase las coloca. En una base local ese esquema se crea solo, así que el
mismo archivo sirve para las dos.

Para comprobar que quedó bien:

```bash
psql prestamo_laboratorios -f bd/03_pruebas.sql          # 25 comprobaciones del Sprint 1
psql prestamo_laboratorios -f bd/05_pruebas_sprint2.sql  # 32 comprobaciones del Sprint 2
psql prestamo_laboratorios -f bd/07_pruebas_sprint3.sql  # 44 comprobaciones del Sprint 3
psql prestamo_laboratorios -f bd/09_pruebas_sprint4.sql  # 52 comprobaciones del Sprint 4
```

Las pruebas corren dentro de una transacción que se revierte al final: no dejan
datos en la base.

### 2. Servidor

```bash
cd servidor
cp .env.ejemplo .env     # y pon tu cadena de conexión en DATABASE_URL
npm install
npm run dev              # queda escuchando en http://localhost:3000
```

### 3. Portal

```bash
cd portal
npm install
npm run dev              # http://localhost:5173, con proxy hacia el servidor
```

Para producción se compila el portal y lo sirve el mismo servidor:

```bash
cd portal && npm run build
cd ../servidor && npm run build && npm start
```

---

## Cuentas de prueba

La contraseña de las cuatro es `Lab2026$fca`. Se almacena como hash bcrypt: el
sistema nunca guarda ni transmite la contraseña en claro.

| Correo | Rol |
|---|---|
| `arnulfo.vasquez@uabc.edu.mx` | Docente |
| `docente.prueba@uabc.edu.mx` | Docente |
| `laboratorios.fca@uabc.edu.mx` | Encargado de laboratorios |
| `coordinacion.fca@uabc.edu.mx` | Coordinación |

El segundo docente existe para demostrar el criterio de HU-12 en el que dos
docentes solicitan el mismo horario y el sistema señala el conflicto.

---

## Modo de demostración

Si el portal se abre sin un servidor detrás, trabaja contra datos en memoria que
replican las mismas reglas. Sirve para mostrar el sistema sin instalar nada, y lo
anuncia en una cinta en la parte superior para que no se confunda con el sistema
desplegado. Nada de lo que se capture en ese modo se guarda.

---

## Pruebas del portal

Con el servidor y la base en marcha:

```bash
cd pruebas
python3 -I pruebas_ui_sprint2.py          # 25 comprobaciones
python3 -I pruebas_ui_sprint3.py          # 37 comprobaciones
python3 -I pruebas_ui_sprint4.py          # 44 comprobaciones
```

Recorren los criterios de aceptación de cada sprint contra la base de datos real
y dejan las capturas en `pruebas/capturas/`.

---

## API

Todas las rutas cuelgan de `/api`. La sesión viaja en una cookie `httpOnly` y se
valida contra la tabla `sesion`, de modo que cerrar sesión la invalida de verdad.

| Método | Ruta | Rol | Historia |
|---|---|---|---|
| `GET` | `/estado` | — | — |
| `POST` | `/acceso` | — | HU-02 |
| `POST` | `/salir` | cualquiera | HU-02 |
| `GET` | `/sesion` | cualquiera | HU-02 |
| `GET` | `/laboratorios` | cualquiera | HU-09 |
| `POST` | `/laboratorios` | administrador | HU-09 |
| `PUT` | `/laboratorios/:id` | administrador | HU-09 |
| `POST` | `/laboratorios/:id/estado` | administrador | HU-09 |
| `GET` | `/laboratorios/:id/reservaciones-futuras` | administrador | HU-09 |
| `GET` | `/disponibilidad?fecha=` | cualquiera | HU-03 |
| `POST` | `/solicitudes` | docente | HU-04, HU-20 |
| `GET` | `/solicitudes/mias` | docente | HU-05 |
| `GET` | `/solicitudes/pendientes` | administrador | HU-12 |
| `POST` | `/solicitudes/:id/aprobar` | administrador | HU-12 |
| `POST` | `/solicitudes/:id/rechazar` | administrador | HU-12 |
| `GET` | `/parametros` | cualquiera | RNF-08 |
| `PUT` | `/parametros/:clave` | administrador | HU-21 |
| `GET` | `/parametros/bitacora` | administrador | HU-21 |
| `GET` | `/usuarios` | administrador | RNF-03 |
| `POST` | `/solicitudes/:id/cancelar` | docente | HU-07 |
| `POST` | `/solicitudes/:id/checkin` | docente, administrador | HU-16 |
| `GET` | `/mi-situacion` | docente | HU-19 |
| `GET` | `/docentes` | administrador | HU-19 |
| `GET` | `/docentes/:id/historial` | administrador | HU-19 |
| `GET` | `/bloqueos` | administrador | HU-10 |
| `POST` | `/bloqueos` | administrador | HU-10 |
| `GET` | `/calendario?desde=&hasta=` | administrador | HU-11 |
| `POST` | `/mantenimiento/liberar` | administrador | HU-17 |

---

## Lo que falta

El product backlog está completo. Lo que sigue pendiente no es desarrollo:

| Pendiente | Qué hace falta |
|---|---|
| Catálogo real | Sustituir los cinco laboratorios de ejemplo por los reales, con sus claves, capacidades y ubicaciones. |
| Avisos por correo | El modelo ya guarda `estatus_envio` y `enviada_en`; falta contratar un servicio transaccional y escribir el envío. |
| Pruebas con docentes | Medición cronometrada del registro de una solicitud con al menos cinco docentes. |

## Documentación

| Documento | Qué cubre |
|---|---|
| `README.md` | Este archivo: instalación rápida y estructura del código |
| `SUPABASE.md` | Puesta en marcha en Supabase, paso a paso |
| Manual de usuario (E-13) | Guía por rol, ilustrada, para docentes, encargado y coordinación |
| Manual técnico (E-14) | Arquitectura, instalación, operación, respaldo y diagnóstico de fallas |
| Memoria técnica | Qué se construyó, con qué decisiones de diseño y con qué resultados |

El procedimiento de respaldo y restauración del manual técnico está probado:
se ejecutó completo sobre una base con 650 reservaciones, verificando que tras
restaurar las reglas de negocio siguen vigentes.

## Datos de demostración

`bd/10_datos_demostracion.sql` es **opcional** y no forma parte del sistema.
Siembra un semestre ficticio —650 reservaciones de ocho docentes inventados
entre septiembre y noviembre— para que los reportes tengan algo que mostrar en
una demostración. Se niega a correr si encuentra reservaciones que no sean de
demostración, y carga los datos por el mismo camino que seguiría la operación
real, de modo que el historial y los avisos se generan igual.

## Procesos automáticos

El servidor ejecuta cada minuto dos funciones, en intervalos separados para que
la falla de una no detenga a la otra.

`prestamo.procesar_avisos` genera los recordatorios que ya están a tiro según el
parámetro P-09 y entrega los avisos que esperaban su hora. Es idempotente: un
índice único parcial impide que la corrida de cada minuto duplique nada.

`prestamo.liberar_inasistencias`:
toda reservación aprobada cuya tolerancia P-01 venció sin check-in pasa a *No
asistió*, su horario vuelve al calendario y la falta queda contabilizada con las
horas-laboratorio perdidas. El encargado puede dispararla en el momento desde la
pantalla de asistencia por docente.
