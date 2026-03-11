-- Alias CBU/CVU del proveedor para transferencias
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS alias_cbu text;
