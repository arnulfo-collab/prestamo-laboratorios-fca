#!/usr/bin/env python3
"""Extrae el diccionario de datos directamente del catálogo de PostgreSQL.

El diccionario no se escribe a mano: se lee de la base de datos ya
implementada, de modo que documento y base no puedan contradecirse.
Entregable E-03 · Tarea T-08 · Sprint 1.
"""
import json
import subprocess
from pathlib import Path

PSQL = ["psql", "postgresql://postgres@localhost:5433/postgres", "-tA", "-c"]

CONSULTA_TABLAS = """
SELECT c.relname                                AS tabla,
       obj_description(c.oid, 'pg_class')       AS proposito,
       (SELECT count(*) FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS campos
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'prestamo' AND c.relkind = 'r'
ORDER BY c.relname;
"""

CONSULTA_COLUMNAS = """
SELECT a.attname                                       AS campo,
       format_type(a.atttypid, a.atttypmod)            AS tipo,
       CASE WHEN a.attnotnull THEN 'No' ELSE 'Sí' END  AS nulo,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '')   AS omision,
       coalesce(col_description(a.attrelid, a.attnum), '') AS comentario,
       CASE
         WHEN EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = a.attrelid
                        AND k.contype = 'p' AND a.attnum = ANY (k.conkey)) THEN 'PK'
         WHEN EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = a.attrelid
                        AND k.contype = 'f' AND a.attnum = ANY (k.conkey)) THEN 'FK'
         WHEN EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = a.attrelid
                        AND k.contype = 'u' AND a.attnum = ANY (k.conkey)) THEN 'UQ'
         ELSE ''
       END                                             AS llave
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'prestamo.{tabla}'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
"""

CONSULTA_RESTRICCIONES = """
SELECT c.conname AS restriccion, pg_get_constraintdef(c.oid) AS definicion
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'prestamo' AND c.contype IN ('c', 'x')
ORDER BY t.relname, c.conname;
"""


def consultar(sql):
    """Devuelve las filas como listas. Se pide a PostgreSQL que serialice en
    JSON para que ningún salto de línea dentro de un comentario rompa el
    recorte de las columnas."""
    envoltura = (f"SELECT coalesce(json_agg(t), '[]'::json)::text "
                 f"FROM ({sql.strip().rstrip(';')}) AS t")
    salida = subprocess.run(PSQL + [envoltura], capture_output=True, text=True, check=True).stdout
    return [[("" if v is None else str(v)) for v in fila.values()] for fila in json.loads(salida)]


TIPOS = {
    "character varying": "varchar",
    "timestamp with time zone": "timestamptz",
    "time without time zone": "time",
    "double precision": "float",
}


def tipo_legible(t):
    for largo, corto in TIPOS.items():
        t = t.replace(largo, corto)
    return t.replace("integer", "entero").replace("smallint", "entero corto") \
            .replace("bigint", "entero largo").replace("boolean", "booleano") \
            .replace("text", "texto").replace("date", "fecha").replace("numeric", "decimal")


def main():
    partes = []
    tablas = consultar(CONSULTA_TABLAS)

    partes.append("### Tablas del modelo\n")
    partes.append("| # | Tabla | Campos | Propósito |")
    partes.append("|---|---|---|---|")
    for i, (nombre, desc, ncols) in enumerate(tablas, 1):
        partes.append(f"| {i} | `{nombre}` | {ncols} | {desc} |")
    partes.append("")

    partes.append("### Detalle de los campos\n")
    for nombre, desc, _ in tablas:
        partes.append(f"**`{nombre}`** — {desc}\n")
        partes.append("| Campo | Tipo | Nulo | Llave | Valor por omisión | Descripción |")
        partes.append("|---|---|---|---|---|---|")
        for campo, tipo, nulo, omision, comentario, llave in consultar(
                CONSULTA_COLUMNAS.format(tabla=nombre)):
            om = omision.replace("nextval(", "secuencia(").split("::")[0]
            om = "—" if not om else f"`{om}`"
            partes.append(
                f"| `{campo}` | {tipo_legible(tipo)} | {nulo} | {llave or '—'} | {om} | {comentario or '—'} |")
        partes.append("")

    partes.append("### Reglas de integridad declaradas en el motor\n")
    partes.append("Estas reglas no viven en el código de la aplicación, sino en la propia base "
                  "de datos. Un dato que las incumpla es rechazado sin importar por dónde intente "
                  "entrar, lo que evita que una pantalla mal programada corrompa la información.\n")
    partes.append("| Restricción | Definición |")
    partes.append("|---|---|")
    for nombre, definicion in consultar(CONSULTA_RESTRICCIONES):
        partes.append(f"| `{nombre}` | `{definicion}` |")
    partes.append("")

    Path("diccionario_de_datos.md").write_text("\n".join(partes), encoding="utf-8")
    print(f"Diccionario generado: {len(tablas)} tablas")


if __name__ == "__main__":
    main()
