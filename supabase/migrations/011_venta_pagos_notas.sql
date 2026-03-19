-- Agregar campo notas a venta_pagos para guardar info del proveedor destino en transferencias
ALTER TABLE venta_pagos ADD COLUMN IF NOT EXISTS notas TEXT;
