-- 041 — La caja cuenta bien la plata.
--
-- 1. obtener_o_crear_caja_hoy toma el día en hora de Argentina. Con CURRENT_DATE
--    (UTC), una venta o un cobro después de las 21 h cerraba la caja del día y
--    abría la del día siguiente.
-- 2. procesar_cambio: la diferencia entraba a la caja con el signo dado vuelta.
--    Lo que pagaba la clienta se restaba y lo que se le devolvía se sumaba.
-- 3. procesar_devolucion ya no le resta a la caja: la devolución no entrega
--    plata, deja saldo a favor o revierte el fiado.
--
-- No recalcula las cajas pasadas. Rollback: supabase/rollback/041_caja_anterior.sql

CREATE OR REPLACE FUNCTION public.obtener_o_crear_caja_hoy()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caja_id UUID;
  -- CURRENT_DATE es el día en UTC: desde las 21 h de Argentina ya es mañana.
  v_hoy     DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- Cerrar cajas abiertas de días anteriores
  UPDATE cajas
    SET estado = 'cerrada', cerrada_en = NOW(),
        notas_cierre = 'Cierre automático'
  WHERE estado = 'abierta' AND fecha < v_hoy;

  -- Buscar o crear la caja de hoy
  INSERT INTO cajas (fecha, estado, monto_inicial,
    total_efectivo, total_transferencia, total_debito,
    total_credito, total_fiado, total_retiros)
  VALUES (v_hoy, 'abierta', 0, 0, 0, 0, 0, 0, 0)
  ON CONFLICT (fecha) DO NOTHING;

  SELECT id INTO v_caja_id FROM cajas WHERE fecha = v_hoy LIMIT 1;
  RETURN v_caja_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.procesar_cambio(p_venta_original_id uuid, p_items_devueltos jsonb, p_items_nuevos jsonb, p_resolucion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    -- v_diferencia > 0 es plata que se le devuelve a la clienta: sale de la caja.
    -- v_diferencia < 0 es lo que paga la clienta: entra. Por eso se resta.
    IF p_resolucion = 'efectivo' THEN
      UPDATE cajas SET total_efectivo = total_efectivo - v_diferencia WHERE id = v_caja_id;
    ELSE
      UPDATE cajas SET total_transferencia = total_transferencia - v_diferencia WHERE id = v_caja_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.procesar_devolucion(p_venta_id uuid, p_items_devolver jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- ── Caja: no se toca. La devolución nunca entrega plata (regla del local):
  -- revierte el fiado de esta venta o deja saldo a favor. Antes se restaba
  -- de la caja de la venta original, aunque estuviera cerrada.

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
$function$;
