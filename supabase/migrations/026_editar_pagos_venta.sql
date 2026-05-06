-- Permite editar los métodos de pago de una venta ya completada.
-- Revierte todos los efectos del pago original (caja, fiado) y aplica los nuevos.
-- También actualiza el total de la venta según la regla de descuento.
CREATE OR REPLACE FUNCTION editar_pagos_venta(
  p_venta_id        UUID,
  p_nuevos_pagos    JSONB,
  p_nuevo_total     INTEGER,
  p_nuevo_descuento INTEGER
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cliente_id UUID;
  v_caja_id    UUID;
  v_pago       JSONB;
  v_monto      INTEGER;
BEGIN
  -- 1. Obtener datos de la venta y validar estado
  SELECT cliente_id, caja_id
    INTO v_cliente_id, v_caja_id
    FROM ventas
   WHERE id = p_venta_id AND estado = 'completada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada o no está en estado completada';
  END IF;

  -- 2. Revertir efectos de los pagos actuales
  FOR v_pago IN SELECT * FROM jsonb_array_elements(
    (SELECT jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto))
       FROM venta_pagos WHERE venta_id = p_venta_id)
  ) LOOP
    v_monto := (v_pago->>'monto')::INTEGER;

    -- Restar de caja
    IF v_caja_id IS NOT NULL THEN
      UPDATE cajas SET
        total_efectivo      = total_efectivo      - CASE WHEN v_pago->>'metodo' = 'efectivo'      THEN v_monto ELSE 0 END,
        total_transferencia = total_transferencia - CASE WHEN v_pago->>'metodo' = 'transferencia' THEN v_monto ELSE 0 END,
        total_debito        = total_debito        - CASE WHEN v_pago->>'metodo' = 'debito'        THEN v_monto ELSE 0 END,
        total_credito       = total_credito       - CASE WHEN v_pago->>'metodo' = 'credito'       THEN v_monto ELSE 0 END,
        total_fiado         = total_fiado         - CASE WHEN v_pago->>'metodo' = 'fiado'         THEN v_monto ELSE 0 END
      WHERE id = v_caja_id;
    END IF;

    -- Revertir deuda si era fiado
    IF v_pago->>'metodo' = 'fiado' AND v_cliente_id IS NOT NULL THEN
      UPDATE clientes
        SET deuda_total = GREATEST(0, deuda_total - v_monto)
      WHERE id = v_cliente_id;
    END IF;
  END LOOP;

  -- 3. Limpiar fiado_movimientos de cargo de esta venta
  IF v_cliente_id IS NOT NULL THEN
    DELETE FROM fiado_movimientos
     WHERE venta_id = p_venta_id AND tipo = 'cargo';
  END IF;

  -- 4. Eliminar pagos anteriores
  DELETE FROM venta_pagos WHERE venta_id = p_venta_id;

  -- 5. Actualizar total y descuento de la venta
  UPDATE ventas
     SET total     = p_nuevo_total,
         descuento = p_nuevo_descuento
   WHERE id = p_venta_id;

  -- 6. Insertar nuevos pagos y aplicar efectos
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_nuevos_pagos) LOOP
    v_monto := (v_pago->>'monto')::INTEGER;

    INSERT INTO venta_pagos (venta_id, metodo, monto, notas)
    VALUES (
      p_venta_id,
      v_pago->>'metodo',
      v_monto,
      NULLIF(v_pago->>'notas', '')
    );

    -- Sumar a caja
    IF v_caja_id IS NOT NULL THEN
      UPDATE cajas SET
        total_efectivo      = total_efectivo      + CASE WHEN v_pago->>'metodo' = 'efectivo'      THEN v_monto ELSE 0 END,
        total_transferencia = total_transferencia + CASE WHEN v_pago->>'metodo' = 'transferencia' THEN v_monto ELSE 0 END,
        total_debito        = total_debito        + CASE WHEN v_pago->>'metodo' = 'debito'        THEN v_monto ELSE 0 END,
        total_credito       = total_credito       + CASE WHEN v_pago->>'metodo' = 'credito'       THEN v_monto ELSE 0 END,
        total_fiado         = total_fiado         + CASE WHEN v_pago->>'metodo' = 'fiado'         THEN v_monto ELSE 0 END
      WHERE id = v_caja_id;
    END IF;

    -- Registrar fiado nuevo
    IF v_pago->>'metodo' = 'fiado' AND v_cliente_id IS NOT NULL THEN
      INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
      VALUES (v_cliente_id, p_venta_id, 'cargo', v_monto, 'Pago editado');

      UPDATE clientes
         SET deuda_total = deuda_total + v_monto
       WHERE id = v_cliente_id;
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true, 'venta_id', p_venta_id);
END;
$$;
