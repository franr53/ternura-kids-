-- KPI del fiado (cuenta corriente) a una fecha de corte. Reemplazar {{al}} por 'AAAA-MM-DD'
-- (se toman los movimientos hasta el final de ese día, hora de Argentina; un "corte al 10/10" de los
-- informes anteriores equivale a {{al}} = 09/10). Sólo lectura.
-- Fuente: fiado_movimientos (el libro), no clientes.deuda_total. Un abono sin metodo_pago es una
-- reversa por devolución o anulación, no un pago: no cuenta como "pagó".
with p as (select date '{{al}}' as al),
m as (
  select fm.*, (fm.creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
  from fiado_movimientos fm, p
  where (fm.creado_en at time zone 'America/Argentina/Buenos_Aires')::date <= p.al
),
por_clienta as (
  select cliente_id,
    sum(case when tipo = 'cargo' then monto else -monto end) as saldo,
    max(dia) filter (where tipo = 'abono' and metodo_pago is not null) as ultimo_pago,
    min(dia) filter (where tipo = 'cargo') as primer_cargo,
    max(dia) as ultimo_movimiento
  from m group by 1
),
d as (select * from por_clienta where saldo > 0)
select
  count(*) as deudoras,
  sum(saldo)::bigint as deuda_total,
  -- META "fiado bajo control": deudoras que no pagan hace más de 60 días y deben desde antes
  count(*) filter (where coalesce(ultimo_pago, primer_cargo) < (select al from p) - 60) as en_riesgo_60d,
  sum(saldo) filter (where coalesce(ultimo_pago, primer_cargo) < (select al from p) - 60)::bigint as monto_en_riesgo_60d,
  -- las mismas medidas a 90 días (para comparar con los informes anteriores)
  count(*) filter (where coalesce(ultimo_pago, primer_cargo) < (select al from p) - 90) as en_riesgo_90d,
  sum(saldo) filter (where coalesce(ultimo_pago, primer_cargo) < (select al from p) - 90)::bigint as monto_en_riesgo_90d,
  count(*) filter (where ultimo_pago is null or ultimo_pago < (select al from p) - 90) as sin_pago_90d_incl_nuevas,
  sum(saldo) filter (where ultimo_pago is null or ultimo_pago < (select al from p) - 90)::bigint as monto_sin_pago_90d_incl_nuevas,
  count(*) filter (where ultimo_movimiento < (select al from p) - 90) as sin_movimiento_90d,
  -- cobros reales de los últimos 30 días
  (select sum(monto) from m where tipo = 'abono' and metodo_pago is not null and dia > (select al from p) - 30)::bigint as cobrado_ult_30d
from d
