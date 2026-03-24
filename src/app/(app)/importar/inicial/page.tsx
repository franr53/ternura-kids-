'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Upload, Package, Users, ShoppingBag, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

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

// ── Tipos ───────────────────────────────────────────────────────────────────
interface FilaProducto {
  Nombre: string
  'Tipo de Producto': string
  Proveedor: string
  Código: string
  Stock: number
  Costo: number
  'Precio de Venta': number
  Activo: string
}

interface FilaClienteCC {
  Cliente: string
  Total: number
}

interface FilaVenta {
  Id: number | string
  Cliente: string
  Producto: string
  Cantidad: number
  'Total Venta': number
}

interface ResultadoImport {
  ok: number
  saltados: number
  noEncontrados: string[]
  errores: string[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────
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

// ── Componente principal ─────────────────────────────────────────────────────
export default function CargaInicialPage() {
  const supabase = createClient()

  // Sección A — Productos
  const [fileProductos, setFileProductos] = useState<File | null>(null)
  const [previewProductos, setPreviewProductos] = useState<FilaProducto[]>([])
  const [estadoA, setEstadoA] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoA, setResultadoA] = useState<ResultadoImport | null>(null)
  const refA = useRef<HTMLInputElement>(null)

  // Sección B — Clientes
  const [fileClientes, setFileClientes] = useState<File | null>(null)
  const [previewClientes, setPreviewClientes] = useState<FilaClienteCC[]>([])
  const [estadoB, setEstadoB] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoB, setResultadoB] = useState<ResultadoImport | null>(null)
  const refB = useRef<HTMLInputElement>(null)

  // Sección C — Historial ventas
  const [fileVentas, setFileVentas] = useState<File | null>(null)
  const [previewVentas, setPreviewVentas] = useState<FilaVenta[]>([])
  const [ventasAgrupadas, setVentasAgrupadas] = useState<{ id: string; cliente: string; items: string; total: number }[]>([])
  const [estadoC, setEstadoC] = useState<'idle' | 'cargado' | 'importando' | 'done'>('idle')
  const [resultadoC, setResultadoC] = useState<ResultadoImport | null>(null)
  const refC = useRef<HTMLInputElement>(null)

  // ── SECCIÓN A: parsear productos ──────────────────────────────────────────
  async function onArchivoProductos(file: File) {
    setFileProductos(file)
    const rows = await leerXLSX(file)
    if (rows.length < 2) { toast.error('Archivo vacío'); return }
    const headers = rows[0] as string[]
    const data = arraysToObjects(headers, rows.slice(1)) as unknown as FilaProducto[]
    const activos = data.filter(r => String(r['Activo']).trim() === 'Si' && r['Nombre'])
    setPreviewProductos(activos.slice(0, 10))
    setEstadoA('cargado')
    toast.success(`${activos.length} productos activos encontrados`)
  }

  async function importarProductos() {
    if (!fileProductos) return
    setEstadoA('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      // Leer archivo completo
      const rows = await leerXLSX(fileProductos)
      const headers = rows[0] as string[]
      const data = arraysToObjects(headers, rows.slice(1)) as unknown as FilaProducto[]
      const activos = data.filter(r => String(r['Activo']).trim() === 'Si' && r['Nombre'])

      // Cargar categorías de DB
      const { data: cats } = await supabase.from('categorias').select('id, nombre')
      const catMap = new Map<string, string>((cats ?? []).map(c => [c.nombre, c.id]))

      // Cargar barcodes existentes para detectar duplicados
      const { data: barcodes } = await supabase.from('variantes').select('codigo_barras').not('codigo_barras', 'is', null)
      const barcodesExistentes = new Set((barcodes ?? []).map(b => b.codigo_barras as string))

      // Proveedores únicos → insertar
      const proveedoresUnicos = [...new Set(activos.map(r => r['Proveedor']?.trim()).filter(Boolean))]
      const proveedoresInsert = proveedoresUnicos.map(nombre => ({ nombre, activo: true }))
      if (proveedoresInsert.length > 0) {
        await supabase.from('proveedores').upsert(proveedoresInsert, { onConflict: 'nombre', ignoreDuplicates: true })
      }
      const { data: provs } = await supabase.from('proveedores').select('id, nombre')
      const provMap = new Map<string, string>((provs ?? []).map(p => [p.nombre, p.id]))

      // Insertar productos en lotes
      const BATCH = 50
      for (let i = 0; i < activos.length; i += BATCH) {
        const lote = activos.slice(i, i + BATCH)

        const productosInsert = lote.map(r => {
          const catNombre = resolverCategoria(String(r['Tipo de Producto']))
          return {
            nombre: String(r['Nombre']).trim(),
            categoria_id: catMap.get(catNombre) ?? null,
            proveedor_id: provMap.get(String(r['Proveedor']).trim()) ?? null,
            precio_costo: Math.round(Number(r['Costo']) || 0),
            precio_venta: Math.round(Number(r['Precio de Venta']) || 0),
            activo: true,
            temporada: 'todo_el_año',
          }
        })

        const { data: insertados, error: errProd } = await supabase
          .from('productos')
          .insert(productosInsert)
          .select('id')

        if (errProd || !insertados) {
          res.errores.push(`Lote ${Math.floor(i / BATCH) + 1}: ${errProd?.message}`)
          continue
        }

        // Insertar variantes para los productos del lote
        const variantesInsert = insertados.map((prod, idx) => {
          const r = lote[idx]
          const codigo = String(r['Código'] ?? '').trim() || null
          const barcode = codigo && !barcodesExistentes.has(codigo) ? codigo : null
          if (codigo && barcodesExistentes.has(codigo)) res.saltados++
          if (barcode) barcodesExistentes.add(barcode)
          return {
            producto_id: prod.id,
            talle: 'Único',
            codigo_barras: barcode,
            stock: Math.round(Number(r['Stock']) || 0),
          }
        })

        const erroresVariantes = await batchInsert(supabase, 'variantes', variantesInsert, BATCH)
        if (erroresVariantes.length > 0) res.errores.push(...erroresVariantes)

        res.ok += insertados.length
      }
    } catch (e) {
      res.errores.push(String(e))
    }

    setResultadoA(res)
    setEstadoA('done')
    if (res.errores.length === 0) toast.success(`✓ ${res.ok} productos importados`)
    else toast.warning(`${res.ok} importados, ${res.errores.length} errores`)
  }

  // ── SECCIÓN B: parsear clientes ───────────────────────────────────────────
  async function onArchivoClientes(file: File) {
    setFileClientes(file)
    const rows = await leerXLSX(file)
    // Buscar la fila de headers (tiene "Cliente")
    const headerIdx = rows.findIndex(r => r.some(c => String(c).trim() === 'Cliente'))
    if (headerIdx === -1) { toast.error('No se encontró columna "Cliente"'); return }
    const headers = rows[headerIdx] as string[]
    const data = arraysToObjects(headers, rows.slice(headerIdx + 1)) as unknown as FilaClienteCC[]
    const validos = data.filter(r => r['Cliente'] && String(r['Cliente']).trim())
    setPreviewClientes(validos.slice(0, 10).sort((a, b) => (Number(b['Total']) || 0) - (Number(a['Total']) || 0)))
    setFileClientes(file)
    setEstadoB('cargado')
    toast.success(`${validos.length} clientes encontrados`)
  }

  async function importarClientes() {
    if (!fileClientes) return
    setEstadoB('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      const rows = await leerXLSX(fileClientes)
      const headerIdx = rows.findIndex(r => r.some(c => String(c).trim() === 'Cliente'))
      const headers = rows[headerIdx] as string[]
      const data = arraysToObjects(headers, rows.slice(headerIdx + 1)) as unknown as FilaClienteCC[]
      const validos = data.filter(r => r['Cliente'] && String(r['Cliente']).trim())

      // Clientes existentes
      const { data: existentes } = await supabase.from('clientes').select('nombre')
      const existentesSet = new Set((existentes ?? []).map(c => c.nombre.toLowerCase().trim()))

      for (const fila of validos) {
        const nombre = String(fila['Cliente']).trim()
        const deuda = Math.round(Number(fila['Total']) || 0)

        if (existentesSet.has(nombre.toLowerCase())) {
          res.saltados++
          continue
        }

        const { data: cliente, error: errCliente } = await supabase
          .from('clientes')
          .insert({ nombre, deuda_total: deuda, activo: true })
          .select('id')
          .single()

        if (errCliente || !cliente) {
          res.errores.push(`${nombre}: ${errCliente?.message}`)
          continue
        }

        if (deuda > 0) {
          await supabase.from('fiado_movimientos').insert({
            cliente_id: cliente.id,
            tipo: 'cargo',
            monto: deuda,
            notas: 'Saldo inicial Contagram al 23/03/2026',
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

  // ── SECCIÓN C: parsear historial ventas ───────────────────────────────────
  async function onArchivoVentas(file: File) {
    setFileVentas(file)
    const rows = await leerXLSX(file)

    // Headers en fila 9 (0-indexed), datos desde fila 10
    const headerRow = rows[9] as string[]
    if (!headerRow || !headerRow.includes('Cliente')) {
      toast.error('Estructura de archivo inesperada')
      return
    }

    const data = arraysToObjects(headerRow, rows.slice(10)) as unknown as FilaVenta[]
    const validos = data.filter(r => r['Cliente'] && r['Producto'])

    // Agrupar por Id de venta
    const grupos = new Map<string, { cliente: string; items: string[]; total: number }>()
    for (const v of validos) {
      const id = String(v['Id'] ?? '').trim()
      if (!id) continue
      if (!grupos.has(id)) {
        grupos.set(id, { cliente: String(v['Cliente']).trim(), items: [], total: 0 })
      }
      const g = grupos.get(id)!
      const prod = String(v['Producto']).trim()
      const cant = Number(v['Cantidad']) || 1
      g.items.push(`${prod}${cant > 1 ? ` x${cant}` : ''}`)
      g.total = Math.round(Number(v['Total Venta']) || 0)
    }

    const agrupadas = Array.from(grupos.entries()).map(([id, g]) => ({
      id, cliente: g.cliente, items: g.items.join(', '), total: g.total,
    }))

    setVentasAgrupadas(agrupadas)
    setFileVentas(file)
    setEstadoC('cargado')
    toast.success(`${agrupadas.length} ventas encontradas de ${new Set(agrupadas.map(v => v.cliente)).size} clientes`)
  }

  async function importarHistorial() {
    if (!fileVentas) return
    setEstadoC('importando')
    const res: ResultadoImport = { ok: 0, saltados: 0, noEncontrados: [], errores: [] }

    try {
      // Cargar mapa de clientes — matching por nombre normalizado y también por palabras
      const { data: clientes } = await supabase.from('clientes').select('id, nombre')
      const clienteMap = new Map<string, string>()
      const clienteMapPalabras = new Map<string, string>() // clave: palabras ordenadas
      for (const c of clientes ?? []) {
        const key = c.nombre.toLowerCase().trim()
        clienteMap.set(key, c.id)
        // También indexar por palabras ordenadas (para "Lezica Yeni" == "yeni lezica")
        const palabras = key.split(/\s+/).sort().join(' ')
        clienteMapPalabras.set(palabras, c.id)
      }

      function buscarCliente(nombre: string): string | undefined {
        const key = nombre.toLowerCase().trim()
        if (clienteMap.has(key)) return clienteMap.get(key)
        // Probar con palabras ordenadas
        const palabras = key.split(/\s+/).sort().join(' ')
        return clienteMapPalabras.get(palabras)
      }

      // Re-parsear el archivo para agrupar
      const rows = await leerXLSX(fileVentas)
      const headerRow = rows[9] as string[]
      const data = arraysToObjects(headerRow, rows.slice(10)) as unknown as FilaVenta[]
      const validos = data.filter(r => r['Cliente'] && r['Producto'])

      const grupos = new Map<string, { cliente: string; items: string[]; total: number }>()
      for (const v of validos) {
        const id = String(v['Id'] ?? '').trim()
        if (!id) continue
        if (!grupos.has(id)) {
          grupos.set(id, { cliente: String(v['Cliente']).trim(), items: [], total: 0 })
        }
        const g = grupos.get(id)!
        const prod = String(v['Producto']).trim()
        const cant = Number(v['Cantidad']) || 1
        g.items.push(`${prod}${cant > 1 ? ` x${cant}` : ''}`)
        g.total = Math.round(Number(v['Total Venta']) || 0)
      }

      const movimientos = []
      for (const [id, g] of grupos.entries()) {
        const clienteId = buscarCliente(g.cliente)
        if (!clienteId) {
          if (!res.noEncontrados.includes(g.cliente)) res.noEncontrados.push(g.cliente)
          continue
        }
        movimientos.push({
          cliente_id: clienteId,
          tipo: 'cargo',
          monto: 0,
          notas: `Historial #${id}: ${g.items.slice(0, 8).join(', ')}${g.items.length > 8 ? ` (+ ${g.items.length - 8} más)` : ''} | Total: $${g.total.toLocaleString('es-AR')}`,
        })
      }

      const errores = await batchInsert(supabase, 'fiado_movimientos', movimientos, 50)
      res.ok = movimientos.length
      res.errores = errores
    } catch (e) {
      res.errores.push(String(e))
    }

    setResultadoC(res)
    setEstadoC('done')
    if (res.errores.length === 0) toast.success(`✓ ${res.ok} registros importados`)
    else toast.warning(`${res.ok} importados, ${res.errores.length} errores`)
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
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
        <p className="text-xs text-gray-400 mt-1">Arrastrá el archivo o hacé click</p>
        <input ref={refEl} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Carga inicial desde Contagram</h1>
        <p className="text-sm text-gray-500 mt-1">Importá los datos del sistema anterior. Hacé los 3 pasos en orden.</p>
      </div>

      {/* ── SECCIÓN A: Productos ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">1</div>
          <Package size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Productos</p>
            <p className="text-xs text-gray-500">Listado de Productos *.xlsx</p>
          </div>
          {estadoA === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoA === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>
        <div className="p-4 space-y-4">
          {estadoA === 'idle' && (
            <DropZone refEl={refA} onFile={onArchivoProductos} label="Listado de Productos 23-03-2026.xlsx" />
          )}
          {(estadoA === 'cargado' || estadoA === 'importando') && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 size={14} className="text-teal-500" />
                <span>{fileProductos?.name}</span>
                <button className="text-xs text-gray-400 underline" onClick={() => { setEstadoA('idle'); setFileProductos(null) }}>cambiar</button>
              </div>
              {previewProductos.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      <th className="text-left p-2 font-medium text-gray-600">Nombre</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden sm:table-cell">Tipo</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden sm:table-cell">Proveedor</th>
                      <th className="text-right p-2 font-medium text-gray-600">Venta</th>
                    </tr></thead>
                    <tbody>
                      {previewProductos.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="p-2 text-gray-800 truncate max-w-[180px]">{r['Nombre']}</td>
                          <td className="p-2 text-gray-500 hidden sm:table-cell">{resolverCategoria(String(r['Tipo de Producto']))}</td>
                          <td className="p-2 text-gray-500 hidden sm:table-cell truncate max-w-[100px]">{r['Proveedor']}</td>
                          <td className="p-2 text-right text-gray-800">${Number(r['Precio de Venta']).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-400 p-2 bg-gray-50">Mostrando primeros 10 registros</p>
                </div>
              )}
              <Button
                onClick={importarProductos}
                disabled={estadoA === 'importando'}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                {estadoA === 'importando' ? <><Loader2 className="animate-spin mr-2" size={16} />Importando...</> : 'Importar productos →'}
              </Button>
            </>
          )}
          {estadoA === 'done' && resultadoA && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-800">{resultadoA.ok} importados</Badge>
                {resultadoA.saltados > 0 && <Badge className="bg-yellow-100 text-yellow-800">{resultadoA.saltados} códigos duplicados (saltados)</Badge>}
                {resultadoA.errores.length > 0 && <Badge className="bg-red-100 text-red-800">{resultadoA.errores.length} errores</Badge>}
              </div>
              {resultadoA.errores.length > 0 && (
                <details className="text-xs text-red-600 bg-red-50 rounded p-2">
                  <summary className="cursor-pointer">Ver errores</summary>
                  {resultadoA.errores.map((e, i) => <p key={i}>{e}</p>)}
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN B: Clientes ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">2</div>
          <Users size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Clientes con deuda</p>
            <p className="text-xs text-gray-500">Informe Cuentas Corrientes *.xlsx</p>
          </div>
          {estadoB === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoB === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>
        <div className="p-4 space-y-4">
          {estadoB === 'idle' && (
            <DropZone refEl={refB} onFile={onArchivoClientes} label="Informe Cuentas Corrientes Saldos de Clientes *.xlsx" />
          )}
          {(estadoB === 'cargado' || estadoB === 'importando') && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 size={14} className="text-teal-500" />
                <span>{fileClientes?.name}</span>
                <button className="text-xs text-gray-400 underline" onClick={() => { setEstadoB('idle'); setFileClientes(null) }}>cambiar</button>
              </div>
              {previewClientes.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      <th className="text-left p-2 font-medium text-gray-600">Cliente</th>
                      <th className="text-right p-2 font-medium text-gray-600">Deuda</th>
                    </tr></thead>
                    <tbody>
                      {previewClientes.map((r, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="p-2 text-gray-800">{r['Cliente']}</td>
                          <td className="p-2 text-right font-medium text-red-600">${Number(r['Total']).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-400 p-2 bg-gray-50">Mostrando top 10 por deuda</p>
                </div>
              )}
              <Button
                onClick={importarClientes}
                disabled={estadoB === 'importando'}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                {estadoB === 'importando' ? <><Loader2 className="animate-spin mr-2" size={16} />Importando...</> : 'Importar clientes →'}
              </Button>
            </>
          )}
          {estadoB === 'done' && resultadoB && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-800">{resultadoB.ok} importados</Badge>
                {resultadoB.saltados > 0 && <Badge className="bg-yellow-100 text-yellow-800">{resultadoB.saltados} ya existían</Badge>}
                {resultadoB.errores.length > 0 && <Badge className="bg-red-100 text-red-800">{resultadoB.errores.length} errores</Badge>}
              </div>
              {resultadoB.errores.length > 0 && (
                <details className="text-xs text-red-600 bg-red-50 rounded p-2">
                  <summary className="cursor-pointer">Ver errores</summary>
                  {resultadoB.errores.map((e, i) => <p key={i}>{e}</p>)}
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN C: Historial ventas ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-bold">3</div>
          <ShoppingBag size={18} className="text-teal-600" />
          <div className="flex-1">
            <p className="font-semibold text-gray-900">Historial de ventas</p>
            <p className="text-xs text-gray-500">Informe de Ventas Resumen *.xlsx — para que las clientas puedan ver qué llevaron</p>
          </div>
          {estadoC === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
          {estadoC === 'importando' && <Loader2 className="text-teal-500 animate-spin" size={20} />}
        </div>
        <div className="p-4 space-y-4">
          {estadoC === 'idle' && (
            <DropZone refEl={refC} onFile={onArchivoVentas} label="Informe de Ventas Resumen *.xlsx" />
          )}
          {(estadoC === 'cargado' || estadoC === 'importando') && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle2 size={14} className="text-teal-500" />
                <span>{fileVentas?.name}</span>
                <button className="text-xs text-gray-400 underline" onClick={() => { setEstadoC('idle'); setFileVentas(null) }}>cambiar</button>
              </div>
              {ventasAgrupadas.length > 0 && (
                <div className="rounded-lg overflow-hidden border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      <th className="text-left p-2 font-medium text-gray-600">Cliente</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden sm:table-cell">Artículos</th>
                      <th className="text-right p-2 font-medium text-gray-600">Total</th>
                    </tr></thead>
                    <tbody>
                      {ventasAgrupadas.slice(0, 8).map((v, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="p-2 text-gray-800 whitespace-nowrap">{v.cliente}</td>
                          <td className="p-2 text-gray-500 hidden sm:table-cell truncate max-w-[220px]">{v.items}</td>
                          <td className="p-2 text-right text-gray-800">${v.total.toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-400 p-2 bg-gray-50">{ventasAgrupadas.length} ventas en total — se guardan como historial informativo (monto $0, no afecta la deuda)</p>
                </div>
              )}
              <Button
                onClick={importarHistorial}
                disabled={estadoC === 'importando'}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                {estadoC === 'importando' ? <><Loader2 className="animate-spin mr-2" size={16} />Importando...</> : 'Importar historial →'}
              </Button>
            </>
          )}
          {estadoC === 'done' && resultadoC && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Badge className="bg-green-100 text-green-800">{resultadoC.ok} registros importados</Badge>
                {resultadoC.noEncontrados.length > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800">{resultadoC.noEncontrados.length} clientes no encontrados</Badge>
                )}
                {resultadoC.errores.length > 0 && <Badge className="bg-red-100 text-red-800">{resultadoC.errores.length} errores</Badge>}
              </div>
              {resultadoC.noEncontrados.length > 0 && (
                <details className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                  <summary className="cursor-pointer">Clientes no encontrados ({resultadoC.noEncontrados.length})</summary>
                  {resultadoC.noEncontrados.slice(0, 20).map((n, i) => <p key={i}>{n}</p>)}
                  {resultadoC.noEncontrados.length > 20 && <p>... y {resultadoC.noEncontrados.length - 20} más</p>}
                </details>
              )}
              {resultadoC.errores.length > 0 && (
                <details className="text-xs text-red-600 bg-red-50 rounded p-2">
                  <summary className="cursor-pointer">Ver errores</summary>
                  {resultadoC.errores.map((e, i) => <p key={i}>{e}</p>)}
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info adicional */}
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
        <AlertCircle size={14} className="mt-0.5 shrink-0 text-gray-400" />
        <p>Los datos importados no se pueden deshacer desde aquí. Si necesitás volver a empezar, aplicá la migración SQL 014 en Supabase Dashboard para limpiar todo y comenzar de nuevo.</p>
      </div>
    </div>
  )
}
