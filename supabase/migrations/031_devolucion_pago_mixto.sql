-- Migración 031: devoluciones con pago MIXTO + modelo cascada unificado.
--
-- CAMBIO 1 — habilitar pago mixto:
--   procesar_devolucion (029) tiraba 'Devolución de pago mixto no soportada' si la
--   venta tenía >1 pago. Ahora lo acepta.
--
-- CAMBIO 2 — modelo CASCADA (unifica fiado simple + mixto):
--   El valor devuelto (para un cliente CON cuenta) primero cancela la parte fiada
--   pendiente de ESA venta, y el resto queda como saldo a favor. Nunca devuelve
--   efectivo (regla del local). Reemplaza el reparto proporcional del fiado simple.
--     deuda_a_revertir = min(valor_devuelto, min(fiado_de_la_venta, deuda_actual))
--     a_favor          = valor_devuelto - deuda_a_revertir
--   - Venta 100% efectivo/transfer (fiado_de_la_venta = 0) → todo a saldo a favor
--     (idéntico al comportamiento previo).
--   - Cliente SIN cuenta → no hay deuda ni saldo; solo se revierte stock y caja
--     (el crédito se maneja en papel — "vale").
--
-- CAMBIO 3 — caja proporcional:
--   El monto devuelto se resta de la caja de la venta original repartido según los
--   métodos con que se pagó (cada bucket recibe su proporción). Para pago simple
--   coincide con el comportamiento anterior (un método = 100%).
--
-- No toca datos históricos: solo CREATE OR REPLACE de la función.

CREATE OR REPLACE FUNCTION procesar_devolucion(
  p_venta_id       UUID,
  p_items_devolver JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta            RECORD;
  v_cliente_id       UUID;
  v_total_venta      INTEGER;
  v_subtotal_venta   INTEGER;
  v_factor           NUMERIC;
  v_item_input       JSONB;
  v_item_venta       RECORD;
  v_variante_id      UUID;
  v_cantidad         INTEGER;
  v_precio_unit      INTEGER;
  v_desc_item        NUMERIC;
  v_monto_item       INTEGER;
  v_precio_efectivo  INTEGER;
  v_monto_devolver   INTEGER := 0;
  v_monto_fiado      INTEGER := 0;
  v_deuda_actual     INTEGER;
  v_fiado_pendiente  INTEGER;
  v_deuda_revertida  INTEGER := 0;
  v_saldo_generado   INTEGER := 0;
  v_items_proc       INTEGER := 0;
  v_total_items_venta INTEGER;
  v_total_items_dev   INTEGER := 0;
  v_caja_id          UUID;
  v_items_con_precio JSONB := '[]'::JSONB;
BEGIN

  SELECT id, cliente_id, total, subtotal, estado INTO v_venta FROM ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_venta.estado != 'completada' THEN RAISE EXCEPTION 'Solo se pueden devolver ventas en estado completada'; END IF;

  v_cliente_id     := v_venta.cliente_id;
  v_total_venta    := v_venta.total;
  v_subtotal_venta := v_venta.subtotal;

  -- factor de descuento global (lo pagado / subtotal con desc. por ítem ya aplicado)
  IF v_subtotal_venta IS NOT NULL AND v_subtotal_venta > 0 THEN
    v_factor := v_total_venta::NUMERIC / v_subtotal_venta::NUMERIC;
  ELSE
    v_factor := 1;
  END IF;

  -- Parte fiada de ESTA venta (para la cascada). 0 si no hubo fiado.
  SELECT COALESCE(SUM(monto), 0) INTO v_monto_fiado
    FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'fiado';

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

    v_monto_item     := ROUND(v_precio_unit * v_cantidad * (1 - v_desc_item / 100.0) * v_factor);
    v_monto_devolver := v_monto_devolver + v_monto_item;
    v_items_proc     := v_items_proc + 1;
    v_total_items_dev := v_total_items_dev + v_cantidad;

    v_precio_efectivo := ROUND(v_monto_item::NUMERIC / v_cantidad);

    v_items_con_precio := v_items_con_precio || jsonb_build_object(
      'variante_id',     v_variante_id,
      'cantidad',        v_cantidad,
      'precio_unitario', v_precio_efectivo
    );
  END LOOP;

  -- Reponer stock
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items_devolver) LOOP
    PERFORM incrementar_stock(
      (v_item_input->>'variante_id')::UUID,
      (v_item_input->>'cantidad')::INTEGER
    );
  END LOOP;

  -- ── Cuenta del cliente: CASCADA (cancela fiado pendiente de esta venta, resto a favor)
  IF v_cliente_id IS NOT NULL THEN
    SELECT deuda_total INTO v_deuda_actual FROM clientes WHERE id = v_cliente_id FOR UPDATE;

    -- Cuánto de esta venta podría seguir debiéndose: su fiado, acotado por la deuda actual.
    v_fiado_pendiente := LEAST(v_monto_fiado, GREATEST(0, v_deuda_actual));
    v_deuda_revertida := LEAST(v_monto_devolver, v_fiado_pendiente);
    v_saldo_generado  := v_monto_devolver - v_deuda_revertida;

    UPDATE clientes
      SET deuda_total = GREATEST(0, deuda_total - v_deuda_revertida),
          saldo_favor = saldo_favor + v_saldo_generado
      WHERE id = v_cliente_id;

    IF v_deuda_revertida > 0 THEN
      INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
      VALUES (v_cliente_id, p_venta_id, 'abono', v_deuda_revertida, 'Devolución de venta');
    END IF;
  END IF;

  -- ── Caja: revertir el monto devuelto proporcional a los métodos de la venta original
  SELECT caja_id INTO v_caja_id FROM ventas WHERE id = p_venta_id;

  IF v_caja_id IS NOT NULL AND v_total_venta > 0 THEN
    UPDATE cajas SET
      total_efectivo      = total_efectivo      - COALESCE(ROUND(v_monto_devolver * (SELECT COALESCE(SUM(monto),0) FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'efectivo')::NUMERIC      / v_total_venta), 0),
      total_transferencia = total_transferencia - COALESCE(ROUND(v_monto_devolver * (SELECT COALESCE(SUM(monto),0) FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'transferencia')::NUMERIC / v_total_venta), 0),
      total_debito        = total_debito        - COALESCE(ROUND(v_monto_devolver * (SELECT COALESCE(SUM(monto),0) FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'debito')::NUMERIC        / v_total_venta), 0),
      total_credito       = total_credito       - COALESCE(ROUND(v_monto_devolver * (SELECT COALESCE(SUM(monto),0) FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'credito')::NUMERIC       / v_total_venta), 0),
      total_fiado         = total_fiado         - COALESCE(ROUND(v_monto_devolver * (SELECT COALESCE(SUM(monto),0) FROM venta_pagos WHERE venta_id = p_venta_id AND metodo = 'fiado')::NUMERIC         / v_total_venta), 0)
    WHERE id = v_caja_id;
  END IF;

  -- Anular la venta si se devolvieron TODAS las unidades
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_items_venta FROM venta_items WHERE venta_id = p_venta_id;
  IF v_total_items_dev >= v_total_items_venta THEN
    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;
  END IF;

  INSERT INTO devoluciones (venta_id, cliente_id, items_devueltos, total_devuelto, saldo_generado, deuda_revertida)
  VALUES (p_venta_id, v_cliente_id, v_items_con_precio, v_monto_devolver, v_saldo_generado, v_deuda_revertida);

  RETURN jsonb_build_object(
    'saldo_generado',   v_saldo_generado,
    'deuda_revertida',  v_deuda_revertida,
    'items_procesados', v_items_proc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_devolucion(UUID, JSONB) TO authenticated;
