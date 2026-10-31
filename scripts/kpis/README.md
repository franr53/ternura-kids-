# KPI del rediseño

Cómo medir las metas del rediseño de Ternura (plan en orka-brain:
`clientes/ternura-kids/especificaciones/2026-10-31-rediseno-ternura.md`).
Todo es de solo lectura sobre la base, salvo las mediciones de pantalla, que corren sólo contra
una copia local.

## Consultas (base)

Cada archivo es una sola consulta `SELECT`. Se corre en el SQL Editor de Supabase, o con el
helper de solo lectura de Fran, reemplazando las fechas:

```bash
ternura-sql "$(sed 's/{{desde}}/2026-10-01/; s/{{hasta}}/2026-10-31/' scripts/kpis/ventas.sql | grep -v '^\s*--')"
ternura-sql "$(sed 's/{{al}}/2026-10-31/' scripts/kpis/fiado.sql | grep -v '^\s*--')"
ternura-sql "$(grep -v '^\s*--' scripts/kpis/stock.sql)"
```

| Archivo | Mide | Meta |
|---|---|---|
| `ventas.sql` | ventas, venta bruta y neta, ticket, prendas por venta, % de 1 prenda, descuento, margen, % fiado, **% sin clienta**, % viernes+sábado, clientas nuevas | ventas sin clienta < 25% |
| `fiado.sql` | deudoras, deuda total, **en riesgo a 60 días** (no pagan hace 60+ días y deben desde antes), lo mismo a 90, cobrado en 30 días | baja mes a mes la deuda en riesgo |
| `stock.sql` | prendas y valor a costo, **talles en negativo**, dormido (nunca vendió y llegó hace 60+ días), sin costo, sin código | 0 talles en negativo |

**Probadas contra prod el 31/10/2026** reproduciendo informes ya verificados:
- `ventas.sql` da igual, campo por campo, que agosto completo, 1–27 de septiembre y septiembre
  completo (ventas, montos, ticket, prendas, descuento, margen, fiado, sin clienta, nuevas).
  Octubre 1–27 da 193 ventas contra 194 del 27/10: una venta de $58.500 del 26/10 se anuló el 28/10.
- `fiado.sql` con `{{al}} = 2026-10-09` da la foto del "corte 10/10" de antes: 128 deudoras,
  $9.116.027, 19 en riesgo a 90 días por $1.311.070, 27 sin pago a 90 incluyendo nuevas
  ($1.646.070), 4 sin movimiento.
- `stock.sql` no tiene historia (es siempre hoy); usa la definición de dormido del 10/10/2026.

## Mediciones de pantalla (copia local)

En `ui/`. Necesitan la app compilada (`next build` + `next start`) apuntando a una Supabase
local, y un JSON con las cuentas de prueba `[{email, password}, …]` (mamá primero, vendedora
segunda). Cortan cualquier pedido a `*.supabase.co`.

| Script | Mide | Hoy (31/10) | Meta |
|---|---|---|---|
| `medir-flujos.mjs` | pasos (toques + campos + escaneos) de 3 ventas comunes | contado 4 · con clienta 6 · fiado 7 | cargar la clienta no suma más de 1 paso |
| `datos-sensibles.mjs` | qué datos sensibles ve la cuenta de la vendedora | ve 8 de 8 | 0 de 8 |

```bash
node scripts/kpis/ui/medir-flujos.mjs http://127.0.0.1:3102 usuarios.json <cod1> <cod2> <cod3> "<clienta>"
node scripts/kpis/ui/datos-sensibles.mjs http://127.0.0.1:3102 usuarios.json
```

`medir-flujos.mjs` hace ventas de verdad en la copia local (baja stock y suma deuda).
