# AUDITORÍA TÉCNICA PRE-LANZAMIENTO — TernuraKids

**Fecha**: 2026-03-18
**Auditor**: Claude (rol ingeniero senior)
**Scope**: Revisión completa pre-producción
**Stack**: Next.js 16 + React 19 + Supabase + Tailwind CSS 4

---

## RESUMEN EJECUTIVO

| Categoría | 🔴 Crítico | ⚠️ Importante | 💡 Mejora | ✅ OK |
|-----------|-----------|--------------|----------|------|
| Velocidad | 0 | 4 | 0 | 2 |
| Cálculos | 1 | 3 | 0 | 0 |
| Seguridad | 0 | 3 | 2 | 4 |
| Código | 0 | 3 | 0 | 4 |
| Backend/DB | 2 | 3 | 1 | 3 |
| PWA | 0 | 4 | 0 | 2 |
| Deploy | 0 | 1 | 2 | 1 |
| **Total** | **3** | **21** | **5** | **16** |

### TOP 5 para resolver ANTES de lanzar:

1. **🔴 Errores silenciosos en confirmarVenta** — venta se crea pero items/stock pueden fallar sin aviso
2. **🔴 Race conditions en deuda** (clientes y proveedores) — ventas simultáneas pisan totales
3. **🔴 Stock negativo permitido** — decidir si es intencional y documentar, o agregar CHECK
4. **⚠️ Float en cálculos de dinero** — agregar Math.round antes de guardar
5. **⚠️ Headers de seguridad HTTP** — clickjacking posible sin X-Frame-Options

---

## 1. VELOCIDAD

### ✅ APROBADO — Build exitoso
- `next build` compila sin errores en 25.3s (Turbopack)
- TypeScript: **0 errores** en `tsc --noEmit`

### ⚠️ IMPORTANTE — Bundle size total: 3.2 MB (JS sin comprimir)
- **Chunk más grande**: 402 KB (`f9a4eca87e75a791.js` — probablemente Recharts + framer-motion)
- **2 chunks de 330 KB** duplicados (posible code splitting subóptimo)
- Con gzip/brotli baja a ~800KB-1MB, dentro del rango aceptable pero en el límite
- **Impacto**: primera carga lenta en móviles con 3G
- **Fix**: lazy import de Recharts y framer-motion en dashboard (`dynamic(() => import(...), { ssr: false })`)

### ✅ APROBADO — Índices de DB
- Migración 001 crea 14 índices: variantes, productos, ventas, cajas, clientes, fiado, venta_items, venta_pagos
- Dashboard usa RPC `dashboard_kpis` que consolida 6 queries en 1

### ⚠️ IMPORTANTE — N+1 en ingreso mercadería
- **Archivo**: `src/app/(app)/proveedores/ingreso/page.tsx:302`
- `for (const item of items)` llama `incrementar_stock` secuencialmente en lugar de `Promise.all`
- **Impacto**: 10 items = 10 RTTs secuenciales (~2-3 seg)
- **Fix**: cambiar a `Promise.all(items.map(item => supabase.rpc('incrementar_stock', ...)))`

### ⚠️ IMPORTANTE — N+1 en auto-cierre de caja
- **Archivo**: `src/app/(app)/caja/page.tsx:104-109`
- Loop secuencial `for (const c of autoCerrar)` llamando `.update()` individual por caja stale
- **Impacto**: si hay 10 cajas viejas abiertas, 10 queries secuenciales
- **Fix**: usar filtro `.in('id', ids)` o `Promise.all()`

### ⚠️ IMPORTANTE — 22 queries con `select('*')`
- `src/components/pos/nueva-venta-dialog.tsx:70-71` (clientes + proveedores)
- `src/app/(app)/clientes/page.tsx:44` (todos los clientes)
- `src/app/(app)/caja/page.tsx:42,57,89,264` (cajas)
- `src/app/(app)/whatsapp/page.tsx:65-66`
- Y 12+ más
- **Impacto**: transfiere columnas innecesarias, mayor latencia en mobile
- **Fix**: usar `.select('id, nombre, deuda_total, telefono')` con las columnas necesarias

### ⚠️ IMPORTANTE — Cache en localStorage sin TTL
- **Archivo**: `src/lib/hooks/use-cache.ts`
- Guarda `ts` pero nunca lo valida — el caché nunca expira
- **Impacto**: datos stale se muestran brevemente antes del fetch (aceptable como SWR), pero localStorage se llena indefinidamente
- **Fix**: agregar TTL y limpieza periódica, o usar sessionStorage

---

## 2. CÁLCULOS

### 🔴 CRÍTICO — Aritmética float en dinero
- **CLAUDE.md dice**: "Manejo de dinero siempre en centavos (enteros), nunca en floats"
- **Realidad**: todo el código opera en pesos con floats
- **Archivo clave**: `src/components/pos/nueva-venta-dialog.tsx:164`
  ```js
  subtotal = carrito.reduce((s, i) => s + i.precio * (1 - i.descuentoItem / 100) * i.cantidad, 0)
  montoDesc = subtotal * (descTotal / 100)  // float division!
  ```
- **Archivo**: `src/lib/services/ventas.ts:83`
  ```js
  subtotal: item.precio * (1 - item.descuentoItem / 100) * item.cantidad  // float
  ```
- **Impacto**: Para precios ARS típicos (enteros como $15.000), el riesgo es bajo. Pero descuentos fraccionarios (ej: 15% de $13.500 = $2.025) pueden generar decimales que se propagan.
- **Mitigante**: `formatPrecio` usa `maximumFractionDigits: 0`, así que el display siempre es entero. Pero la DB puede guardar 2024.9999... en vez de 2025.
- **Fix**: `Math.round()` en todos los cálculos de subtotal, descuento y total antes de guardar

### ⚠️ IMPORTANTE — Errores silenciosos en paso 3-5 de confirmarVenta
- **Archivo**: `src/lib/services/ventas.ts:75-99`
- Los `Promise.all` de items, pagos y stock NO verifican errores:
  ```js
  await Promise.all([
    supabase.from('venta_items').insert(...),  // error ignorado!
    supabase.from('venta_pagos').insert(...),  // error ignorado!
  ])
  await Promise.all(carrito.map(item =>
    supabase.rpc('decrementar_stock', ...)     // error ignorado!
  ))
  ```
- **Impacto**: si falla el insert de items o la reducción de stock, la venta queda registrada pero incompleta: dinero cobrado, stock no descontado, items faltantes
- **Fix**: capturar errores de cada Promise.all y hacer rollback (DELETE venta) si fallan

### ⚠️ IMPORTANTE — Race condition en actualización de caja
- **Archivo**: `src/lib/services/ventas.ts:118-127`
- Lee `caja.total_efectivo`, suma en JS, y escribe. Si dos ventas simultáneas leen el mismo valor, una sobreescribe a la otra.
- **Impacto**: totales de caja incorrectos con vendedoras simultáneas
- **Fix**: usar `supabase.rpc('sumar_a_caja', { campo, monto })` con SQL `SET total_x = total_x + monto`

### ⚠️ IMPORTANTE — Deuda de cliente y proveedor: read-modify-write
- **Archivo cliente**: `src/lib/services/ventas.ts:111-113`
  ```js
  supabase.from('clientes').update({
    deuda_total: (cliente.deuda_total || 0) + pagoFiado.monto,
  }).eq('id', cliente.id)
  ```
- **Archivos proveedor** (3 ubicaciones):
  - `src/lib/services/ventas.ts` (deuda en venta)
  - `src/app/(app)/proveedores/ingreso/page.tsx:315-320` (deuda en ingreso)
  - `src/components/pos/nueva-venta-dialog.tsx:376-384` (transferencia a proveedor)
- Mismo problema: si se registran dos operaciones simultáneas, una puede pisar a la otra
- **Fix**: RPC `sumar_deuda(p_tabla, p_id, p_monto)` con `SET deuda_total = deuda_total + p_monto`

---

## 3. SEGURIDAD

### ✅ APROBADO — .env nunca commiteado
- `.gitignore` incluye `.env*`
- `git log --all -- '.env*'` devuelve vacío
- Solo existe `.env.local` (142 bytes, 2 variables NEXT_PUBLIC)

### ✅ APROBADO — No hay secrets hardcodeados
- Búsqueda de `sk-`, `eyJ`, `SERVICE_ROLE` en src/: negativo
- Solo `password` es un `useState` en login (esperado)

### ✅ APROBADO — RLS completo en todas las tablas
- Migración 001 define políticas para 20 tablas
- Migración 006 corrige permisos para operaciones diarias
- `es_admin()` protege escrituras en catálogo, eliminaciones, y log

### ✅ APROBADO — Auth middleware funcional
- `src/proxy.ts` verifica `supabase.auth.getUser()` en cada request
- Redirige a `/login` si no hay sesión
- Redirige a `/dashboard` si ya está logueado
- No hay SQL injection (todo parametrizado via SDK Supabase)
- No hay XSS explotable (único `dangerouslySetInnerHTML` es estático en SW registration)
- Login no expone info de usuarios (error genérico, sin enumeration)

### ⚠️ IMPORTANTE — Sin headers de seguridad HTTP
- `next.config.ts` está vacío — no define headers de seguridad
- **Falta**: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, `Strict-Transport-Security`
- **Impacto**: vulnerable a clickjacking (iframe embedding), MIME sniffing
- **Fix**: agregar `headers()` en next.config.ts:
  ```typescript
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
    ],
  }],
  ```

### ⚠️ IMPORTANTE — dangerouslySetInnerHTML en SW registration
- **Archivo**: `src/app/layout.tsx:60`
- El contenido es estático (no user input), así que no es XSS explotable
- Pero es mejor usar `next/script` con `strategy="afterInteractive"`
- **Riesgo real**: bajo

### ⚠️ IMPORTANTE — CDN scripts sin SRI
- `src/lib/etiquetas-pdf.ts` carga html2canvas, jsPDF y JsBarcode desde CDN sin Subresource Integrity
- **Impacto**: si el CDN se compromete, se podrían inyectar scripts maliciosos
- **Fix**: agregar `integrity="sha384-..."` a los scripts de terceros

### 💡 MEJORA — localStorage cachea datos de negocio
- `use-cache.ts` guarda en localStorage con key `cache:` + datos de ventas, clientes, etc.
- No es un secreto per se, pero un tercero con acceso al dispositivo puede ver datos de negocio en DevTools
- **Mitigante**: el modo privacidad enmascara en UI pero no en storage
- **Fix**: usar sessionStorage en lugar de localStorage (se borra al cerrar tab)

### 💡 MEJORA — Sin rate limiting en login
- Supabase Auth tiene protección propia, pero no hay rate limiting adicional en la app
- **Fix**: considerar middleware de Vercel o límite en intentos

---

## 4. CALIDAD DE CÓDIGO

### ✅ APROBADO — TypeScript: 0 errores
- `tsc --noEmit` pasa limpio

### ✅ APROBADO — Solo 1 console.warn (intencional)
- `src/app/(app)/proveedores/ingreso/page.tsx:318` — warn cuando RLS bloquea update de proveedor (correcto como fallback)

### ✅ APROBADO — Sin TODOs/FIXMEs críticos

### ✅ APROBADO — Buen manejo de errores en general
- 30+ puntos con `error.message` en toast
- try/catch en operaciones de file/PDF

### ⚠️ IMPORTANTE — 7 usos de `any` explícito
- `src/app/(app)/dashboard/page.tsx:125,139,162` (3 usos con eslint-disable)
- `src/app/(app)/reportes/page.tsx:154`
- `src/lib/etiquetas-pdf.ts:179,557,735` (3 usos — `iframeWin as any`)
- **Fix**: crear tipos locales para los datos de Supabase con joins

### ⚠️ IMPORTANTE — VentaPago type falta campo `notas`
- **Archivo**: `src/types/index.ts`
- Migración 011 agrega `notas` a `venta_pagos` pero el interface TypeScript no lo tiene
- **Impacto**: el campo se usa en el código (`p.notas`) pero sin type safety
- **Fix**: agregar `notas?: string` a `VentaPago` en types/index.ts

### ⚠️ IMPORTANTE — Migración 007 faltante
- Migraciones van: 001, 002, 003, 004, 005, 006, 008, 009, 010, 011
- **Falta la 007** — podría ser un problema si las migraciones se aplican secuencialmente
- **Fix**: verificar si fue eliminada intencionalmente o si hay un gap

---

## 5. BACKEND Y BASE DE DATOS

### ✅ APROBADO — decrementar_stock e incrementar_stock existen
- Definidos en migración 001 con `SECURITY DEFINER`
- Usados correctamente en ventas.ts y proveedores/ingreso

### ✅ APROBADO — Stock siempre via RPC
- Búsqueda de `.update({...stock` devuelve 0 resultados
- Todas las operaciones de stock usan `rpc('decrementar_stock')` o `rpc('incrementar_stock')`

### ✅ APROBADO — Triggers updated_at activos
- 5 triggers definidos en migración 001 para productos, proveedores, variantes, clientes, ventas

### 🔴 CRÍTICO — decrementar_stock permite stock negativo
- **Archivo**: `supabase/migrations/001_mejoras_produccion.sql:15`
  ```sql
  UPDATE variantes SET stock = stock - p_cantidad WHERE id = p_variante_id;
  ```
- No hay `CHECK (stock >= 0)` ni validación en la función
- **Impacto**: ventas pueden dejar stock en -5, -10, etc. — datos corruptos
- **Mitigante**: el frontend muestra "Sin stock" pero NO bloquea la venta (decisión de negocio documentada)
- **Fix**: si se quiere permitir stock negativo (backorder), documentarlo. Si no, agregar `IF (SELECT stock FROM variantes WHERE id = p_variante_id) < p_cantidad THEN RAISE EXCEPTION`

### 🔴 CRÍTICO — Sin transacciones en flujo de venta
- `src/lib/services/ventas.ts` hace 5-6 operaciones separadas sin transacción
- Si falla en el paso 4 (stock), la venta ya está guardada pero el stock no se descontó
- **Impacto**: inconsistencia entre ventas y stock
- **Fix**: envolver todo el flujo en una RPC `procesar_venta(...)` con `BEGIN/COMMIT/ROLLBACK`

### ⚠️ IMPORTANTE — codigo_barras sin constraint UNIQUE
- Migración 001 crea índice parcial pero no UNIQUE constraint
- **Impacto**: se pueden insertar códigos de barras duplicados
- **Fix**: `ALTER TABLE variantes ADD CONSTRAINT uq_codigo_barras UNIQUE (codigo_barras)`

### ⚠️ IMPORTANTE — Dashboard: 9 queries sin error handling
- **Archivo**: `src/app/(app)/dashboard/page.tsx:102-116`
- `Promise.all` con 9 queries no verifica errores individuales
- **Impacto**: si una query falla, todo el dashboard muestra datos parciales o vacíos sin aviso
- **Fix**: verificar `error` de cada resultado

### ⚠️ IMPORTANTE — historial_precios sin ON DELETE
- **Archivo**: `supabase/migrations/004_historial_precios.sql:9`
- `usuario_id REFERENCES auth.users(id)` sin ON DELETE clause
- **Impacto**: si se elimina un usuario, quedan registros huérfanos
- **Fix**: agregar `ON DELETE SET NULL`

### 💡 MEJORA — Sin rollback en la mayoría de migraciones
- Solo 001, 006 y 008 usan `DROP IF EXISTS`
- Las demás no tienen rollback path
- **Fix**: agregar comentarios con SQL de rollback (DOWN)

---

## 6. PWA

### ✅ APROBADO — Manifest tiene campos requeridos
- name, short_name, start_url, display:standalone, theme_color, icons, shortcuts

### ✅ APROBADO — Supabase API nunca cacheada por SW
- `public/sw.js:37`: `if (url.hostname.includes('supabase')) return`

### ⚠️ IMPORTANTE — Falta ícono 192x192
- Manifest declara solo 512x512 y SVG
- Chrome requiere un ícono de 192x192 para la instalación
- **Fix**: crear y agregar ícono 192x192 cuadrado

### ⚠️ IMPORTANTE — logo.png no es cuadrado (552x452)
- Manifest declara `sizes: '512x512'` pero el archivo real es 552x452
- **Impacto**: ícono distorsionado en Android, warnings del browser
- **Fix**: redimensionar a 512x512 cuadrado

### ⚠️ IMPORTANTE — orientation: 'landscape' incorrecto
- **Archivo**: `src/app/manifest.ts:12`
- Para una app que se usa "celular desde cualquier lugar" (CLAUDE.md), landscape es restrictivo
- **Fix**: cambiar a `'any'` o `'portrait'`

### ⚠️ IMPORTANTE — SW no cachea manifest ni icons
- `STATIC_ASSETS` solo incluye `/`, `/dashboard`, `/pos`, `/inventario`, `/icons/icon.svg`
- Falta cachear `/logo.png`, fuentes, y CSS
- **Impacto**: offline funciona parcialmente (solo las 4 rutas pre-cacheadas)

---

## 7. DEPLOY

### ✅ APROBADO — Build sin errores
- `next build` compila exitosamente con 22 rutas

### ⚠️ IMPORTANTE — next.config.ts vacío
- Sin headers de seguridad
- Sin configuración de `images.remotePatterns`
- Sin `output: 'standalone'` (recomendado para deploy optimizado)

### 💡 MEJORA — No hay vercel.json
- Sin configuración explícita de Vercel — depende de auto-detection
- Funciona, pero no se pueden configurar headers, redirects, ni rewrites

### 💡 MEJORA — Sin tests automatizados de lógica de negocio
- Existe `tests/` y `playwright.config.ts` pero sin tests funcionales
- No hay tests de cálculos de venta, stock, deuda
- **Recomendación**: al menos tests para `confirmarVenta()`, cálculo de descuentos, y actualización de deuda

---

## PLAN DE ACCIÓN RECOMENDADO

### Semana 0 (antes de lanzar):
1. Agregar error handling a `confirmarVenta()` pasos 3-5
2. Crear RPCs atómicas para deuda de clientes y proveedores
3. Decidir política de stock negativo y aplicar CHECK si corresponde
4. Agregar `Math.round()` a cálculos de dinero
5. Agregar headers de seguridad en next.config.ts
6. Corregir manifest: orientation, logo cuadrado, ícono 192x192

### Semana 1 (post-lanzamiento):
7. Migrar flujo de venta a RPC transaccional
8. Agregar constraint UNIQUE a codigo_barras
9. Optimizar select('*') → columnas específicas
10. Agregar error handling al dashboard
11. Agregar campo `notas` a VentaPago type
12. Resolver gap de migración 007

### Backlog:
13. Lazy import de Recharts/framer-motion
14. Agregar TTL a use-cache
15. SRI para scripts CDN
16. Tests automatizados de lógica de negocio
17. vercel.json con configuración explícita
18. Rate limiting en login

---

*Generado automáticamente por auditoría Claude Code — 2026-03-18*
