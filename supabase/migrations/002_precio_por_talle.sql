-- ============================================================
-- Migración 002: Precio de venta y costo opcionales por talle
-- Si una variante tiene precio propio, tiene prioridad sobre el producto.
-- Si es NULL, se usa el precio del producto.
-- ============================================================

ALTER TABLE variantes
  ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS precio_costo NUMERIC(12,2) NULL;

-- Índice para búsquedas por precio
CREATE INDEX IF NOT EXISTS idx_variantes_precio_venta ON variantes(precio_venta) WHERE precio_venta IS NOT NULL;
