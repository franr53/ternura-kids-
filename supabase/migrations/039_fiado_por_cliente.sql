-- 039_fiado_por_cliente.sql
-- Comparar, cuenta por cuenta, cuánto se llevó fiado cada cliente contra
-- cuánto entregó en el mismo período. Sirve para ver quién paga y quién solo
-- acumula deuda — algo que el total mensual no muestra.
--
-- Criterios consistentes con el resto de Finanzas:
--   · fiado   = cargos del período (lo que se llevó a cuenta)
--   · cobrado = abonos con metodo_pago NOT NULL (los abonos sin método son
--     reversas de devolución, no plata que entró)
--   · saldo   = deuda_total actual del cliente
-- Solo lectura.

CREATE OR REPLACE FUNCTION finanzas_fiado_por_cliente(
  p_inicio DATE,
  p_fin    DATE,
  p_limite INT DEFAULT 12
)
RETURNS TABLE (
  cliente_id UUID,
  nombre     TEXT,
  fiado      NUMERIC,
  cobrado    NUMERIC,
  saldo      NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH mov AS (
    SELECT fm.cliente_id,
           SUM(CASE WHEN fm.tipo = 'cargo' THEN fm.monto ELSE 0 END) AS fiado,
           SUM(CASE WHEN fm.tipo = 'abono' AND fm.metodo_pago IS NOT NULL THEN fm.monto ELSE 0 END) AS cobrado
    FROM fiado_movimientos fm
    WHERE fm.creado_en >= p_inicio::timestamptz
      AND fm.creado_en <  (p_fin + 1)::timestamptz
    GROUP BY fm.cliente_id
  )
  SELECT c.id, c.nombre::TEXT,
         COALESCE(m.fiado,0)::NUMERIC,
         COALESCE(m.cobrado,0)::NUMERIC,
         COALESCE(c.deuda_total,0)::NUMERIC
  FROM mov m
  JOIN clientes c ON c.id = m.cliente_id
  WHERE COALESCE(m.fiado,0) + COALESCE(m.cobrado,0) > 0
  ORDER BY (COALESCE(m.fiado,0) + COALESCE(m.cobrado,0)) DESC
  LIMIT p_limite;
$$;

GRANT EXECUTE ON FUNCTION finanzas_fiado_por_cliente(DATE, DATE, INT) TO authenticated;
