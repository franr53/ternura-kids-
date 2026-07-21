-- 038_ingresos_desde_inventario.sql
-- Permite que el alta de mercadería en Inventario deje registrado QUÉ entró,
-- sin tocar la deuda con el proveedor (que se sigue cargando a mano como hoy).
--
-- Hasta ahora `ingresos_mercaderia` tenía un solo uso: "Registrar deuda" desde
-- la ficha del proveedor, un monto suelto que SÍ suma deuda. Si el alta de
-- Inventario empezara a crear ingresos con el mismo significado, la deuda se
-- duplicaría (se carga por los dos lados).
--
-- Solución: distinguir el origen y si afecta o no la deuda.
--   · origen 'manual'     → "Registrar deuda" (afecta_deuda = true)
--   · origen 'inventario' → alta de stock     (afecta_deuda = false)
--
-- Los ingresos existentes quedan como 'manual' + afecta_deuda true, que es
-- exactamente lo que eran. Aditivo: no cambia ningún dato.

ALTER TABLE ingresos_mercaderia
  ADD COLUMN IF NOT EXISTS origen        TEXT    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS afecta_deuda  BOOLEAN NOT NULL DEFAULT true;

-- El proveedor deja de ser obligatorio: en Inventario se puede cargar un
-- producto sin marca asignada y aun así queremos registrar la entrada.
ALTER TABLE ingresos_mercaderia ALTER COLUMN proveedor_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingresos_origen ON ingresos_mercaderia(origen, creado_en DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- La auditoría solo debe considerar los ingresos que efectivamente mueven
-- deuda. Si no, los registros de Inventario aparecerían como descuadre.
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
  SELECT * FROM (
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

    SELECT
      'marca'::TEXT,
      m.id,
      m.nombre::TEXT,
      COALESCE(m.deuda_total,0)::NUMERIC,
      (COALESCE(i.tot,0) - COALESCE(p.tot,0))::NUMERIC,
      (COALESCE(m.deuda_total,0) - GREATEST(COALESCE(i.tot,0) - COALESCE(p.tot,0),0))::NUMERIC,
      (COALESCE(i.n,0) + COALESCE(p.n,0))::INT
    FROM marcas m
    LEFT JOIN (
      SELECT proveedor_id, SUM(total) tot, COUNT(*) n
      FROM ingresos_mercaderia
      WHERE afecta_deuda            -- los de Inventario no mueven deuda
      GROUP BY proveedor_id
    ) i ON i.proveedor_id = m.id
    LEFT JOIN (SELECT proveedor_id, SUM(monto) tot, COUNT(*) n FROM pagos_proveedores GROUP BY proveedor_id) p ON p.proveedor_id = m.id
    WHERE ABS(COALESCE(m.deuda_total,0) - GREATEST(COALESCE(i.tot,0) - COALESCE(p.tot,0),0)) >= 1
  ) x
  ORDER BY ABS(x.diferencia) DESC;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Historial de costo por variante: lo que este registro desbloquea.
-- Cada entrada de mercadería deja su precio de costo fechado, así deja de
-- perderse cuando se pisa `variantes.precio_costo`.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION historial_costo_variante(p_variante_id UUID)
RETURNS TABLE (fecha DATE, cantidad INT, precio_costo NUMERIC, origen TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT im.creado_en::date, ii.cantidad::INT, ii.precio_costo::NUMERIC, im.origen::TEXT
  FROM ingreso_items ii
  JOIN ingresos_mercaderia im ON im.id = ii.ingreso_id
  WHERE ii.variante_id = p_variante_id
  ORDER BY im.creado_en DESC;
$$;

GRANT EXECUTE ON FUNCTION auditoria_descuadres()          TO authenticated;
GRANT EXECUTE ON FUNCTION historial_costo_variante(UUID)  TO authenticated;
