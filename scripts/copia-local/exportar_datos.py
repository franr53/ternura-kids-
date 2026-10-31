"""Baja los datos de prod (solo SELECT con ternura-sql) y arma el SQL de carga para la copia local.

Excluye columnas generadas, carga con session_replication_role=replica (sin triggers ni FK
mientras carga) y deja los datos personales reemplazados por inventados (ver anonimizar.sql).
"""
import json, subprocess, sys, secrets

SQL = "/home/franlerra/.claude/bin/ternura-sql"
def q(sql):
    out = subprocess.run([SQL, sql], capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip().startswith("["):
        sys.exit(f"falló:\n{sql}\n{out.stdout[:400]}{out.stderr[:400]}")
    return json.loads(out.stdout)

VACIAR = {"asistente_consultas", "log_actividad"}  # texto libre con datos de clientas: no se copia
cols = q("""select c.relname as tabla, string_agg(quote_ident(a.attname), ',' order by a.attnum) as cols,
  bool_or(a.attidentity='a') as identidad
  from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attgenerated=''
  where c.relnamespace='public'::regnamespace and c.relkind='r' group by 1 order by 1""")
salida = ["SET session_replication_role = replica;"]
total = 0
for r in cols:
    t = r["tabla"]
    if t in VACIAR:
        continue
    filas = q(f"select coalesce(json_agg(x), '[]'::json) as j from (select {r['cols']} from public.{t}) x")[0]["j"]
    if not filas:
        continue
    total += len(filas)
    tag = "$d" + secrets.token_hex(4) + "$"
    over = " OVERRIDING SYSTEM VALUE" if r["identidad"] else ""
    salida.append(f"INSERT INTO public.{t} ({r['cols']}){over} SELECT {r['cols']} FROM json_populate_recordset(null::public.{t}, {tag}{json.dumps(filas, ensure_ascii=False)}{tag});")
    print(f"{t}: {len(filas)}")
salida.append("SET session_replication_role = origin;")
open(sys.argv[1], "w").write("\n".join(salida) + "\n")
print(f"total {total} filas -> {sys.argv[1]}")
