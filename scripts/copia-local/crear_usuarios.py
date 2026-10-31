"""Crea en la copia LOCAL las dos cuentas de prueba (mamá admin y vendedora) y sus perfiles."""
import json, secrets, subprocess, urllib.request

env = dict(l.strip().split("=", 1) for l in open("local.env") if "=" in l)
env = {k: v.strip('"') for k, v in env.items()}
assert env["API_URL"].startswith("http://127.0.0.1"), "esto es sólo para la copia local"

def admin(path, body):
    req = urllib.request.Request(env["API_URL"] + path, data=json.dumps(body).encode(), method="POST",
        headers={"apikey": env["SERVICE_ROLE_KEY"], "Authorization": "Bearer " + env["SERVICE_ROLE_KEY"], "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

cuentas = []
for email, nombre, rol in [("mama@ternura.local", "Mamá (prueba)", "admin"), ("vendedora@ternura.local", "Vendedora (prueba)", "vendedor")]:
    clave = "tk-" + secrets.token_urlsafe(9)
    u = admin("/auth/v1/admin/users", {"email": email, "password": clave, "email_confirm": True})
    cuentas.append({"email": email, "password": clave, "id": u["id"], "nombre": nombre, "rol": rol})

sql = "".join(f"INSERT INTO public.perfiles (id, nombre, rol) VALUES ('{c['id']}', '{c['nombre']}', '{c['rol']}');\n" for c in cuentas)
subprocess.run(["docker", "exec", "-i", "supabase_db_ternura-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], input=sql, text=True, check=True)
json.dump(cuentas, open("usuarios-locales.json", "w"), indent=2)
print("cuentas:", ", ".join(f"{c['email']} ({c['rol']})" for c in cuentas))
