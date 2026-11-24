## Objeto de esta memoria

El informe final del proyecto describe cómo se administró el trabajo. Esta
memoria describe **qué se construyó y por qué se construyó así**. Está dirigida
a quien tenga que entender el sistema por dentro: para mantenerlo, para
auditarlo o para decidir si conviene extenderlo.

---

## El problema, en términos medibles

El préstamo de laboratorios de la facultad operaba sobre una hoja de papel en el
cubículo del encargado. Eso produce tres fallas que no son opiniones sino
consecuencias del medio:

1. **Nadie puede consultar sin presentarse.** La información está en un solo
   lugar físico y en horario de oficina.
2. **Nada impide el doble apartado.** Dos anotaciones sobre el mismo renglón no
   se detectan hasta el día del choque.
3. **El desperdicio es invisible.** Un laboratorio apartado y no usado queda
   bloqueado toda la sesión, y no queda registro de que eso ocurrió.

La tercera es la que justifica el proyecto. Digitalizar un trámite ahorra
caminatas; medir el desperdicio permite actuar sobre él. El sistema construido
mide, sobre un semestre simulado de 650 reservaciones, una tasa de
aprovechamiento del 84.5 % y 174 horas-laboratorio perdidas por inasistencia:
cifras que antes no existían.

---

## Solución adoptada y alternativas descartadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Desarrollar a la medida | Adaptar un producto de reservación genérico | Ningún producto modela la tolerancia de check-in, la liberación automática ni las restricciones graduales al reincidente. Adaptarlo costaría más que construirlo |
| PostgreSQL | Un motor sin tipos de rango ni restricciones de exclusión | La regla anti-empalme se expresa en una línea del motor; en otro habría que programarla y confiar en que nadie la rodee |
| Reglas en el motor | Reglas en la aplicación | Ver la sección siguiente: es la decisión central del diseño |
| Portal web instalable | Aplicación nativa de tienda | Exigiría cuentas de desarrollador de pago, revisión de tienda y una segunda base de código. No cabe en el presupuesto ni en el plazo |
| Gráficas dibujadas en SVG | Una biblioteca de gráficas | Tres formas sencillas. La biblioteca pesaría más que el código que la sustituye y añadiría una dependencia que mantener |

---

## Arquitectura

```
Navegador                Servidor Node 22              PostgreSQL 16
┌──────────────┐        ┌────────────────────┐        ┌──────────────────┐
│ Portal React │──────▶ │ Express            │──────▶ │ esquema prestamo │
│ TypeScript   │ HTTPS  │ · sesión por cookie│  TLS   │ · 15 tablas      │
│ build Vite   │        │ · control por rol  │        │ · 25 funciones   │
│ instalable   │ ◀──────│ · sirve el portal  │ ◀──────│ · restricciones  │
└──────────────┘        │ · 2 procesos/min   │        │ · disparadores   │
                        └────────────────────┘        └──────────────────┘
```

El portal se compila a archivos estáticos que sirve el mismo servidor de la
API. Esa elección evita configurar CORS y permite que la cookie de sesión
—`httpOnly`, `sameSite=lax`— viaje sin ajustes. El costo es que portal y API
comparten despliegue; para un sistema de una facultad es un costo razonable.

El servidor **no guarda estado en memoria**: las sesiones viven en una tabla. Si
el proceso se reinicia, nadie pierde su sesión, y el día que haga falta un
segundo servidor no hará falta cambiar nada.

---

## Modelo de datos

![Modelo entidad-relación del sistema, con sus quince tablas en cuatro bloques](/home/claude/proyecto/bd/modelo_er.png)

Las quince tablas se agrupan en cuatro bloques: catálogos, acceso,
laboratorios y reservaciones. El diccionario de datos completo —cada columna,
su tipo, si admite nulos y para qué sirve— está en el entregable E-03, generado
desde el catálogo del propio motor para que no pueda divergir de la
implementación.

Dos decisiones del modelo merecen explicación.

**El estado de una reservación es una tabla, no una columna de texto.** Los ocho
estados —Solicitada, Aprobada, Rechazada, Confirmada, En curso, Cumplida,
Cancelada, No asistió— viven en `estatus_reservacion` con una bandera que dice
cuáles ocupan el horario. La restricción anti-empalme consulta esa bandera, de
modo que agregar un estado nuevo no obliga a revisar la restricción.

**Las reglas de préstamo son renglones, no constantes.** Los nueve parámetros
viven en una tabla con su rango permitido y su bitácora de cambios. La
coordinación los ajusta desde el sistema y la siguiente validación ya usa el
valor nuevo. Fue la única forma de desbloquear el proyecto cuando la definición
de esos valores se escaló tres sprints seguidos sin respuesta.

---

## Las reglas viven en el motor

Es la decisión central del sistema y la que más veces se puso a prueba.

### Anti-empalme: una restricción, no una consulta previa

Lo intuitivo es consultar si el horario está libre y, si lo está, insertar. Eso
funciona hasta que dos solicitudes llegan en el mismo instante: ambas consultan,
ambas ven libre, ambas insertan. Es una condición de carrera clásica y no se
arregla consultando mejor.

La solución está en el motor:

```sql
ALTER TABLE reservacion ADD CONSTRAINT reservacion_sin_empalme
    EXCLUDE USING gist (laboratorio_id WITH =,
                        fecha_uso      WITH =,
                        public.timerange(hora_inicio, hora_fin) WITH &&)
    WHERE (estatus_id IN (2, 4, 5, 6, 8));
```

PostgreSQL no trae un tipo de rango para la hora del día, así que se define uno:
`CREATE TYPE public.timerange AS RANGE (subtype = time)`. El operador `&&`
detecta traslape parcial, que es el caso que una comparación de horas escrita a
mano suele dejar pasar.

La restricción es imposible de rodear: falla igual desde la aplicación, desde
una consulta manual o desde un proceso futuro que nadie ha escrito todavía.

### Historial y avisos: disparadores sobre el cambio de estado

El historial de cada reservación y los avisos al docente cuelgan del mismo
evento —`AFTER INSERT OR UPDATE OF estatus_id`— y no de la aplicación. La razón
es que hay cinco caminos que cambian un estado: aprobar, rechazar, cancelar,
registrar asistencia y el proceso que libera por inasistencia. Repartir la
notificación entre los cinco significa que olvidar uno deja a un docente sin
enterarse, y el que más fácil se olvida es justamente el automático, porque
ocurre sin que nadie abra el sistema.

### Idempotencia: un índice, no una bandera en el código

El proceso de recordatorios corre cada minuto. Sin protección, un docente
recibiría sesenta recordatorios por hora. La protección es un índice único
parcial:

```sql
CREATE UNIQUE INDEX ux_notificacion_recordatorio
    ON notificacion (reservacion_id, tipo)
    WHERE tipo LIKE 'recordatorio_%';
```

La función encola con `ON CONFLICT DO NOTHING`: repetir no es un error, solo no
hace nada. Hay una prueba que corre el proceso dos veces seguidas y verifica que
la segunda genere cero.

### Transacción única donde hay contabilidad

Liberar una reservación por inasistencia implica dos escrituras: cambiar el
estado y registrar la falta con sus horas perdidas. Separarlas abre la
posibilidad de una reservación liberada sin falta contabilizada. La función lo
hace en una sola transacción con `WITH … RETURNING`, de modo que o pasan las
dos o no pasa ninguna.

---

## Construcción por incrementos

| Sprint | Qué se construyó | Verificación |
|---|---|---|
| 1 | Esquema completo de 15 tablas, acceso por rol con sesiones en tabla y contraseñas con bcrypt verificadas en el motor, catálogo de laboratorios | 47 comprobaciones |
| 2 | Disponibilidad calculada en el motor, registro de solicitudes con folio secuencial, restricción anti-empalme, límites por docente | 57 |
| 3 | Panel de administración, check-in con ventana de tolerancia, liberación automática en proceso programado, restricciones graduales, parámetros configurables con bitácora | 81 |
| 4 | Avisos por disparador, recordatorios idempotentes, funciones de reporte, exportación a CSV, portal instalable | 96 |

El esquema se diseñó completo en el Sprint 1, incluidas las tablas que no se
usarían hasta el Sprint 4. Fue deliberado: rehacer un modelo de datos a mitad
del proyecto cuesta mucho más que preverlo, y el costo de tener tablas vacías
dos meses es cero.

---

## Estrategia de verificación

El sistema acumula **281 comprobaciones automatizadas**, todas aprobadas, en dos
niveles que verifican cosas distintas.

| Nivel | Qué verifica | Cantidad |
|---|---|---|
| Sobre el motor | Que las reglas se cumplan aunque la aplicación no esté | 153 |
| Sobre el sistema completo | Que los criterios de aceptación se cumplan en el portal real contra la base real | 128 |

Las pruebas del motor corren dentro de una transacción que se revierte, así que
no dejan rastro. Las de interfaz manejan un navegador de verdad con Playwright,
reconstruyen la base desde cero y capturan la evidencia en la misma corrida: la
imagen que aparece en cada bitácora es del momento en que la prueba pasó.

**Cada criterio de aceptación tiene al menos una comprobación.** No es una
métrica decorativa: es lo que permite afirmar que un requerimiento está
cumplido sin tener que creerle a nadie.

Tres ejemplos de pruebas que no se limitan a confirmar lo evidente:

- El archivo exportado **se descarga de verdad y se interpreta con un lector de
  CSV**, en lugar de dar por bueno que el botón hizo algo.
- La tasa de asistencia que muestra el portal **se compara contra la que calcula
  la base** para el mismo rango, no solo contra la existencia de un número.
- El ancho del documento **se mide en píxeles** en una pantalla de teléfono, de
  modo que un desbordamiento horizontal no pueda pasar inadvertido.

---

## Defectos encontrados y corregidos

Vale más registrar los defectos que presumir su ausencia. Estos son los que
costaron tiempo y lo que se aprendió de cada uno.

| Defecto | Causa | Corrección | Qué se adoptó como práctica |
|---|---|---|---|
| El disparador de historial fallaba al correr desde psql | Referencia a una tabla sin calificar su esquema | Calificar el esquema | Nombrar con su esquema todo objeto usado dentro de una función |
| El tipo `timerange` no era visible desde otra conexión | Se creó dentro del esquema del sistema | Moverlo a un esquema compartido | Lo compartido —extensiones y tipos— no vive en el esquema del sistema |
| Un docente suspendido recibía un mensaje que no correspondía | Las validaciones se evaluaban en mal orden | Reordenarlas de la más excluyente a la más específica | Documentar el orden en el comentario de la función |
| Una prueba daba falso negativo | Se asumió orden de evaluación entre ramas de un CTE | Separar en pasos con tabla temporal | No asumir orden de evaluación en SQL |
| `liberar_inasistencias` fallaba por columna ambigua | Un parámetro de salida se llamaba igual que una columna | Prefijar los parámetros de salida | Prefijar siempre los OUT de una función que consulta sus propias tablas |
| La suite del Sprint 2 dejó de pasar | El Sprint 3 agregó una columna y la suite no reconstruía con el guion nuevo | Actualizar la reconstrucción | Las suites viejas se ejecutan en cada sprint, no solo al final |
| La paleta de las gráficas era inaccesible | Se eligió por intuición | Verificarla y sustituirla | Verificar el color antes de escribir el código de la gráfica |

Los dos últimos son los interesantes. El de la suite del Sprint 2 lo encontró la
disciplina de volver a correr todo, no una revisión: sin ella habría llegado al
cierre. El de la paleta es el único defecto del proyecto que no afectaba a la
máquina sino al lector: el par verde y ámbar, el intuitivo para "aprovechado y
desperdiciado", resultó ser precisamente el que se confunde en la deficiencia de
visión del color más común, a una distancia de 5.8 cuando el mínimo aceptable es
8. Se sustituyó por verde y morado, que llega a 17.4.

---

## Resultados medidos

| Indicador | Resultado |
|---|---|
| Historias de usuario terminadas | 22 de 22 |
| Requerimientos funcionales verificados | 21 de 21 |
| Requerimientos no funcionales verificados | 7 de 8 |
| Comprobaciones automatizadas aprobadas | 281 de 281 |
| Defectos detectados después de cerrar un sprint | 2, ambos corregidos en el sprint siguiente |
| Historias devueltas al product backlog | 0 |
| Tamaño del portal comprimido | 72 KB |
| Tiempo de respaldo completo | 1.1 segundos · 171 KB |

---

## Limitaciones conocidas

Conviene que estén escritas por quien construyó el sistema y no que las
descubra quien lo reciba.

**El catálogo de laboratorios es ficticio.** Los cinco laboratorios con sus
claves, capacidades y ubicaciones son de ejemplo. Deben sustituirse antes de la
primera operación real.

**Los avisos se entregan dentro del sistema, no por correo.** El modelo ya
guarda el estado y el momento de envío, de modo que agregar el canal de correo
no exige rehacer nada, pero hoy el docente se entera al abrir la aplicación.

**El portal instalable no es una aplicación nativa.** La diferencia práctica es
una: no hay notificaciones al teléfono con la aplicación cerrada.

**No hay control de concurrencia a nivel de interfaz.** Si dos administradores
abren la misma solicitud, el segundo en aprobar recibe un error claro, pero no
se le avisa en pantalla mientras la tiene abierta.

**El sistema no verifica identidad al registrar asistencia.** Quien tenga la
sesión del docente puede registrar el check-in desde cualquier lugar. Resolverlo
exigiría presencia física comprobable —un código en el laboratorio, por
ejemplo— y queda fuera del alcance comprometido.

---

## Líneas de evolución

En orden de lo que más aportaría con menos esfuerzo:

1. **Canal de correo para los avisos.** El modelo ya lo contempla; falta
   contratar el servicio y escribir el envío.
2. **Código de confirmación en el laboratorio** para que el check-in acredite
   presencia física.
3. **Reporte por docente y por programa educativo**, que la coordinación pidió
   después del alcance comprometido.
4. **Aplicación nativa**, si la facultad decide que las notificaciones al
   teléfono justifican el costo. La API ya está separada del portal, así que una
   aplicación nativa hablaría con ella sin cambios en el servidor.
