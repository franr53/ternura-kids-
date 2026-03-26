-- Migración 017: Gastos vinculados a proveedores + fuente de pago
-- Permite registrar desde Gastos pagos a proveedores con historial y origen del dinero

-- 1. Agregar fuente_pago a gastos
--    Solo aplica cuando metodo_pago = 'efectivo'
--    caja_hoy: descuenta del efectivo del día en caja
--    retiro_anterior: plata retirada días previos, NO afecta caja de hoy
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS fuente_pago TEXT DEFAULT 'caja_hoy'
    CHECK (fuente_pago IN ('caja_hoy', 'retiro_anterior'));

-- 2. Agregar proveedor_id opcional a gastos
--    Cuando está presente, el gasto se registra también como pago al proveedor
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES marcas(id) ON DELETE SET NULL;

-- 3. Agregar gasto_id a pagos_proveedores para trazabilidad
--    Permite saber qué pagos se originaron desde el módulo de Gastos
ALTER TABLE pagos_proveedores
  ADD COLUMN IF NOT EXISTS gasto_id UUID REFERENCES gastos(id) ON DELETE SET NULL;

-- 4. Índice para consultar gastos por proveedor (historial en perfil de proveedor)
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor_id
  ON gastos(proveedor_id)
  WHERE proveedor_id IS NOT NULL;

-- Nota: los gastos existentes sin fuente_pago quedan con DEFAULT 'caja_hoy'
-- para mantener el comportamiento previo en el módulo de Caja.
