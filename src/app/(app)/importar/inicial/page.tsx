'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Upload, Package, Users, ShoppingBag, CheckCircle2, Loader2, ChevronDown } from 'lucide-react'

// ── Mapeo Tipo de Producto → nombre de categoría en DB ──────────────────────
const MAPA_CAT: Record<string, string> = {
  'NIÑA': 'Nena', 'Niña': 'Nena', 'niña': 'Nena',
  'NIÑO': 'Nene', 'Niño': 'Nene', 'niño': 'Nene',
  'BEBÉ': 'Bebé', 'Bebe': 'Bebé', 'bebe': 'Bebé', 'BEBE': 'Bebé', 'Bebé': 'Bebé',
  'Calzado': 'Calzado', 'Calzado ': 'Calzado', 'CALZADO': 'Calzado',
  'COLEGIAL': 'Colegial', 'Colegial': 'Colegial',
  'Ropa interior': 'Ropa Interior', 'Ropa interior ': 'Ropa Interior', 'ROPA INTERIOR': 'Ropa Interior',
  'ACCESORIOS': 'Accesorios', 'Accesorios': 'Accesorios', 'ACCESORIOS ': 'Accesorios',
  'Perfumeria': 'Perfumería', 'PERFUMERIA': 'Perfumería', 'Perfumería': 'Perfumería',
}

function resolverCategoria(tipo: string): string {
  const t = tipo?.trim()
  return MAPA_CAT[t] ?? MAPA_CAT[t?.toUpperCase()] ?? t ?? 'Sin categoría'
}

// ── Campos del sistema para productos ────────────────────────────────────────
const CAMPOS_PROD = [
  { key: 'nombre',      label: 'Nombre del producto',  required: true  },
  { key: 'categoria',   label: 'Tipo / Categoría',      required: false },
  { key: 'marca',       label: 'Marca / Proveedor',     required: false },
  { key: 'codigo',      label: 'Código de barras',      required: false },
  { key: 'stock',       label: 'Stock',                 required: false },
  { key: 'costo',       label: 'Precio costo',          required: false },
  { key: 'precioVenta', label: 'Precio de venta',       required: false },
  { key: 'activo',      label: 'Activo (solo Si/No)',   required: false },
]

// Auto-mapeo por nombres comunes de Contagram
const AUTO_MAP: Record<string, string[]> = {
  nombre:      ['nombre', 'producto', 'descripcion', 'description'],
  categoria:   ['tipo de producto', 'tipo', 'categoria', 'category'],
  marca:       ['proveedor', 'marca', 'brand', 'fabricante'],
  codigo:      ['código', 'codigo', 'code', 'barcode', 'cod'],
  stock:       ['stock', 'cantidad', 'qty'],
  costo:       ['costo', 'costo neto', 'precio costo', 'cost'],
  precioVenta: ['precio de venta', 'precio', 'pvp', 'price', 'venta'],
  activo:      ['activo', 'activo?', 'estado', 'active'],
}

function autoDetectar(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const campo of CAMPOS_PROD) {
    const candidatos = AUTO_MAP[campo.key] ?? []
    const found = headers.find((_, i) => candidatos.includes(lower[i]))
    map[campo.key] = found ?? ''
  }
  return map
}

// ── Campos del sistema para clientes ─────────────────────────────────────────
const CAMPOS_CLIENTES = [
  { key: 'nombre', label: 'Nombre del cliente', required: true  },
  { key: 'deuda',  label: 'Deuda inicial ($)',   required: false },
]

const AUTO_MAP_CLIENTES: Record<string, string[]> = {
  nombre: ['cliente', 'nombre', 'name'],
  deuda:  ['total', 'deuda', 'saldo', 'debe'],
}

function autoDetectarClientes(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const campo of CAMPOS_CLIENTES) {
    const candidatos = AUTO_MAP_CLIENTES[campo.key] ?? []
    const found = headers.find((_, i) => candidatos.includes(lower[i]))
    map[campo.key] = found ?? ''
  }
  return map
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ResultadoImport {
  ok: number
  saltados: number
  noEncontrados: string[]
  errores: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function leerXLSX(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][])
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function arraysToObjects(headers: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows
    .filter(r => r.some(v => v !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
}

async function batchInsert<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  tabla: string,
  items: T[],
  batchSize = 50
) {
  const errores: string[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const { error } = await supabase.from(tabla).insert(batch)
    if (error) errores.push(`Batch ${i / batchSize + 1}: ${error.message}`)
  }
  return errores
}

// ── Componente de mapeo de columnas ──────────────────────────────────────────
function MapeoCols({
  campos,
  headers,
  mapa,
  onChange,
}: {
  campos: { key: string; label: string; required: boolean }[]
  headers: string[]
  mapa: Record<string, string>
  onChange: (key: string, val: string) => void
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
        <ChevronDown size={16} /> Mapeá las columnas del archivo a los campos del sistema
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map(campo => (
          <div key={campo.key} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-36 shrink-0">
              {campo.label}
              {campo.required && <span className="text-red-500 ml-0.5">*</span>}
            </span>
            <select
              value={mapa[campo.key] ?? ''}
              onChange={e => onChange(campo.key, e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">(no usar)</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CargaInicialPage() {
  const supabase = createClient()

  // Sección A — Productos
  const [fileProductos, setFileProductos] = useState<File | null>(null)
  const [headersA, setHeadersA] = useState<string[]>([])
  const [colMapA, setColMapA] = useState<Record<string, string>>({})
  const [previewA, setPreviewA] = useState<Record<string, unknown>[]>([])
  const [rawRowsA, setRawRowsA] = useState<Record<string, unknown>[]>([])
  const [estadoA, setEstadoA] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoA, setResultadoA] = useState<ResultadoImport | null>(null)
  const refA = useRef<HTMLInputElement>(null)

  // Sección B — Clientes
  const [fileClientes, setFileClientes] = useState<File | null>(null)

  const [headersB, setHeadersB] = useState<string[]>([])
  const [colMapB, setColMapB] = useState<Record<string, string>>({})
  const [previewB, setPreviewB] = useState<Record<string, unknown>[]>([])
  const [rawRowsB, setRawRowsB] = useState<Record<string, unknown>[]>([])
  const [estadoB, setEstadoB] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoB, setResultadoB] = useState<ResultadoImport | null>(null)
  const refB = useRef<HTMLInputElement>(null)

  // Sección C — Historial ventas
  const [fileVentas, setFileVentas] = useState<File | null>(null)
  const [headersC, setHeadersC] = useState<string[]>([])
  const [colMapC, setColMapC] = useState<Record<string, string>>({})
  const [previewC, setPreviewC] = useState<Record<string, unknown>[]>([])
  const [rawRowsC, setRawRowsC] = useState<Record<string, unknown>[]>([])
  const [estadoC, setEstadoC] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoC, setResultadoC] = useState<ResultadoImport | null>(null)
  const refC = useRef<HTMLInputElement>(null)

  // ── SECCIÓN A: parsear productos ───────────────────────────────────────────
  async function onArchivoProductos(file: File) {
    setFileProductos(file)
    const rows = await leerXLSX(file)
    if (rows.length < 2) { toast.error('Archivo vacío'); return }

    // Buscar fila de headers (la primera que tenga algún texto)
    const headerIdx = rows.findIndex(r => r.some(c => String(c).trim() !== ''))
    const headers = (rows[headerIdx] as string[]).map(h => String(h).trim()).filter(Boolean)
    const data = arraysToObjects(headers, rows.slice(headerIdx + 1))

    const detected = autoDetectar(headers)
    setHeadersA(headers)
    setColMapA(detected)
    setRawRowsA(data)

    // Preview: primeras 5 filas con todas las columnas
    setPreviewA(data.slice(0, 5))
    setEstadoA('cargado')
    toast.success(`${data.length} filas detectadas — revisá el mapeo de columnas`)
  }

  function getVal(row: Record<string, unknown>, col: string): string {
    if (!col) return ''
    return String(row[col] ?? '').trim()
  }

  async function importarProductos() {
    if (!fileProductos || rawRowsA.length === 0) return
    setEstadoA('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      const { nombre: colNombre, categoria: colCat, marca: colMarca,
              codigo: colCodigo, stock: colStock, costo: colCosto,
              precioVenta: colPrecio, activo: colActivo } = colMapA

      if (!colNombre) { toast.error('Debés mapear la columna "Nombre del producto"'); setEstadoA('cargado'); return }

      // Filtrar activos si hay columna activo mapeada
      const filas = colActivo
        ? rawRowsA.filter(r => String(r[colActivo] ?? '').trim().toLowerCase() === 'si')
        : rawRowsA.filter(r => getVal(r, colNombre) !== '')

      // Cargar categorías
      const { data: cats } = await supabase.from('categorias').select('id, nombre')
      const catMap = new Map<string, string>((cats ?? []).map(c => [c.nombre, c.id]))

      // Cargar barcodes existentes
      const { data: barcodes } = await supabase.from('variantes').select('codigo_barras').not('codigo_barras', 'is', null)
      const barcodesExistentes = new Set((barcodes ?? []).map(b => b.codigo_barras as string))

      // Marcas únicas → upsert
      if (colMarca) {
        const marcasUnicas = [...new Set(filas.map(r => getVal(r, colMarca)).filter(Boolean))]
        if (marcasUnicas.length > 0) {
          await supabase.from('marcas').upsert(
            marcasUnicas.map(nombre => ({ nombre, activo: true })),
            { onConflict: 'nombre', ignoreDuplicates: true }
          )
        }
      }
      const { data: provs } = await supabase.from('marcas').select('id, nombre')
      const provMap = new Map<string, string>((provs ?? []).map(p => [p.nombre, p.id]))

      // Insertar productos en lotes — IDs generados en cliente para evitar .select()
      const BATCH = 50
      for (let i = 0; i < filas.length; i += BATCH) {
        const lote = filas.slice(i, i + BATCH)

        // Generamos IDs acá para no necesitar RETURNING (evita problema de schema cache)
        const ids = lote.map(() => crypto.randomUUID())

        const productosInsert = lote.map((r, idx) => {
          const catRaw = colCat ? getVal(r, colCat) : ''
          const catNombre = catRaw ? resolverCategoria(catRaw) : ''
          const marcaNombre = colMarca ? getVal(r, colMarca) : ''
          return {
            id: ids[idx],
            nombre_base: getVal(r, colNombre),
            categoria_id: catNombre ? (catMap.get(catNombre) ?? null) : null,
            marca_id: marcaNombre ? (provMap.get(marcaNombre) ?? null) : null,
            activo: true,
            temporada: 'todo_el_año',
          }
        })

        const { error: errProd } = await supabase.from('productos').insert(productosInsert)

        if (errProd) {
          res.errores.push(`Lote ${Math.floor(i / BATCH) + 1}: ${errProd.message}`)
          continue
        }

        const variantesInsert = ids.map((prodId, idx) => {
          const r = lote[idx]
          const codigoRaw = colCodigo ? getVal(r, colCodigo) : ''
          const barcode = codigoRaw && !barcodesExistentes.has(codigoRaw) ? codigoRaw : null
          if (codigoRaw && barcodesExistentes.has(codigoRaw)) res.saltados++
          if (barcode) barcodesExistentes.add(barcode)
          return {
            producto_id: prodId,
            talle: 'Único',
            codigo_barras: barcode,
            stock: colStock ? Math.round(Number(r[colStock]) || 0) : 0,
            precio_costo: colCosto ? Math.round(Number(r[colCosto]) || 0) : 0,
            precio_venta: colPrecio ? Math.round(Number(r[colPrecio]) || 0) : 0,
          }
        })

        const errV = await batchInsert(supabase, 'variantes', variantesInsert, BATCH)
        if (errV.length > 0) res.errores.push(...errV)
        res.ok += lote.length
      }
    } catch (e) {
      res.errores.push(String(e))
    }

    setResultadoA(res)
    setEstadoA('done')
    if (res.errores.length === 0) toast.success(`✓ ${res.ok} productos importados`)
    else toast.warning(`${res.ok} importados, ${res.errores.length} errores`)
  }

  // ── SECCIÓN B: parsear clientes ────────────────────────────────────────────
  async function onArchivoClientes(file: File) {
    setFileClientes(file)
    const rows = await leerXLSX(file)

    // Buscar fila de headers (la que contenga algo parecido a "cliente" o "nombre")
    const headerIdx = rows.findIndex(r =>
      r.some(c => ['cliente', 'nombre', 'name'].includes(String(c).trim().toLowerCase()))
    )
    if (headerIdx === -1) { toast.error('No se encontró fila de encabezados con "Cliente" o "Nombre"'); return }

    const headers = (rows[headerIdx] as string[]).map(h => String(h).trim()).filter(Boolean)
    const data = arraysToObjects(headers, rows.slice(headerIdx + 1))
      .filter(r => Object.values(r).some(v => String(v).trim() !== ''))

    const detected = autoDetectarClientes(headers)
    setHeadersB(headers)
    setColMapB(detected)
    setRawRowsB(data)
    setPreviewB(data.slice(0, 5))
    setFileClientes(file)
    setEstadoB('cargado')
    toast.success(`${data.length} filas detectadas — revisá el mapeo de columnas`)
  }

  async function importarClientes() {
    if (!fileClientes || rawRowsB.length === 0) return
    setEstadoB('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      const { nombre: colNombre, deuda: colDeuda } = colMapB
      if (!colNombre) { toast.error('Debés mapear la columna "Nombre del cliente"'); setEstadoB('cargado'); return }

      const validos = rawRowsB.filter(r => getVal(r, colNombre) !== '')

      const { data: existentes } = await supabase.from('clientes').select('nombre')
      const existentesSet = new Set((existentes ?? []).map(c => c.nombre.toLowerCase().trim()))

      for (const fila of validos) {
        const nombre = getVal(fila, colNombre)
        const deuda = colDeuda ? Math.round(Number(fila[colDeuda]) || 0) : 0

        if (existentesSet.has(nombre.toLowerCase())) { res.saltados++; continue }

        const { data: cliente, error: errCliente } = await supabase
          .from('clientes')
          .insert({ nombre, deuda_total: deuda, activo: true })
          .select('id')
          .single()

        if (errCliente || !cliente) { res.errores.push(`${nombre}: ${errCliente?.message}`); continue }

        if (deuda > 0) {
          await supabase.from('fiado_movimientos').insert({
            cliente_id: cliente.id,
            tipo: 'cargo',
            monto: deuda,
            notas: 'Saldo inicial importado',
          })
        }

        existentesSet.add(nombre.toLowerCase())
        res.ok++
      }
    } catch (e) {
      res.errores.push(String(e))
    }

    setResultadoB(res)
    setEstadoB('done')
    if (res.errores.length === 0) toast.success(`✓ ${res.ok} clientes importados`)
    else toast.warning(`${res.ok} importados, ${res.errores.length} errores`)
  }

  // ── SECCIÓN C: historial ventas ────────────────────────────────────────────
  const CAMPOS_VENTAS = [
    { key: 'id',      label: 'ID de venta',    required: true  },
    { key: 'cliente', label: 'Nombre cliente',  required: true  },
    { key: 'producto',label: 'Productos',       required: false },
    { key: 'cantidad',label: 'Cantidad',        required: false },
    { key: 'total',   label: 'Total venta ($)', required: false },
  ]

  async function onArchivoVentas(file: File) {
    setFileVentas(file)
    const rows = await leerXLSX(file)

    // Contagram tiene headers en fila 9 (idx 8), intentar auto-detectar
    let headerIdx = rows.findIndex(r =>
      r.some(c => ['cliente', 'id', 'venta'].includes(String(c).trim().toLowerCase()))
    )
    if (headerIdx === -1) headerIdx = 0

    const headers = (rows[headerIdx] as string[]).map(h => String(h).trim()).filter(Boolean)
    const data = arraysToObjects(headers, rows.slice(headerIdx + 1))
      .filter(r => Object.values(r).some(v => String(v).trim() !== ''))

    // Auto-mapear
    const autoMapVentas: Record<string, string[]> = {
      id:       ['id', 'nro', 'numero', 'venta id', 'id venta'],
      cliente:  ['cliente', 'nombre', 'client'],
      producto: ['producto', 'descripcion', 'articulo', 'item'],
      cantidad: ['cantidad', 'qty', 'cant'],
      total:    ['total venta', 'total', 'importe', 'monto'],
    }
    const lower = headers.map(h => h.toLowerCase().trim())
    const detected: Record<string, string> = {}
    for (const campo of CAMPOS_VENTAS) {
      const cands = autoMapVentas[campo.key] ?? []
      const found = headers.find((_, i) => cands.includes(lower[i]))
      detected[campo.key] = found ?? ''
    }

    setHeadersC(headers)
    setColMapC(detected)
    setRawRowsC(data)
    setPreviewC(data.slice(0, 5))
    setEstadoC('cargado')
    toast.success(`${data.length} filas detectadas — revisá el mapeo de columnas`)
  }

  async function importarHistorial() {
    if (!fileVentas || rawRowsC.length === 0) return
    setEstadoC('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      const { id: colId, cliente: colCliente, producto: colProd, cantidad: colCant, total: colTotal } = colMapC
      if (!colCliente) { toast.error('Debés mapear la columna "Nombre cliente"'); setEstadoC('cargado'); return }

      // Cargar clientes (mapa por nombre normalizado + palabras)
      const { data: clientes } = await supabase.from('clientes').select('id, nombre')
      const clienteMap = new Map<string, string>()
      const clienteMapPal = new Map<string, string>()
      for (const c of clientes ?? []) {
        const k = c.nombre.toLowerCase().trim()
        clienteMap.set(k, c.id)
        clienteMapPal.set(k.split(/\s+/).sort().join(' '), c.id)
      }
      function buscarCliente(nombre: string) {
        const k = nombre.toLowerCase().trim()
        return clienteMap.get(k) ?? clienteMapPal.get(k.split(/\s+/).sort().join(' '))
      }

      // Agrupar por ID de venta
      type Grupo = { cliente: string; prods: string[]; total: number }
      const grupos = new Map<string, Grupo>()
      // Nombres que corresponden a clientes ocasionales — se ignoran
      const OCASIONALES = ['local', 'mostrador', 'ocasional', 'sin cuenta', 'contado']

      for (const fila of rawRowsC) {
        const id = colId ? getVal(fila, colId) : String(Math.random())
        const clienteNombre = getVal(fila, colCliente)
        if (!clienteNombre) continue
        if (OCASIONALES.includes(clienteNombre.toLowerCase())) { res.saltados++; continue }
        if (!grupos.has(id)) grupos.set(id, { cliente: clienteNombre, prods: [], total: 0 })
        const g = grupos.get(id)!
        if (colProd) {
          const prod = getVal(fila, colProd)
          const cant = colCant ? (Number(fila[colCant]) || 1) : 1
          if (prod) g.prods.push(cant > 1 ? `${prod} x${cant}` : prod)
        }
        if (colTotal) g.total = Math.round(Number(fila[colTotal]) || 0)
      }

      const movimientos = []
      for (const [id, g] of grupos.entries()) {
        const clienteId = buscarCliente(g.cliente)
        if (!clienteId) {
          if (!res.noEncontrados.includes(g.cliente)) res.noEncontrados.push(g.cliente)
          continue
        }
        const prodsStr = g.prods.slice(0, 8).join(', ') + (g.prods.length > 8 ? ` (+${g.prods.length - 8} más)` : '')
        const notas = [
          colId ? `Venta #${id}` : null,
          prodsStr || null,
          g.total > 0 ? `Total: $${g.total.toLocaleString('es-AR')}` : null,
        ].filter(Boolean).join(' · ')
        movimientos.push({ cliente_id: clienteId, tipo: 'cargo', monto: 0, notas })
      }

      const errores = await batchInsert(supabase, 'fiado_movimientos', movimientos, 50)
      res.ok = movimientos.length - errores.length
      res.noEncontrados = res.noEncontrados
      res.errores = errores
      if (res.noEncontrados.length > 0) res.saltados = res.noEncontrados.length
    } catch (e) {
      res.errores.push(String(e))
    }

    setResultadoC(res)
    setEstadoC('done')
    if (res.errores.length === 0) toast.success(`✓ ${res.ok} movimientos importados`)
    else toast.warning(`${res.ok} importados, ${res.errores.length} errores`)
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function DropZone({ refEl, onFile, label }: { refEl: React.RefObject<HTMLInputElement | null>; onFile: (f: File) => void; label: string }) {
    return (
      <div
        className="border-2 border-dashed border-teal-200 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 transition-colors"
        onClick={() => refEl.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      >
        <Upload className="mx-auto mb-2 text-teal-400" size={24} />
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-xs text-gray-400 mt-1">Arrastrá el archivo o hacé click · .xlsx / .xls</p>
        <input ref={refEl} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Carga inicial</h1>
        <p className="text-sm text-gray-500 mt-1">Importá productos y clientes desde tu planilla. Mapeá las columnas del archivo a los campos del sistema.</p>
      </div>

      {/* ── SECCIÓN A: Productos ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">1</div>
          <Package size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Productos</p>
            <p className="text-xs text-gray-500">Planilla de productos (.xlsx)</p>
          </div>
          {estadoA === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoA === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>

        <div className="p-4 space-y-4">
          {estadoA === 'idle' && (
            <DropZone refEl={refA} onFile={onArchivoProductos} label="Planilla de productos" />
          )}

          {(estadoA === 'cargado' || estadoA === 'importando') && (
            <>
              {/* Mapeo de columnas */}
              <MapeoCols
                campos={CAMPOS_PROD}
                headers={headersA}
                mapa={colMapA}
                onChange={(k, v) => setColMapA(prev => ({ ...prev, [k]: v }))}
              />

              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Vista previa (5 primeras filas)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {CAMPOS_PROD.filter(c => colMapA[c.key]).map(c => (
                          <th key={c.key} className="px-3 py-2 text-left text-gray-500 font-medium">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewA.map((row, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {CAMPOS_PROD.filter(c => colMapA[c.key]).map(c => (
                            <td key={c.key} className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]">
                              {String(row[colMapA[c.key]] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-1">{rawRowsA.length} filas en total</p>
              </div>

              <Button
                onClick={importarProductos}
                disabled={estadoA === 'importando' || !colMapA.nombre}
                className="w-full bg-teal-500 hover:bg-teal-600"
              >
                {estadoA === 'importando'
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Importando...</>
                  : `Importar ${rawRowsA.length} productos`
                }
              </Button>
            </>
          )}

          {estadoA === 'done' && resultadoA && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-700">✓ {resultadoA.ok} importados</Badge>
                {resultadoA.saltados > 0 && <Badge className="bg-yellow-100 text-yellow-700">⚠ {resultadoA.saltados} barcodes duplicados</Badge>}
                {resultadoA.errores.length > 0 && <Badge className="bg-red-100 text-red-700">✗ {resultadoA.errores.length} errores</Badge>}
              </div>
              {resultadoA.errores.length > 0 && (
                <details className="text-xs text-red-600">
                  <summary className="cursor-pointer">Ver errores</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                    {resultadoA.errores.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
              <button onClick={() => { setEstadoA('idle'); setFileProductos(null); setHeadersA([]); setRawRowsA([]) }} className="text-xs text-teal-600 underline">
                Cargar otro archivo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN B: Clientes ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">2</div>
          <Users size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Clientes</p>
            <p className="text-xs text-gray-500">Planilla de clientes con deuda (.xlsx)</p>
          </div>
          {estadoB === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoB === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>

        <div className="p-4 space-y-4">
          {estadoB === 'idle' && (
            <DropZone refEl={refB} onFile={onArchivoClientes} label="Planilla de clientes" />
          )}

          {(estadoB === 'cargado' || estadoB === 'importando') && (
            <>
              <MapeoCols
                campos={CAMPOS_CLIENTES}
                headers={headersB}
                mapa={colMapB}
                onChange={(k, v) => setColMapB(prev => ({ ...prev, [k]: v }))}
              />

              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Vista previa (5 primeras filas)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {CAMPOS_CLIENTES.filter(c => colMapB[c.key]).map(c => (
                          <th key={c.key} className="px-3 py-2 text-left text-gray-500 font-medium">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewB.map((row, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {CAMPOS_CLIENTES.filter(c => colMapB[c.key]).map(c => (
                            <td key={c.key} className="px-3 py-1.5 text-gray-700 truncate max-w-[200px]">
                              {String(row[colMapB[c.key]] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-1">{rawRowsB.length} filas en total</p>
              </div>

              <Button
                onClick={importarClientes}
                disabled={estadoB === 'importando' || !colMapB.nombre}
                className="w-full bg-teal-500 hover:bg-teal-600"
              >
                {estadoB === 'importando'
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Importando...</>
                  : `Importar ${rawRowsB.length} clientes`
                }
              </Button>
            </>
          )}

          {estadoB === 'done' && resultadoB && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-700">✓ {resultadoB.ok} importados</Badge>
                {resultadoB.saltados > 0 && <Badge className="bg-yellow-100 text-yellow-700">⚠ {resultadoB.saltados} ya existían</Badge>}
                {resultadoB.errores.length > 0 && <Badge className="bg-red-100 text-red-700">✗ {resultadoB.errores.length} errores</Badge>}
              </div>
              {resultadoB.errores.length > 0 && (
                <details className="text-xs text-red-600">
                  <summary className="cursor-pointer">Ver errores</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                    {resultadoB.errores.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
              <button onClick={() => { setEstadoB('idle'); setFileClientes(null); setHeadersB([]); setRawRowsB([]) }} className="text-xs text-teal-600 underline">
                Cargar otro archivo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN C: Historial de ventas ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">3</div>
          <ShoppingBag size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Historial de ventas</p>
            <p className="text-xs text-gray-500">Mostrará de dónde viene la deuda de cada cliente</p>
          </div>
          {estadoC === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoC === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>

        <div className="p-4 space-y-4">
          {estadoC === 'idle' && (
            <DropZone refEl={refC} onFile={onArchivoVentas} label="Planilla de historial de ventas" />
          )}

          {(estadoC === 'cargado' || estadoC === 'importando') && (
            <>
              <MapeoCols
                campos={CAMPOS_VENTAS}
                headers={headersC}
                mapa={colMapC}
                onChange={(k, v) => setColMapC(prev => ({ ...prev, [k]: v }))}
              />

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Vista previa (5 primeras filas)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {CAMPOS_VENTAS.filter(c => colMapC[c.key]).map(c => (
                          <th key={c.key} className="px-3 py-2 text-left text-gray-500 font-medium">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewC.map((row, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {CAMPOS_VENTAS.filter(c => colMapC[c.key]).map(c => (
                            <td key={c.key} className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]">
                              {String(row[colMapC[c.key]] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-1">{rawRowsC.length} filas en total</p>
              </div>

              <Button
                onClick={importarHistorial}
                disabled={estadoC === 'importando' || !colMapC.cliente}
                className="w-full bg-teal-500 hover:bg-teal-600"
              >
                {estadoC === 'importando'
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Importando...</>
                  : `Importar historial (${rawRowsC.length} filas)`
                }
              </Button>
            </>
          )}

          {estadoC === 'done' && resultadoC && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-700">✓ {resultadoC.ok} registros importados</Badge>
                {resultadoC.saltados > 0 && <Badge className="bg-yellow-100 text-yellow-700">⚠ {resultadoC.saltados} omitidos (ocasionales o no encontrados)</Badge>}
                {resultadoC.errores.length > 0 && <Badge className="bg-red-100 text-red-700">✗ {resultadoC.errores.length} errores</Badge>}
              </div>
              {resultadoC.noEncontrados.length > 0 && (
                <details className="text-xs text-yellow-700">
                  <summary className="cursor-pointer">Ver clientes no encontrados ({resultadoC.noEncontrados.length})</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                    {resultadoC.noEncontrados.slice(0, 20).map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </details>
              )}
              <button onClick={() => { setEstadoC('idle'); setFileVentas(null); setHeadersC([]); setRawRowsC([]) }} className="text-xs text-teal-600 underline">
                Cargar otro archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
