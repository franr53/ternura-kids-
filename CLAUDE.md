# TernuraKids — CLAUDE.md

## Modelo de IA
- **Plan mode**: Claude Opus 4.6 (`claude-opus-4-6`)
- **Resto**: Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **OBLIGATORIO**: Entrar en modo plan (`EnterPlanMode`) antes de cualquier tarea con estadísticas, gráficos, dashboard, reportes, caja o gastos.

---

## Reglas de trabajo

1. **Alcance primero**: Confirmá qué archivos tocás y cuáles NO antes de escribir código. Más de 3 archivos → listá cambios antes de ejecutar. Nunca modifiques migraciones, RLS o auth sin confirmación explícita.
2. **Modo plan**: Para tareas no triviales (3+ pasos o arquitectura), planificá antes de ejecutar.
3. **Subagentes**: Delegá investigación, exploración y análisis paralelo. Contexto principal solo para ejecución.
4. **Verificación (OBLIGATORIO)**: Nunca marques tarea como completada sin probar el flujo completo con Playwright (`http://localhost:3000`). Para cualquier operación que guarde datos en DB: ejecutar el guardado real, verificar que no hay errores en consola ni en toast, y confirmar que los datos quedaron correctos. No hay excepción a esta regla.
5. **Claridad**: Código claro > elegante. Para cambios complejos, buscá la forma más simple.
6. **Errores**: Si recibís un reporte, arreglalo autónomamente. No pidas más info si podés encontrarla.
7. **Commits atómicos**: `tipo(módulo): descripción`. Un cambio funcional = un commit.
8. **Tokens**: Más de 2 archivos → pedí aprobación. Nunca reescribas un archivo que funciona para "mejorar el estilo".
9. **Diseño (OBLIGATORIO)**: NUNCA regenerar componente completo por cambio visual. Usar `str_replace` sobre líneas exactas. Mostrar fragmento afectado y esperar aprobación. Cambio > 20 líneas → dividir en pasos.

---

## Stack
- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Supabase** (PostgreSQL + Auth con SSR)
- **Tailwind CSS 4**, **shadcn/ui** (`src/components/ui/`)
- **Recharts**, **Sonner** (toasts), **Lucide React**
- `xlsx@0.18.5` (SheetJS) — importar clientes

## Convenciones
- Moneda ARS: `formatPrecio()` en `src/lib/utils.ts` → `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`
- Dinero siempre en centavos (enteros), `Math.round()` antes de guardar en DB
- Estado local con `useState`/`useEffect`, sin state manager global
- Llamadas directas a Supabase desde componentes (no API routes)
- Búsquedas fuzzy: normalizar acentos + split por palabras, filtrar client-side
- Validaciones en frontend Y backend

## Paleta de colores
- **Primario**: `bg-teal-500` / `hover:bg-teal-600` — `#4EC3BD`
- **Fondos suaves**: `bg-teal-50` | **Texto**: `text-teal-600` / `text-teal-700`
- **Recharts**: `#4EC3BD` | **NO usar** clases `pink-*`

## PWA
- `src/app/manifest.ts`, `public/sw.js`, `public/icons/icon.svg`
- Selects: `value={campo || '__none__'}` + `onValueChange={v => set(v === '__none__' ? '' : (v ?? ''))}`

## Migraciones Supabase (`supabase/migrations/`)
- **001**: `decrementar_stock` RPC, triggers, índices, RLS — **CRÍTICO**: requerida por `ventas.ts`
- **016**: tablas `tipos_prenda` y `colegios` con `abreviatura`
- **017**: `fuente_pago` + `proveedor_id` en `gastos`; `gasto_id` en `pagos_proveedores` — aplicada
- **018**: RLS fix `tipos_prenda` y `colegios` — aplicada
- **021**: tabla `cambios` + RPC `procesar_cambio` (devolucion/cambio de prendas) — aplicada
- Pedí confirmación ANTES de aplicar cualquier migración. Seguir numeración existente.

## Decisiones clave
- `src/proxy.ts` en vez de `middleware.ts` (fix Next.js 16)
- Etiquetas: JsBarcode CDN (`jsbarcode@3.11.6`) en iframe oculto con html2canvas + jsPDF
- `Producto` no tiene campo `marca` → tabla renombrada a `marcas`, `marca_id`, campo `nombre_base`
- `BuscadorProducto` y `ClienteSelector`: cargan todo en mount, filtran client-side (máx 500 variantes)
- Stock 0 no bloquea venta — badge naranja "⚠ Sin stock" + toast.warning
- Inventario: 1 fila por variante (flatMap), join de marcas manual en JS (cache issue PostgREST)
- Wizard nuevo producto: nombre `[Tipo] [Detalle] [Marca] [Colegio si Colegial]` | barcode `[TIPO.abrev][CAT][MARCA][COLEGIO.abrev][talle]`
- Multi-negocio: cualquier modelo nuevo debe considerar si aplica solo a ropa o es genérico
- **Devolución/Cambio** (`devolucion-dialog.tsx`): flujo multi-paso (1→2→2b→3→4). `ClientePanel` local con historial filtrable (Fiado/Todas) y balance proyectado. `calcularBalanceProyectado()` replica lógica del RPC cliente-side. Paso 2b busca por producto→talle igual que POS. Detección de código de barras: `/^[A-Z0-9]{4,}$/i` sin espacios.

---

## Reglas críticas (lecciones)

**DB y datos:**
- Contadores acumulativos (`deuda_total`, `caja.total_*`) → siempre RPC con `SET campo = campo + valor`, nunca read+add+write desde cliente
- Stock → siempre `supabase.rpc('incrementar_stock')` / `supabase.rpc('decrementar_stock')`, nunca read+update manual
- Toda operación multi-paso con dinero debe verificar cada resultado y hacer rollback si falla
- `Math.round()` antes de guardar montos — los descuentos porcentuales producen floats
- Operaciones batch → `Promise.all()` o filtro `.in()`, nunca loop secuencial

**RLS:**
- Tablas operativas (ingresos, pagos) → INSERT `WITH CHECK (true)`, solo DELETE requiere `es_admin()`
- Tablas de configuración editables desde UI (tipos_prenda, colegios, categorías) → INSERT/UPDATE `WITH CHECK (true)`. NUNCA `FOR ALL USING (es_admin())`

**PostgREST:**
- Tras rename en Supabase, si PostgREST falla: quitar `.order()` con col renombrada, fetchear tabla por separado y hacer join manual con Map

**Frontend:**
- `padding-bottom` del `<main>` debe ser >= altura del nav fijo en todas las resoluciones. No reducir con breakpoints si el nav sigue visible
- `useSearchParams` en Next.js 16 requiere Suspense boundary o `export const dynamic = 'force-dynamic'`
- En mobile: `navigator.share({ files })` abre picker genérico (no WhatsApp directo). Desktop: descargar + abrir wa.me/{tel}
- Tabla con variantes aplanadas: cada fila debe ser autocontenida (mostrar marca/categoría en TODAS las filas)
- Todo `Promise.all` con queries debe verificar `error` de cada resultado individualmente
- Cuando se agrega columna por migración, actualizar el tipo TypeScript correspondiente
- Recursos con estado temporal (`abierta`, `en_progreso`) → detectar estado stale al cargar + mecanismo de resolución

**Código:**
- Errores Supabase: incluir `error?.message` en toast, nunca texto hardcodeado
- Tipos parciales: crear tipo local si la query selecciona pocas columnas
- API keys: nunca pedir que el usuario las pegue en el chat — escribirlas en `.env.local`
- Carga masiva: acumular en memoria, confirmar en batch al final. No interrumpir con confirmaciones individuales
- Cuando un pago tiene contexto adicional (proveedor destino, referencia), guardarlo en `venta_pagos.notas` al momento de la venta
- Cuando se muestra proveedor en contexto de transferencia, siempre mostrar `alias_cbu` si existe
