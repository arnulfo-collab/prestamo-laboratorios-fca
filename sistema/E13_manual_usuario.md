## Qué resuelve este sistema

Antes, apartar un laboratorio de cómputo en la facultad significaba ir al
cubículo del encargado, preguntar si estaba libre y anotarse en una hoja. Si el
encargado no estaba, había que volver. Si dos docentes se anotaban para el mismo
horario, nadie lo notaba hasta el día del choque. Y si alguien apartaba un
laboratorio y no llegaba, el espacio quedaba bloqueado toda la sesión sin que
nadie lo supiera.

Este sistema hace tres cosas: te deja apartar desde donde estés, impide que dos
reservaciones se encimen, y mide cuánto del tiempo apartado se aprovecha de
verdad.

Este manual está dividido por rol. Busca el tuyo y lee solo esa parte.

| Si eres… | Ve a la sección |
|---|---|
| Docente | 3. Guía del docente |
| Encargado de laboratorios | 4. Guía del encargado |
| Coordinación de la facultad | 5. Guía de la coordinación |

---

## Entrar al sistema

Abre la dirección del sistema en el navegador. Verás la pantalla de acceso.

![Pantalla de acceso al sistema](capturas/01-acceso.png)

Escribe tu **correo institucional** —el que termina en `@uabc.edu.mx`— y tu
contraseña. El sistema no acepta correos de otro dominio: el padrón se limita a
personal de la universidad.

Si te equivocas, el aviso es el mismo tanto si el correo no existe como si la
contraseña está mal. No es un descuido: decir cuál de los dos falló le diría a
un desconocido qué correos están dados de alta.

![Aviso cuando las credenciales no son válidas](capturas/02-credenciales-invalidas.png)

### Lo que ves depende de tu rol

Al entrar, el menú de la izquierda muestra únicamente las secciones que tu rol
puede usar. Un docente ve su disponibilidad y sus solicitudes; el encargado ve
además el panel de administración; la coordinación ve los reportes.

![Pantalla de inicio de un docente](capturas/03-inicio-docente.png)

Escribir a mano la dirección de una sección que no te corresponde no sirve: el
sistema decide qué mostrarte por tu rol, no por lo que diga la barra del
navegador.

![Acceso denegado al escribir la dirección de otra sección](capturas/04-acceso-denegado.png)

**Tu sesión dura ocho horas.** Pasado ese plazo el sistema te pide entrar de
nuevo. Si usas una computadora compartida, cierra sesión con el botón del pie
del menú en lugar de solo cerrar la pestaña.

---

## Guía del docente

### Consultar la disponibilidad

Entra a **Disponibilidad** y elige la fecha. Verás todos los laboratorios con
sus bloques del día, en tres estados:

- **Libre.** Puedes apartarlo; el bloque es un botón.
- **Ocupado.** Ya lo apartó alguien más; dice quién y para qué grupo.
- **Bloqueado.** El laboratorio no está disponible ese día por mantenimiento o
  por un evento.

![Calendario de disponibilidad con los bloques del día](capturas/s2-01-calendario.png)

Los laboratorios de la facultad publican horarios de lunes a viernes. Si eliges
un sábado o un domingo, el sistema te lo dice en lugar de mostrarte una pantalla
vacía.

### Apartar un laboratorio

Oprime el bloque que quieras. Se abre una ventana con el laboratorio, la fecha y
el horario ya puestos; solo tienes que capturar dos datos:

- **Grupo o materia.** Para qué clase lo necesitas.
- **Motivo de uso.** Qué vas a hacer ahí. Sirve para que el encargado decida con
  información cuando dos personas piden lo mismo.

![Formulario de solicitud con sus validaciones](capturas/s2-02-validacion-solicitud.png)

Al enviarla, el sistema te da un **folio**. Anótalo o déjalo donde puedas verlo:
es como identificarás tu solicitud en cualquier consulta.

![Folio asignado al registrar la solicitud](capturas/s2-03-folio.png)

La solicitud queda en estado **Solicitada**. No tienes el laboratorio todavía:
lo tendrás cuando el encargado la apruebe, y te llegará un aviso.

### Lo que puede impedirte apartar

Hay tres reglas y conviene conocerlas antes de toparse con ellas.

**No puedes apartar con demasiada anticipación.** El sistema limita cuántos días
antes se puede reservar, para que nadie acapare el calendario del semestre
entero. Si te pasas, te dice cuál es el máximo.

![Aviso al exceder la anticipación permitida](capturas/s2-04-anticipacion.png)

**No puedes tener demasiadas reservaciones activas a la vez.** Cuando alcanzas
el tope, el sistema te lo indica y te pide liberar alguna antes de pedir otra.

![Aviso al alcanzar el límite de reservaciones activas](capturas/s2-05-limite.png)

**No puedes apartar un horario que ya está ocupado.** El bloque ni siquiera
aparece como botón; se ve con el nombre de quien lo apartó.

![Un bloque ya ocupado por otro docente](capturas/s2-09-calendario-ocupado.png)

Los valores exactos de estas reglas —cuántos días de anticipación, cuántas
reservaciones a la vez— los fija la coordinación y pueden cambiar. El sistema
siempre te dice cuál es el valor vigente cuando lo topas.

### Seguir tus solicitudes

En **Mis solicitudes** está todo lo que has pedido, con su estado actual.

![Seguimiento de las solicitudes propias](capturas/s2-06-mis-solicitudes.png)

Los estados que puede tener una solicitud son ocho:

| Estado | Qué significa |
|---|---|
| **Solicitada** | La enviaste y el encargado todavía no la resuelve |
| **Aprobada** | El laboratorio está apartado a tu nombre |
| **Rechazada** | No se autorizó; el detalle trae el motivo |
| **Confirmada** | Aprobada y además confirmaste que sí la vas a usar |
| **En curso** | Registraste tu asistencia y la sesión está ocurriendo |
| **Cumplida** | Usaste el laboratorio |
| **Cancelada** | La cancelaste tú a tiempo |
| **No asistió** | Nadie registró asistencia y el horario se liberó |

Si te rechazaron una solicitud, ábrela: el motivo que escribió el encargado está
ahí.

![Detalle de una solicitud rechazada con su motivo](capturas/s2-10-detalle-rechazo.png)

### Tus avisos

La sección **Avisos** te dice lo que pasó sin que tengas que entrar a revisar.
El menú muestra cuántos llevas sin leer.

![Bandeja de avisos del docente](capturas/s4-03-bandeja-avisos.png)

Recibes aviso en cuatro momentos: cuando registras una solicitud, cuando el
encargado la aprueba, cuando la rechaza —con el motivo— y cuando el sistema
libera una reservación tuya por inasistencia.

### Confirmar o cancelar desde el recordatorio

Un día antes de tu reservación, y otra vez una hora antes, recibes un
recordatorio con dos botones.

![Recordatorio con las acciones de confirmar y cancelar](capturas/s4-04-recordatorio.png)

**Confirmar** conserva el horario y deja constancia de que sigues pensando ir.
**Cancelar la reservación** la libera para que otro compañero la aproveche, y
dentro del plazo permitido no te cuenta como falta.

![Confirmación registrada](capturas/s4-05-confirmada.png)

**Confirmar no sustituye registrar tu asistencia.** Es la confusión más común:
confirmar dice "sigo pensando ir"; el check-in del día dice "estoy aquí". Solo
el segundo evita la falta.

### Registrar tu asistencia al llegar

El día de tu reservación, al llegar al laboratorio, entra a **Mis solicitudes** y
oprime **Registrar asistencia**. La reservación pasa a *En curso*.

![Registro de asistencia dentro de la tolerancia](capturas/s3-05-checkin.png)

Tienes una **ventana de tolerancia** después de la hora de inicio. Antes de la
hora no se puede registrar —el sistema te dice a partir de cuándo— y pasada la
tolerancia tampoco, porque para entonces el horario ya se liberó y quedó una
falta a tu nombre.

### Cancelar a tiempo

Si ya no vas a usar el laboratorio, cancélalo. Desde **Mis solicitudes**, abre la
reservación y oprime cancelar.

![Cancelación de una solicitud](capturas/s3-11-cancelacion.png)

Cancelar **dentro del plazo** no te cuenta como falta. Es deliberado: el sistema
quiere premiar que avises, porque un laboratorio liberado con tiempo lo
aprovecha alguien más. Pasado el plazo ya no puedes cancelar tú; habla con el
encargado.

### Tus faltas y qué pasa si se acumulan

Si apartas un laboratorio y nadie registra asistencia, el sistema lo libera solo
y anota una falta. Las faltas se cuentan dentro de un periodo móvil, no para
siempre.

Al acercarte al umbral, el sistema te lo advierte.

![Advertencia al acumular faltas](capturas/s3-09-advertencia-faltas.png)

Si sigues acumulando, las restricciones son graduales: primero tus solicitudes
pasan a requerir autorización del encargado, y después se suspende por un tiempo
tu posibilidad de apartar con antelación.

![Aviso de suspensión temporal por reincidencia](capturas/s3-10-suspension.png)

La suspensión vence sola. No tienes que pedir que te la quiten.

### Usarlo desde el teléfono

El sistema funciona igual en el teléfono: el menú se vuelve una barra superior y
todo baja a una sola columna.

![El sistema en la pantalla de un teléfono](capturas/12-movil-inicio.png)

Puedes **instalarlo como aplicación**: abre el sistema en el navegador del
teléfono y elige *Agregar a la pantalla de inicio* —en Android está en el menú
del navegador, en iPhone en el botón de compartir—. Queda con su icono y abre
sin la barra del navegador.

![Los avisos en el teléfono](capturas/s4-10-movil-avisos.png)

Instalado o no, el sistema necesita conexión para consultar y guardar. Sin red
te lo dice claramente en vez de mostrarte información vieja.

![Aviso cuando no hay conexión](capturas/11-sin-conexion.png)

---

## Guía del encargado de laboratorios

### Resolver las solicitudes

**Solicitudes por resolver** es tu bandeja. El menú muestra cuántas esperan. Las
solicitudes aparecen ordenadas por fecha de uso: primero lo que ocurre antes.

De cada una ves quién la pide, para qué grupo, con qué motivo, y dos datos que
el sistema calcula para ayudarte a decidir:

- **Conflictos.** Si otra solicitud pide el mismo laboratorio y horario, aparece
  señalada. Así decides con las dos a la vista en lugar de aprobar una y
  descubrir el choque después.
- **Faltas del docente.** Cuántas inasistencias lleva en el periodo vigente.

![Dos solicitudes en conflicto por el mismo horario](capturas/s2-07-conflictos.png)

**Aprobar** aparta el laboratorio y avisa al docente. **Rechazar** te pide un
motivo —es obligatorio— y ese texto es lo que el docente va a leer, así que
conviene que diga algo útil.

Si intentas aprobar una solicitud cuyo horario ya quedó ocupado, el sistema te
lo impide y te dice con cuál choca. No es una advertencia que puedas saltarte:
la regla vive en la base de datos.

![El sistema impide aprobar un empalme](capturas/s2-08-empalme-impedido.png)

### Ver el calendario general

**Calendario general** te muestra todas las reservaciones de un periodo, con
filtro por laboratorio. Es la vista para responder "qué hay esta semana".

![Calendario general de reservaciones](capturas/s3-12-calendario-general.png)

Al abrir una reservación ves su detalle completo, incluida la asistencia: si se
registró, a qué hora y con cuántos minutos de retraso.

![Detalle de una reservación con su asistencia](capturas/s3-13-detalle-reservacion.png)

### Administrar el catálogo de laboratorios

En **Catálogo** das de alta, editas o desactivas laboratorios.

![Catálogo de laboratorios](capturas/05-catalogo.png)

Cada laboratorio tiene clave, nombre, capacidad y ubicación. El sistema valida
lo que capturas: no acepta una clave repetida ni una capacidad en cero.

![Validación al dar de alta un laboratorio](capturas/06-validacion-alta.png)

Los **horarios** de cada laboratorio se definen por día de la semana. Son los
bloques que el docente verá como disponibles.

![Horarios semanales de un laboratorio](capturas/07-horarios.png)

**Al desactivar un laboratorio que tiene reservaciones a futuro**, el sistema te
advierte y te dice exactamente cuáles son, con su folio, fecha, horario y
docente, antes de permitirte confirmar. Desactivar sin ver eso dejaría a varios
docentes sin espacio y sin enterarse.

![Advertencia al desactivar un laboratorio con reservaciones](capturas/09-aviso-baja.png)

### Bloquear un laboratorio por mantenimiento

En **Bloqueos** registras un periodo en que un laboratorio no estará
disponible: mantenimiento, un evento, una reparación. Durante ese rango el
laboratorio no aparece como libre para nadie.

![Registro de un bloqueo por mantenimiento](capturas/s3-03-bloqueos.png)

### Vigilar la asistencia

**Asistencia por docente** concentra la situación de cada uno: reservaciones
cumplidas, faltas vigentes y si tiene alguna restricción activa.

![Asistencia por docente](capturas/s3-08-docentes.png)

Al abrir un docente ves su historial completo, reservación por reservación.

![Historial de asistencia de un docente](capturas/s3-07-historial-docente.png)

**La liberación por inasistencia es automática.** Un proceso revisa cada minuto
las reservaciones cuya tolerancia venció sin check-in: las marca como *No
asistió*, devuelve el horario al calendario y anota la falta. Puedes dispararlo
a mano desde esta pantalla si quieres verlo operar.

![Liberación automática de un laboratorio no utilizado](capturas/s3-06-liberacion.png)

### Ajustar las reglas de préstamo

**Reglas de préstamo** tiene los nueve parámetros que gobiernan el sistema.
Cambiarlos no requiere programar nada ni avisar a nadie.

![Configuración de las reglas de préstamo](capturas/s3-01-parametros.png)

| Clave | Qué controla |
|---|---|
| P-01 | Minutos de tolerancia para registrar el check-in |
| P-02 | Días del periodo en que se cuentan las inasistencias |
| P-03 | Faltas antes de que las solicitudes requieran autorización |
| P-04 | Faltas antes de suspender el apartado con antelación |
| P-05 | Días que dura la suspensión |
| P-06 | Reservaciones activas simultáneas por docente |
| P-07 | Días de anticipación máxima para apartar |
| P-08 | Horas mínimas para cancelar sin que cuente como falta |
| P-09 | Momentos de envío del recordatorio, en horas antes |

Cada parámetro tiene un rango permitido y el sistema lo valida. Todo cambio
queda en bitácora, con quién lo hizo, cuándo, y de qué valor a cuál.

![Bitácora de cambios de los parámetros](capturas/s3-02-bitacora-parametros.png)

El cambio surte efecto de inmediato: la siguiente validación ya usa el valor
nuevo.

---

## Guía de la coordinación

### Los reportes de uso

**Reportes de uso** responde con datos lo que antes se contestaba por
percepción. Arriba, cuatro cifras del periodo que elijas:

- **Tasa de asistencia.** Reservaciones cumplidas sobre las que llegaron a
  apartar horario. No incluye las canceladas a tiempo ni las rechazadas, porque
  esas nunca ocuparon el espacio.
- **Horas-laboratorio desperdiciadas.** Tiempo apartado que nadie usó.
- **Laboratorio más solicitado.**
- **Horario de mayor demanda.**

![Reportes de uso con sus cuatro indicadores](capturas/s4-06-dashboard.png)

Debajo, tres gráficas: demanda por laboratorio separando lo aprovechado de lo
desperdiciado, demanda por franja horaria en el orden en que transcurre el día,
y la evolución diaria de las solicitudes. Al final, una tabla con los mismos
datos en texto.

![Gráficas de demanda y tabla de respaldo](capturas/s4-06b-graficas.png)

### Filtrar

Los tres filtros de arriba —desde, hasta y laboratorio— recalculan todo: las
cuatro cifras, las tres gráficas y la tabla.

![Reporte filtrado por un laboratorio](capturas/s4-08-filtro-laboratorio.png)

Si el periodo que eliges no tiene reservaciones, el sistema te lo dice en
palabras en lugar de dibujar gráficas vacías, que es la forma más fácil de
leer mal un reporte.

![Periodo sin registros](capturas/s4-07-sin-datos.png)

### Exportar

Los tres botones del final descargan archivos CSV que abren en Excel: demanda
por laboratorio, demanda por horario y detalle de reservaciones. **Los archivos
respetan el filtro que tengas puesto**: si estás viendo un solo laboratorio, eso
es lo que se exporta.

---

## Preguntas frecuentes

**Aparté un laboratorio y no me ha llegado la aprobación.**
Las solicitudes las resuelve el encargado de laboratorios; el sistema no aprueba
solo. Revisa en *Mis solicitudes* que siga en estado *Solicitada*.

**Confirmé mi reservación, ¿ya no tengo que hacer nada el día de la clase?**
Sí: tienes que registrar tu asistencia al llegar. Confirmar y asistir son cosas
distintas, y solo la segunda evita la falta.

**Llegué tarde y ya no me deja registrar asistencia.**
La tolerancia venció y el horario se liberó. Habla con el encargado; la falta ya
quedó registrada y solo él puede revisarla.

**Me aparece que estoy suspendido para apartar.**
Acumulaste el número de faltas que marca el parámetro P-04. La suspensión vence
sola después de los días de P-05; el sistema te dice la fecha.

**Ya no voy a usar el laboratorio, ¿qué hago?**
Cancélalo cuanto antes. Dentro del plazo no cuenta como falta y el espacio queda
libre para alguien más.

**¿Puedo apartar un laboratorio para todo el semestre?**
No. El sistema limita la anticipación y el número de reservaciones activas. Es
para que el calendario no lo acapare quien llega primero.

**No me deja entrar con mi correo.**
El sistema solo acepta correos `@uabc.edu.mx` que estén en el padrón. Si el
tuyo es institucional y aun así no entra, pide al encargado que verifique tu
alta en *Usuarios y roles*.

**El sistema no responde.**
Revisa tu conexión: cuando no hay red el sistema lo avisa. Si hay red y aun así
no responde, repórtalo al personal de TI de la facultad.
