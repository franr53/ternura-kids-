-- 037_rubros_con_proveedores.sql
-- Los pagos a proveedores cargados fuera de `gastos` (desde la ficha del
-- proveedor, o transferidos por un cliente) ya se contaban en la caja de
-- Finanzas, pero seguían faltando en el ANÁLISIS de gastos: no aparecían en el
-- desglose por rubro ni en los porcentajes.
--
-- Se suman como un rubro más, dentro del grupo Mercadería, que es lo que son:
-- compra de ropa para revender. Se excluyen los que tienen gasto_id porque
-- esos ya vienen por `gastos` (si no, se contarían dos veces).
--
-- Solo lectura. Reemplaza la función de la migración 033.

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
  WITH
  -- rango del mes anterior, para la comparativa
  prev AS (
    SELECT (date_trunc('month', p_inicio::timestamp) - INTERVAL '1 month')::date AS ini,
           (date_trunc('month', p_inicio::timestamp) - INTERVAL '1 day')::date    AS fin
  ),
  clasificado AS (
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
  -- pagos a proveedores que NO pasaron por `gastos`
  pagos AS (
    SELECT creado_en::date AS fecha, monto,
           'Pagos a proveedores'::TEXT AS sub,
           'Mercadería'::TEXT AS grupo
    FROM pagos_proveedores
    WHERE gasto_id IS NULL
  ),
  todo AS (
    SELECT fecha, monto, sub, grupo FROM clasificado
    UNION ALL
    SELECT fecha, monto, sub, grupo FROM pagos
  ),
  actual AS (
    SELECT sub, grupo, SUM(monto) AS monto
    FROM todo
    WHERE fecha >= p_inicio AND fecha <= p_fin
    GROUP BY sub, grupo
  ),
  previo AS (
    SELECT t.sub, SUM(t.monto) AS monto
    FROM todo t, prev
    WHERE t.fecha >= prev.ini AND t.fecha <= prev.fin
    GROUP BY t.sub
  )
  SELECT a.sub::TEXT, a.grupo::TEXT, a.monto::NUMERIC, COALESCE(pv.monto, 0)::NUMERIC
  FROM actual a
  LEFT JOIN previo pv ON pv.sub = a.sub
  ORDER BY a.monto DESC;
$$;

GRANT EXECUTE ON FUNCTION finanzas_gastos_rubro(DATE, DATE) TO authenticated;
