-- ============================================================
-- TERNURA KIDS — Migración 014: Limpiar datos prueba + categorías
-- Aplicar en Supabase Dashboard → SQL Editor
-- ============================================================

-- ① LIMPIAR DATOS DE PRUEBA (NO toca perfiles/usuarios)
TRUNCATE TABLE
  campania_destinatarios,
  campanias_whatsapp,
  log_actividad,
  historial_precios,
  devoluciones,
  pagos_proveedores,
  ingreso_items,
  ingresos_mercaderia,
  retiros_caja,
  cajas,
  venta_pagos,
  venta_items,
  ventas,
  fiado_movimientos,
  clientes,
  variantes,
  productos,
  proveedores,
  categorias
CASCADE;

-- ② CATEGORÍAS NUEVAS (basadas en datos reales + nueva Colegial)
INSERT INTO categorias (nombre, sistema_talles, color) VALUES
  ('Bebé',          'meses',    '#f9a8d4'),
  ('Nena',          'numerico', '#c084fc'),
  ('Nene',          'numerico', '#60a5fa'),
  ('Calzado',       'calzado',  '#f472b6'),
  ('Colegial',      'numerico', '#34d399'),
  ('Ropa Interior', 'numerico', '#86efac'),
  ('Accesorios',    'numerico', '#fcd34d'),
  ('Perfumería',    'numerico', '#fb923c');

-- ============================================================
-- ✅ Migración completa
-- Próximos pasos:
--   1. Ir a /importar/inicial en la app
--   2. Subir Listado de Productos → confirmar
--   3. Subir Cuentas Corrientes → confirmar
--   4. Subir Informe de Ventas → confirmar
-- ============================================================
