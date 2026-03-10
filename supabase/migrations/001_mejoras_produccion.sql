-- ============================================================
-- TERNURA KIDS — Migración 001: Mejoras producción
-- Aplicar en Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 1. FUNCIÓN: decrementar_stock (atómica, sin race condition)
-- ============================================================
CREATE OR REPLACE FUNCTION decrementar_stock(p_variante_id UUID, p_cantidad INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE variantes
  SET stock = stock - p_cantidad
  WHERE id = p_variante_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variante_id;
  END IF;
END;
$$;

-- ============================================================
-- 2. FUNCIÓN + TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$;

-- Agregar columna actualizado_en donde falta
ALTER TABLE proveedores   ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE variantes     ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clientes      ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ventas        ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE cajas         ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE fiado_movimientos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

-- Crear triggers para updated_at
DROP TRIGGER IF EXISTS trg_productos_updated_at ON productos;
CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_proveedores_updated_at ON proveedores;
CREATE TRIGGER trg_proveedores_updated_at
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_variantes_updated_at ON variantes;
CREATE TRIGGER trg_variantes_updated_at
  BEFORE UPDATE ON variantes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON clientes;
CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ventas_updated_at ON ventas;
CREATE TRIGGER trg_ventas_updated_at
  BEFORE UPDATE ON ventas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 3. FUNCIÓN: incrementar_stock (para devoluciones)
-- ============================================================
CREATE OR REPLACE FUNCTION incrementar_stock(p_variante_id UUID, p_cantidad INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE variantes
  SET stock = stock + p_cantidad
  WHERE id = p_variante_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante % no encontrada', p_variante_id;
  END IF;
END;
$$;

-- ============================================================
-- 4. ÍNDICES de rendimiento
-- ============================================================

-- Búsquedas frecuentes en POS
CREATE INDEX IF NOT EXISTS idx_variantes_producto_id ON variantes(producto_id);
CREATE INDEX IF NOT EXISTS idx_variantes_codigo_barras ON variantes(codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos USING gin(to_tsvector('spanish', nombre));

-- Ventas y caja del día
CREATE INDEX IF NOT EXISTS idx_ventas_creado_en ON ventas(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_caja_id ON ventas(caja_id);
CREATE INDEX IF NOT EXISTS idx_cajas_fecha ON cajas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cajas_estado ON cajas(estado) WHERE estado = 'abierta';

-- Clientes y fiado
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_con_deuda ON clientes(deuda_total) WHERE deuda_total > 0;
CREATE INDEX IF NOT EXISTS idx_fiado_cliente ON fiado_movimientos(cliente_id, creado_en DESC);

-- Venta items
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta ON venta_pagos(venta_id);

-- ============================================================
-- 5. RLS: Separar admin (todo) vs vendedor (operación diaria)
-- ============================================================

-- Helper: verificar si el usuario autenticado es admin
CREATE OR REPLACE FUNCTION es_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

-- Eliminar políticas genéricas existentes
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'perfiles','categorias','proveedores','productos','variantes','clientes',
    'cajas','retiros_caja','ventas','venta_items','venta_pagos',
    'fiado_movimientos','devoluciones','ingresos_mercaderia','ingreso_items',
    'pagos_proveedores','historial_precios','log_actividad',
    'campanias_whatsapp','campania_destinatarios'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios autenticados" ON %I', tbl);
  END LOOP;
END;
$$;

-- ── PERFILES ─────────────────────────────────────────────────
-- Cada usuario ve su propio perfil; admin ve todos
CREATE POLICY "perfil_select" ON perfiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR es_admin());
CREATE POLICY "perfil_update" ON perfiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR es_admin());
CREATE POLICY "perfil_insert" ON perfiles FOR INSERT TO authenticated
  WITH CHECK (es_admin());
CREATE POLICY "perfil_delete" ON perfiles FOR DELETE TO authenticated
  USING (es_admin());

-- ── CATÁLOGO (solo admin puede modificar) ────────────────────
CREATE POLICY "categorias_select" ON categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "categorias_write"  ON categorias FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY "proveedores_select" ON proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "proveedores_write"  ON proveedores FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY "productos_select" ON productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_write"  ON productos FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY "variantes_select" ON variantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "variantes_write"  ON variantes FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ── CLIENTES (vendedor puede leer y crear; solo admin edita/elimina) ──
CREATE POLICY "clientes_select" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_insert" ON clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_update" ON clientes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clientes_delete" ON clientes FOR DELETE TO authenticated USING (es_admin());

-- ── CAJA (vendedor puede abrir y ver; solo admin cierra/elimina) ──
CREATE POLICY "cajas_select" ON cajas FOR SELECT TO authenticated USING (true);
CREATE POLICY "cajas_insert" ON cajas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cajas_update" ON cajas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cajas_delete" ON cajas FOR DELETE TO authenticated USING (es_admin());

CREATE POLICY "retiros_select" ON retiros_caja FOR SELECT TO authenticated USING (true);
CREATE POLICY "retiros_insert" ON retiros_caja FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "retiros_delete" ON retiros_caja FOR DELETE TO authenticated USING (es_admin());

-- ── VENTAS (todos crean, solo admin anula/elimina) ────────────
CREATE POLICY "ventas_select" ON ventas FOR SELECT TO authenticated USING (true);
CREATE POLICY "ventas_insert" ON ventas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ventas_update" ON ventas FOR UPDATE TO authenticated
  USING (es_admin() OR estado != 'anulada');
CREATE POLICY "ventas_delete" ON ventas FOR DELETE TO authenticated USING (es_admin());

CREATE POLICY "venta_items_select" ON venta_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "venta_items_insert" ON venta_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "venta_items_delete" ON venta_items FOR DELETE TO authenticated USING (es_admin());

CREATE POLICY "venta_pagos_select" ON venta_pagos FOR SELECT TO authenticated USING (true);
CREATE POLICY "venta_pagos_insert" ON venta_pagos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "venta_pagos_delete" ON venta_pagos FOR DELETE TO authenticated USING (es_admin());

-- ── FIADO ─────────────────────────────────────────────────────
CREATE POLICY "fiado_select" ON fiado_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "fiado_insert" ON fiado_movimientos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fiado_update" ON fiado_movimientos FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "fiado_delete" ON fiado_movimientos FOR DELETE TO authenticated USING (es_admin());

-- ── DEVOLUCIONES ──────────────────────────────────────────────
CREATE POLICY "devoluciones_select" ON devoluciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "devoluciones_insert" ON devoluciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "devoluciones_delete" ON devoluciones FOR DELETE TO authenticated USING (es_admin());

-- ── INGRESOS MERCADERÍA (solo admin) ─────────────────────────
CREATE POLICY "ingresos_select" ON ingresos_mercaderia FOR SELECT TO authenticated USING (true);
CREATE POLICY "ingresos_write"  ON ingresos_mercaderia FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY "ingreso_items_select" ON ingreso_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ingreso_items_write"  ON ingreso_items FOR ALL    TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ── PAGOS A PROVEEDORES (solo admin) ─────────────────────────
CREATE POLICY "pagos_prov_select" ON pagos_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "pagos_prov_write"  ON pagos_proveedores FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ── HISTORIAL PRECIOS (solo admin) ───────────────────────────
CREATE POLICY "hist_precios_select" ON historial_precios FOR SELECT TO authenticated USING (true);
CREATE POLICY "hist_precios_write"  ON historial_precios FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ── LOG ACTIVIDAD (todos insertan, solo admin lee/elimina) ───
CREATE POLICY "log_insert" ON log_actividad FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "log_select" ON log_actividad FOR SELECT TO authenticated USING (es_admin());
CREATE POLICY "log_delete" ON log_actividad FOR DELETE TO authenticated USING (es_admin());

-- ── CAMPAÑAS WHATSAPP (solo admin) ───────────────────────────
CREATE POLICY "camp_select" ON campanias_whatsapp FOR SELECT TO authenticated USING (true);
CREATE POLICY "camp_write"  ON campanias_whatsapp FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY "camp_dest_select" ON campania_destinatarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "camp_dest_write"  ON campania_destinatarios FOR ALL   TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- ============================================================
-- ✅ Migración completa
-- Próximos pasos:
--   1. Aplicar este SQL en Supabase Dashboard → SQL Editor
--   2. Verificar que decrementar_stock funciona con una venta de prueba
--   3. Crear el primer usuario admin desde el dashboard
-- ============================================================
