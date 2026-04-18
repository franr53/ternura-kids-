-- Migración 022: caja automática por día
-- 1. Constraint UNIQUE en fecha para garantizar 1 caja por día
-- 2. Función auxiliar que auto-crea la caja del día si no existe
-- 3. Actualizar procesar_venta y procesar_cobro_deuda para usarla

-- UNIQUE en fecha (idempotente)
ALTER TABLE cajas ADD CONSTRAINT cajas_fecha_unique UNIQUE (fecha);

-- Función auxiliar: devuelve el id de la caja del día, creándola si no existe
CREATE OR REPLACE FUNCTION obtener_o_crear_caja_hoy()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caja_id UUID;
  v_hoy     DATE := CURRENT_DATE;
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
$$;

-- procesar_venta: usar obtener_o_crear_caja_hoy en vez de buscar estado='abierta'
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
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta_id    UUID;
  v_caja_id     UUID;
  v_item        JSONB;
  v_pago        JSONB;
  v_variante_id UUID;
  v_cantidad    INTEGER;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'La venta debe tener al menos un item'; END IF;
  IF jsonb_array_length(p_pagos) = 0 THEN RAISE EXCEPTION 'La venta debe tener al menos un pago'; END IF;
  IF p_total <= 0 THEN RAISE EXCEPTION 'El total debe ser mayor a cero'; END IF;

  -- Obtener (o crear) la caja del día
  v_caja_id := obtener_o_crear_caja_hoy();

  -- Insertar venta
  INSERT INTO ventas (caja_id, cliente_id, subtotal, descuento, total, estado)
  VALUES (v_caja_id, p_cliente_id, p_subtotal, p_descuento, p_total, 'completada')
  RETURNING id INTO v_venta_id;

  -- Insertar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
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

  -- Insertar pagos
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos) LOOP
    INSERT INTO venta_pagos (venta_id, metodo, monto, notas)
    VALUES (v_venta_id, (v_pago->>'metodo')::text, (v_pago->>'monto')::INTEGER, v_pago->>'notas');
  END LOOP;

  -- Descontar stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;
    UPDATE variantes SET stock = stock - v_cantidad WHERE id = v_variante_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variante % no encontrada', v_variante_id; END IF;
  END LOOP;

  -- Registrar fiado si corresponde
  IF p_cliente_id IS NOT NULL THEN
    FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos) LOOP
      IF v_pago->>'metodo' = 'fiado' THEN
        INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto)
        VALUES (p_cliente_id, v_venta_id, 'cargo', (v_pago->>'monto')::INTEGER);
        UPDATE clientes SET deuda_total = deuda_total + (v_pago->>'monto')::INTEGER WHERE id = p_cliente_id;
      END IF;
    END LOOP;
  END IF;

  -- Actualizar totales de caja
  FOR v_pago IN SELECT * FROM jsonb_array_elements(p_pagos) LOOP
    UPDATE cajas SET
      total_efectivo      = total_efectivo      + CASE WHEN v_pago->>'metodo' = 'efectivo'      THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
      total_transferencia = total_transferencia + CASE WHEN v_pago->>'metodo' = 'transferencia' THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
      total_debito        = total_debito        + CASE WHEN v_pago->>'metodo' = 'debito'        THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
      total_credito       = total_credito       + CASE WHEN v_pago->>'metodo' = 'credito'       THEN (v_pago->>'monto')::INTEGER ELSE 0 END,
      total_fiado         = total_fiado         + CASE WHEN v_pago->>'metodo' = 'fiado'         THEN (v_pago->>'monto')::INTEGER ELSE 0 END
    WHERE id = v_caja_id;
  END LOOP;

  -- Pago a proveedor
  IF p_proveedor_id IS NOT NULL AND p_monto_proveedor > 0 THEN
    INSERT INTO pagos_proveedores (proveedor_id, monto, metodo, notas)
    VALUES (p_proveedor_id, p_monto_proveedor, 'transferencia', 'Pago directo de cliente en venta');
    UPDATE proveedores SET deuda_total = GREATEST(0, deuda_total - p_monto_proveedor) WHERE id = p_proveedor_id;
  END IF;

  RETURN json_build_object('venta_id', v_venta_id);
END;
$$;

-- procesar_cobro_deuda: usar obtener_o_crear_caja_hoy
CREATE OR REPLACE FUNCTION procesar_cobro_deuda(
  p_cliente_id   UUID,
  p_monto        INTEGER,
  p_metodo       TEXT,
  p_notas        TEXT    DEFAULT NULL,
  p_proveedor_id UUID    DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caja_id      UUID;
  v_deuda_actual INTEGER;
BEGIN
  SELECT deuda_total INTO v_deuda_actual FROM clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF p_monto <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF p_monto > v_deuda_actual THEN RAISE EXCEPTION 'Monto supera la deuda actual'; END IF;

  INSERT INTO fiado_movimientos (cliente_id, tipo, monto, notas, metodo_pago)
  VALUES (p_cliente_id, 'abono', p_monto, p_notas, p_metodo);

  UPDATE clientes SET deuda_total = GREATEST(0, deuda_total - p_monto) WHERE id = p_cliente_id;

  IF p_proveedor_id IS NOT NULL THEN
    INSERT INTO pagos_proveedores (proveedor_id, monto, metodo, notas)
    VALUES (p_proveedor_id, p_monto, 'transferencia', COALESCE(p_notas, 'Cobro de cliente'));
    UPDATE proveedores SET deuda_total = GREATEST(0, deuda_total - p_monto) WHERE id = p_proveedor_id;
  END IF;

  -- Obtener (o crear) la caja del día
  v_caja_id := obtener_o_crear_caja_hoy();

  UPDATE cajas SET
    total_cobros        = total_cobros        + p_monto,
    total_efectivo      = total_efectivo      + CASE WHEN p_metodo = 'efectivo'      THEN p_monto ELSE 0 END,
    total_transferencia = total_transferencia + CASE WHEN p_metodo = 'transferencia' THEN p_monto ELSE 0 END,
    total_debito        = total_debito        + CASE WHEN p_metodo = 'debito'        THEN p_monto ELSE 0 END
  WHERE id = v_caja_id;

  RETURN jsonb_build_object('ok', true, 'deuda_restante', v_deuda_actual - p_monto);
END;
$$;

GRANT EXECUTE ON FUNCTION obtener_o_crear_caja_hoy() TO authenticated;
GRANT EXECUTE ON FUNCTION procesar_venta(TEXT,INTEGER,INTEGER,JSONB,JSONB,INTEGER,UUID,UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION procesar_cobro_deuda(UUID,INTEGER,TEXT,TEXT,UUID) TO authenticated;
