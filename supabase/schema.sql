-- ============================================================
-- TERNURA KIDS - Schema completo
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USUARIOS (manejado por Supabase Auth)
-- Tabla de perfiles extendida
-- ============================================================
CREATE TABLE IF NOT EXISTS perfiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CATEGORÍAS
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  sistema_talles TEXT NOT NULL DEFAULT 'numerico' CHECK (sistema_talles IN ('numerico', 'letras', 'meses', 'calzado')),
  color TEXT DEFAULT '#6366f1',
  activa BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVEEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  notas TEXT,
  deuda_total NUMERIC(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_id UUID REFERENCES categorias(id),
  proveedor_id UUID REFERENCES proveedores(id),
  precio_costo NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0,
  temporada TEXT CHECK (temporada IN ('verano', 'invierno', 'todo_el_año', 'liquidacion')),
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VARIANTES (talle + stock + código de barras)
-- ============================================================
CREATE TABLE IF NOT EXISTS variantes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,
  talle TEXT NOT NULL,
  codigo_barras TEXT UNIQUE,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER DEFAULT 2,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  deuda_total NUMERIC(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAJA DIARIA
-- ============================================================
CREATE TABLE IF NOT EXISTS cajas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  monto_inicial NUMERIC(12,2) DEFAULT 0,
  total_efectivo NUMERIC(12,2) DEFAULT 0,
  total_transferencia NUMERIC(12,2) DEFAULT 0,
  total_debito NUMERIC(12,2) DEFAULT 0,
  total_credito NUMERIC(12,2) DEFAULT 0,
  total_fiado NUMERIC(12,2) DEFAULT 0,
  total_retiros NUMERIC(12,2) DEFAULT 0,
  estado TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  abierta_por UUID REFERENCES perfiles(id),
  cerrada_por UUID REFERENCES perfiles(id),
  abierta_en TIMESTAMPTZ DEFAULT NOW(),
  cerrada_en TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS retiros_caja (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  caja_id UUID REFERENCES cajas(id) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  motivo TEXT,
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VENTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS ventas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  caja_id UUID REFERENCES cajas(id),
  cliente_id UUID REFERENCES clientes(id),
  descuento NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  estado TEXT DEFAULT 'completada' CHECK (estado IN ('completada', 'anulada', 'reserva')),
  notas TEXT,
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venta_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE NOT NULL,
  variante_id UUID REFERENCES variantes(id) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento_item NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS venta_pagos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'debito', 'credito', 'fiado')),
  monto NUMERIC(12,2) NOT NULL
);

-- ============================================================
-- FIADO (deuda de clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS fiado_movimientos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) NOT NULL,
  venta_id UUID REFERENCES ventas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('cargo', 'abono')),
  monto NUMERIC(12,2) NOT NULL,
  notas TEXT,
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEVOLUCIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS devoluciones (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  venta_id UUID REFERENCES ventas(id) NOT NULL,
  variante_id UUID REFERENCES variantes(id) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  motivo TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('devolucion', 'cambio')),
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INGRESOS DE MERCADERÍA
-- ============================================================
CREATE TABLE IF NOT EXISTS ingresos_mercaderia (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  proveedor_id UUID REFERENCES proveedores(id) NOT NULL,
  numero_remito TEXT,
  total NUMERIC(12,2) DEFAULT 0,
  notas TEXT,
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingreso_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ingreso_id UUID REFERENCES ingresos_mercaderia(id) ON DELETE CASCADE NOT NULL,
  variante_id UUID REFERENCES variantes(id) NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_costo NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL
);

-- ============================================================
-- PAGOS A PROVEEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  proveedor_id UUID REFERENCES proveedores(id) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  metodo TEXT CHECK (metodo IN ('efectivo', 'transferencia', 'cheque', 'otro')),
  notas TEXT,
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HISTORIAL DE PRECIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_precios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE NOT NULL,
  precio_costo_anterior NUMERIC(12,2),
  precio_venta_anterior NUMERIC(12,2),
  precio_costo_nuevo NUMERIC(12,2),
  precio_venta_nuevo NUMERIC(12,2),
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOG DE ACTIVIDAD
-- ============================================================
CREATE TABLE IF NOT EXISTS log_actividad (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  usuario_id UUID REFERENCES perfiles(id),
  accion TEXT NOT NULL,
  tabla TEXT,
  registro_id UUID,
  detalle JSONB,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAMPAÑAS WHATSAPP
-- ============================================================
CREATE TABLE IF NOT EXISTS campanias_whatsapp (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('deuda', 'producto', 'promocion', 'personalizada')),
  estado TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada')),
  usuario_id UUID REFERENCES perfiles(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campania_destinatarios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campania_id UUID REFERENCES campanias_whatsapp(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES clientes(id) NOT NULL,
  enviado BOOLEAN DEFAULT FALSE,
  enviado_en TIMESTAMPTZ
);

-- ============================================================
-- DATOS INICIALES - Categorías
-- ============================================================
INSERT INTO categorias (nombre, sistema_talles, color) VALUES
  ('Bebé', 'meses', '#f9a8d4'),
  ('Niñas', 'numerico', '#c084fc'),
  ('Niños', 'numerico', '#60a5fa'),
  ('Calzado Nena', 'calzado', '#f472b6'),
  ('Calzado Nene', 'calzado', '#38bdf8'),
  ('Ropa Interior', 'numerico', '#86efac'),
  ('Accesorios', 'numerico', '#fcd34d'),
  ('Abrigos', 'numerico', '#fb923c'),
  ('Pijamas', 'numerico', '#a78bfa')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiado_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos_mercaderia ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingreso_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanias_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE campania_destinatarios ENABLE ROW LEVEL SECURITY;

-- Política simple: solo usuarios autenticados acceden a todo
CREATE POLICY "Usuarios autenticados" ON perfiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON categorias FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON proveedores FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON productos FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON variantes FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON clientes FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON cajas FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON retiros_caja FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON ventas FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON venta_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON venta_pagos FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON fiado_movimientos FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON devoluciones FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON ingresos_mercaderia FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON ingreso_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON pagos_proveedores FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON historial_precios FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON log_actividad FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON campanias_whatsapp FOR ALL TO authenticated USING (true);
CREATE POLICY "Usuarios autenticados" ON campania_destinatarios FOR ALL TO authenticated USING (true);
