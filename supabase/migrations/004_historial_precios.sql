-- Historial de precios: registra cambios de precio_costo y precio_venta en productos
CREATE TABLE IF NOT EXISTS historial_precios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id uuid REFERENCES productos(id) ON DELETE CASCADE,
  precio_costo_anterior numeric,
  precio_venta_anterior numeric,
  precio_costo_nuevo numeric,
  precio_venta_nuevo numeric,
  usuario_id uuid REFERENCES auth.users(id),
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX idx_historial_precios_producto ON historial_precios(producto_id, creado_en DESC);

-- RLS
ALTER TABLE historial_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_precios_read" ON historial_precios
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "historial_precios_insert" ON historial_precios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
