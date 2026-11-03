-- Prueba de la 041: la caja cuenta bien la plata en cambios y devoluciones, y
-- toma el día en hora de Argentina.
--
-- Vende, cambia y devuelve de verdad, así que se corre SIEMPRE dentro de una
-- transacción que se deshace, y sólo contra la copia local:
--
--   (echo 'BEGIN;'; cat supabase/tests/041_caja.sql; echo 'ROLLBACK;') \
--     | docker exec -i supabase_db_ternura-local psql -U postgres -v ON_ERROR_STOP=1 -q
--
-- Si algo no cuadra, corta con una excepción que dice qué. Si todo cuadra,
-- termina con el aviso "041: todo cuadra".

DO $$
DECLARE
  v_a        RECORD;   -- prenda barata
  v_b        RECORD;   -- prenda cara
  v_dif      INTEGER;
  v_cli      UUID;
  v_venta    UUID;
  v_caja     UUID;
  v_antes    RECORD;
  v_despues  RECORD;
  v_saldo    INTEGER;
  v_deuda    INTEGER;
BEGIN
  IF current_setting('TimeZone') <> 'UTC' THEN
    RAISE EXCEPTION 'la prueba supone la base en UTC, como producción';
  END IF;

  -- 1. El día en Argentina. 00:30 UTC del 4/11 son las 21:30 del 3/11 acá.
  IF (timestamptz '2026-11-04 00:30:00+00' AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <> date '2026-11-03' THEN
    RAISE EXCEPTION 'la conversión a hora de Argentina no da el día correcto';
  END IF;
  v_caja := obtener_o_crear_caja_hoy();
  IF (SELECT fecha FROM cajas WHERE id = v_caja) <> (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
    RAISE EXCEPTION 'la caja del día no es la de hoy en Argentina';
  END IF;

  -- Dos prendas con stock y precios distintos, y una clienta de prueba.
  SELECT id, precio_venta::INTEGER AS precio INTO v_a FROM variantes
   WHERE stock > 5 AND precio_venta BETWEEN 5000 AND 20000 ORDER BY precio_venta, id LIMIT 1;
  SELECT id, precio_venta::INTEGER AS precio INTO v_b FROM variantes
   WHERE stock > 5 AND precio_venta > v_a.precio + 1000 ORDER BY precio_venta, id LIMIT 1;
  IF v_a.id IS NULL OR v_b.id IS NULL THEN RAISE EXCEPTION 'faltan prendas con stock para probar'; END IF;
  v_dif := v_b.precio - v_a.precio;
  INSERT INTO clientes (nombre, activo) VALUES ('QA caja 041', true) RETURNING id INTO v_cli;

  -- 2. Cambio en el que la clienta paga la diferencia en efectivo: la caja SUMA.
  v_venta := (procesar_venta(
    to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), v_a.precio, v_a.precio,
    jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1, 'precio_unitario', v_a.precio, 'descuento_item', 0, 'subtotal', v_a.precio)),
    jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', v_a.precio)),
    0, v_cli) ->> 'venta_id')::UUID;
  SELECT * INTO v_antes FROM cajas WHERE id = v_caja;
  PERFORM procesar_cambio(v_venta,
    jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1, 'precio_unitario', v_a.precio)),
    jsonb_build_array(jsonb_build_object('variante_id', v_b.id, 'cantidad', 1, 'precio_unitario', v_b.precio)),
    'efectivo');
  SELECT * INTO v_despues FROM cajas WHERE id = v_caja;
  IF v_despues.total_efectivo - v_antes.total_efectivo <> v_dif THEN
    RAISE EXCEPTION 'cambio en que la clienta paga $%: la caja se movió $% (tenía que sumar $%)',
      v_dif, v_despues.total_efectivo - v_antes.total_efectivo, v_dif;
  END IF;

  -- 3. Cambio en el que se le devuelve la diferencia por transferencia: la caja RESTA.
  v_venta := (procesar_venta(
    to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), v_b.precio, v_b.precio,
    jsonb_build_array(jsonb_build_object('variante_id', v_b.id, 'cantidad', 1, 'precio_unitario', v_b.precio, 'descuento_item', 0, 'subtotal', v_b.precio)),
    jsonb_build_array(jsonb_build_object('metodo', 'transferencia', 'monto', v_b.precio)),
    0, v_cli) ->> 'venta_id')::UUID;
  SELECT * INTO v_antes FROM cajas WHERE id = v_caja;
  PERFORM procesar_cambio(v_venta,
    jsonb_build_array(jsonb_build_object('variante_id', v_b.id, 'cantidad', 1, 'precio_unitario', v_b.precio)),
    jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1, 'precio_unitario', v_a.precio)),
    'transferencia');
  SELECT * INTO v_despues FROM cajas WHERE id = v_caja;
  IF v_despues.total_transferencia - v_antes.total_transferencia <> -v_dif THEN
    RAISE EXCEPTION 'cambio en que se le devuelven $%: la caja se movió $% (tenía que restar $%)',
      v_dif, v_despues.total_transferencia - v_antes.total_transferencia, v_dif;
  END IF;

  -- 4. Devolución de una venta pagada: no sale plata, la caja queda igual y la
  --    clienta se queda con el saldo a favor.
  v_venta := (procesar_venta(
    to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), v_a.precio, v_a.precio,
    jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1, 'precio_unitario', v_a.precio, 'descuento_item', 0, 'subtotal', v_a.precio)),
    jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', v_a.precio)),
    0, v_cli) ->> 'venta_id')::UUID;
  SELECT * INTO v_antes FROM cajas WHERE id = v_caja;
  SELECT saldo_favor INTO v_saldo FROM clientes WHERE id = v_cli;
  PERFORM procesar_devolucion(v_venta, jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1)));
  SELECT * INTO v_despues FROM cajas WHERE id = v_caja;
  IF (v_despues.total_efectivo, v_despues.total_transferencia, v_despues.total_debito, v_despues.total_credito, v_despues.total_fiado)
     IS DISTINCT FROM (v_antes.total_efectivo, v_antes.total_transferencia, v_antes.total_debito, v_antes.total_credito, v_antes.total_fiado) THEN
    RAISE EXCEPTION 'devolución pagada: la caja se movió (efectivo $% → $%) y no tenía que tocarse',
      v_antes.total_efectivo, v_despues.total_efectivo;
  END IF;
  IF (SELECT saldo_favor FROM clientes WHERE id = v_cli) - v_saldo <> v_a.precio THEN
    RAISE EXCEPTION 'devolución pagada: el saldo a favor no subió $%', v_a.precio;
  END IF;

  -- 5. Devolución de una venta fiada: se revierte la deuda y la caja queda igual.
  v_venta := (procesar_venta(
    to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'), v_a.precio, v_a.precio,
    jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1, 'precio_unitario', v_a.precio, 'descuento_item', 0, 'subtotal', v_a.precio)),
    jsonb_build_array(jsonb_build_object('metodo', 'fiado', 'monto', v_a.precio)),
    0, v_cli) ->> 'venta_id')::UUID;
  SELECT * INTO v_antes FROM cajas WHERE id = v_caja;
  SELECT deuda_total INTO v_deuda FROM clientes WHERE id = v_cli;
  PERFORM procesar_devolucion(v_venta, jsonb_build_array(jsonb_build_object('variante_id', v_a.id, 'cantidad', 1)));
  SELECT * INTO v_despues FROM cajas WHERE id = v_caja;
  IF (v_despues.total_efectivo, v_despues.total_transferencia, v_despues.total_fiado)
     IS DISTINCT FROM (v_antes.total_efectivo, v_antes.total_transferencia, v_antes.total_fiado) THEN
    RAISE EXCEPTION 'devolución fiada: la caja se movió y no tenía que tocarse';
  END IF;
  IF v_deuda - (SELECT deuda_total FROM clientes WHERE id = v_cli) <> v_a.precio THEN
    RAISE EXCEPTION 'devolución fiada: la deuda no bajó $%', v_a.precio;
  END IF;

  RAISE NOTICE '041: todo cuadra (cambio que paga +$%, cambio que devuelve −$%, dos devoluciones sin mover la caja)', v_dif, v_dif;
END $$;
