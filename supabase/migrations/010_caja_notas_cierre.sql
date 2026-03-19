-- Agregar campo para notas/anomalías al cierre de caja
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS notas_cierre TEXT;

COMMENT ON COLUMN cajas.notas_cierre IS 'Notas o anomalías reportadas al cerrar la caja (números que no coinciden, faltantes, etc.)';
