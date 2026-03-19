-- Migración 012: RPC transaccional procesar_venta
-- Reemplaza 6-7 llamadas independientes por una sola transacción atómica.
-- Si falla cualquier paso → ROLLBACK automático completo.

CREATE OR REPLACE FUNCTION procesar_venta(
  p_caja_fecha      TEXT,
  p_subtotal        INTEGER,
  p_total           INTEGER,
  p_items           JSONB,
  p_pagos           JSONB,
  p_descuento       INTEGER DEFAULT 0,
  p_cliente_id      UUID    DEFAULT NULL,
  p_proveedor_id    UUID    DEFAULT NULL,
  p_monto_proveedor INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venta_id   UUID;
  v_caja_id    UUID;
  v_item       JSONB;
  v_pago       JSONB;
  v_variante_id UUID;
  v_cantidad    INTEGER;
BEGIN
  -- Validaciones básicas
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un item';
  END IF;
  IF jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un pago';
  END IF;
  IF p_total <= 0 THEN
    RAISE EXCEPTION 'El total debe ser mayor a cero';
  END IF;

  -- 1. Buscar caja abierta del día (opcional — puede no existir)
  SELECT id INTO v_caja_id
  FROM cajas
  WHERE estado = 'abierta'
    AND fecha = p_caja_fecha::DATE
  LIMIT 1;

  -- 2. Insertar venta
  INSERT INTO ventas (caja_id, cliente_id, subtotal, descuento, total, estado)
  VALUES (v_caja_id, p_cliente_id, p_subtotal, p_descuento, p_total, 'completada')
  RETURNING id INTO v_venta_id;

  -- 3. Insertar items de la venta
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_item, subtotal)
    VALUES (
      v_venta_id,
      (v_item->>'variante_id')::UUID,
      (v_item->>'cantidad')::INTEGER,
      (v_item->>'precio_unitario')::INTEGER,
      (v_item->>'descuento_item')::INTEGER,
      (v_item->>'subtotal')::INTEGER
    );
  END LOOP;

  -- 4. Insertar pagos de la venta
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
  LOOP
    INSERT INTO venta_pagos (venta_id, metodo, monto, notas)
    VALUES (
      v_venta_id,
      (v_pago->>'metodo')::text,
      (v_pago->>'monto')::INTEGER,
      v_pago->>'notas'
    );
  END LOOP;

  -- 5. Descontar stock de cada variante (atómico — sin race condition)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;

    UPDATE variantes
    SET stock = stock - v_cantidad
    WHERE id = v_variante_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variante % no encontrada', v_variante_id;
    END IF;
  END LOOP;

  -- 6. Registrar fiado si hay pago con método='fiado' y hay cliente
  IF p_cliente_id IS NOT NULL THEN
    FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
    LOOP
      IF v_pago->>'metodo' = 'fiado' THEN
        INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto)
        VALUES (p_cliente_id, v_venta_id, 'cargo', (v_pago->>'monto')::INTEGER);

        UPDATE clientes
        SET deuda_total = deuda_total + (v_pago->>'monto')::INTEGER
        WHERE id = p_cliente_id;
      END IF;
    END LOOP;
  END IF;

  -- 7. Actualizar totales de caja (atómico — sin race condition)
  IF v_caja_id IS NOT NULL THEN
    FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos)
    LOOP
      UPDATE cajas
      SET
        total_efectivo     = total_efectivo     + CASE WHEN v_pago->>'metodo' = 'efectivo'     THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
        total_transferencia= total_transferencia+ CASE WHEN v_pago->>'metodo' = 'transferencia' THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
        total_debito       = total_debito       + CASE WHEN v_pago->>'metodo' = 'debito'        THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
        total_credito      = total_credito      + CASE WHEN v_pago->>'metodo' = 'credito'       THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
        total_fiado        = total_fiado        + CASE WHEN v_pago->>'metodo' = 'fiado'         THEN (v_pago->>'monto')::INTEGER ELSE 0 END
      WHERE id = v_caja_id;
    END LOOP;
  END IF;

  -- 8. Registrar pago a proveedor (si se asignó transferencia a un proveedor)
  IF p_proveedor_id IS NOT NULL AND p_monto_proveedor > 0 THEN
    INSERT INTO pagos_proveedores (proveedor_id, monto, metodo, notas)
    VALUES (p_proveedor_id, p_monto_proveedor, 'transferencia', 'Pago directo de cliente en venta');

    UPDATE proveedores
    SET deuda_total = GREATEST(0, deuda_total - p_monto_proveedor)
    WHERE id = p_proveedor_id;
  END IF;

  RETURN json_build_object('venta_id', v_venta_id);
END;
$$;

-- Permitir que los roles autenticados llamen a esta función
GRANT EXECUTE ON FUNCTION procesar_venta(TEXT, INTEGER, INTEGER, JSONB, JSONB, INTEGER, UUID, UUID, INTEGER) TO authenticated;
