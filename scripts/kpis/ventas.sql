-- KPI de ventas de un período (fechas en hora de Argentina, ambos extremos incluidos).
-- Reemplazar {{desde}} y {{hasta}} por fechas 'AAAA-MM-DD'. Una sola consulta, sólo lectura.
-- Reglas (ver orka-brain, "cómo se mueve la plata"): sólo ventas 'completada'; las devoluciones
-- parciales sobre esas ventas se restan para el neto; una venta es "fiado" si tiene un pago con
-- metodo = 'fiado'; el resto es contado.
with p as (select date '{{desde}}' as desde, date '{{hasta}}' as hasta),
v as (
  select v.*, (v.creado_en at time zone 'America/Argentina/Buenos_Aires') as local
  from ventas v, p
  where v.estado = 'completada'
    and (v.creado_en at time zone 'America/Argentina/Buenos_Aires')::date between p.desde and p.hasta
),
pagos as (
  select vp.venta_id, sum(vp.monto) filter (where vp.metodo = 'fiado') as fiado
  from venta_pagos vp join v on v.id = vp.venta_id group by 1
),
items as (
  select vi.venta_id, sum(vi.cantidad) as prendas, sum(vi.cantidad * coalesce(va.precio_costo, 0)) as costo
  from venta_items vi join v on v.id = vi.venta_id left join variantes va on va.id = vi.variante_id group by 1
),
dev as (
  select coalesce(sum(d.total_devuelto), 0) as devuelto,
         coalesce(sum((select sum((it->>'cantidad')::numeric * coalesce(va.precio_costo, 0))
                       from jsonb_array_elements(d.items_devueltos) it
                       left join variantes va on va.id = (it->>'variante_id')::uuid)), 0) as costo_devuelto
  from devoluciones d join v on v.id = d.venta_id
),
primera as (
  select cliente_id, min((creado_en at time zone 'America/Argentina/Buenos_Aires')::date) as dia
  from ventas where estado = 'completada' and cliente_id is not null group by 1
)
select
  count(*) as ventas,
  sum(v.total)::bigint as venta_bruta,
  (sum(v.total) - (select devuelto from dev))::bigint as venta_neta,
  round(sum(v.total) / nullif(count(*), 0)) as ticket_promedio,
  round(sum(i.prendas)::numeric / nullif(count(*), 0), 2) as prendas_por_venta,
  round(100.0 * count(*) filter (where i.prendas = 1) / nullif(count(*), 0), 1) as pct_ventas_de_1_prenda,
  round(100.0 * sum(v.descuento) / nullif(sum(v.subtotal), 0), 2) as pct_descuento,
  -- margen sobre la venta neta, con el costo actual de cada talle (no hay costo histórico)
  round(100.0 * ((sum(v.total) - (select devuelto from dev)) - (sum(i.costo) - (select costo_devuelto from dev)))
        / nullif(sum(v.total) - (select devuelto from dev), 0), 1) as pct_margen,
  round(100.0 * sum(coalesce(pg.fiado, 0)) / nullif(sum(v.total), 0), 1) as pct_fiado,
  -- META "saber a quién se le vende": bajar de 47,9% (oct) a menos de 25%
  round(100.0 * count(*) filter (where v.cliente_id is null) / nullif(count(*), 0), 1) as pct_ventas_sin_clienta,
  round(100.0 * count(*) filter (where v.cliente_id is null and coalesce(pg.fiado, 0) = 0)
        / nullif(count(*) filter (where coalesce(pg.fiado, 0) = 0), 0), 1) as pct_contado_sin_clienta,
  -- picos: viernes (5) y sábado (6)
  round(100.0 * sum(v.total) filter (where extract(isodow from v.local) in (5, 6)) / nullif(sum(v.total), 0), 1) as pct_venta_vie_sab,
  -- clientas cuya primera compra cae en el período (la fecha de alta de la ficha no sirve:
  -- muchas se cargan después o nunca compran)
  (select count(*) from primera, p where primera.dia between p.desde and p.hasta) as clientas_nuevas
from v
left join pagos pg on pg.venta_id = v.id
left join items i on i.venta_id = v.id
