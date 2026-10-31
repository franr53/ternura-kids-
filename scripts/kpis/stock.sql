-- KPI de stock en este momento (el stock no tiene historia: siempre es "hoy"). Sólo lectura.
-- Sólo talles de productos activos. "Dormido" (definición del 10/10/2026) = tiene stock, se cargó
-- hace más de 60 días y NUNCA vendió una unidad. Lo cargado en los últimos 60 días va aparte.
-- El valor es a costo actual del talle.
with va as (
  select v.*, (v.creado_en at time zone 'America/Argentina/Buenos_Aires')::date as alta
  from variantes v join productos p on p.id = v.producto_id
  where p.activo
),
vendidos as (
  select distinct vi.variante_id
  from venta_items vi join ventas v on v.id = vi.venta_id
  where v.estado = 'completada'
),
g as (
  select va.*,
    case when va.alta > (now() at time zone 'America/Argentina/Buenos_Aires')::date - 60 then 'recien_llegado'
         when vd.variante_id is null then 'dormido'
         else 'se_vende' end as grupo
  from va left join vendidos vd on vd.variante_id = va.id
)
select
  sum(stock) filter (where stock > 0) as prendas,
  sum(stock * coalesce(precio_costo, 0)) filter (where stock > 0)::bigint as valor_a_costo,
  -- META "stock confiable": 0 talles en negativo (53 el 27/10)
  count(*) filter (where stock < 0) as talles_en_negativo,
  sum(stock) filter (where stock < 0) as unidades_en_negativo,
  count(*) filter (where stock > 0 and grupo = 'dormido') as talles_dormidos_60d,
  sum(stock) filter (where stock > 0 and grupo = 'dormido') as prendas_dormidas_60d,
  sum(stock * coalesce(precio_costo, 0)) filter (where stock > 0 and grupo = 'dormido')::bigint as valor_dormido_60d,
  sum(stock * coalesce(precio_costo, 0)) filter (where stock > 0 and grupo = 'recien_llegado')::bigint as valor_recien_llegado,
  count(*) filter (where stock > 0 and (precio_costo is null or precio_costo = 0)) as talles_con_stock_sin_costo,
  count(*) filter (where stock > 0 and (codigo_barras is null or codigo_barras = '')) as talles_con_stock_sin_codigo,
  (select count(*) from productos where activo) as productos_activos
from g
