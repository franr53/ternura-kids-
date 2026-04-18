-- Migración 023: procesar_cambio usa obtener_o_crear_caja_hoy igual que los otros RPCs

CREATE OR REPLACE FUNCTION procesar_cambio(
  p_venta_original_id  UUID,
  p_items_devueltos    JSONB,
  p_items_nuevos       JSONB,
  p_resolucion         TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_venta         RECORD;
  v_cliente_id    UUID;
  v_item          JSONB;
  v_variante_id   UUID;
  v_cantidad      INTEGER;
  v_precio_unit   INTEGER;
  v_total_dev     INTEGER := 0;
  v_total_nuevo   INTEGER := 0;
  v_diferencia    INTEGER;
  v_caja_id       UUID;
  v_cambio_id     UUID;
BEGIN
  SELECT id, cliente_id, total INTO v_venta FROM ventas WHERE id = p_venta_original_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  v_cliente_id := v_venta.cliente_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_devueltos) LOOP
    PERFORM incrementar_stock(
      (v_item->>'variante_id')::UUID,
      (v_item->>'cantidad')::INTEGER
    );
    v_total_dev := v_total_dev + ((v_item->>'precio_unitario')::INTEGER * (v_item->>'cantidad')::INTEGER);
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_nuevos) LOOP
    v_variante_id := (v_item->>'variante_id')::UUID;
    v_cantidad    := (v_item->>'cantidad')::INTEGER;
    v_precio_unit := (v_item->>'precio_unitario')::INTEGER;
    UPDATE variantes SET stock = stock - v_cantidad WHERE id = v_variante_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variante % no encontrada', v_variante_id; END IF;
    v_total_nuevo := v_total_nuevo + (v_precio_unit * v_cantidad);
  END LOOP;

  v_diferencia := v_total_dev - v_total_nuevo;

  -- Usar obtener_o_crear_caja_hoy (igual que procesar_venta y procesar_cobro_deuda)
  v_caja_id := obtener_o_crear_caja_hoy();

  IF p_resolucion = 'saldo_favor' AND v_cliente_id IS NOT NULL AND v_diferencia > 0 THEN
    UPDATE clientes SET saldo_favor = saldo_favor + v_diferencia WHERE id = v_cliente_id;

  ELSIF p_resolucion = 'fiado' AND v_cliente_id IS NOT NULL AND v_diferencia < 0 THEN
    UPDATE clientes SET deuda_total = deuda_total + ABS(v_diferencia) WHERE id = v_cliente_id;
    INSERT INTO fiado_movimientos (cliente_id, venta_id, tipo, monto, notas)
    VALUES (v_cliente_id, p_venta_original_id, 'cargo', ABS(v_diferencia), 'Cambio de prenda');

  ELSIF (p_resolucion = 'efectivo' OR p_resolucion = 'transferencia') THEN
    IF p_resolucion = 'efectivo' THEN
      UPDATE cajas SET total_efectivo = total_efectivo + v_diferencia WHERE id = v_caja_id;
    ELSE
      UPDATE cajas SET total_transferencia = total_transferencia + v_diferencia WHERE id = v_caja_id;
    END IF;
  END IF;

  IF jsonb_array_length(p_items_nuevos) = 0 THEN
    UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_original_id;
  END IF;

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
