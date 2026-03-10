# TernuraKids — Contexto del proyecto

Sistema de gestión para tienda de ropa infantil. POS + inventario + clientes + caja + reportes.

## Stack
- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Supabase** (PostgreSQL + Auth con SSR)
- **Tailwind CSS 4**, **shadcn/ui** (componentes en `src/components/ui/`)
- **Recharts** (gráficos), **Sonner** (toasts), **Lucide React** (iconos)

## Estructura
```
src/
  app/
    (app)/          ← Rutas protegidas (layout con sidebar)
      dashboard/    ← KPIs, ventas, top productos, deudores
      pos/          ← Punto de venta (barcode + carrito + pago)
      inventario/   ← Productos + variantes/talles + stock
      clientes/     ← Clientes + deuda + historial fiado
      proveedores/  ← Proveedores + deuda + ingreso mercadería
      caja/         ← Apertura/cierre + retiros
      reportes/     ← Ventas por período + stock + CSV export
      etiquetas/    ← Generación e impresión de etiquetas
      whatsapp/     ← Mensajes a deudores y campañas
      importar/     ← CSV desde Contagram
    login/          ← Auth con Supabase
  components/
    pos/
      buscador-producto.tsx   ← Búsqueda fuzzy, carga todo en mount
      cliente-selector.tsx    ← Búsqueda fuzzy, carga todo en mount
      pago-dialog.tsx         ← Selección de método de pago (simple o mixto)
      nueva-venta-dialog.tsx  ← Modal unificado: cliente + productos + pago
    layout/
      sidebar.tsx
    ui/             ← shadcn components
  lib/
    supabase/client.ts   ← Cliente browser
    supabase/server.ts   ← Cliente server (cookies)
    utils.ts             ← cn(), formatPrecio() (ARS)
  types/index.ts    ← Todos los tipos del dominio
  proxy.ts          ← Middleware de autenticación
```

## Tipos clave (`src/types/index.ts`)
- `MetodoPago`: `efectivo | transferencia | debito | credito | fiado`
- `SistemaTalles`: `numerico | letras | meses | calzado`
- `Temporada`: `verano | invierno | todo_el_año | liquidacion`
- `EstadoVenta`: `completada | anulada | reserva`
- `Rol`: `admin | vendedor`
- **`Producto`** no tiene campo `marca` — se usa `proveedor.nombre` como marca

## Convenciones
- Moneda: ARS con `formatPrecio()` → `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`
- Estado local con `useState`/`useEffect`, sin state manager global
- Llamadas directas a Supabase desde componentes (no API routes)
- Búsquedas fuzzy: normalizar acentos + split por palabras, filtrar client-side
- Descuento efectivo en etiquetas: 20% sobre `precio_venta`

## Dependencias adicionales
- `xlsx@0.18.5` (SheetJS) — leer archivos .xlsx/.xls/.csv en el browser (importar clientes)

## Paleta de colores
- **Marca**: teal del logo (`#4EC3BD`) → usar clases `teal-*` de Tailwind
- **Primario (botones, activos)**: `bg-teal-500` / `hover:bg-teal-600`
- **Fondos suaves**: `bg-teal-50`
- **Texto de marca**: `text-teal-600` / `text-teal-700`
- **NO usar** clases `pink-*` en ningún componente nuevo
- **Gráficos Recharts**: color primario `#4EC3BD`

## PWA (Progressive Web App)
- `src/app/manifest.ts` — web app manifest (nombre, iconos, shortcuts, theme teal)
- `public/sw.js` — service worker: cache estáticos, network-first para navegación, Supabase API nunca se cachea
- `public/icons/icon.svg` — ícono SVG de la app (osito con moño naranja sobre fondo teal)
- `src/app/layout.tsx` — registro del SW vía script inline, metadata completa, viewport, themeColor
- Selects usan `value={campo || '__none__'}` + `onValueChange={v => set(v === '__none__' ? '' : (v ?? ''))}` para evitar mostrar UUIDs

## Migraciones Supabase
- `supabase/migrations/001_mejoras_produccion.sql` — función `decrementar_stock` (RPC), triggers `updated_at`, índices de rendimiento, RLS admin vs vendedor
- **CRÍTICO**: aplicar la migración antes de usar el POS (la función `decrementar_stock` es requerida por `src/lib/services/ventas.ts`)

## Decisiones tomadas
- `src/proxy.ts` en vez de `middleware.ts` (fix para Next.js 16)
- Etiquetas: usa JsBarcode CDN (`jsbarcode@3.11.6`) para Code 128 real
- `NuevaVentaDialog` tiene su propia lógica de confirmación de venta (independiente del POS page)
- `BuscadorProducto` y `ClienteSelector` cargan todos los registros en mount y filtran client-side (máx 500 variantes, sin límite clientes)
- Stock 0 no bloquea la venta — muestra badge naranja "⚠ Sin stock" + toast.warning
- Búsqueda por código de barras: `matchVariante()` en buscador-producto y nueva-venta-dialog
- Cobro de deuda: mini modal inline en POS (cuando cliente tiene deuda) + sección mejorada en `/clientes/[id]`
- Filtros de anomalías en inventario: calculados client-side (sin_codigo, cod_duplicado, nombre_repetido, precio_invalido)
- Importar clientes: `/clientes/importar` — sube xlsx, auto-detecta columnas, mapeo manual, valida duplicados, inserta en Supabase
