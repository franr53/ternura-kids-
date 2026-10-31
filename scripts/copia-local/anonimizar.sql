-- Copia local de Ternura: reemplaza datos personales por inventados. NUNCA correr en prod.
SET session_replication_role = replica;
WITH nombres AS (SELECT ARRAY['Sofía','Valentina','Camila','Lucía','Martina','Julieta','Florencia','Agustina','Micaela','Romina','Carolina','Paula','Natalia','Daniela','Gabriela','Lorena','Mariana','Vanesa','Silvina','Andrea','Belén','Celeste','Jimena','Noelia','Rocío','Milagros','Antonella','Brenda','Yanina','Melina'] AS n,
                        ARRAY['González','Rodríguez','Gómez','Fernández','López','Díaz','Martínez','Pérez','García','Sánchez','Romero','Sosa','Torres','Álvarez','Ruiz','Ramírez','Flores','Acosta','Benítez','Medina','Herrera','Suárez','Aguirre','Giménez','Molina','Castro','Ortiz','Silva','Núñez','Luna'] AS a),
     orden AS (SELECT id, row_number() OVER (ORDER BY creado_en, id) AS i FROM clientes)
UPDATE clientes c SET
  nombre = (SELECT a[1 + (o.i / 30 + o.i * 11) % 30] || ' ' || n[1 + o.i % 30] FROM nombres),
  telefono = CASE WHEN c.telefono IS NULL OR c.telefono = '' THEN c.telefono ELSE '11' || lpad(((o.i * 7919) % 100000000)::text, 8, '0') END,
  direccion = CASE WHEN c.direccion IS NULL OR c.direccion = '' THEN c.direccion ELSE 'Calle ' || (100 + o.i) END
FROM orden o WHERE o.id = c.id;
UPDATE marcas SET telefono = NULL, email = NULL, direccion = NULL, alias_cbu = NULL, notas = NULL;
UPDATE ventas SET notas = NULL WHERE notas IS NOT NULL;
UPDATE venta_pagos SET notas = NULL WHERE notas IS NOT NULL;
UPDATE fiado_movimientos SET notas = NULL WHERE notas IS NOT NULL;
UPDATE pagos_proveedores SET notas = NULL WHERE notas IS NOT NULL;
UPDATE gastos SET notas = NULL WHERE notas IS NOT NULL;
UPDATE cajas SET notas_cierre = NULL WHERE notas_cierre IS NOT NULL;
SET session_replication_role = origin;
