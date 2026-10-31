# Copia local de Ternura (para auditar y medir sin tocar prod)

Arma una Supabase local con la estructura y los datos de prod, con los datos personales de las
clientas cambiados por inventados. Todo lo que se lee de prod es con consultas `SELECT` por el
helper de solo lectura `ternura-sql`; nada escribe en prod.

1. `supabase init` + `supabase start` en una carpeta aparte (Docker). Postgres 17, como prod.
2. `python3 -I extraer_esquema.py esquema-prod.sql` → estructura reconstruida del catálogo
   (sin la contraseña de la base no hay `pg_dump`): tablas, restricciones, índices, funciones,
   triggers, RLS y políticas.
3. `python3 -I exportar_datos.py datos-prod.sql` → datos de prod. **Este archivo tiene datos
   personales: no se commitea ni se comparte; borrarlo después de cargar.**
4. Cargar en orden con `psql` dentro del contenedor: `esquema-prod.sql`, `datos-prod.sql`,
   `anonimizar.sql`.
5. `supabase status -o env > local.env` y `python3 -I crear_usuarios.py` → cuentas de prueba
   madre (admin) y vendedora en `usuarios-locales.json` (no se commitea).
6. La app: `.env.local` con la URL y la anon key **locales**, `next build` + `next start`
   (el servidor de desarrollo en WSL sirve versiones viejas).

`productos_prueba.sql` suma 120 productos para pasar los 1.000 activos; `borrar_productos_prueba.sql`
los saca junto con las ventas de prueba que los usaron.
