-- Fix RLS: ingresos de mercadería y pagos a proveedores
-- deben poder ser creados por cualquier usuario autenticado (no solo admin)

-- Ingresos mercadería
DROP POLICY IF EXISTS "ingresos_write" ON ingresos_mercaderia;
CREATE POLICY "ingresos_insert" ON ingresos_mercaderia FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ingresos_update" ON ingresos_mercaderia FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "ingresos_delete" ON ingresos_mercaderia FOR DELETE TO authenticated USING (es_admin());

-- Ingreso items
DROP POLICY IF EXISTS "ingreso_items_write" ON ingreso_items;
CREATE POLICY "ingreso_items_insert" ON ingreso_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ingreso_items_update" ON ingreso_items FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "ingreso_items_delete" ON ingreso_items FOR DELETE TO authenticated USING (es_admin());

-- Pagos a proveedores
DROP POLICY IF EXISTS "pagos_prov_write" ON pagos_proveedores;
CREATE POLICY "pagos_prov_insert" ON pagos_proveedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pagos_prov_update" ON pagos_proveedores FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "pagos_prov_delete" ON pagos_proveedores FOR DELETE TO authenticated USING (es_admin());

-- Proveedores: permitir UPDATE a cualquier autenticado (para actualizar deuda_total)
DROP POLICY IF EXISTS "proveedores_write" ON proveedores;
CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE TO authenticated USING (es_admin());
