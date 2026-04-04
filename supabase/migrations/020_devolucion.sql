-- Migración 020: Devolución de venta
-- Agrega saldo_favor a clientes y RPC procesar_devolucion

-- 1. Nuevo campo en clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_favor INTEGER NOT NULL DEFAULT 0;

-- 2. RPC procesar_devolucion
CREATE OR REPLACE FUNCTION procesar_devolucion(
  p_venta_id       UUID,
  p_items_devolver JSONB  -- array de {variante_id, cantidad}
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta           RECORD;
  v_cliente_id      UUID;
  v_total_venta     INTEGER;
  v_metodo          TEXT;
  v_cant_pagos      INTEGER;
  v_item_input      JSONB;
  v_item_venta      RECORD;
  v_variante_id     UUID;
  v_cantidad        INTEGER;
  v_precio_unit     INTEGER;
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
BEGIN

  -- 1. Leer venta original
  SELECT id, cliente_id, total, estado
    INTO v_venta
    FROM ventas
   WHERE id = p_venta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;
  IF v_venta.estado != 'completada' THEN
    RAISE EXCEPTION 'Solo se pueden devolver ventas en estado completada';
  END IF;

  v_cliente_id  := v_venta.cliente_id;
  v_total_venta := v_venta.total;

  -- 2. Validar pago no mixto
  SELECT COUNT(*) INTO v_cant_pagos
    FROM venta_pagos WHERE venta_id = p_venta_id;

  IF v_cant_pagos > 1 THEN
    RAISE EXCEPTION 'Devolución de pago mixto no soportada en esta versión';
  END IF;

  -- Obtener método de pago
  SELECT metodo INTO v_metodo
    FROM venta_pagos WHERE venta_id = p_venta_id LIMIT 1;

  -- 3. Validar items y calcular monto a devolver
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items_devolver)
  LOOP
    v_variante_id := (v_item_input->>'variante_id')::UUID;
    v_cantidad    := (v_item_input->>'cantidad')::INTEGER;

    SELECT precio_unitario, cantidad
      INTO v_item_venta
      FROM venta_items
     WHERE venta_id = p_venta_id AND variante_id = v_variante_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item variante % no pertenece a esta venta', v_variante_id;
    END IF;
    IF v_cantidad > v_item_venta.cantidad THEN
      RAISE EXCEPTION 'Cantidad a devolver (%) supera la cantidad original (%)', v_cantidad, v_item_venta.cantidad;
    END IF;
    IF v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad a devolver debe ser mayor a 0';
    END IF;

    v_precio_unit    := v_item_venta.precio_unitario;
    v_monto_devolver := v_monto_devolver + (v_precio_unit * v_cantidad);
    v_items_proc     := v_items_proc + 1;
    v_total_items_dev := v_total_items_dev + v_cantidad;
  END LOOP;

  -- 4. Incrementar stock para cada item
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items_devolver)
  LOOP
    PERFORM incrementar_stock(
      (v_item_input->>'variante_id')::UUID,
      (v_item_input->>'cantidad')::INTEGER
    );
  END LOOP;

  -- 5. Ajustar deuda / saldo según método de pago
  IF v_metodo = 'fiado' AND v_cliente_id IS NOT NULL THEN
    SELECT deuda_total INTO v_deuda_actual
      FROM clientes WHERE id = v_cliente_id FOR UPDATE;

    -- Proporción pagada del total de la venta (clampear entre 0 y 1)
    IF v_total_venta > 0 THEN
      v_proporcion_pag := GREATEST(0, LEAST(1,
        1.0 - (v_deuda_actual::NUMERIC / v_total_venta::NUMERIC)
      ));
    ELSE
      v_proporcion_pag := 0;
    END IF;

    v_ya_abonado   := ROUND(v_monto_devolver * v_proporcion_pag);
    v_aun_en_deuda := v_monto_devolver - v_ya_abonado;

    UPDATE clientes
       SET deuda_total  = GREATEST(0, deuda_total - v_aun_en_deuda),
           saldo_favor  = saldo_favor + v_ya_abonado
     WHERE id = v_cliente_id;

    IF v_aun_en_deuda > 0 THEN
      INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
      VALUES (v_cliente_id, p_venta_id, 'abono', v_aun_en_deuda, 'Devolución de venta');
    END IF;

    v_saldo_generado  := v_ya_abonado;
    v_deuda_revertida := v_aun_en_deuda;

  ELSIF (v_metodo = 'efectivo' OR v_metodo = 'transferencia') AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes
       SET saldo_favor = saldo_favor + v_monto_devolver
     WHERE id = v_cliente_id;

    v_saldo_generado := v_monto_devolver;
  END IF;

  -- 6. Decrementar caja (buscar caja del día de la venta o abierta)
  SELECT id INTO v_caja_id
    FROM cajas
   WHERE id = (SELECT caja_id FROM ventas WHERE id = p_venta_id)
   LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    UPDATE cajas
       SET total_efectivo      = total_efectivo      - CASE WHEN v_metodo = 'efectivo'      THEN v_monto_devolver ELSE 0 END,
           total_transferencia = total_transferencia - CASE WHEN v_metodo = 'transferencia' THEN v_monto_devolver ELSE 0 END,
           total_debito        = total_debito        - CASE WHEN v_metodo = 'debito'        THEN v_monto_devolver ELSE 0 END,
           total_credito       = total_credito       - CASE WHEN v_metodo = 'credito'       THEN v_monto_devolver ELSE 0 END,
           total_fiado         = total_fiado         - CASE WHEN v_metodo = 'fiado'         THEN v_monto_devolver ELSE 0 END
     WHERE id = v_caja_id;
  END IF;

  -- 7. Si se devolvieron TODOS los items → anular venta
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_items_venta
    FROM venta_items WHERE venta_id = p_venta_id;

  -- Verificar si todos los items quedaron devueltos comparando con lo que hay en stock revertido
  -- Simplificación: si monto_devolver >= total_venta → anular
  IF v_monto_devolver >= v_total_venta THEN
    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;
  END IF;

  RETURN jsonb_build_object(
    'saldo_generado',  v_saldo_generado,
    'deuda_revertida', v_deuda_revertida,
    'items_procesados', v_items_proc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_devolucion(UUID, JSONB) TO authenticated;
