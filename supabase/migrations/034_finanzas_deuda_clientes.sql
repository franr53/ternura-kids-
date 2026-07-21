-- 034_finanzas_deuda_clientes.sql
-- Antigüedad de la deuda CON detalle por cliente, para poder desplegar cada
-- tramo y ver quiénes son. Reemplaza en uso a finanzas_deuda_antiguedad (033),
-- que queda en la base pero ya no la consulta la app.
--
-- Misma lógica FIFO: lo que sigue impago son los cargos MÁS RECIENTES de cada
-- cliente, hasta cubrir su deuda_total actual. Solo lectura.

CREATE OR REPLACE FUNCTION finanzas_deuda_clientes()
RETURNS TABLE (
  cliente_id  UUID,
  nombre      TEXT,
  tramo       TEXT,
  orden       INT,
  monto       NUMERIC,
  dias        INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH saldo AS (
    SELECT id AS cliente_id, nombre, deuda_total
    FROM clientes
    WHERE deuda_total > 0
  ),
  cargos AS (
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
    SELECT c.cliente_id, s.nombre, c.creado_en,
           LEAST(c.monto, GREATEST(s.deuda_total - (c.acum - c.monto), 0)) AS monto_impago
    FROM cargos c
    JOIN saldo s ON s.cliente_id = c.cliente_id
    WHERE (c.acum - c.monto) < s.deuda_total
  ),
  -- un cliente puede tener cargos impagos en distintos tramos: se agrupa por
  -- cliente + tramo para no repetir filas.
  clasificado AS (
    SELECT cliente_id, nombre, monto_impago,
      (CURRENT_DATE - creado_en::date) AS dias,
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
      END AS orden
    FROM impagos
    WHERE monto_impago > 0
  )
  SELECT cliente_id, nombre::TEXT, tramo::TEXT, orden,
         SUM(monto_impago)::NUMERIC AS monto,
         MAX(dias)::INT AS dias
  FROM clasificado
  GROUP BY cliente_id, nombre, tramo, orden
  ORDER BY orden, monto DESC;
$$;

GRANT EXECUTE ON FUNCTION finanzas_deuda_clientes() TO authenticated;
