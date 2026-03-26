-- Migración 018: corregir RLS en tipos_prenda y colegios
-- La política anterior bloqueaba INSERT a usuarios no-admin (vendedores)
-- Regla: cualquier autenticado puede leer e insertar/actualizar; solo admin puede eliminar

-- tipos_prenda
DROP POLICY IF EXISTS "Solo admin modifica tipos_prenda" ON tipos_prenda;

CREATE POLICY "Autenticados insertan tipos_prenda"
  ON tipos_prenda FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan tipos_prenda"
  ON tipos_prenda FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Solo admin elimina tipos_prenda"
  ON tipos_prenda FOR DELETE TO authenticated USING (es_admin());

-- colegios (misma lógica)
DROP POLICY IF EXISTS "Solo admin modifica colegios" ON colegios;

CREATE POLICY "Autenticados insertan colegios"
  ON colegios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados actualizan colegios"
  ON colegios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Solo admin elimina colegios"
  ON colegios FOR DELETE TO authenticated USING (es_admin());
