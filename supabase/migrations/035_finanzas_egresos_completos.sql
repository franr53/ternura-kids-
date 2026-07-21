-- 035_finanzas_egresos_completos.sql
-- FIX de correctitud de la vista de caja: faltaban dos egresos reales.
--
-- Auditoría de flujos (julio 2026) encontró que `gastos` NO es el único libro
-- de egresos. Faltaban:
--
-- 1) PAGOS A PROVEEDORES sin gasto asociado ($824.100 en julio)
--    Dos orígenes, ambos son egreso:
--      · el cliente transfiere DIRECTO al proveedor para cancelar su deuda
--        (procesar_cobro_deuda / procesar_venta): el abono se cuenta como
--        "entró", pero esa plata nunca tocó la caja → sin este egreso el
--        resultado quedaba inflado. Contándolo, neto cero: la verdad.
--      · pagos manuales al proveedor desde su ficha: egreso real que faltaba.
--    Se EXCLUYEN los que tienen gasto_id: esos ya están en `gastos` y sumarlos
--    duplicaría (migración 017 los espeja).
--
-- 2) REINTEGROS EN EFECTIVO por devolución ($55.740 en julio)
--    De `devoluciones`, la parte que se devolvió en plata:
--      total_devuelto − saldo_generado − deuda_revertida
--    (lo que fue a saldo o a revertir deuda no es salida de caja).
--
-- Solo lectura, reemplaza las funciones de la migración 033.

-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION finanzas_resumen_mes(p_inicio DATE, p_fin DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desde     TIMESTAMPTZ := p_inicio::timestamptz;
  v_hasta     TIMESTAMPTZ := (p_fin + 1)::timestamptz;
  v_contado   NUMERIC := 0;
  v_cobros    NUMERIC := 0;
  v_merc      NUMERIC := 0;
  v_local     NUMERIC := 0;
  v_personal  NUMERIC := 0;
  v_otros     NUMERIC := 0;
  v_prov      NUMERIC := 0;
  v_devol     NUMERIC := 0;
  v_facturado NUMERIC := 0;
  v_costo     NUMERIC := 0;
  v_fiado     NUMERIC := 0;
  v_metodos   JSON;
  v_salio     NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(vp.monto), 0) INTO v_contado
  FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
  WHERE v.estado = 'completada' AND vp.metodo <> 'fiado'
    AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  SELECT COALESCE(SUM(monto), 0) INTO v_cobros
  FROM fiado_movimientos
  WHERE tipo = 'abono' AND metodo_pago IS NOT NULL
    AND creado_en >= v_desde AND creado_en < v_hasta;

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

  -- NUEVO: pagos a proveedores que NO vienen de un gasto (si no, duplica)
  SELECT COALESCE(SUM(monto), 0) INTO v_prov
  FROM pagos_proveedores
  WHERE gasto_id IS NULL
    AND creado_en >= v_desde AND creado_en < v_hasta;

  -- NUEVO: reintegros en efectivo por devolución
  SELECT COALESCE(SUM(GREATEST(
           COALESCE(total_devuelto,0) - COALESCE(saldo_generado,0) - COALESCE(deuda_revertida,0), 0)), 0)
  INTO v_devol
  FROM devoluciones
  WHERE creado_en >= v_desde AND creado_en < v_hasta;

  SELECT COALESCE(SUM(total), 0) INTO v_facturado
  FROM ventas WHERE estado = 'completada' AND creado_en >= v_desde AND creado_en < v_hasta;

  SELECT COALESCE(SUM(vp.monto), 0) INTO v_fiado
  FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
  WHERE v.estado = 'completada' AND vp.metodo = 'fiado'
    AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  SELECT COALESCE(SUM(vi.cantidad * COALESCE(va.precio_costo, 0)), 0) INTO v_costo
  FROM venta_items vi
  JOIN ventas v ON v.id = vi.venta_id
  JOIN variantes va ON va.id = vi.variante_id
  WHERE v.estado = 'completada' AND v.creado_en >= v_desde AND v.creado_en < v_hasta;

  SELECT COALESCE(json_agg(json_build_object('metodo', metodo, 'monto', monto) ORDER BY monto DESC), '[]'::json)
  INTO v_metodos
  FROM (
    SELECT vp.metodo, SUM(vp.monto) AS monto
    FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
    WHERE v.estado = 'completada' AND v.creado_en >= v_desde AND v.creado_en < v_hasta
    GROUP BY vp.metodo
  ) m;

  v_salio := v_merc + v_local + v_personal + v_otros + v_prov + v_devol;

  RETURN json_build_object(
    'entro_contado',     v_contado,
    'entro_cobros',      v_cobros,
    'entro_total',       v_contado + v_cobros,
    'salio_mercaderia',  v_merc,
    'salio_local',       v_local,
    'salio_personal',    v_personal,
    'salio_otros',       v_otros,
    'salio_proveedores', v_prov,
    'salio_devoluciones',v_devol,
    'salio_total',       v_salio,
    'quedo',             (v_contado + v_cobros) - v_salio,
    'facturado',         v_facturado,
    'costo_vendido',     v_costo,
    'fiado_nuevo',       v_fiado,
    'por_metodo',        v_metodos
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Se agrega la columna salio_proveedores al RETURNS TABLE. Postgres no permite
-- cambiar el tipo de retorno con CREATE OR REPLACE → hay que dropear primero.
DROP FUNCTION IF EXISTS finanzas_evolucion(INT);

CREATE FUNCTION finanzas_evolucion(p_meses INT DEFAULT 12)
RETURNS TABLE (
  mes               DATE,
  entro_contado     NUMERIC,
  entro_cobros      NUMERIC,
  salio_mercaderia  NUMERIC,
  salio_local       NUMERIC,
  salio_personal    NUMERIC,
  salio_proveedores NUMERIC,
  facturado         NUMERIC,
  costo_vendido     NUMERIC,
  fiado_nuevo       NUMERIC
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
    SELECT date_trunc('month', v.creado_en)::date AS mes, SUM(v.total) AS facturado
    FROM ventas v WHERE v.estado = 'completada' GROUP BY 1
  ),
  pagos_m AS (
    SELECT date_trunc('month', v.creado_en)::date AS mes,
           SUM(CASE WHEN vp.metodo <> 'fiado' THEN vp.monto ELSE 0 END) AS contado,
           SUM(CASE WHEN vp.metodo =  'fiado' THEN vp.monto ELSE 0 END) AS fiado
    FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
    WHERE v.estado = 'completada' GROUP BY 1
  ),
  cobros_m AS (
    SELECT date_trunc('month', creado_en)::date AS mes, SUM(monto) AS cobros
    FROM fiado_movimientos
    WHERE tipo = 'abono' AND metodo_pago IS NOT NULL GROUP BY 1
  ),
  costo_m AS (
    SELECT date_trunc('month', v.creado_en)::date AS mes,
           SUM(vi.cantidad * COALESCE(va.precio_costo, 0)) AS costo
    FROM venta_items vi
    JOIN ventas v ON v.id = vi.venta_id
    JOIN variantes va ON va.id = vi.variante_id
    WHERE v.estado = 'completada' GROUP BY 1
  ),
  prov_m AS (
    SELECT date_trunc('month', creado_en)::date AS mes, SUM(monto) AS prov
    FROM pagos_proveedores WHERE gasto_id IS NULL GROUP BY 1
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
  SELECT m.mes,
    COALESCE(p.contado, 0)::NUMERIC,
    COALESCE(cb.cobros, 0)::NUMERIC,
    COALESCE(g.merc, 0)::NUMERIC,
    COALESCE(g.loc, 0)::NUMERIC,
    COALESCE(g.pers, 0)::NUMERIC,
    COALESCE(pr.prov, 0)::NUMERIC,
    COALESCE(vt.facturado, 0)::NUMERIC,
    COALESCE(ct.costo, 0)::NUMERIC,
    COALESCE(p.fiado, 0)::NUMERIC
  FROM meses m
  LEFT JOIN ventas_m vt ON vt.mes = m.mes
  LEFT JOIN pagos_m  p  ON p.mes  = m.mes
  LEFT JOIN cobros_m cb ON cb.mes = m.mes
  LEFT JOIN costo_m  ct ON ct.mes = m.mes
  LEFT JOIN prov_m   pr ON pr.mes = m.mes
  LEFT JOIN gastos_m g  ON g.mes  = m.mes
  ORDER BY m.mes;
$$;

GRANT EXECUTE ON FUNCTION finanzas_resumen_mes(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION finanzas_evolucion(INT)          TO authenticated;
