-- ============================================================
-- TERNURA KIDS — Migración 008: Subcategorías de gastos (grupos)
-- Aplicar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Agregar columna padre_id para jerarquía de categorías
ALTER TABLE categorias_gastos ADD COLUMN padre_id UUID REFERENCES categorias_gastos(id) ON DELETE CASCADE;
CREATE INDEX idx_categorias_gastos_padre ON categorias_gastos(padre_id);

-- 2. Abrir RLS: INSERT y UPDATE para todos los autenticados (DELETE sigue siendo admin)
DROP POLICY IF EXISTS "cat_gastos_insert" ON categorias_gastos;
DROP POLICY IF EXISTS "cat_gastos_update" ON categorias_gastos;
CREATE POLICY "cat_gastos_insert" ON categorias_gastos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cat_gastos_update" ON categorias_gastos FOR UPDATE TO authenticated USING (true);

-- 3. Crear grupos padre
INSERT INTO categorias_gastos (nombre, color) VALUES
  ('Personal', '#8b5cf6'),
  ('Local',    '#ef4444');

-- 4. Reparentar categorías existentes bajo sus grupos
UPDATE categorias_gastos SET padre_id = (SELECT id FROM categorias_gastos WHERE nombre = 'Personal' AND padre_id IS NULL)
WHERE nombre IN ('Carnicería', 'Verdulería', 'Supermercado', 'Hogar', 'Transporte', 'Salud');

UPDATE categorias_gastos SET padre_id = (SELECT id FROM categorias_gastos WHERE nombre = 'Local' AND padre_id IS NULL)
WHERE nombre IN ('Alquiler', 'Servicios', 'Sueldos', 'Insumos', 'Publicidad', 'Varios');
