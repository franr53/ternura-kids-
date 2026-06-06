-- Migración 029: corregir cálculo de reintegro en devoluciones y cambios.
--
-- BUG: procesar_devolucion (025) y procesar_cambio (021) calculaban el monto
-- devuelto sobre venta_items.precio_unitario (precio de LISTA), ignorando el
-- descuento — tanto el global (ventas.descuento) como el por ítem
-- (venta_items.descuento_item). Cuando la venta tuvo descuento (ej. 20% pago en
-- efectivo) se devolvía/acreditaba de más (inflaba saldo_favor, deuda y descontaba
-- de más la caja).
--
-- FIX: reintegro de un ítem = precio_unitario
--                           * (1 - descuento_item/100)        -- descuento por ítem
--                           * cantidad
--                           * (ventas.total / ventas.subtotal) -- descuento global
-- En ventas sin descuento: total == subtotal y descuento_item = 0 → resultado idéntico
-- al anterior (sin cambio de comportamiento).
--
-- No toca NINGÚN dato histórico: solo CREATE OR REPLACE de las dos funciones.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. procesar_devolucion  (idéntica a 025 — solo cambia el cálculo del monto y
--    la condición de anulación, que ahora compara cantidades en vez de montos
--    para no fallar por redondeo del descuento)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION procesar_devolucion(
  p_venta_id       UUID,
  p_items_devolver JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta           RECORD;
  v_cliente_id      UUID;
  v_total_venta     INTEGER;
  v_subtotal_venta  INTEGER;
  v_factor          NUMERIC;
  v_metodo          TEXT;
  v_cant_pagos      INTEGER;
  v_item_input      JSONB;
  v_item_venta      RECORD;
  v_variante_id     UUID;
  v_cantidad        INTEGER;
  v_precio_unit     INTEGER;
  v_desc_item       NUMERIC;
  v_monto_item      INTEGER;
  v_precio_efectivo INTEGER;
  v_monto_devolver  INTEGER := 0;
  v_deuda_actual    INTEGER;
  v_proporcion_pag  NUMERIC;
  v_ya_abonado      INTEGER;
  v_aun_en_deuda    INTEGER;
  v_saldo_generado  INTEGER := 0;
  v_deuda_revertida INTEGER := 0;
  v_items_proc      INTEGER := 0;
  v_total_items_venta INTEGER;
  v_total_items_dev   INTEGER := 0;
  v_caja_id         UUID;
  v_items_con_precio JSONB := '[]'::JSONB;
BEGIN

  SELECT id, cliente_id, total, subtotal, estado INTO v_venta FROM ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_venta.estado != 'completada' THEN RAISE EXCEPTION 'Solo se pueden devolver ventas en estado completada'; END IF;

  v_cliente_id     := v_venta.cliente_id;
  v_total_venta    := v_venta.total;
  v_subtotal_venta := v_venta.subtotal;

  -- factor de descuento global: lo realmente pagado / subtotal (ya con desc. por ítem)
  IF v_subtotal_venta IS NOT NULL AND v_subtotal_venta > 0 THEN
    v_factor := v_total_venta::NUMERIC / v_subtotal_venta::NUMERIC;
  ELSE
    v_factor := 1;
  END IF;

  SELECT COUNT(*) INTO v_cant_pagos FROM venta_pagos WHERE venta_id = p_venta_id;
  IF v_cant_pagos > 1 THEN RAISE EXCEPTION 'Devolución de pago mixto no soportada en esta versión'; END IF;

  SELECT metodo INTO v_metodo FROM venta_pagos WHERE venta_id = p_venta_id LIMIT 1;

  -- Validar items, calcular monto (sobre lo REALMENTE pagado) y construir JSONB
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items_devolver) LOOP
    v_variante_id := (v_item_input->>'variante_id')::UUID;
    v_cantidad    := (v_item_input->>'cantidad')::INTEGER;

    SELECT precio_unitario, cantidad, COALESCE(descuento_item, 0) AS descuento_item
      INTO v_item_venta
      FROM venta_items WHERE venta_id = p_venta_id AND variante_id = v_variante_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item variante % no pertenece a esta venta', v_variante_id; END IF;
    IF v_cantidad > v_item_venta.cantidad THEN RAISE EXCEPTION 'Cantidad a devolver (%) supera la cantidad original (%)', v_cantidad, v_item_venta.cantidad; END IF;
    IF v_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad a devolver debe ser mayor a 0'; END IF;

    v_precio_unit := v_item_venta.precio_unitario;
    v_desc_item   := v_item_venta.descuento_item;

    -- monto realmente pagado por estas unidades (desc. por ítem + desc. global)
    v_monto_item     := ROUND(v_precio_unit * v_cantidad * (1 - v_desc_item / 100.0) * v_factor);
    v_monto_devolver := v_monto_devolver + v_monto_item;
    v_items_proc     := v_items_proc + 1;
    v_total_items_dev := v_total_items_dev + v_cantidad;

    v_precio_efectivo := ROUND(v_monto_item::NUMERIC / v_cantidad);

    -- Guardar item con el precio EFECTIVO (lo que se reintegra), para que el
    -- detalle sea consistente con total_devuelto
    v_items_con_precio := v_items_con_precio || jsonb_build_object(
      'variante_id',     v_variante_id,
      'cantidad',        v_cantidad,
      'precio_unitario', v_precio_efectivo
    );
  END LOOP;

  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items_devolver) LOOP
    PERFORM incrementar_stock(
      (v_item_input->>'variante_id')::UUID,
      (v_item_input->>'cantidad')::INTEGER
    );
  END LOOP;

  IF v_metodo = 'fiado' AND v_cliente_id IS NOT NULL THEN
    SELECT deuda_total INTO v_deuda_actual FROM clientes WHERE id = v_cliente_id FOR UPDATE;

    IF v_total_venta > 0 THEN
      v_proporcion_pag := GREATEST(0, LEAST(1, 1.0 - (v_deuda_actual::NUMERIC / v_total_venta::NUMERIC)));
    ELSE
      v_proporcion_pag := 0;
    END IF;

    v_ya_abonado   := ROUND(v_monto_devolver * v_proporcion_pag);
    v_aun_en_deuda := v_monto_devolver - v_ya_abonado;

    UPDATE clientes SET deuda_total = GREATEST(0, deuda_total - v_aun_en_deuda), saldo_favor = saldo_favor + v_ya_abonado WHERE id = v_cliente_id;

    IF v_aun_en_deuda > 0 THEN
      INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
      VALUES (v_cliente_id, p_venta_id, 'abono', v_aun_en_deuda, 'Devolución de venta');
    END IF;

    v_saldo_generado  := v_ya_abonado;
    v_deuda_revertida := v_aun_en_deuda;

  ELSIF (v_metodo = 'efectivo' OR v_metodo = 'transferencia') AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes SET saldo_favor = saldo_favor + v_monto_devolver WHERE id = v_cliente_id;
    v_saldo_generado := v_monto_devolver;
  END IF;

  SELECT id INTO v_caja_id FROM cajas WHERE id = (SELECT caja_id FROM ventas WHERE id = p_venta_id) LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    UPDATE cajas SET
      total_efectivo      = total_efectivo      - CASE WHEN v_metodo = 'efectivo'      THEN v_monto_devolver ELSE 0 END,
      total_transferencia = total_transferencia - CASE WHEN v_metodo = 'transferencia' THEN v_monto_devolver ELSE 0 END,
      total_debito        = total_debito        - CASE WHEN v_metodo = 'debito'        THEN v_monto_devolver ELSE 0 END,
      total_credito       = total_credito       - CASE WHEN v_metodo = 'credito'       THEN v_monto_devolver ELSE 0 END,
      total_fiado         = total_fiado         - CASE WHEN v_metodo = 'fiado'         THEN v_monto_devolver ELSE 0 END
    WHERE id = v_caja_id;
  END IF;

  -- Anular la venta si se devolvieron TODAS las unidades (comparar cantidades,
  -- robusto al redondeo del descuento; antes comparaba montos)
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_items_venta FROM venta_items WHERE venta_id = p_venta_id;
  IF v_total_items_dev >= v_total_items_venta THEN
    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;
  END IF;

  INSERT INTO devoluciones (venta_id, cliente_id, items_devueltos, total_devuelto, saldo_generado, deuda_revertida)
  VALUES (p_venta_id, v_cliente_id, v_items_con_precio, v_monto_devolver, v_saldo_generado, v_deuda_revertida);

  RETURN jsonb_build_object(
    'saldo_generado',  v_saldo_generado,
    'deuda_revertida', v_deuda_revertida,
    'items_procesados', v_items_proc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_devolucion(UUID, JSONB) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. procesar_cambio  (idéntica a 021 — solo cambia el cálculo de v_total_dev,
--    que ahora lee precio + descuento_item de la venta original y aplica el
--    factor de descuento global. No confía en el precio del input)
-- ────────────────────────────────────────────────────────────────────────────
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
      -- fallback defensivo: ítem no encontrado en la venta → usar precio del input
      v_total_dev := v_total_dev + ROUND((v_item->>'precio_unitario')::INTEGER * v_cantidad * v_factor);
    END IF;
  END LOOP;

  -- 3. Decrementar stock de lo nuevo
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_nuevos) LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;
    v_precio_unit := (v_item->>'precio_unitario')::INTEGER;

    UPDATE variantes SET stock = stock - v_cantidad WHERE id = v_variante_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variante % no encontrada', v_variante_id;
    END IF;

    v_total_nuevo := v_total_nuevo + (v_precio_unit * v_cantidad);
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
    -- diferencia > 0: se entrega al cliente → restar de caja
    -- diferencia < 0: cliente paga → sumar a caja
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
