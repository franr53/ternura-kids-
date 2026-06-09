-- Migración 030: en procesar_cambio, las prendas NUEVAS también se valúan al precio
-- efectivo (mismo factor de descuento que la venta original).
--
-- Contexto: la 029 corrigió el monto DEVUELTO para que use lo realmente pagado. Pero las
-- prendas nuevas seguían a precio de LISTA, así que un cambio de una venta con 20% efectivo
-- comparaba "lo devuelto con descuento" contra "lo nuevo a lista" → diferencia inconsistente.
--
-- Decisión (dueña): el cambio se valúa en los mismos términos de pago que la compra original.
-- Si la venta original fue en efectivo (factor 0.8), las prendas nuevas también van al 80%.
-- Venta original sin descuento → factor 1 → prendas nuevas a precio de lista (sin cambio).
--
-- Único cambio respecto a 029: v_total_nuevo aplica v_factor. No toca datos históricos.

CREATE OR REPLACE FUNCTION procesar_cambio(
  p_venta_original_id  UUID,
  p_items_devueltos    JSONB,   -- [{variante_id, cantidad, precio_unitario}]
  p_items_nuevos       JSONB,   -- [{variante_id, cantidad, precio_unitario}]
  p_resolucion         TEXT     -- 'saldo_favor'|'efectivo'|'transferencia'|'fiado'|'ninguna'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta         RECORD;
  v_cliente_id    UUID;
  v_factor        NUMERIC;
  v_item          JSONB;
  v_variante_id   UUID;
  v_cantidad      INTEGER;
  v_precio_unit   INTEGER;
  v_vi            RECORD;
  v_total_dev     INTEGER := 0;
  v_total_nuevo   INTEGER := 0;
  v_diferencia    INTEGER;
  v_caja_id       UUID;
  v_cambio_id     UUID;
BEGIN

  -- 1. Validar venta original
  SELECT id, cliente_id, total, subtotal INTO v_venta
    FROM ventas WHERE id = p_venta_original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  v_cliente_id := v_venta.cliente_id;

  -- factor de descuento global (lo pagado / subtotal con desc. por ítem ya aplicado)
  IF v_venta.subtotal IS NOT NULL AND v_venta.subtotal > 0 THEN
    v_factor := v_venta.total::NUMERIC / v_venta.subtotal::NUMERIC;
  ELSE
    v_factor := 1;
  END IF;

  -- 2. Incrementar stock de lo devuelto + sumar monto REALMENTE PAGADO
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_devueltos) LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;

    PERFORM incrementar_stock(v_variante_id, v_cantidad);

    -- precio + descuento por ítem desde la venta original (no confiar en el input)
    SELECT precio_unitario, COALESCE(descuento_item, 0) AS descuento_item
      INTO v_vi
      FROM venta_items
      WHERE venta_id = p_venta_original_id AND variante_id = v_variante_id;

    IF FOUND THEN
      v_total_dev := v_total_dev + ROUND(v_vi.precio_unitario * v_cantidad * (1 - v_vi.descuento_item / 100.0) * v_factor);
    ELSE
      v_total_dev := v_total_dev + ROUND((v_item->>'precio_unitario')::INTEGER * v_cantidad * v_factor);
    END IF;
  END LOOP;

  -- 3. Decrementar stock de lo nuevo + sumar al PRECIO EFECTIVO (mismo factor)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_nuevos) LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;
    v_precio_unit := (v_item->>'precio_unitario')::INTEGER;

    UPDATE variantes SET stock = stock - v_cantidad WHERE id = v_variante_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variante % no encontrada', v_variante_id;
    END IF;

    v_total_nuevo := v_total_nuevo + ROUND(v_precio_unit * v_cantidad * v_factor);
  END LOOP;

  -- 4. Calcular diferencia (positivo = cliente tiene crédito, negativo = cliente paga)
  v_diferencia := v_total_dev - v_total_nuevo;

  -- 5. Buscar caja abierta
  SELECT id INTO v_caja_id FROM cajas WHERE estado = 'abierta' ORDER BY abierta_en DESC LIMIT 1;

  -- 6. Aplicar resolución de la diferencia
  IF p_resolucion = 'saldo_favor' AND v_cliente_id IS NOT NULL AND v_diferencia > 0 THEN
    UPDATE clientes SET saldo_favor = saldo_favor + v_diferencia WHERE id = v_cliente_id;

  ELSIF p_resolucion = 'fiado' AND v_cliente_id IS NOT NULL AND v_diferencia < 0 THEN
    UPDATE clientes SET deuda_total = deuda_total + ABS(v_diferencia) WHERE id = v_cliente_id;
    INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
    VALUES (v_cliente_id, p_venta_original_id, 'cargo', ABS(v_diferencia), 'Cambio de prenda');

  ELSIF (p_resolucion = 'efectivo' OR p_resolucion = 'transferencia') AND v_caja_id IS NOT NULL THEN
    IF p_resolucion = 'efectivo' THEN
      UPDATE cajas SET total_efectivo = total_efectivo + v_diferencia WHERE id = v_caja_id;
    ELSE
      UPDATE cajas SET total_transferencia = total_transferencia + v_diferencia WHERE id = v_caja_id;
    END IF;
  END IF;
  -- 'ninguna' → diferencia == 0, no hacer nada

  -- 7. Si no lleva nada nuevo → anular venta original
  IF jsonb_array_length(p_items_nuevos) = 0 THEN
    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_original_id;
  END IF;

  -- 8. Registrar cambio
  INSERT INTO cambios (
    venta_original_id, cliente_id,
    items_devueltos, items_nuevos,
    total_devuelto, total_nuevo, diferencia,
    resolucion_diferencia
  ) VALUES (
    p_venta_original_id, v_cliente_id,
    p_items_devueltos, p_items_nuevos,
    v_total_dev, v_total_nuevo, v_diferencia,
    p_resolucion
  ) RETURNING id INTO v_cambio_id;

  RETURN jsonb_build_object(
    'cambio_id',      v_cambio_id,
    'total_devuelto', v_total_dev,
    'total_nuevo',    v_total_nuevo,
    'diferencia',     v_diferencia
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_cambio(UUID, JSONB, JSONB, TEXT) TO authenticated;
