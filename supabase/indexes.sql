-- ============================================================
-- ÍNDICES — senior-backend skill
-- Optimización de queries más frecuentes en TernuraKids
-- ============================================================

-- Variantes: búsqueda por código de barras (POS - crítico)
CREATE INDEX IF NOT EXISTS idx_variantes_codigo_barras ON variantes(codigo_barras) WHERE codigo_barras IS NOT NULL;

-- Variantes: todas las variantes de un producto
CREATE INDEX IF NOT EXISTS idx_variantes_producto_id ON variantes(producto_id);

-- Productos: búsqueda por nombre (inventario + POS)
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos USING gin(to_tsvector('spanish', nombre));
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);

-- Ventas: reportes por fecha (muy frecuente)
CREATE INDEX IF NOT EXISTS idx_ventas_creado_en ON ventas(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_caja ON ventas(caja_id) WHERE caja_id IS NOT NULL;

-- Venta items: join con ventas
CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_items_variante ON venta_items(variante_id);

-- Venta pagos: análisis por método
CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta ON venta_pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_pagos_metodo ON venta_pagos(metodo);

-- Fiado: historial por cliente
CREATE INDEX IF NOT EXISTS idx_fiado_cliente ON fiado_movimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fiado_creado_en ON fiado_movimientos(creado_en DESC);

-- Clientes: filtro por deuda
CREATE INDEX IF NOT EXISTS idx_clientes_deuda ON clientes(deuda_total DESC) WHERE deuda_total > 0;
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre) WHERE activo = true;

-- Cajas: búsqueda por fecha y estado
CREATE INDEX IF NOT EXISTS idx_cajas_fecha ON cajas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cajas_estado ON cajas(estado);

-- Ingresos: por proveedor
CREATE INDEX IF NOT EXISTS idx_ingresos_proveedor ON ingresos_mercaderia(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_creado_en ON ingresos_mercaderia(creado_en DESC);

-- Log: búsqueda por usuario y fecha
CREATE INDEX IF NOT EXISTS idx_log_usuario ON log_actividad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_creado_en ON log_actividad(creado_en DESC);
