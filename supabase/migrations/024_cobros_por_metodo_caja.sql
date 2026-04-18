-- Migración 024: columnas separadas para cobros de deuda por método
-- Permite mostrar en caja: "Efectivo (ventas)" vs "Efectivo (cobros)" sin doble conteo visual

ALTER TABLE cajas
  ADD COLUMN IF NOT EXISTS total_cobros_efectivo      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cobros_transferencia INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cobros_debito        INTEGER NOT NULL DEFAULT 0;

-- Actualizar procesar_cobro_deuda para poblar las nuevas columnas
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

  v_caja_id := obtener_o_crear_caja_hoy();

  UPDATE cajas SET
    total_cobros              = total_cobros              + p_monto,
    total_efectivo            = total_efectivo            + CASE WHEN p_metodo = 'efectivo'      THEN p_monto ELSE 0 END,
    total_transferencia       = total_transferencia       + CASE WHEN p_metodo = 'transferencia' THEN p_monto ELSE 0 END,
    total_debito              = total_debito              + CASE WHEN p_metodo = 'debito'        THEN p_monto ELSE 0 END,
    total_cobros_efectivo     = total_cobros_efectivo     + CASE WHEN p_metodo = 'efectivo'      THEN p_monto ELSE 0 END,
    total_cobros_transferencia= total_cobros_transferencia+ CASE WHEN p_metodo = 'transferencia' THEN p_monto ELSE 0 END,
    total_cobros_debito       = total_cobros_debito       + CASE WHEN p_metodo = 'debito'        THEN p_monto ELSE 0 END
  WHERE id = v_caja_id;

  RETURN jsonb_build_object('ok', true, 'deuda_restante', v_deuda_actual - p_monto);
END;
$$;

GRANT EXECUTE ON FUNCTION procesar_cobro_deuda(UUID,INTEGER,TEXT,TEXT,UUID) TO authenticated;
