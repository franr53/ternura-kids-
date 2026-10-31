-- Copia local: borra los productos de prueba y las ventas de prueba que los usaron.
SET session_replication_role = replica;
WITH vv AS (SELECT DISTINCT vi.venta_id FROM venta_items vi JOIN variantes v ON v.id = vi.variante_id WHERE v.codigo_barras LIKE 'PRUEBAPAG%')
, a AS (DELETE FROM venta_pagos WHERE venta_id IN (SELECT venta_id FROM vv))
, b AS (DELETE FROM venta_items WHERE venta_id IN (SELECT venta_id FROM vv))
DELETE FROM ventas WHERE id IN (SELECT venta_id FROM vv);
DELETE FROM variantes WHERE codigo_barras LIKE 'PRUEBAPAG%';
DELETE FROM productos WHERE nombre_base LIKE 'Prueba paginado %';
SET session_replication_role = origin;
