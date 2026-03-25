-- ============================================================
-- 016: Tablas tipos_prenda y colegios
-- ============================================================

-- Tabla tipos_prenda
CREATE TABLE tipos_prenda (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  abreviatura VARCHAR(4) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tipos_prenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos leen tipos_prenda"        ON tipos_prenda FOR SELECT USING (true);
CREATE POLICY "Solo admin modifica tipos_prenda" ON tipos_prenda FOR ALL    USING (es_admin());

INSERT INTO tipos_prenda (nombre, abreviatura) VALUES
  ('Remera Manga Corta', 'RMC'),
  ('Remera Manga Larga', 'RML'),
  ('Pantalón',           'PAN'),
  ('Jean',               'JEA'),
  ('Buzo',               'BUZ'),
  ('Campera',            'CAM'),
  ('Calza',              'CLZ'),
  ('Body',               'BOD'),
  ('Zapatillas',         'ZAP'),
  ('Vestido',            'VST'),
  ('Conjunto',           'CNJ'),
  ('Short',              'SHT'),
  ('Bermuda',            'BRM'),
  ('Medias',             'MDS'),
  ('Chomba',             'CHO'),
  ('Musculosa',          'MUS'),
  ('Pollera',            'POL'),
  ('Pijama',             'PJM'),
  ('Calzado',            'CAL');

-- Tabla colegios
CREATE TABLE IF NOT EXISTS colegios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  abreviatura VARCHAR(4) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE colegios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos leen colegios"        ON colegios FOR SELECT USING (true);
CREATE POLICY "Solo admin modifica colegios" ON colegios FOR ALL    USING (es_admin());

INSERT INTO colegios (nombre, abreviatura) VALUES
  ('San Miguel', 'SMG'),
  ('Dante',      'DAN'),
  ('Normal',     'NOR')
ON CONFLICT (nombre) DO NOTHING;
