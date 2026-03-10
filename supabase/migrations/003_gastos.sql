-- ============================================================
-- TERNURA KIDS — Migración 003: Módulo de Gastos
-- Aplicar en Supabase Dashboard → SQL Editor
-- ============================================================

-- Categorías de gastos (personalizables por la dueña)
CREATE TABLE IF NOT EXISTS categorias_gastos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#6b7280',
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Seed inicial de categorías
INSERT INTO categorias_gastos (nombre, color) VALUES
  ('Alquiler',    '#ef4444'),
  ('Servicios',   '#f97316'),
  ('Sueldos',     '#8b5cf6'),
  ('Insumos',     '#06b6d4'),
  ('Publicidad',  '#ec4899'),
  ('Varios',      '#6b7280')
ON CONFLICT DO NOTHING;

-- Gastos del negocio
CREATE TABLE IF NOT EXISTS gastos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  concepto     TEXT NOT NULL,
  categoria_id UUID REFERENCES categorias_gastos(id) ON DELETE SET NULL,
  monto        NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  metodo_pago  TEXT NOT NULL DEFAULT 'efectivo',
  notas        TEXT,
  usuario_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_gastos_fecha      ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria  ON gastos(categoria_id);

-- RLS categorias_gastos
ALTER TABLE categorias_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_gastos_select" ON categorias_gastos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_gastos_insert" ON categorias_gastos FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "cat_gastos_update" ON categorias_gastos FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "cat_gastos_delete" ON categorias_gastos FOR DELETE TO authenticated USING (es_admin());

-- RLS gastos: todos leen e insertan; solo admin elimina
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gastos_select" ON gastos FOR SELECT TO authenticated USING (true);
CREATE POLICY "gastos_insert" ON gastos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gastos_update" ON gastos FOR UPDATE TO authenticated USING (es_admin());
CREATE POLICY "gastos_delete" ON gastos FOR DELETE TO authenticated USING (es_admin());
