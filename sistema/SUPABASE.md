# Puesta en marcha en Supabase

Sistema de préstamo de laboratorios de cómputo · FCA, UABC Mexicali
Arnulfo Vásquez Romero

Esta guía monta el sistema sobre el **plan gratuito** de Supabase. La base de
datos no está escrita para Supabase: es PostgreSQL estándar, y los mismos
guiones corren en Neon, en Render, en un servidor de la facultad o en tu
computadora. Lo que sigue son los pasos específicos de Supabase.

---

## 1. Crear el proyecto

1. Entra a <https://supabase.com> y crea un proyecto nuevo.
2. Región: elige la más cercana a Mexicali, normalmente **West US (North
   California)**. La región no se puede cambiar después.
3. Guarda la contraseña de la base de datos que te pide al crearlo. No se
   vuelve a mostrar y la vas a necesitar en el paso 3.

---

## 2. Crear el esquema

En el panel de Supabase: **SQL Editor → New query**. Pega y ejecuta, en este
orden, el contenido de cada archivo:

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `bd/01_esquema.sql` | Crea el esquema `prestamo` con sus 15 tablas |
| 2 | `bd/02_datos_iniciales.sql` | Carga roles, estados, parámetros, usuarios y laboratorios |
| 3 | `bd/04_sprint2.sql` | Disponibilidad, folios y reglas de reservación |
| 4 | `bd/06_sprint3.sql` | Asistencia, inasistencias, bloqueos y configuración |

Los guiones ya vienen preparados para Supabase: instalan `citext`, `pgcrypto` y
`btree_gist` en el esquema `extensions`, que es donde Supabase las coloca.

Para comprobar que quedó bien, ejecuta también `bd/03_pruebas.sql`,
`bd/05_pruebas_sprint2.sql` y `bd/07_pruebas_sprint3.sql`. Son 101
comprobaciones y las tres corren dentro de una transacción que se revierte al
final, así que no dejan datos.

### La zona horaria

El control de asistencia compara la hora de cada reservación contra el reloj de
la base. Supabase corre en UTC, así que hay que decirle cuál es la hora de la
facultad:

```sql
alter database postgres set timezone to 'America/Tijuana';
```

Después de ejecutarlo, reinicia el proyecto desde **Settings → General →
Restart project** para que las conexiones nuevas lo tomen.

---

## 3. Conectar el servidor

En **Settings → Database → Connection string** copia la cadena. Usa la de
**conexión directa** o la del **Session pooler**, no la del Transaction pooler:
el servidor mantiene conexiones largas y fija su ruta de búsqueda al conectarse,
y el pooler de transacciones no conserva esa configuración entre consultas.

En `servidor/.env`:

```
DATABASE_URL=postgresql://postgres:TU_CONTRASENA@db.TUPROYECTO.supabase.co:5432/postgres
BD_SSL=true
PUERTO=3000
HORAS_DE_SESION=8
NODE_ENV=production
```

`BD_SSL=true` no es opcional: Supabase rechaza las conexiones sin TLS.

---

## 4. Lo que conviene revisar de seguridad

**El esquema `prestamo` no queda expuesto.** Supabase genera sola una API REST
sobre la base, pero solo para los esquemas que tenga marcados como expuestos, y
por omisión son `public`, `storage` y `graphql_public`. Como todas las tablas
del sistema viven en `prestamo`, esa API no las alcanza. Verifícalo en
**Integrations → Data API → Settings**: el esquema `prestamo` **no** debe
aparecer en *Exposed schemas*.

**Quién cuida la puerta.** En este sistema la autorización vive en el servidor
Node, en el control por rol de cada ruta. La base no tiene políticas de
seguridad a nivel de renglón, y no las necesita mientras nadie se conecte a ella
sin pasar por el servidor. Por eso importa lo del párrafo anterior, y por eso la
clave `service_role` de Supabase no debe salir nunca del servidor.

**La contraseña de la base no va al repositorio.** Vive en `.env`, que está
fuera del control de versiones. `​.env.ejemplo` documenta qué variables hacen
falta, sin valores.

---

## 5. Lo que hay que saber del plan gratuito

| Límite | Valor | Qué significa aquí |
|---|---|---|
| Almacenamiento | 500 MB | De sobra: el sistema completo con un año de reservaciones no llega a 50 MB |
| Proyectos activos | 2 | Alcanza para este proyecto y uno de pruebas |
| Pausa por inactividad | 7 días | Es el punto importante, ver abajo |

**La pausa es lo único que puede estorbarte.** Si la base no recibe actividad
durante una semana, Supabase pausa el proyecto y deja de responder hasta que lo
reactivas a mano desde el panel. Los datos no se pierden.

Para este proyecto eso importa poco mientras el servidor esté corriendo: el
proceso que vence la tolerancia del check-in consulta la base cada minuto, y eso
cuenta como actividad. El riesgo real aparece si apagas el servidor entre una
demostración y otra. Dos salidas:

1. **Si el sistema solo se enciende para demostrar**, entra al panel de Supabase
   un día antes y reactiva el proyecto si aparece pausado. Tarda un par de
   minutos.
2. **Si la facultad lo deja operando de verdad**, el plan Pro quita la pausa.
   Son 25 dólares mensuales, y es justamente el escenario que el proyecto tiene
   previsto en su presupuesto de contingencia.

---

## 6. Si algo falla

| Síntoma | Causa probable |
|---|---|
| `no pg_hba.conf entry … no encryption` | Falta `BD_SSL=true` |
| `type "citext" does not exist` | El guion 01 no se ejecutó, o se ejecutó en otra base |
| `function crypt(...) does not exist` | La conexión no trae `extensions` en su ruta de búsqueda; revisa que no estés usando el Transaction pooler |
| El check-in dice que aún no empieza el horario | Falta fijar la zona horaria del paso 2 |
| La base no responde y el panel dice *Paused* | Pausa por inactividad: reactívalo desde el panel |
