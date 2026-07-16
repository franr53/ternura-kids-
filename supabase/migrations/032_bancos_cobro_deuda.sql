-- Migración 032: cuentas bancarias del local + atribución del cobro de deuda.
--
-- Contexto: al cobrar la deuda de un cliente por transferencia, hoy se puede
-- elegir un PROVEEDOR (marca) — la transferencia del cliente cancela deuda del
-- local con esa marca (procesar_cobro_deuda ya lo hace, migración 028). Faltaba
-- el otro caso: la transferencia entró a una CUENTA/BANCO del local. Eso es pura
-- atribución contable — NO mueve deuda de nadie ni cambia la caja (la
-- transferencia ya suma a total_transferencia igual que antes).
--
-- CAMBIO 1 — tabla bancos: lista editable de cuentas (el "+" del selector inserta
--            acá; reaparecen ordenadas en el dropdown).
-- CAMBIO 2 — fiado_movimientos.banco_id: a qué cuenta entró el abono (nullable).
-- CAMBIO 3 — procesar_cobro_deuda gana p_banco_id y lo guarda. Proveedor y banco
--            son mutuamente excluyentes (la plata fue a uno u otro).
--
-- Aditivo y reversible: para volver atrás, re-aplicar la RPC de 028 y (opcional)
-- dropear banco_id / bancos. No toca datos históricos.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tabla de cuentas bancarias del local
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bancos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    TEXT NOT NULL,
  activo    BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON bancos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Atribución del abono a una cuenta bancaria
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE fiado_movimientos ADD COLUMN IF NOT EXISTS banco_id UUID REFERENCES bancos(id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. procesar_cobro_deuda — idéntica a 028, agrega p_banco_id (guarda la cuenta)
--    Se dropea la firma anterior para evitar ambigüedad de overload en PostgREST.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS procesar_cobro_deuda(UUID, INTEGER, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION procesar_cobro_deuda(
  p_cliente_id   UUID,
  p_monto        INTEGER,
  p_metodo       TEXT,
  p_notas        TEXT    DEFAULT NULL,
  p_proveedor_id UUID    DEFAULT NULL,
  p_banco_id     UUID    DEFAULT NULL
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
  IF p_proveedor_id IS NOT NULL AND p_banco_id IS NOT NULL THEN
    RAISE EXCEPTION 'El cobro va a un proveedor o a un banco, no a ambos';
  END IF;

  INSERT INTO fiado_movimientos (cliente_id, tipo, monto, notas, metodo_pago, banco_id)
  VALUES (p_cliente_id, 'abono', p_monto, p_notas, p_metodo, p_banco_id);

  UPDATE clientes SET deuda_total = GREATEST(0, deuda_total - p_monto) WHERE id = p_cliente_id;

  -- Pago directo a proveedor (marca): la transferencia del cliente cancela deuda del local
  IF p_proveedor_id IS NOT NULL THEN
    INSERT INTO pagos_proveedores (proveedor_id, monto, metodo, notas)
    VALUES (p_proveedor_id, p_monto, 'transferencia', COALESCE(p_notas, 'Cobro de cliente'));
    UPDATE marcas SET deuda_total = GREATEST(0, deuda_total - p_monto) WHERE id = p_proveedor_id;
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

GRANT EXECUTE ON FUNCTION procesar_cobro_deuda(UUID, INTEGER, TEXT, TEXT, UUID, UUID) TO authenticated;
