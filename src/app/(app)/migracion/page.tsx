'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Upload, Trash2, CheckCircle2, AlertTriangle, Loader2, Users, Package, Building2, DollarSign, X } from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Tipos ──────────────────────────────────────────────────────
interface FilaProveedor { nombre: string }
interface FilaCliente { nombre: string; telefono: string }
interface FilaProducto {
  nombre: string; proveedor: string; categoria: string
  codigo: string; stock: number; costo: number; precio: number; activo: boolean
}
interface FilaDeuda { cliente: string; deuda: number }

interface ConteoActual {
  proveedores: number; clientes: number; productos: number
  variantes: number; ventas: number; gastos: number; cajas: number
}

interface ColMapeo {
  columna: string    // nombre en el Excel
  ejemplo: string    // valor de la primera fila
  destino: string    // campo destino (o "— ignorado")
  usado: boolean     // si se importa o no
}

// ── Funciones de mapeo por archivo ─────────────────────────────
const MAPEO_PROVEEDORES: Record<string, string> = {
  'Proveedor':        'nombre',
  'Teléfono':         'telefono (si tiene)',
  'Saldo Inicial':    'deuda_total = $0 (se ignora, arranca en cero)',
  'Email':            '— ignorado',
  'Nombre':           '— ignorado (se usa "Proveedor")',
  'Apellido':         '— ignorado',
  'Dirección':        '— ignorado',
  'Localidad':        '— ignorado',
  'Provincia':        '— ignorado',
  'DNI':              '— ignorado',
  'CUIT':             '— ignorado',
  'Condición de IVA': '— ignorado',
  'Razón Social':     '— ignorado',
  'Observaciones':    '— ignorado',
}

const MAPEO_CLIENTES: Record<string, string> = {
  'Cliente':          'nombre',
  'Teléfono':         'telefono',
  'Teléfono 2':       'telefono (si el principal está vacío)',
  'Saldo Inicial':    'deuda_total = $0 (se actualiza en Paso 4)',
  'Nombre':           '— ignorado (se usa "Cliente")',
  'Apellido':         '— ignorado',
  'Email':            '— ignorado',
  'Dirección':        '— ignorado',
  'Localidad':        '— ignorado',
  'Provincia':        '— ignorado',
  'DNI':              '— ignorado',
  'Observaciones':    '— ignorado',
}

const MAPEO_PRODUCTOS: Record<string, string> = {
  'Nombre':              'producto → nombre  ✦  variante → nombre',
  'Tipo de Producto':    'producto → categoría',
  'Proveedor':           'producto → proveedor',
  'Código':              'variante → código de barras',
  'Stock':               'variante → stock',
  'Costo':               'producto → precio_costo  ✦  variante → precio_costo',
  'Precio de Venta':     'producto → precio_venta  ✦  variante → precio_venta',
  'Activo':              'producto → activo',
  'Descripción':         '— ignorado',
  'IVA Compras':         '— ignorado',
  'IVA Ventas':          '— ignorado',
  'Imagen':              '— ignorado',
  'Mostrar en Ventas':   '— ignorado',
  'Mostrar en Compras':  '— ignorado',
  'Id':                  '— ignorado (se genera nuevo ID)',
}

const MAPEO_DEUDAS: Record<string, string> = {
  'Cliente':           'busca el cliente por nombre',
  'A Cobrar':          'clientes → deuda_total (último saldo del cliente)',
  'Emisión':           '— solo para ordenar, no se importa',
  'Operación':         '— ignorado',
  'Total Venta':       '— ignorado',
  'Cobrado':           '— ignorado',
  'N° de Comprobante': '— ignorado',
  'Medio de Cobro':    '— ignorado',
  'Descripción':       '— ignorado',
  'Categoría':         '— ignorado',
}

function generarMapeo(
  row: Record<string, unknown>,
  mapaConocido: Record<string, string>
): ColMapeo[] {
  const columnas = Object.keys(row)
  return columnas.map(col => {
    const destino = mapaConocido[col] ?? '— ignorado'
    const usado = !destino.startsWith('—')
    const ejemplo = String(row[col] ?? '').trim().slice(0, 40) || '(vacío)'
    return { columna: col, ejemplo, destino, usado }
  })
}

// ── Componente tabla de mapeo ──────────────────────────────────
function TablaMapeo({ mapeo }: { mapeo: ColMapeo[] }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#f8fdfc' }}>
            <th className="text-left px-3 py-2 font-semibold text-gray-500 w-1/3">Columna en archivo</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500 w-1/4">Ejemplo</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-500">Va a parar a...</th>
          </tr>
        </thead>
        <tbody>
          {mapeo.map((col, i) => (
            <tr key={i} className="border-t border-gray-50"
              style={{ background: col.usado ? 'white' : '#fafafa' }}>
              <td className="px-3 py-2 font-semibold" style={{ color: col.usado ? '#0d9488' : '#9ca3af' }}>
                {col.columna}
              </td>
              <td className="px-3 py-2 text-gray-500 font-mono truncate max-w-0" style={{ maxWidth: '8rem' }}>
                {col.ejemplo}
              </td>
              <td className="px-3 py-2" style={{ color: col.usado ? '#374151' : '#d1d5db' }}>
                {col.destino}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Helpers XLSX ───────────────────────────────────────────────
function leerExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }))
      } catch { reject(new Error('No se pudo leer el archivo')) }
    }
    reader.readAsArrayBuffer(file)
  })
}

function num(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

// ── Parsers ────────────────────────────────────────────────────
function parsearProveedores(rows: Record<string, unknown>[]): FilaProveedor[] {
  const vistos = new Set<string>()
  return rows
    .map(r => ({ nombre: str(r['Proveedor'] ?? r['proveedor'] ?? r['Nombre'] ?? '') }))
    .filter(r => {
      if (!r.nombre || vistos.has(r.nombre.toLowerCase())) return false
      vistos.add(r.nombre.toLowerCase())
      return true
    })
}

function parsearClientes(rows: Record<string, unknown>[]): FilaCliente[] {
  const vistos = new Set<string>()
  return rows
    .map(r => ({
      nombre: str(r['Cliente'] ?? r['Nombre'] ?? ''),
      telefono: str(r['Teléfono'] ?? r['Telefono'] ?? r['Teléfono 2'] ?? ''),
    }))
    .filter(r => {
      const n = r.nombre.toLowerCase()
      if (!r.nombre || n === 'total' || vistos.has(n)) return false
      vistos.add(n)
      return true
    })
}

function parsearProductos(rows: Record<string, unknown>[]): FilaProducto[] {
  return rows
    .map(r => ({
      nombre:    str(r['Nombre'] ?? r['nombre'] ?? ''),
      proveedor: str(r['Proveedor'] ?? r['proveedor'] ?? ''),
      categoria: str(r['Tipo de Producto'] ?? r['Tipo'] ?? r['tipo'] ?? ''),
      codigo:    str(r['Código'] ?? r['Codigo'] ?? r['codigo'] ?? ''),
      stock:     Math.max(0, Math.round(num(r['Stock'] ?? r['stock'] ?? 0))),
      costo:     Math.round(num(r['Costo'] ?? r['costo'] ?? 0)),
      precio:    Math.round(num(r['Precio de Venta'] ?? r['PrecioVenta'] ?? r['precio_venta'] ?? 0)),
      activo:    str(r['Activo'] ?? 'Si').toLowerCase() !== 'no',
    }))
    .filter(r => r.nombre.length > 0)
}

function parsearMovimientosClientes(rows: Record<string, unknown>[]): FilaDeuda[] {
  // Tomamos el último valor de "A Cobrar" por cliente (saldo final)
  const saldos = new Map<string, number>()
  for (const r of rows) {
    const cliente = str(r['Cliente'] ?? r['cliente'] ?? '')
    const aCobrar = r['A Cobrar'] ?? r['a_cobrar'] ?? r['ACobrar'] ?? ''
    if (!cliente || cliente === 'LOCAL' || cliente === '') continue
    const valor = num(aCobrar)
    if (valor !== 0) saldos.set(cliente, Math.abs(valor))
  }
  return Array.from(saldos.entries())
    .map(([cliente, deuda]) => ({ cliente, deuda }))
    .filter(r => r.deuda > 0)
    .sort((a, b) => b.deuda - a.deuda)
}

// ── Componente ─────────────────────────────────────────────────
export default function MigracionPage() {
  const supabase = createClient()

  const [conteoActual, setConteoActual] = useState<ConteoActual | null>(null)
  const [cargandoConteo, setCargandoConteo] = useState(false)
  const [resetando, setResetando] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const [proveedores, setProveedores] = useState<FilaProveedor[] | null>(null)
  const [clientes, setClientes] = useState<FilaCliente[] | null>(null)
  const [productos, setProductos] = useState<FilaProducto[] | null>(null)
  const [deudas, setDeudas] = useState<FilaDeuda[] | null>(null)

  // Primera fila de cada archivo (para mostrar el mapeo de columnas)
  const [mapeoProveedores, setMapeoProveedores] = useState<ColMapeo[] | null>(null)
  const [mapeoClientes, setMapeoClientes] = useState<ColMapeo[] | null>(null)
  const [mapeoProductos, setMapeoProductos] = useState<ColMapeo[] | null>(null)
  const [mapeoDeudas, setMapeoDeudas] = useState<ColMapeo[] | null>(null)

  const [cargando, setCargando] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Record<string, string>>({})

  // ── Contar datos actuales ──────────────────────────────────
  const cargarConteo = useCallback(async () => {
    setCargandoConteo(true)
    const [
      { count: cp }, { count: cc }, { count: cpr }, { count: cv },
      { count: cv2 }, { count: cg }, { count: ccj }
    ] = await Promise.all([
      supabase.from('proveedores').select('*', { count: 'exact', head: true }),
      supabase.from('clientes').select('*', { count: 'exact', head: true }),
      supabase.from('productos').select('*', { count: 'exact', head: true }),
      supabase.from('variantes').select('*', { count: 'exact', head: true }),
      supabase.from('ventas').select('*', { count: 'exact', head: true }),
      supabase.from('gastos').select('*', { count: 'exact', head: true }),
      supabase.from('cajas').select('*', { count: 'exact', head: true }),
    ])
    setConteoActual({
      proveedores: cp ?? 0, clientes: cc ?? 0, productos: cpr ?? 0,
      variantes: cv ?? 0, ventas: cv2 ?? 0, gastos: cg ?? 0, cajas: ccj ?? 0,
    })
    setCargandoConteo(false)
  }, [supabase])

  // ── Reset completo ─────────────────────────────────────────
  async function ejecutarReset() {
    setResetando(true)
    try {
      // Orden respetando FK
      const tablas = [
        'fiado_movimientos', 'venta_pagos', 'venta_items',
        'ventas', 'historial_precios', 'variantes', 'productos',
        'clientes', 'proveedores', 'gastos', 'cajas',
      ]
      for (const tabla of tablas) {
        const { error } = await supabase.from(tabla as never).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (error && !error.message.includes('does not exist')) {
          console.warn(`Error borrando ${tabla}:`, error.message)
        }
      }
      toast.success('Datos borrados. Base lista para migración.')
      setConfirmReset(false)
      setResultados({})
      setProveedores(null); setClientes(null); setProductos(null); setDeudas(null)
      await cargarConteo()
    } catch (e: unknown) {
      toast.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setResetando(false)
    }
  }

  // ── Importar proveedores ───────────────────────────────────
  async function importarProveedores() {
    if (!proveedores) return
    setCargando('proveedores')
    let ok = 0; let err = 0
    for (const p of proveedores) {
      const { error } = await supabase.from('proveedores').insert({
        nombre: p.nombre, deuda_total: 0, activo: true,
      })
      if (error) err++; else ok++
    }
    setResultados(r => ({ ...r, proveedores: `✅ ${ok} insertados${err ? ` · ⚠️ ${err} errores` : ''}` }))
    toast.success(`Proveedores: ${ok} importados`)
    setCargando(null)
    await cargarConteo()
  }

  // ── Importar clientes ──────────────────────────────────────
  async function importarClientes() {
    if (!clientes) return
    setCargando('clientes')
    let ok = 0; let err = 0
    for (const c of clientes) {
      const { error } = await supabase.from('clientes').insert({
        nombre: c.nombre,
        telefono: c.telefono || null,
        deuda_total: 0,
      })
      if (error) err++; else ok++
    }
    setResultados(r => ({ ...r, clientes: `✅ ${ok} insertados${err ? ` · ⚠️ ${err} errores` : ''}` }))
    toast.success(`Clientes: ${ok} importados`)
    setCargando(null)
    await cargarConteo()
  }

  // ── Importar productos ─────────────────────────────────────
  async function importarProductos() {
    if (!productos) return
    setCargando('productos')

    // 1. Traer categorias y proveedores existentes
    const [{ data: cats }, { data: provs }] = await Promise.all([
      supabase.from('categorias').select('id, nombre'),
      supabase.from('proveedores').select('id, nombre'),
    ])
    const mapCat = new Map((cats ?? []).map(c => [c.nombre.toLowerCase().trim(), c.id]))
    const mapProv = new Map((provs ?? []).map(p => [p.nombre.toLowerCase().trim(), p.id]))

    // Mapa de categorias de Contagram → nombre en nuestro sistema
    const MAPA_CAT: Record<string, string> = {
      'niña': 'Niña', 'nena': 'Niña',
      'niño': 'Niño', 'nene': 'Niño', 'varon': 'Niño',
      'bebé': 'Bebé', 'bebe': 'Bebé',
      'colegial': 'Colegial',
      'calzado': 'Calzado',
      'ropa interior': 'Ropa Interior',
      'accesorios': 'Accesorios',
      'perfumeria': 'Perfumería',
    }

    let ok = 0; let sinProv = 0; let sinPrecio = 0; let err = 0

    for (const p of productos) {
      const catKey = MAPA_CAT[p.categoria.toLowerCase()] ?? p.categoria
      const catId = mapCat.get(catKey.toLowerCase()) ?? mapCat.get(p.categoria.toLowerCase()) ?? null
      const provId = mapProv.get(p.proveedor.toLowerCase()) ?? null
      if (!provId) sinProv++
      if (!p.precio) sinPrecio++

      const { data: prod, error: errProd } = await supabase.from('productos').insert({
        nombre: p.nombre,
        categoria_id: catId,
        proveedor_id: provId,
        precio_costo: p.costo,
        precio_venta: p.precio,
        temporada: 'todo_el_año',
        activo: p.activo,
      }).select('id').single()

      if (errProd || !prod) { err++; continue }

      const { error: errVar } = await supabase.from('variantes').insert({
        producto_id: prod.id,
        talle: 'U',
        codigo_barras: p.codigo || null,
        stock: p.stock,
        stock_minimo: 1,
        precio_costo: p.costo || null,
        precio_venta: p.precio || null,
      })
      if (errVar) err++; else ok++
    }

    const msg = `✅ ${ok} importados${sinProv ? ` · ⚠️ ${sinProv} sin proveedor` : ''}${sinPrecio ? ` · ⚠️ ${sinPrecio} sin precio` : ''}${err ? ` · ❌ ${err} errores` : ''}`
    setResultados(r => ({ ...r, productos: msg }))
    toast.success(`Productos: ${ok} importados`)
    setCargando(null)
    await cargarConteo()
  }

  // ── Importar deudas ────────────────────────────────────────
  async function importarDeudas() {
    if (!deudas) return
    setCargando('deudas')

    const { data: clientesDB } = await supabase.from('clientes').select('id, nombre')
    const mapCliente = new Map((clientesDB ?? []).map(c => [
      c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), c.id
    ]))

    let ok = 0; let noEncontrado = 0

    for (const d of deudas) {
      const key = d.cliente.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const clienteId = mapCliente.get(key) ?? null

      // Buscar match parcial si no encontró exacto
      let id = clienteId
      if (!id) {
        const palabras = key.split(/\s+/)
        for (const [nombre, cid] of mapCliente) {
          if (palabras.every(p => nombre.includes(p))) { id = cid; break }
        }
      }

      if (!id) { noEncontrado++; continue }

      const { error } = await supabase.from('clientes').update({ deuda_total: d.deuda }).eq('id', id)
      if (!error) ok++; else noEncontrado++
    }

    const msg = `✅ ${ok} actualizados${noEncontrado ? ` · ⚠️ ${noEncontrado} no encontrados` : ''}`
    setResultados(r => ({ ...r, deudas: msg }))
    toast.success(`Deudas: ${ok} clientes actualizados`)
    setCargando(null)
  }

  // ── UI ─────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
            Migración de datos
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Importar datos desde Contagram — usar el viernes del cambio</p>
        </div>

        {/* ── PASO 0: Reset ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                Paso 0 — Limpiar datos de prueba
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Borra todas las ventas, productos, clientes y proveedores de prueba</p>
            </div>
            {!conteoActual && (
              <button onClick={cargarConteo} disabled={cargandoConteo}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                {cargandoConteo ? <Loader2 size={12} className="animate-spin" /> : 'Ver datos actuales'}
              </button>
            )}
          </div>

          {conteoActual && (
            <div className="px-5 pb-4 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Proveedores', conteoActual.proveedores],
                  ['Clientes', conteoActual.clientes],
                  ['Productos', conteoActual.productos],
                  ['Variantes', conteoActual.variantes],
                  ['Ventas', conteoActual.ventas],
                  ['Gastos', conteoActual.gastos],
                  ['Cajas', conteoActual.cajas],
                ].map(([label, count]) => (
                  <div key={label as string} className="rounded-xl p-2 text-center" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-xs text-red-400">{label}</p>
                    <p className="text-base font-black text-red-600">{count}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">⚠️ Se borran ventas, variantes, productos, clientes, proveedores, gastos y cajas. Las <strong>categorías</strong> se mantienen.</p>

              {!confirmReset ? (
                <button onClick={() => setConfirmReset(true)}
                  className="w-full py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  Borrar datos de prueba
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-red-600 text-center">¿Seguro? Esta acción no se puede deshacer.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmReset(false)}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600">
                      Cancelar
                    </button>
                    <button onClick={ejecutarReset} disabled={resetando}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: '#ef4444' }}>
                      {resetando ? <><Loader2 size={14} className="animate-spin" />Borrando...</> : 'Sí, borrar todo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── PASO 1: Proveedores ───────────────────────── */}
        <PasoMigracion
          numero={1}
          titulo="Proveedores"
          icono={<Building2 size={16} style={{ color: '#4EC3BD' }} />}
          descripcion='Subí "Listado de Proveedores.xlsx" de Contagram'
          archivo="Listado de Proveedores*.xlsx"
          datos={proveedores}
          mapeo={mapeoProveedores}
          resultado={resultados.proveedores}
          cargando={cargando === 'proveedores'}
          onFile={async (file) => {
            const rows = await leerExcel(file)
            setProveedores(parsearProveedores(rows))
            if (rows[0]) setMapeoProveedores(generarMapeo(rows[0], MAPEO_PROVEEDORES))
          }}
          onClear={() => { setProveedores(null); setMapeoProveedores(null) }}
          onImportar={importarProveedores}
          resumen={proveedores ? `${proveedores.length} proveedores listos para importar` : null}
          preview={proveedores?.slice(0, 5).map(p => p.nombre)}
        />

        {/* ── PASO 2: Clientes ─────────────────────────── */}
        <PasoMigracion
          numero={2}
          titulo="Clientes"
          icono={<Users size={16} style={{ color: '#4EC3BD' }} />}
          descripcion='Subí "Listado de Clientes.xlsx" de Contagram'
          archivo="Listado de Clientes*.xlsx"
          datos={clientes}
          mapeo={mapeoClientes}
          resultado={resultados.clientes}
          cargando={cargando === 'clientes'}
          onFile={async (file) => {
            const rows = await leerExcel(file)
            setClientes(parsearClientes(rows))
            if (rows[0]) setMapeoClientes(generarMapeo(rows[0], MAPEO_CLIENTES))
          }}
          onClear={() => { setClientes(null); setMapeoClientes(null) }}
          onImportar={importarClientes}
          resumen={clientes ? `${clientes.length} clientes listos · deuda = $0 (se actualiza en Paso 4)` : null}
          preview={clientes?.slice(0, 5).map(c => c.nombre)}
        />

        {/* ── PASO 3: Productos ────────────────────────── */}
        <PasoMigracion
          numero={3}
          titulo="Productos"
          icono={<Package size={16} style={{ color: '#4EC3BD' }} />}
          descripcion='Subí "Listado de Productos.xlsx" de Contagram'
          archivo="Listado de Productos*.xlsx"
          datos={productos}
          mapeo={mapeoProductos}
          resultado={resultados.productos}
          cargando={cargando === 'productos'}
          onFile={async (file) => {
            const rows = await leerExcel(file)
            setProductos(parsearProductos(rows))
            if (rows[0]) setMapeoProductos(generarMapeo(rows[0], MAPEO_PRODUCTOS))
          }}
          onClear={() => { setProductos(null); setMapeoProductos(null) }}
          onImportar={importarProductos}
          resumen={productos ? (() => {
            const sinCosto = productos.filter(p => !p.costo).length
            const sinProv = productos.filter(p => !p.proveedor).length
            return `${productos.length} productos${sinCosto ? ` · ⚠️ ${sinCosto} sin costo` : ''}${sinProv ? ` · ⚠️ ${sinProv} sin proveedor` : ''}`
          })() : null}
          preview={productos?.slice(0, 5).map(p => `${p.nombre} · $${p.precio} · stock ${p.stock}`)}
          advertencia={productos ? (() => {
            const sinCosto = productos.filter(p => !p.costo).length
            return sinCosto > 0 ? `${sinCosto} productos se importarán con costo $0. Podés editarlos después.` : null
          })() : null}
        />

        {/* ── PASO 4: Deuda de clientes ────────────────── */}
        <PasoMigracion
          numero={4}
          titulo="Deuda de clientes"
          icono={<DollarSign size={16} style={{ color: '#4EC3BD' }} />}
          descripcion='Subí "Informe Movimientos de Clientes.xlsx" de Contagram'
          archivo="Informe*Clientes*.xlsx"
          datos={deudas}
          mapeo={mapeoDeudas}
          resultado={resultados.deudas}
          cargando={cargando === 'deudas'}
          onFile={async (file) => {
            const rows = await leerExcel(file)
            setDeudas(parsearMovimientosClientes(rows))
            if (rows[0]) setMapeoDeudas(generarMapeo(rows[0], MAPEO_DEUDAS))
          }}
          onClear={() => { setDeudas(null); setMapeoDeudas(null) }}
          onImportar={importarDeudas}
          resumen={deudas ? `${deudas.length} clientes con deuda detectada` : null}
          preview={deudas?.slice(0, 5).map(d => `${d.cliente} — $${d.deuda.toLocaleString('es-AR')}`)}
        />

      </div>
    </div>
  )
}

// ── Componente reutilizable de paso ────────────────────────────
function PasoMigracion({
  numero, titulo, icono, descripcion, datos, mapeo, resultado, cargando,
  onFile, onClear, onImportar, resumen, preview, advertencia,
}: {
  numero: number
  titulo: string
  icono: React.ReactNode
  descripcion: string
  archivo: string
  datos: unknown[] | null
  mapeo?: ColMapeo[] | null
  resultado?: string
  cargando: boolean
  onFile: (file: File) => Promise<void>
  onClear: () => void
  onImportar: () => void
  resumen: string | null
  preview?: string[]
  advertencia?: string | null
}) {
  const [parseando, setParseando] = useState(false)
  const hecho = !!resultado

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      style={{ borderColor: hecho ? 'rgba(78,195,189,0.3)' : undefined }}>
      <div className="px-5 pt-5 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0"
              style={{ background: hecho ? '#4EC3BD' : '#9ca3af' }}>
              {hecho ? '✓' : numero}
            </span>
            {icono}
            {titulo}
          </h2>
          {hecho && <CheckCircle2 size={18} style={{ color: '#4EC3BD' }} />}
        </div>

        {hecho ? (
          <p className="text-sm font-semibold" style={{ color: '#0d9488' }}>{resultado}</p>
        ) : (
          <>
            <p className="text-xs text-gray-400">{descripcion}</p>

            {!datos ? (
              <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:border-teal-300 hover:bg-teal-50"
                style={{ borderColor: '#d1d5db' }}>
                {parseando
                  ? <Loader2 size={20} className="text-teal-500 animate-spin" />
                  : <Upload size={20} className="text-gray-300" />
                }
                <span className="text-xs text-gray-400 font-medium">
                  {parseando ? 'Leyendo archivo...' : 'Seleccionar archivo .xlsx'}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setParseando(true)
                    try { await onFile(file) }
                    catch { toast.error('No se pudo leer el archivo') }
                    finally { setParseando(false) }
                  }} />
              </label>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(78,195,189,0.06)', border: '1px solid rgba(78,195,189,0.2)' }}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-teal-700">{resumen}</p>
                    {preview && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {preview.join(' · ')}...
                      </p>
                    )}
                  </div>
                  <button onClick={onClear} className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-red-50">
                    <X size={12} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>

                {/* Tabla de mapeo de columnas */}
                {mapeo && (
                  <details className="text-left">
                    <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 py-1">
                      Ver mapeo de columnas →
                    </summary>
                    <div className="mt-2">
                      <TablaMapeo mapeo={mapeo} />
                    </div>
                  </details>
                )}

                {advertencia && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                    style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{advertencia}</p>
                  </div>
                )}

                <button onClick={onImportar} disabled={cargando}
                  className="w-full py-3 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}>
                  {cargando
                    ? <><Loader2 size={15} className="animate-spin" />Importando...</>
                    : <>Importar {titulo}</>
                  }
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
