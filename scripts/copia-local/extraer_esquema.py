"""Arma el esquema `public` de prod (Ternura) leyendo el catálogo con ternura-sql (solo SELECT).

No usa pg_dump (no tenemos la contraseña de la base): reconstruye tablas, restricciones,
índices, funciones, triggers y políticas desde pg_catalog. Salida: SQL para la copia local.
"""
import json, subprocess, sys

SQL = "/home/franlerra/.claude/bin/ternura-sql"

def q(sql):
    out = subprocess.run([SQL, sql], capture_output=True, text=True)
    if out.returncode != 0 or not out.stdout.strip().startswith("["):
        sys.exit(f"falló:\n{sql}\n{out.stdout[:500]}{out.stderr[:500]}")
    return json.loads(out.stdout)

def ident(s):
    return '"%s"' % s.replace('"', '""')

partes = ["-- Esquema public de Ternura (prod), reconstruido del catálogo", "SET check_function_bodies = off;", ""]

for r in q("select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as labels from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace group by 1"):
    partes.append(f"CREATE TYPE public.{ident(r['typname'])} AS ENUM ({r['labels']});")

seqs = q("select s.sequencename, s.start_value, s.increment_by, s.last_value from pg_sequences s where s.schemaname='public'")
for r in seqs:
    partes.append(f"CREATE SEQUENCE IF NOT EXISTS public.{ident(r['sequencename'])} START {r['start_value']} INCREMENT {r['increment_by']};")

cols = q("""select c.relname as tabla, a.attnum, a.attname, format_type(a.atttypid,a.atttypmod) as tipo, a.attnotnull,
  pg_get_expr(d.adbin,d.adrelid) as defecto, a.attidentity, a.attgenerated
  from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by 1,2""")
tablas = {}
for r in cols:
    tablas.setdefault(r["tabla"], []).append(r)
for t, cs in tablas.items():
    lineas = []
    for c in cs:
        l = f"  {ident(c['attname'])} {c['tipo']}"
        if c["attgenerated"] == "s":
            l += f" GENERATED ALWAYS AS ({c['defecto']}) STORED"
        elif c["attidentity"] in ("a", "d"):
            l += " GENERATED %s AS IDENTITY" % ("ALWAYS" if c["attidentity"] == "a" else "BY DEFAULT")
        elif c["defecto"] is not None:
            l += f" DEFAULT {c['defecto']}"
        if c["attnotnull"]:
            l += " NOT NULL"
        lineas.append(l)
    partes.append(f"CREATE TABLE public.{ident(t)} (\n" + ",\n".join(lineas) + "\n);")

cons = q("""select c.relname as tabla, co.conname, co.contype, pg_get_constraintdef(co.oid) as def
  from pg_constraint co join pg_class c on c.oid=co.conrelid
  where c.relnamespace='public'::regnamespace and co.contype in ('p','u','c','f','x')
  order by case co.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end, 1, 2""")
for r in cons:
    partes.append(f"ALTER TABLE public.{ident(r['tabla'])} ADD CONSTRAINT {ident(r['conname'])} {r['def']};")

for r in q("""select indexdef from pg_indexes where schemaname='public'
  and indexname not in (select conname from pg_constraint where connamespace='public'::regnamespace)"""):
    partes.append(r["indexdef"] + ";")

for r in seqs:
    if r["last_value"] is not None:
        partes.append(f"SELECT setval('public.{r['sequencename']}', {r['last_value']});")

funcs = q("""select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1""")
for r in funcs:
    partes.append(r["def"].rstrip() + ";")

trig = q("""select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public'
  or exists (select 1 from pg_proc p where p.oid=t.tgfoid and p.pronamespace='public'::regnamespace))""")
for r in trig:
    partes.append(r["def"] + ";")

for r in q("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity"):
    partes.append(f"ALTER TABLE public.{ident(r['relname'])} ENABLE ROW LEVEL SECURITY;")

for r in q("select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public'"):
    roles = r["roles"] if isinstance(r["roles"], list) else r["roles"].strip("{}").split(",")
    l = f"CREATE POLICY {ident(r['policyname'])} ON public.{ident(r['tablename'])} AS {r['permissive']} FOR {r['cmd']} TO {', '.join(roles)}"
    if r["qual"]:
        l += f" USING ({r['qual']})"
    if r["with_check"]:
        l += f" WITH CHECK ({r['with_check']})"
    partes.append(l + ";")

open(sys.argv[1], "w").write("\n".join(partes) + "\n")
print(f"{len(tablas)} tablas, {len(cons)} restricciones, {len(funcs)} funciones, {len(trig)} triggers -> {sys.argv[1]}")
