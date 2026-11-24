# Sistema de préstamo de laboratorios de cómputo

Facultad de Ciencias Administrativas · Universidad Autónoma de Baja California, Mexicali

Sistema para apartar los laboratorios de cómputo de la Facultad, resolver las
solicitudes, controlar la asistencia y medir el aprovechamiento de los espacios.

Desarrollado como proyecto de la materia **Administración de Proyectos de
Tecnologías de la Información** de la Maestría en Gestión de Tecnologías de la
Información y la Comunicación, en cuatro sprints de dos semanas.

## Qué resuelve

El préstamo se llevaba en papel, en el cubículo del encargado. De ese medio se
desprenden tres fallas: no se puede consultar sin presentarse, nada impide el
doble apartado, y el desperdicio es invisible. La tercera es la que justifica el
proyecto: un laboratorio apartado y no usado queda bloqueado toda la sesión sin
que quede registro.

El sistema mide ese desperdicio. Sobre 650 reservaciones de demostración arroja
174 horas-laboratorio apartadas y no utilizadas en un semestre, con una tasa de
aprovechamiento de 84.5 %.

## Arquitectura

Tres capas, y una decisión que explica a las otras dos: **las reglas que deben
cumplirse siempre viven en el motor de base de datos, no en la aplicación.**

| Capa | Tecnología | Carpeta |
|---|---|---|
| Portal | React 18 · TypeScript · Vite · PWA | `sistema/portal` |
| Servidor | Node 22 · TypeScript · Express | `sistema/servidor` |
| Base de datos | PostgreSQL 16 | `sistema/bd` |

El empalme de horarios lo impide una restricción de exclusión GiST, no una
consulta previa: falla igual desde la aplicación, desde una consulta escrita a
mano o desde un proceso que todavía nadie ha escrito.

## Puesta en marcha

Los guiones de base de datos se aplican en orden numérico, de `01` a `09`.
El `10` carga datos de demostración y es opcional. El `11` programa en `pg_cron`
los dos procesos que corren cada minuto.

El procedimiento completo de despliegue está en `sistema/E15_despliegue.md`.

- `sistema/E13_manual_usuario.md` · manual de usuario por rol
- `sistema/E14_manual_tecnico.md` · instalación, respaldo y mantenimiento
- `sistema/E15_despliegue.md` · puesta en operación en la nube
- `sistema/MT_memoria_tecnica.md` · qué se construyó y por qué así

## Verificación

259 comprobaciones automatizadas, todas aprobadas: 153 sobre la base de datos
(`sistema/bd/03`, `05`, `07`, `09`) y 106 sobre el portal con un navegador real
(`sistema/pruebas`).

## Autor

Arnulfo Vásquez Romero · arnulfo.vasquez@uabc.edu.mx
