# Pendiente: Implementación de códigos de barras

## Fórmula de generación (ya implementada en el código, solo falta mostrarla)

```
[PRENDA][GÉNERO][PROVEEDOR][TALLE]
  RMC  +  NA  +  NIC  +  6  =  RMCNANIC6
  CLZ  +  NA  +  BLU  + 12  =  CLZNABLU12
  BCF  +  NO  +  COC  +  6  =  BCFNOCOC6
  BOD  +  BB  +   —   +  3  =  BODBB3
```

Tokens de género: NA (niña), NO (niño), BB (bebé), COL (colegial)

## Archivos a tocar (3)

### 1. `src/app/(app)/inventario/nuevo/page.tsx`
**Qué cambiar:** En el paso `talle`, sección "Detalle por talle", agregar campo editable de código de barras por talle.
- Ya se calcula en background al seleccionar el talle (`calcularBarcodeParaTalle`)
- Ya se guarda en `tallesSeleccionados[talle].barcode`
- Solo falta mostrarlo como input editable debajo de costo/venta
- Botón 🔄 para regenerar
- Si el campo queda vacío al agregar al lote → toast warning (no bloquea)
- El usuario puede escribir su propio código (ej: zapatillas con EAN propio)

### 2. `src/app/(app)/inventario/[id]/page.tsx`
**Qué cambiar:** En la tabla de variantes del producto, agregar columna "Código de barras".
- Si tiene código → mostrarlo en badge gris claro
- Si está vacío → badge "Sin código" en naranja suave

### 3. `src/components/pos/buscador-producto.tsx`
**Qué cambiar:** En los resultados de búsqueda, mostrar el código debajo del nombre de la variante.
- Formato: nombre · 🏷 RMCNANIC6 · T6
- La búsqueda por barcode ya funciona (`matchVariante`), solo falta mostrarlo

## Validación en etiquetas
Al hacer "Confirmar todo" en el lote y luego "Generar etiquetas":
- Si algún item no tiene barcode → aviso "X variantes sin código, las etiquetas no tendrán código escaneable"
- El usuario puede continuar igual

## Lo que NO cambia
- La función `generarCodigoBarras()` — ya usa el patrón correcto
- La función `categoriaACodigo()` — ya devuelve NA, NO, BB, COL correctamente
- La DB / migraciones — `codigo_barras` ya existe en la tabla `variantes`
- El modal de etiquetas

## Cómo ejecutarlo
Decile a Claude: **"implementá el plan de barcodes que está en PENDIENTE_barcodes.md"**
