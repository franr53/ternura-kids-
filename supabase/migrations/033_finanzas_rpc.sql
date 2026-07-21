-- 033_finanzas_rpc.sql
-- RPCs de la pestaña Finanzas: agregaciones del lado del servidor para no bajar
-- un año de filas al navegador. Todas son SOLO LECTURA (SELECT), no mutan datos.
--
-- Criterios (acordados con el usuario):
--   · Vista de CAJA: plata que entró vs plata que salió.
--   · ENTRÓ = contado (venta_pagos con metodo <> 'fiado') + cobros de deuda.
--     OJO: los cobros son abonos con metodo_pago NOT NULL. Los abonos SIN
--     metodo_pago son reversas de devolución/anulación — NO es plata que entró.
--   · SALIÓ = tabla `gastos` únicamente. NO se suma `pagos_proveedores`: un gasto
--     con proveedor se duplica ahí (gastos.proveedor_id + pagos_proveedores.gasto_id,
--     migración 017) y contaría dos veces el mismo egreso.
--   · Gastos agrupados por categoría padre (categorias_gastos.padre_id):
--     'mercaderia' = subcategoría Insumos (compra de ropa para revender)
--     'local'      = padre Local, sin Insumos (servicios, sueldos, alquiler…)
--     'personal'   = padre Personal (gastos de la familia)
--   · Las fechas se comparan sin conversión de timezone, igual que el resto de
--     la app (dashboard_kpis, migración 009), para que los números cuadren.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Resumen de un período (la vista de caja del mes)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION finanzas_resumen_mes(p_inicio DATE, p_fin DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desde     TIMESTAMPTZ := p_inicio::timestamptz;
  v_hasta     TIMESTAMPTZ := (p_fin + 1)::timestamptz;  -- exclusivo
  v_contado   NUMERIC := 0;
  v_cobros    NUMERIC := 0;
  v_merc      NUMERIC := 0;
  v_local     NUMERIC := 0;
  v_personal  NUMERIC := 0;
  v_otros     NUMERIC := 0;
  v_facturado NUMERIC := 0;
  v_costo     NUMERIC := 0;
  v_fiado     NUMERIC := 0;
  v_metodos   JSON;
BEGIN
  -- ENTRÓ: contado (todo lo que no es fiado)
  SELECT COALESCE(SUM(vp.monto), 0) INTO v_contado
  FROM venta_pagos vp
  JOIN ventas v ON v.id = vp.venta_id
  WHERE v.estado = 'completada' AND vp.metodo <> 'fiado'
    AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  -- ENTRÓ: cobros de deuda (abonos reales, no reversas)
  SELECT COALESCE(SUM(monto), 0) INTO v_cobros
  FROM fiado_movimientos
  WHERE tipo = 'abono' AND metodo_pago IS NOT NULL
    AND creado_en >= v_desde AND creado_en < v_hasta;

  -- SALIÓ: gastos clasificados en una sola pasada
  SELECT
    COALESCE(SUM(CASE WHEN grupo = 'mercaderia' THEN monto END), 0),
    COALESCE(SUM(CASE WHEN grupo = 'local'      THEN monto END), 0),
    COALESCE(SUM(CASE WHEN grupo = 'personal'   THEN monto END), 0),
    COALESCE(SUM(CASE WHEN grupo = 'otros'      THEN monto END), 0)
  INTO v_merc, v_local, v_personal, v_otros
  FROM (
    SELECT gs.monto,
      CASE
        WHEN c.id IS NULL                              THEN 'otros'
        WHEN lower(c.nombre) = 'insumos'               THEN 'mercaderia'
        WHEN COALESCE(p.nombre, c.nombre) = 'Local'    THEN 'local'
        WHEN COALESCE(p.nombre, c.nombre) = 'Personal' THEN 'personal'
        ELSE 'otros'
      END AS grupo
    FROM gastos gs
    LEFT JOIN categorias_gastos c ON c.id = gs.categoria_id
    LEFT JOIN categorias_gastos p ON p.id = c.padre_id
    WHERE gs.fecha >= p_inicio AND gs.fecha <= p_fin
  ) x;

  -- Facturado y fiado nuevo del período
  SELECT COALESCE(SUM(total), 0) INTO v_facturado
  FROM ventas
  WHERE estado = 'completada' AND creado_en >= v_desde AND creado_en < v_hasta;

  SELECT COALESCE(SUM(vp.monto), 0) INTO v_fiado
  FROM venta_pagos vp
  JOIN ventas v ON v.id = vp.venta_id
  WHERE v.estado = 'completada' AND vp.metodo = 'fiado'
    AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  -- Costo de la mercadería vendida (para el cruce de reposición)
  SELECT COALESCE(SUM(vi.cantidad * COALESCE(va.precio_costo, 0)), 0) INTO v_costo
  FROM venta_items vi
  JOIN ventas v    ON v.id  = vi.venta_id
  JOIN variantes va ON va.id = vi.variante_id
  WHERE v.estado = 'completada' AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  -- Desglose de cobro por método (contado + cobros de deuda juntos)
  SELECT COALESCE(json_agg(json_build_object('metodo', metodo, 'monto', monto) ORDER BY monto DESC), '[]'::json)
  INTO v_metodos
  FROM (
    SELECT vp.metodo, SUM(vp.monto) AS monto
    FROM venta_pagos vp
    JOIN ventas v ON v.id = vp.venta_id
    WHERE v.estado = 'completada'
      AND v.creado_en >= v_desde AND v.creado_en < v_hasta
    GROUP BY vp.metodo
  ) m;

  RETURN json_build_object(
    'entro_contado',    v_contado,
    'entro_cobros',     v_cobros,
    'entro_total',      v_contado + v_cobros,
    'salio_mercaderia', v_merc,
    'salio_local',      v_local,
    'salio_personal',   v_personal,
    'salio_otros',      v_otros,
    'salio_total',      v_merc + v_local + v_personal + v_otros,
    'quedo',            (v_contado + v_cobros) - (v_merc + v_local + v_personal + v_otros),
    'facturado',        v_facturado,
    'costo_vendido',    v_costo,
    'fiado_nuevo',      v_fiado,
    'por_metodo',       v_metodos
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Evolución mes a mes (default 12 meses, incluyendo el actual)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION finanzas_evolucion(p_meses INT DEFAULT 12)
RETURNS TABLE (
  mes              DATE,
  entro_contado    NUMERIC,
  entro_cobros     NUMERIC,
  salio_mercaderia NUMERIC,
  salio_local      NUMERIC,
  salio_personal   NUMERIC,
  facturado        NUMERIC,
  costo_vendido    NUMERIC,
  fiado_nuevo      NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH meses AS (
    SELECT generate_series(
      (date_trunc('month', CURRENT_DATE) - ((p_meses - 1) || ' months')::interval)::date,
      date_trunc('month', CURRENT_DATE)::date,
      '1 month'::interval
    )::date AS mes
  ),
  ventas_m AS (
    SELECT date_trunc('month', v.creado_en)::date AS mes,
           SUM(v.total) AS facturado
    FROM ventas v
    WHERE v.estado = 'completada'
    GROUP BY 1
  ),
  pagos_m AS (
    SELECT date_trunc('month', v.creado_en)::date AS mes,
           SUM(CASE WHEN vp.metodo <> 'fiado' THEN vp.monto ELSE 0 END) AS contado,
           SUM(CASE WHEN vp.metodo =  'fiado' THEN vp.monto ELSE 0 END) AS fiado
    FROM venta_pagos vp
    JOIN ventas v ON v.id = vp.venta_id
    WHERE v.estado = 'completada'
    GROUP BY 1
  ),
  cobros_m AS (
    SELECT date_trunc('month', creado_en)::date AS mes,
           SUM(monto) AS cobros
    FROM fiado_movimientos
    WHERE tipo = 'abono' AND metodo_pago IS NOT NULL
    GROUP BY 1
  ),
  costo_m AS (
    SELECT date_trunc('month', v.creado_en)::date AS mes,
           SUM(vi.cantidad * COALESCE(va.precio_costo, 0)) AS costo
    FROM venta_items vi
    JOIN ventas v     ON v.id  = vi.venta_id
    JOIN variantes va ON va.id = vi.variante_id
    WHERE v.estado = 'completada'
    GROUP BY 1
  ),
  gastos_m AS (
    SELECT date_trunc('month', g.fecha)::date AS mes,
           SUM(CASE WHEN g.grupo = 'mercaderia' THEN g.monto ELSE 0 END) AS merc,
           SUM(CASE WHEN g.grupo = 'local'      THEN g.monto ELSE 0 END) AS loc,
           SUM(CASE WHEN g.grupo = 'personal'   THEN g.monto ELSE 0 END) AS pers
    FROM (
      SELECT gs.fecha, gs.monto,
        CASE
          WHEN c.id IS NULL                              THEN 'otros'
          WHEN lower(c.nombre) = 'insumos'               THEN 'mercaderia'
          WHEN COALESCE(p.nombre, c.nombre) = 'Local'    THEN 'local'
          WHEN COALESCE(p.nombre, c.nombre) = 'Personal' THEN 'personal'
          ELSE 'otros'
        END AS grupo
      FROM gastos gs
      LEFT JOIN categorias_gastos c ON c.id = gs.categoria_id
      LEFT JOIN categorias_gastos p ON p.id = c.padre_id
    ) g
    GROUP BY 1
  )
  SELECT
    m.mes,
    COALESCE(p.contado, 0)::NUMERIC,
    COALESCE(cb.cobros, 0)::NUMERIC,
    COALESCE(g.merc, 0)::NUMERIC,
    COALESCE(g.loc, 0)::NUMERIC,
    COALESCE(g.pers, 0)::NUMERIC,
    COALESCE(vt.facturado, 0)::NUMERIC,
    COALESCE(ct.costo, 0)::NUMERIC,
    COALESCE(p.fiado, 0)::NUMERIC
  FROM meses m
  LEFT JOIN ventas_m  vt ON vt.mes = m.mes
  LEFT JOIN pagos_m   p  ON p.mes  = m.mes
  LEFT JOIN cobros_m  cb ON cb.mes = m.mes
  LEFT JOIN costo_m   ct ON ct.mes = m.mes
  LEFT JOIN gastos_m  g  ON g.mes  = m.mes
  ORDER BY m.mes;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Gastos por rubro del período, con comparativa contra el mes anterior
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION finanzas_gastos_rubro(p_inicio DATE, p_fin DATE)
RETURNS TABLE (
  nombre         TEXT,
  grupo          TEXT,
  monto          NUMERIC,
  monto_anterior NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH clasificado AS (
    SELECT gs.fecha, gs.monto,
      COALESCE(c.nombre, 'Sin categoría') AS sub,
      CASE
        WHEN c.id IS NULL                              THEN 'Otros'
        WHEN lower(c.nombre) = 'insumos'               THEN 'Mercadería'
        WHEN COALESCE(p.nombre, c.nombre) = 'Local'    THEN 'Local'
        WHEN COALESCE(p.nombre, c.nombre) = 'Personal' THEN 'Personal'
        ELSE 'Otros'
      END AS grupo
    FROM gastos gs
    LEFT JOIN categorias_gastos c ON c.id = gs.categoria_id
    LEFT JOIN categorias_gastos p ON p.id = c.padre_id
  ),
  actual AS (
    SELECT sub, grupo, SUM(monto) AS monto
    FROM clasificado
    WHERE fecha >= p_inicio AND fecha <= p_fin
    GROUP BY sub, grupo
  ),
  previo AS (
    SELECT sub, SUM(monto) AS monto
    FROM clasificado
    WHERE fecha >= (date_trunc('month', p_inicio::timestamp) - INTERVAL '1 month')::date
      AND fecha <  date_trunc('month', p_inicio::timestamp)::date
    GROUP BY sub
  )
  SELECT a.sub::TEXT, a.grupo::TEXT, a.monto::NUMERIC, COALESCE(pv.monto, 0)::NUMERIC
  FROM actual a
  LEFT JOIN previo pv ON pv.sub = a.sub
  ORDER BY a.monto DESC;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Antigüedad de la deuda (FIFO: lo impago son los cargos más recientes)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION finanzas_deuda_antiguedad()
RETURNS TABLE (
  tramo    TEXT,
  orden    INT,
  monto    NUMERIC,
  clientes INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH saldo AS (
    SELECT id AS cliente_id, deuda_total
    FROM clientes
    WHERE deuda_total > 0
  ),
  cargos AS (
    -- acumulado de cargos del más nuevo al más viejo
    SELECT fm.cliente_id, fm.monto, fm.creado_en,
           SUM(fm.monto) OVER (
             PARTITION BY fm.cliente_id ORDER BY fm.creado_en DESC
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS acum
    FROM fiado_movimientos fm
    JOIN saldo s ON s.cliente_id = fm.cliente_id
    WHERE fm.tipo = 'cargo'
  ),
  impagos AS (
    -- de cada cargo, la porción que todavía entra dentro del saldo adeudado
    SELECT c.cliente_id, c.creado_en,
           LEAST(c.monto, GREATEST(s.deuda_total - (c.acum - c.monto), 0)) AS monto_impago
    FROM cargos c
    JOIN saldo s ON s.cliente_id = c.cliente_id
    WHERE (c.acum - c.monto) < s.deuda_total
  ),
  tramos AS (
    SELECT
      CASE
        WHEN (CURRENT_DATE - creado_en::date) <= 30 THEN '0-30 días'
        WHEN (CURRENT_DATE - creado_en::date) <= 60 THEN '31-60 días'
        WHEN (CURRENT_DATE - creado_en::date) <= 90 THEN '61-90 días'
        ELSE '90+ días'
      END AS tramo,
      CASE
        WHEN (CURRENT_DATE - creado_en::date) <= 30 THEN 1
        WHEN (CURRENT_DATE - creado_en::date) <= 60 THEN 2
        WHEN (CURRENT_DATE - creado_en::date) <= 90 THEN 3
        ELSE 4
      END AS orden,
      cliente_id, monto_impago
    FROM impagos
    WHERE monto_impago > 0
  )
  SELECT tramo::TEXT, orden, SUM(monto_impago)::NUMERIC, COUNT(DISTINCT cliente_id)::INT
  FROM tramos
  GROUP BY tramo, orden
  ORDER BY orden;
$$;

GRANT EXECUTE ON FUNCTION finanzas_resumen_mes(DATE, DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION finanzas_evolucion(INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION finanzas_gastos_rubro(DATE, DATE)     TO authenticated;
GRANT EXECUTE ON FUNCTION finanzas_deuda_antiguedad()           TO authenticated;
