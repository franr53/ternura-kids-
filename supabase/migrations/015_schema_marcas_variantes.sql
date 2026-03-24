-- ════════════════════════════════════════════════════════════════
-- 015_schema_marcas_variantes.sql
-- Refactor: proveedores→marcas, precios→variantes, colegios, nombre_base
-- APLICAR MANUALMENTE en Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- ① Nueva tabla colegios (para categoría Colegial)
CREATE TABLE IF NOT EXISTS colegios (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    TEXT NOT NULL UNIQUE,
  activo    BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE colegios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos leen colegios"  ON colegios FOR SELECT USING (true);
CREATE POLICY "Solo admin modifica colegios" ON colegios FOR ALL USING (es_admin());

-- ② Renombrar tabla proveedores → marcas
-- Las FK constraints de otras tablas (pagos_proveedores, ingresos_mercaderia)
-- siguen válidas porque PostgreSQL trackea FKs por OID, no por nombre de tabla.
ALTER TABLE proveedores RENAME TO marcas;

-- ③ Migrar precios productos → variantes ANTES de borrar columnas
-- COALESCE: si la variante ya tenía precio propio, lo respeta; si no, toma el del producto.
UPDATE variantes v
SET precio_costo = COALESCE(v.precio_costo, p.precio_costo, 0),
    precio_venta = COALESCE(v.precio_venta, p.precio_venta, 0)
FROM productos p
WHERE v.producto_id = p.id;

-- ④ Cambios en tabla productos
ALTER TABLE productos RENAME COLUMN nombre       TO nombre_base;
ALTER TABLE productos RENAME COLUMN proveedor_id TO marca_id;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS colegio_id UUID REFERENCES colegios(id);
ALTER TABLE productos DROP COLUMN IF EXISTS precio_costo;
ALTER TABLE productos DROP COLUMN IF EXISTS precio_venta;

-- ⑤ Índice para colegio_id
CREATE INDEX IF NOT EXISTS idx_productos_colegio_id ON productos(colegio_id);

-- ⑥ Verificación (ejecutar por separado para ver resultados)
-- SELECT id, nombre_base, marca_id, colegio_id FROM productos LIMIT 5;
-- SELECT id, precio_costo, precio_venta FROM variantes LIMIT 5;
