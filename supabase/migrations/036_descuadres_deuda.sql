-- 036_descuadres_deuda.sql
-- Deja de perder información cuando un saldo se trunca en cero, y agrega una
-- auditoría que detecta descuadres vengan de donde vengan.
--
-- Contexto: 12 lugares usan GREATEST(0, deuda - monto) para que el saldo no
-- quede negativo. Está bien que no quede negativo (rompería la app), pero hoy
-- el excedente se pierde en silencio: nadie se entera de que un pago superó la
-- deuda, ni de cuánto.
--
-- Enfoque de bajo riesgo: NO se tocan los RPC de venta, devolución ni cambio
-- (corren en el mostrador; un error ahí corta una operación con la clienta
-- enfrente). Se registra el excedente en `ajustar_deuda_marca` —que es de tres
-- líneas— y se agrega `auditoria_descuadres()`, que compara el saldo guardado
-- contra el libro de movimientos y encuentra CUALQUIER desvío, incluidos los
-- que provienen de caminos que no modificamos.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Bitácora de excedentes
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS descuadres_deuda (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       TEXT NOT NULL CHECK (tipo IN ('cliente','marca')),
  entidad_id UUID NOT NULL,
  -- cuánto se quiso descontar por debajo de cero (siempre positivo)
  excedente  NUMERIC(12,2) NOT NULL CHECK (excedente > 0),
  saldo_previo NUMERIC(12,2) NOT NULL,
  operacion  TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_descuadres_entidad ON descuadres_deuda(tipo, entidad_id, creado_en DESC);

ALTER TABLE descuadres_deuda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read" ON descuadres_deuda;
CREATE POLICY "auth_read" ON descuadres_deuda FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ajustar_deuda_marca: mismo comportamiento visible, pero deja rastro
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ajustar_deuda_marca(p_marca_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previo NUMERIC;
  v_nuevo  NUMERIC;
BEGIN
  SELECT deuda_total INTO v_previo FROM marcas WHERE id = p_marca_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_nuevo := v_previo + p_delta;

  -- El saldo nunca queda negativo (igual que antes), pero ahora se registra
  -- cuánto se quiso descontar de más, para poder revisarlo después.
  IF v_nuevo < 0 THEN
    INSERT INTO descuadres_deuda (tipo, entidad_id, excedente, saldo_previo, operacion)
    VALUES ('marca', p_marca_id, -v_nuevo, v_previo, 'ajustar_deuda_marca');
    v_nuevo := 0;
  END IF;

  UPDATE marcas SET deuda_total = v_nuevo WHERE id = p_marca_id;
  RETURN v_nuevo::INTEGER;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Auditoría: saldo guardado vs libro de movimientos
--    Detecta descuadres de cualquier origen, incluidos los caminos que no
--    modificamos (devoluciones, cambios, importaciones, ediciones manuales).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auditoria_descuadres()
RETURNS TABLE (
  tipo        TEXT,
  entidad_id  UUID,
  nombre      TEXT,
  guardado    NUMERIC,
  libro       NUMERIC,
  diferencia  NUMERIC,
  movimientos INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- El ORDER BY va afuera del UNION: Postgres no admite expresiones sobre las
  -- columnas de salida dentro de una consulta con UNION.
  SELECT * FROM (
  -- Clientes: deuda_total contra Σ(cargos) − Σ(abonos)
  SELECT
    'cliente'::TEXT AS tipo,
    c.id AS entidad_id,
    c.nombre::TEXT AS nombre,
    COALESCE(c.deuda_total,0)::NUMERIC AS guardado,
    COALESCE(l.saldo,0)::NUMERIC AS libro,
    (COALESCE(c.deuda_total,0) - GREATEST(COALESCE(l.saldo,0),0))::NUMERIC AS diferencia,
    COALESCE(l.n,0)::INT AS movimientos
  FROM clientes c
  LEFT JOIN (
    SELECT cliente_id,
           SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END) AS saldo,
           COUNT(*) AS n
    FROM fiado_movimientos GROUP BY cliente_id
  ) l ON l.cliente_id = c.id
  WHERE ABS(COALESCE(c.deuda_total,0) - GREATEST(COALESCE(l.saldo,0),0)) >= 1

  UNION ALL

  -- Marcas: deuda_total contra Σ(ingresos) − Σ(pagos)
  SELECT
    'marca'::TEXT,
    m.id,
    m.nombre::TEXT,
    COALESCE(m.deuda_total,0)::NUMERIC,
    (COALESCE(i.tot,0) - COALESCE(p.tot,0))::NUMERIC,
    (COALESCE(m.deuda_total,0) - GREATEST(COALESCE(i.tot,0) - COALESCE(p.tot,0),0))::NUMERIC,
    (COALESCE(i.n,0) + COALESCE(p.n,0))::INT
  FROM marcas m
  LEFT JOIN (SELECT proveedor_id, SUM(total) tot, COUNT(*) n FROM ingresos_mercaderia GROUP BY proveedor_id) i ON i.proveedor_id = m.id
  LEFT JOIN (SELECT proveedor_id, SUM(monto) tot, COUNT(*) n FROM pagos_proveedores  GROUP BY proveedor_id) p ON p.proveedor_id = m.id
  WHERE ABS(COALESCE(m.deuda_total,0) - GREATEST(COALESCE(i.tot,0) - COALESCE(p.tot,0),0)) >= 1
  ) x
  ORDER BY ABS(x.diferencia) DESC;
$$;

GRANT EXECUTE ON FUNCTION ajustar_deuda_marca(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION auditoria_descuadres()             TO authenticated;
