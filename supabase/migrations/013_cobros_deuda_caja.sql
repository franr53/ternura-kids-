-- Migración 013: Cobros de deuda → Caja
-- Agrega total_cobros a cajas, metodo_pago a fiado_movimientos,
-- y la RPC atómica procesar_cobro_deuda.

-- 1. Nueva columna en cajas
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS total_cobros NUMERIC(12,2) DEFAULT 0;

-- 2. Método de pago en historial de fiado
ALTER TABLE fiado_movimientos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT
  CHECK (metodo_pago IN ('efectivo', 'transferencia', 'debito'));

-- 3. RPC atómica
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
  -- Lock fila del cliente y leer deuda actual
  SELECT deuda_total INTO v_deuda_actual
    FROM clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF p_monto <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF p_monto > v_deuda_actual THEN RAISE EXCEPTION 'Monto supera la deuda actual'; END IF;

  -- Registrar abono con método de pago
  INSERT INTO fiado_movimientos (cliente_id, tipo, monto, notas, metodo_pago)
  VALUES (p_cliente_id, 'abono', p_monto, p_notas, p_metodo);

  -- Descontar deuda del cliente (atómico, sin ir a 0 negativo)
  UPDATE clientes
    SET deuda_total = GREATEST(0, deuda_total - p_monto)
  WHERE id = p_cliente_id;

  -- Si la transferencia va al alias de un proveedor: reducir su deuda
  IF p_proveedor_id IS NOT NULL THEN
    INSERT INTO pagos_proveedores (proveedor_id, monto, metodo, notas)
    VALUES (p_proveedor_id, p_monto, 'transferencia',
            COALESCE(p_notas, 'Cobro de cliente'));
    UPDATE proveedores
      SET deuda_total = GREATEST(0, deuda_total - p_monto)
    WHERE id = p_proveedor_id;
  END IF;

  -- Buscar caja abierta y acumular en total_cobros
  SELECT id INTO v_caja_id
    FROM cajas WHERE estado = 'abierta'
    ORDER BY abierta_en DESC LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    UPDATE cajas
      SET total_cobros = total_cobros + p_monto
    WHERE id = v_caja_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deuda_restante', v_deuda_actual - p_monto);
END;
$$;
