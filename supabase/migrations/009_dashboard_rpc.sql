-- RPC para KPIs del dashboard: reemplaza 6 queries paralelas por 1
CREATE OR REPLACE FUNCTION dashboard_kpis(p_fecha_hoy TEXT, p_inicio_mes TEXT, p_inicio_ayer TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'ventas_hoy', COALESCE((
      SELECT SUM(total) FROM ventas
      WHERE estado = 'completada' AND creado_en >= (p_fecha_hoy || 'T00:00:00')::timestamp
    ), 0),
    'ventas_ayer', COALESCE((
      SELECT SUM(total) FROM ventas
      WHERE estado = 'completada'
        AND creado_en >= (p_inicio_ayer || 'T00:00:00')::timestamp
        AND creado_en < (p_fecha_hoy || 'T00:00:00')::timestamp
    ), 0),
    'ventas_mes', COALESCE((
      SELECT SUM(total) FROM ventas
      WHERE estado = 'completada' AND creado_en >= (p_inicio_mes || 'T00:00:00')::timestamp
    ), 0),
    'count_ventas_mes', (
      SELECT COUNT(*) FROM ventas
      WHERE estado = 'completada' AND creado_en >= (p_inicio_mes || 'T00:00:00')::timestamp
    ),
    'clientes_deuda', (
      SELECT COUNT(*) FROM clientes WHERE deuda_total > 0
    ),
    'variantes_sin_stock', (
      SELECT COUNT(*) FROM variantes WHERE stock = 0
    )
  ) INTO result;
  RETURN result;
END;
$$;
