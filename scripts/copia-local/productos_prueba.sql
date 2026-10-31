-- Copia local: 120 productos de prueba para pasar los 1.000 activos. Se borran con borrar_productos_prueba.sql
WITH cat AS (SELECT id FROM categorias WHERE activa ORDER BY nombre LIMIT 1),
nuevos AS (
  INSERT INTO productos (nombre_base, categoria_id, activo)
  SELECT 'Prueba paginado ' || lpad(g::text, 3, '0'), (SELECT id FROM cat), true FROM generate_series(1, 120) g
  RETURNING id, nombre_base)
INSERT INTO variantes (producto_id, talle, stock, stock_minimo, precio_venta, precio_costo, codigo_barras)
SELECT id, 'U', 1, 0, 1000, 500, 'PRUEBAPAG' || right(nombre_base, 3) FROM nuevos;
