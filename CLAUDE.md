# TernuraKids — CLAUDE.md

## Modelo de IA
- **Plan mode**: Claude Opus 4.6 (`claude-opus-4-6`)
- **Resto**: Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- Configuración: `opusplan` — Opus para arquitectura/decisiones, Sonnet para ejecución

---

## Sobre este proyecto

Sistema de gestión para tienda de ropa infantil. POS + inventario + clientes + caja + reportes.
Diseñado para escalar a múltiples rubros (canchas de pádel, perfumerías, otros locales).

---

## Estado actual

### ✅ Completado
- Estructura base Next.js 16 + React 19 + TypeScript
- Login con Supabase Auth (SSR) + glassmorphism
- Sidebar + layout protegido
- Módulo Inventario completo:
  - Listado productos (1 fila/variante, con marca+categoría en cada fila)
  - Wizard de carga batch (acumula lote en memoria, confirma todo junto)
  - Selectores dinámicos Tipo de Prenda + Colegio (DB, modales "Agregar nuevo")
  - Regla nombre: `[Tipo] [Detalle] [Marca] [Colegio si Colegial]`
  - Barcode: `[TIPO.abrev][CAT][MARCA][COLEGIO if colegial][talle]`
- Módulo POS (punto de venta completo)
- Módulo Clientes (deuda + historial fiado + cobro inline)
- Módulo Caja (apertura/cierre + retiros + cobro de deuda)
- Módulo Proveedores (deuda + ingreso de mercadería)
- Módulo Importar (CSV/xlsx desde Contagram)
- PWA configurada (manifest + service worker)
- Migraciones 001–016

### 🔄 En progreso
- Migración 016 (`tipos_prenda` + `colegios`) — **aplicar en Supabase SQL Editor**

### ⏳ Pendiente
- Dashboard (KPIs, ventas, top productos, deudores)
- Módulo Reportes (ventas por período + CSV export)
- Módulo Etiquetas (generación e impresión)
- Módulo WhatsApp (mensajes a deudores + campañas)
- Objeto de tema central (colores centralizados)
- Tests de lógica crítica (ventas, stock, caja, deuda)
- Deploy definitivo en Vercel (dominio propio)

---

## Reglas de trabajo

### 0. Define el alcance antes de actuar
- Antes de escribir código, confirmá QUÉ archivos vas a tocar y cuáles NO.
- Si la tarea implica más de 3 archivos, listá los cambios antes de ejecutar.
- No modifiques modelos de datos, migraciones, RLS o configuración de auth sin confirmación explícita.
- Ante la duda, preguntá. Es mejor una pregunta de más que un rollback.

### 1. Modo plan por defecto
- Para cualquier tarea no trivial (3+ pasos o decisiones de arquitectura), planificá primero.
- Si algo se desvía del plan, detenete y replantea de inmediato.
- Usá el modo plan para verificar pasos, no solo para construir.
- Escribí especificaciones claras desde el inicio para reducir ambigüedad.
- **OBLIGATORIO**: Entrar en modo plan (`EnterPlanMode`) antes de empezar cualquier tarea que involucre estadísticas, gráficos, dashboard, reportes, caja o gastos.

### 2. Estrategia de subagentes
- Usá subagentes para mantener limpio el contexto principal.
- Delegá investigación, exploración y análisis paralelo a subagentes.
- Un solo objetivo por subagente para mantener el enfoque.
- Para problemas complejos, preferí más cómputo a través de subagentes.

### 3. Ciclo de auto-mejora
- Después de cualquier corrección, actualizá la sección "Lecciones aprendidas" de este archivo.
- Escribí reglas concretas para evitar repetir el mismo error.
- Revisá las lecciones al inicio de cada sesión del proyecto.

### 4. Verificación antes de terminar
- Nunca marques una tarea como completada sin demostrar que funciona.
- Ejecutá pruebas, revisá logs y demostrá que todo está correcto.
- Compará el comportamiento entre la versión principal y tus cambios.
- Preguntate: "¿Un ingeniero senior aprobaría este PR?"

### 5. Preferí claridad sobre elegancia
- Código claro que cualquiera entiende > código elegante que solo vos entendés.
- Para cambios complejos, pausá y preguntate si hay una forma más simple.
- Si una solución se siente improvisada, buscá una mejor.
- Para arreglos simples, no sobre-ingenierices.

### 6. Corrección autónoma de errores
- Si recibís un reporte de error, arreglalo.
- Revisá logs, errores y pruebas fallidas, y resolvelo.
- No obligues al usuario a cambiar de contexto para dar más info si podés encontrarla.
- Corregí pruebas CI que fallen sin esperar instrucciones.

### 7. Commits atómicos
- Cada cambio funcional = un commit con mensaje descriptivo.
- Si algo sale mal, debe poderse revertir sin perder trabajo no relacionado.
- Formato: `tipo(módulo): descripción` (ej: `fix(stock): corregir cálculo de inventario negativo`).

### 8. Control de tokens
- Para tareas de diseño o refactor, estimá cuántos archivos vas a tocar ANTES de empezar.
- Si la tarea toca más de 2 archivos, pedí aprobación primero.
- Preferí múltiples cambios pequeños sobre un cambio grande.
- Nunca reescribas un archivo que ya funciona para "mejorar el estilo".
- Si una tarea va a consumir muchos tokens, avisá antes de empezar y proponé una alternativa más eficiente.

### 9. Cambios de diseño (OBLIGATORIO)
- NUNCA regenerar un componente completo por un cambio visual.
- Usar `str_replace` SIEMPRE, sobre las líneas exactas que cambian.
- Antes de aplicar cualquier cambio visual, mostrar SOLO el fragmento afectado y esperar aprobación explícita.
- Si el cambio toca más de 20 líneas, dividirlo en pasos y confirmar cada uno.
- Para cambios de color globales, modificar SOLO el objeto de tema central.
- Si no existe objeto de tema central, crearlo ANTES de cualquier cambio visual.
- Nunca tocar funcionalidad al hacer cambios visuales — son tareas separadas.

### Gestión de tareas
- **Simplicidad primero:** cada cambio debe ser lo más simple posible.
- **Sin pereza:** encontrá la causa raíz, evitá soluciones temporales.
- **Impacto mínimo:** cambiá solo lo necesario para evitar errores colaterales.

---

## Herramientas y recursos

### Subagentes (obligatorio para tareas complejas)
- Usá subagentes siempre que la tarea involucre investigación, exploración de código, o análisis que pueda correr en paralelo.
- No intentes hacer todo en el hilo principal: delegá y mantené el contexto limpio.
- Ejemplo: "Investigá cómo funciona el sistema de talles actual" → subagente. "Aplicá el cambio" → hilo principal.

### Paquetes y dependencias
- Si necesitás instalar un paquete npm para resolver la tarea, pedí confirmación y explicá por qué.
- No reinventes lo que ya existe: si hay una librería bien mantenida que resuelve el problema, proponela.
- Antes de instalar, verificá que sea compatible con el stack (Next.js 16, React 19).

### MCP Chrome (verificación visual obligatoria)
- Después de cada cambio visual o de flujo, abrí `http://localhost:3000` en el navegador con el MCP de Chrome.
- Navegá la UI como lo haría un usuario: hacé clic en botones, cargá formularios, probá el flujo completo.
- Verificá que no haya errores en consola, que los estilos se vean correctos, y que la funcionalidad responda.
- Si algo se ve roto o no funciona, arreglalo antes de reportar que terminaste.
- Esto es OBLIGATORIO antes de marcar cualquier tarea como completada. No alcanza con que el código compile.

### MCP Supabase
- Usá el MCP de Supabase para consultar datos reales de la base en vez de asumir estructuras o contenido.
- Verificá que las queries funcionen contra la base real antes de dar por terminado.
- Revisá que las políticas RLS no bloqueen operaciones que deberían funcionar.
- Si necesitás ver el schema actual, consultalo vía MCP en vez de adivinar.

### MCP GitHub
- Usá el MCP de GitHub para crear branches, abrir PRs, y revisar el estado del repo.
- Antes de pushear, verificá que no haya conflictos con la rama principal.

### Otros MCP
- Si para una tarea necesitás un MCP que no está configurado (ej: Vercel, Slack, otro), pedímelo y lo configuro.
- No te limites a lo que tenés: si un MCP aceleraría el trabajo, proponelo.

### Búsqueda web y documentación
- Si no estás seguro de una API, hook, o librería, buscá la documentación oficial actualizada.
- No inventes sintaxis ni parámetros de memoria. Verificá siempre.
- Preferí la documentación oficial sobre Stack Overflow o blogs.

### Tests automáticos
- Proponé tests para toda lógica crítica de negocio: ventas, stock, caja, cálculo de deuda, descuentos.
- No hace falta testear cada componente UI, pero sí los flujos que manejan plata o datos sensibles.
- Si un bug se repite, el fix debe incluir un test que lo cubra.

### Migraciones SQL
- Cuando un cambio toque el modelo de datos, generá la migración SQL correspondiente.
- Pedí confirmación ANTES de aplicar cualquier migración.
- Seguí la numeración existente en `supabase/migrations/`.
- Incluí rollback (down) cuando sea posible.

### Feedback temprano
- No esperes a terminar todo para mostrar resultados. Mostrá avances parciales.
- Si no estás seguro de la dirección, preguntá antes de seguir construyendo.
- Si una tarea va a tardar más de lo esperado, avisá y explicá por qué.

---

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
- Manejo de dinero siempre en centavos (enteros), nunca en floats
- Estado local con `useState`/`useEffect`, sin state manager global
- Llamadas directas a Supabase desde componentes (no API routes)
- Búsquedas fuzzy: normalizar acentos + split por palabras, filtrar client-side
- Descuento efectivo en etiquetas: 20% sobre `precio_venta`
- Validaciones tanto en frontend como en backend, nunca confiar solo en el cliente

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
- `src/app/manifest.ts` — web app manifest
- `public/sw.js` — service worker: cache estáticos, network-first para navegación, Supabase API nunca se cachea
- `public/icons/icon.svg` — ícono SVG de la app
- Selects usan `value={campo || '__none__'}` + `onValueChange={v => set(v === '__none__' ? '' : (v ?? ''))}` para evitar mostrar UUIDs

## Migraciones Supabase
- `supabase/migrations/001_mejoras_produccion.sql` — función `decrementar_stock` (RPC), triggers `updated_at`, índices de rendimiento, RLS admin vs vendedor
- `supabase/migrations/016_tipos_prenda_colegios.sql` — tablas `tipos_prenda` y `colegios` con campo `abreviatura` (usado en barcodes)
- **CRÍTICO**: aplicar migración 001 antes de usar el POS (`decrementar_stock` es requerida por `src/lib/services/ventas.ts`)
- **PENDIENTE**: aplicar migración 016 en Supabase SQL Editor para habilitar selectores dinámicos en wizard de inventario

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
- Login: glassmorphism con logo de fondo difuminado, campos color agua/teal, card translúcido

---

## Reglas para escalar a multi-negocio
- La arquitectura debe soportar multi-tenant (múltiples negocios/locales).
- Cualquier modelo nuevo debe considerar: ¿esto aplica solo a ropa o es genérico para cualquier rubro?
- Los endpoints de API deben seguir convenciones REST consistentes.

---

## Deploy y uso en producción

La app es una PWA. El flujo para el cliente final:
1. Se deploya en Vercel (o similar) conectado al repo de GitHub.
2. El cliente abre la URL desde Chrome en celular, tablet o PC.
3. Chrome ofrece "Agregar a pantalla de inicio" → queda como app nativa con el ícono.
4. Funciona offline para lo básico gracias al service worker.
5. Actualizaciones automáticas: se deploya y el cliente las recibe al recargar.
6. Para POS/caja: idealmente tablet o PC en el mostrador.
7. Para consultar stock/clientes: celular desde cualquier lugar.

---

## Inicio de sesión obligatorio
Al arrancar cada sesión nueva en Claude Code, ejecutar siempre:
1. Leer este CLAUDE.md completo
2. Revisar la sección "Estado actual" para saber dónde estamos
3. Revisar "Lecciones aprendidas" para no repetir errores
4. Confirmar con el usuario qué se va a trabajar hoy antes de tocar código

---

## Lecciones aprendidas

- [2026-03-18] El layout tenía `pb-20 lg:pb-4` pero la bottom-nav (`fixed bottom-0 h-16`) aparece en TODAS las resoluciones → En desktop el contenido quedaba tapado (botón cerrar caja, guardar proveedor, etc.). Fix: `pb-24` sin breakpoint. **Regla**: el `padding-bottom` del `<main>` debe ser >= altura del nav fijo en todas las resoluciones. Nunca reducir el pb en breakpoints si el nav sigue visible.
- [2026-03-18] `navigator.share({ files })` en mobile abre un picker genérico de contactos en vez de ir directo al chat del cliente → No se puede mandar un archivo Y pre-seleccionar un contacto en WhatsApp vía URL. **Regla**: en mobile usar share nativo (el archivo se adjunta solo), en desktop descargar + abrir wa.me/{tel} + avisar al usuario que adjunte el PDF.
- [2026-03-18] La caja no detectaba cajas abiertas de días anteriores — si se olvidaban de cerrar, quedaban en limbo sin aviso. **Regla**: todo recurso con estado temporal (`abierta`, `en_progreso`, etc.) debe tener detección de estado stale al cargar la página + mecanismo de resolución (auto-cierre + cierre manual con notas).
- [2026-03-18] Al seleccionar proveedor para transferencia no se mostraba su alias/CBU — el cliente no sabía a dónde transferir. **Regla**: cuando se muestra un proveedor en contexto de pago por transferencia, siempre mostrar `alias_cbu` si existe. Verificar que el `select()` de la query incluya el campo.
- [2026-03-18] Las ventas en el POS no mostraban a qué proveedor iba la transferencia porque `venta_pagos` no tenía campo `notas`. **Regla**: cuando un pago tiene contexto adicional (proveedor destino, referencia, etc.), guardarlo en `venta_pagos.notas` al momento de la venta. No intentar reconstruirlo después.
- [2026-03-18] **Auditoría pre-lanzamiento — Hallazgos críticos:**
  - `confirmarVenta()` en `ventas.ts` hace 5 operaciones sin transacción y sin verificar errores en pasos 3-5 (items, pagos, stock, fiado, caja). **Regla**: toda operación multi-paso que involucre dinero debe verificar cada resultado y hacer rollback si falla. Ideal: una RPC server-side con BEGIN/COMMIT.
  - `decrementar_stock` no valida stock >= 0. **Regla**: decidir explícitamente si el negocio permite stock negativo y documentarlo. Si no, agregar CHECK constraint o validación en la función.
  - Actualización de `caja.total_*` y `clientes.deuda_total` usan read-modify-write (leer en JS, sumar, escribir). **Regla**: contadores acumulativos siempre deben usar `SET campo = campo + valor` en SQL vía RPC, nunca read+add+write desde el cliente.
  - Cálculos de dinero usan float JS sin Math.round. **Regla**: siempre `Math.round()` antes de guardar montos en DB. Los descuentos porcentuales producen decimales que se propagan.
  - `next.config.ts` sin headers de seguridad. **Regla**: antes de deploy a producción, agregar X-Frame-Options, X-Content-Type-Options, y CSP.
  - Manifest PWA declara `orientation: 'landscape'` pero la app se usa en celular. **Regla**: usar `'any'` a menos que haya un motivo específico para restringir orientación. Además, logo.png es 552x452 (no cuadrado) pero el manifest lo declara como 512x512 — las dimensiones reales deben coincidir.
  - 22 queries con `select('*')` donde se usan 3-5 columnas. **Regla**: siempre especificar columnas en select para reducir payload, especialmente en mobile.
  - Cache en localStorage (`use-cache.ts`) no tiene TTL ni limpieza. **Regla**: todo caché debe tener expiración y mecanismo de evicción.
  - N+1 en caja auto-cierre (`caja/page.tsx:104`): loop secuencial `for (const c of autoCerrar)` llamando `.update()` individual. **Regla**: operaciones batch siempre con `Promise.all()` o filtro `.in()`.
  - Race condition en deuda de proveedor: 3 archivos distintos (`ventas.ts`, `proveedores/ingreso`, `nueva-venta-dialog`) usan read-modify-write para `proveedores.deuda_total`. Misma regla que clientes: usar RPC atómico.
  - `VentaPago` en `types/index.ts` no incluye `notas` pero la migración 011 lo agrega a la tabla. **Regla**: cuando se agrega una columna por migración, actualizar el tipo TypeScript correspondiente.
  - `variantes.codigo_barras` tiene índice pero no constraint UNIQUE. **Regla**: si un campo se usa como identificador (búsqueda por barcode), agregar UNIQUE para evitar duplicados.
  - CDN scripts (html2canvas, jsPDF, JsBarcode) se cargan sin SRI (Subresource Integrity). **Regla**: en producción, agregar `integrity="sha384-..."` a scripts de terceros.
  - Dashboard hace 9 queries en `Promise.all` sin verificar errores individuales. **Regla**: todo `Promise.all` con queries debe verificar `error` de cada resultado. Si falla una, mostrar partial data o retry, no fallar silenciosamente.
- [2026-03-19] El wizard de carga de stock guardaba cada producto individualmente en Supabase y mostraba una pantalla "¡Guardado!" que interrumpía el flujo. Para cargas masivas (ej: caja del proveedor) era muy lento. **Regla**: todo flujo de carga masiva debe acumular en memoria y confirmar en batch al final. No interrumpir el flujo del usuario con confirmaciones individuales — usar panel lateral/barra para feedback visual sin bloquear.
- [2026-03-25] PostgREST schema cache queda stale tras renombrar tablas/columnas. Queries con `.order('nombre_renombrado')` y joins embedded `tabla_nueva:tabla_vieja(*)` retornaban 400/404 a pesar de que la DB tenía los datos. **Regla**: después de rename en Supabase, si PostgREST sigue fallando, mover las referencias JS-side: quitar `.order()` con col renombrada, fetchear tabla relacionada por separado y hacer join manual con Map.
- [2026-03-25] El inventario mostraba 1 fila por variante (flatMap) y solo la primera fila de cada producto mostraba marca y categoría. El usuario veía "el 2do producto sin marca ni categoría". **Regla**: en una tabla que aplana variantes, cada fila debe ser autocontenida — mostrar marca/categoría en todas las filas, no solo en `esFirst`.
- [2026-03-26] La política RLS `FOR ALL USING (es_admin())` en tablas de configuración (tipos_prenda, colegios) bloqueaba INSERT a usuarios con rol `vendedor`. **Regla**: las tablas de configuración editables desde la UI (listas de tipos, categorías, etc.) deben tener `FOR INSERT WITH CHECK (true)` y `FOR UPDATE USING (true)`. Solo `FOR DELETE` requiere `es_admin()`. Nunca usar `FOR ALL USING (es_admin())` en tablas que vendedores necesitan editar.