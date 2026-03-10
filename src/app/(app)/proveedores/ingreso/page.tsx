'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Proveedor, Producto, Variante } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, Camera, FileText, Sparkles, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio, cn } from '@/lib/utils'

interface ItemIngreso {
  variante_id: string
  variante: Variante & { producto?: Producto }
  cantidad: number
  precio_costo: number
}

// Item detectado por la IA
interface ItemDetectado {
  nombre: string
  talle?: string | null
  cantidad: number
  precio_unitario?: number | null
  confianza: 'alta' | 'baja'
  // matching manual
  productoSeleccionado: (Producto & { variantes?: Variante[] }) | null
  varianteId: string
  cantidadEditable: string
  precioEditable: string
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function fuzzyScore(texto: string, query: string): number {
  const t = normalizar(texto)
  const palabras = normalizar(query).split(/\s+/).filter(Boolean)
  const matches = palabras.filter(p => t.includes(p))
  return matches.length / Math.max(palabras.length, 1)
}

export default function IngresoMercaderiaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<(Producto & { variantes?: Variante[] })[]>([])
  const [proveedorId, setProveedorId] = useState(searchParams.get('proveedor') || '')
  const [numeroRemito, setNumeroRemito] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [items, setItems] = useState<ItemIngreso[]>([])
  const [guardando, setGuardando] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto & { variantes?: Variante[] } | null>(null)
  const [varianteId, setVarianteId] = useState('')
  const [cantidadItem, setCantidadItem] = useState('1')
  const [precioCostoItem, setPrecioCostoItem] = useState('')

  // Escáner IA
  const [tabEscaneo, setTabEscaneo] = useState<'foto' | 'texto'>('foto')
  const [textoRemito, setTextoRemito] = useState('')
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenBase64, setImagenBase64] = useState<string | null>(null)
  const [imagenMime, setImagenMime] = useState<string>('image/jpeg')
  const [analizando, setAnalizando] = useState(false)
  const [itemsDetectados, setItemsDetectados] = useState<ItemDetectado[] | null>(null)
  const [proveedorDetectado, setProveedorDetectado] = useState<string | null>(null)

  const cargarDatos = useCallback(async () => {
    const [{ data: provs }, { data: prods }] = await Promise.all([
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('productos').select('*, variantes(*)').eq('activo', true).order('nombre'),
    ])
    setProveedores(provs || [])
    setProductos(prods || [])
  }, [supabase])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const productosFiltrados = busquedaProducto
    ? productos.filter(p => p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()))
    : []

  function seleccionarProducto(producto: Producto & { variantes?: Variante[] }) {
    setProductoSeleccionado(producto)
    setBusquedaProducto('')
    setVarianteId('')
    setPrecioCostoItem(producto.precio_costo?.toString() || '')
    if (producto.variantes?.length === 1) {
      setVarianteId(producto.variantes[0].id)
    }
  }

  function agregarItem() {
    if (!productoSeleccionado || !varianteId) { toast.error('Seleccioná un producto y talle'); return }
    const cantidad = parseInt(cantidadItem) || 0
    const precio = parseFloat(precioCostoItem) || 0
    if (cantidad <= 0) { toast.error('Cantidad inválida'); return }

    const variante = productoSeleccionado.variantes?.find(v => v.id === varianteId)
    if (!variante) return

    const existe = items.find(i => i.variante_id === varianteId)
    if (existe) { toast.error('Ya agregaste esa variante'); return }

    setItems(prev => [...prev, {
      variante_id: varianteId,
      variante: { ...variante, producto: productoSeleccionado },
      cantidad,
      precio_costo: precio,
    }])
    setProductoSeleccionado(null)
    setVarianteId('')
    setCantidadItem('1')
    setPrecioCostoItem('')
  }

  function quitarItem(varianteId: string) {
    setItems(prev => prev.filter(i => i.variante_id !== varianteId))
  }

  const total = items.reduce((s, i) => s + i.cantidad * i.precio_costo, 0)

  // ── ESCÁNER IA ──────────────────────────────────────────

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const mime = file.type || 'image/jpeg'
    setImagenMime(mime)
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result as string
      setImagenPreview(result)
      // Extraer solo el base64 (sin el prefijo data:...)
      setImagenBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  function matchProducto(nombre: string): (Producto & { variantes?: Variante[] }) | null {
    let best: (Producto & { variantes?: Variante[] }) | null = null
    let bestScore = 0
    for (const p of productos) {
      const score = fuzzyScore(p.nombre, nombre)
      if (score > bestScore) { bestScore = score; best = p }
    }
    return bestScore >= 0.5 ? best : null
  }

  async function analizar() {
    if (tabEscaneo === 'foto' && !imagenBase64) { toast.error('Subí una foto primero'); return }
    if (tabEscaneo === 'texto' && !textoRemito.trim()) { toast.error('Pegá el texto del remito'); return }

    setAnalizando(true)
    try {
      const body = tabEscaneo === 'foto'
        ? { type: 'image', imageBase64: imagenBase64, mimeType: imagenMime }
        : { type: 'text', texto: textoRemito }

      const res = await fetch('/api/scan-remito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al analizar'); return }

      // Auto-completar N° remito si lo detectó
      if (data.numeroRemito && !numeroRemito) setNumeroRemito(data.numeroRemito as string)

      // Guardar nombre de proveedor detectado
      if (data.proveedorNombre) setProveedorDetectado(data.proveedorNombre)

      // Mapear items detectados con matching automático
      const detectados: ItemDetectado[] = (data.items || []).map((item: {
        nombre: string; talle?: string | null; cantidad: number;
        precio_unitario?: number | null; confianza: 'alta' | 'baja'
      }) => {
        const match = matchProducto(item.nombre)
        const tieneMatch = match !== null
        const varianteMatch = match?.variantes?.find(v =>
          item.talle && v.talle.toLowerCase() === item.talle.toLowerCase()
        )
        return {
          nombre: item.nombre,
          talle: item.talle,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          confianza: tieneMatch ? item.confianza : 'baja',
          productoSeleccionado: match,
          varianteId: varianteMatch?.id || '',
          cantidadEditable: String(item.cantidad || 1),
          precioEditable: item.precio_unitario ? String(item.precio_unitario) : '',
        }
      })

      setItemsDetectados(detectados)
      toast.success(`IA detectó ${detectados.length} artículo${detectados.length !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Error de conexión al analizar')
    } finally {
      setAnalizando(false)
    }
  }

  function actualizarDetectado(idx: number, campo: Partial<ItemDetectado>) {
    setItemsDetectados(prev => prev ? prev.map((it, i) => i === idx ? { ...it, ...campo } : it) : prev)
  }

  function eliminarDetectado(idx: number) {
    setItemsDetectados(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
  }

  function confirmarDetectados() {
    if (!itemsDetectados) return
    const nuevos: ItemIngreso[] = []
    let saltados = 0

    for (const det of itemsDetectados) {
      if (!det.productoSeleccionado || !det.varianteId) { saltados++; continue }
      const variante = det.productoSeleccionado.variantes?.find(v => v.id === det.varianteId)
      if (!variante) { saltados++; continue }
      const cantidad = parseInt(det.cantidadEditable) || 0
      if (cantidad <= 0) { saltados++; continue }
      // Evitar duplicados con items ya existentes
      if (items.some(it => it.variante_id === det.varianteId)) { saltados++; continue }

      nuevos.push({
        variante_id: det.varianteId,
        variante: { ...variante, producto: det.productoSeleccionado },
        cantidad,
        precio_costo: parseFloat(det.precioEditable) || 0,
      })
    }

    setItems(prev => [...prev, ...nuevos])
    setItemsDetectados(null)
    setImagenPreview(null)
    setImagenBase64(null)
    setTextoRemito('')
    if (saltados > 0) {
      toast.warning(`${nuevos.length} artículo${nuevos.length !== 1 ? 's' : ''} agregado${nuevos.length !== 1 ? 's' : ''}, ${saltados} omitido${saltados !== 1 ? 's' : ''} (sin producto asignado)`)
    } else {
      toast.success(`${nuevos.length} artículo${nuevos.length !== 1 ? 's' : ''} agregado${nuevos.length !== 1 ? 's' : ''} al ingreso`)
    }
  }

  // ── GUARDAR ─────────────────────────────────────────────

  async function guardar() {
    if (!proveedorId) { toast.error('Seleccioná un proveedor'); return }
    if (items.length === 0) { toast.error('Agregá al menos un artículo'); return }
    setGuardando(true)

    const { data: ingreso, error: errIngreso } = await supabase.from('ingresos_mercaderia').insert({
      proveedor_id: proveedorId,
      numero_remito: numeroRemito || null,
      total,
    }).select().single()

    if (errIngreso || !ingreso) { toast.error('Error al guardar ingreso'); setGuardando(false); return }

    const itemsInsert = items.map(i => ({
      ingreso_id: ingreso.id,
      variante_id: i.variante_id,
      cantidad: i.cantidad,
      precio_costo: i.precio_costo,
      subtotal: i.cantidad * i.precio_costo,
    }))

    const { error: errItems } = await supabase.from('ingreso_items').insert(itemsInsert)
    if (errItems) { toast.error('Error al guardar items'); setGuardando(false); return }

    for (const item of items) {
      const { data: variante } = await supabase.from('variantes').select('stock').eq('id', item.variante_id).single()
      if (variante) {
        await supabase.from('variantes').update({ stock: variante.stock + item.cantidad }).eq('id', item.variante_id)
      }
    }

    const { data: prov } = await supabase.from('proveedores').select('deuda_total').eq('id', proveedorId).single()
    if (prov) {
      await supabase.from('proveedores').update({ deuda_total: (prov.deuda_total || 0) + total }).eq('id', proveedorId)
    }

    toast.success('Ingreso registrado')
    router.push(`/proveedores/${proveedorId}`)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/proveedores"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
        <h1 className="text-2xl font-bold text-gray-800">Ingreso de mercadería</h1>
      </div>

      {/* ── ESCÁNER IA ── */}
      <Card className="border-teal-200 bg-teal-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-teal-700">
            <Sparkles size={16} className="text-teal-500" />
            Escaneá el remito con IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs foto / texto */}
          <div className="flex gap-1 p-1 bg-white rounded-lg border border-teal-100 w-fit">
            <button
              onClick={() => setTabEscaneo('foto')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all', tabEscaneo === 'foto' ? 'bg-teal-500 text-white' : 'text-gray-500 hover:text-gray-700')}
            >
              <Camera size={14} /> Foto
            </button>
            <button
              onClick={() => setTabEscaneo('texto')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all', tabEscaneo === 'texto' ? 'bg-teal-500 text-white' : 'text-gray-500 hover:text-gray-700')}
            >
              <FileText size={14} /> Lista de texto
            </button>
          </div>

          {tabEscaneo === 'foto' ? (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              {imagenPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagenPreview} alt="Remito" className="w-full max-h-48 object-contain rounded-lg border border-teal-200 bg-white" />
                  <button
                    onClick={() => { setImagenPreview(null); setImagenBase64(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-gray-500 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-teal-200 rounded-xl py-8 flex flex-col items-center gap-2 text-teal-500 hover:border-teal-400 hover:bg-teal-50 transition-colors"
                >
                  <Camera size={28} />
                  <span className="text-sm font-medium">Subir foto del remito</span>
                  <span className="text-xs text-gray-400">JPG, PNG, WebP — foto del celular</span>
                </button>
              )}
            </div>
          ) : (
            <textarea
              value={textoRemito}
              onChange={e => setTextoRemito(e.target.value)}
              placeholder={'Pegá acá la lista que te mandaron por WhatsApp...\n\nEj:\nRemera rayada azul T6 x5 $1200\nCampera polar T8 x3 $2500\nShort niño T10 x10 $800'}
              className="w-full h-36 p-3 text-sm border border-teal-200 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
            />
          )}

          <Button
            onClick={analizar}
            disabled={analizando || (tabEscaneo === 'foto' ? !imagenBase64 : !textoRemito.trim())}
            className="w-full bg-teal-500 hover:bg-teal-600 gap-2"
          >
            {analizando ? <><Loader2 size={16} className="animate-spin" /> Analizando remito...</> : <><Sparkles size={16} /> Analizar con IA</>}
          </Button>
        </CardContent>
      </Card>

      {/* ── OVERLAY DE CONFIRMACIÓN ── */}
      {itemsDetectados && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Sparkles size={16} className="text-teal-500" />
                  IA detectó {itemsDetectados.length} artículo{itemsDetectados.length !== 1 ? 's' : ''} — Revisá y confirmá
                </h2>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><CheckCircle size={11} className="text-green-500" /> Leído bien</span>
                  <span className="flex items-center gap-1"><AlertTriangle size={11} className="text-orange-500" /> Revisar antes de confirmar</span>
                </div>
              </div>
              <button onClick={() => setItemsDetectados(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Proveedor detectado */}
            {proveedorDetectado && (
              <div className="px-6 py-3 bg-teal-50 border-b border-teal-100 flex items-center gap-2 text-sm">
                <span className="text-gray-500">Proveedor detectado:</span>
                <span className="font-semibold text-teal-700">&quot;{proveedorDetectado}&quot;</span>
              </div>
            )}

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {itemsDetectados.map((det, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'rounded-xl border-2 p-4 space-y-3',
                    det.confianza === 'alta' && det.productoSeleccionado
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-orange-200 bg-orange-50/50'
                  )}
                >
                  {/* Cabecera del item */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {det.confianza === 'alta' && det.productoSeleccionado
                        ? <CheckCircle size={14} className="text-green-500 shrink-0" />
                        : <AlertTriangle size={14} className="text-orange-500 shrink-0" />}
                      <span className="text-xs text-gray-500 italic">&quot;{det.nombre}&quot;</span>
                    </div>
                    <button onClick={() => eliminarDetectado(idx)} className="text-gray-300 hover:text-red-400 shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Campos editables */}
                  <div className="grid grid-cols-4 gap-2">
                    {/* Producto */}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Producto del inventario</label>
                      <select
                        value={det.productoSeleccionado?.id || ''}
                        onChange={e => {
                          const p = productos.find(p => p.id === e.target.value) || null
                          actualizarDetectado(idx, {
                            productoSeleccionado: p,
                            varianteId: '',
                            precioEditable: p?.precio_costo?.toString() || det.precioEditable,
                          })
                        }}
                        className="w-full h-8 rounded-md border border-gray-200 bg-white text-xs px-2 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">— Buscar producto —</option>
                        {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>

                    {/* Talle */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Talle</label>
                      <select
                        value={det.varianteId}
                        onChange={e => actualizarDetectado(idx, { varianteId: e.target.value })}
                        disabled={!det.productoSeleccionado}
                        className="w-full h-8 rounded-md border border-gray-200 bg-white text-xs px-2 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-40"
                      >
                        <option value="">—</option>
                        {det.productoSeleccionado?.variantes?.map(v => (
                          <option key={v.id} value={v.id}>{v.talle}</option>
                        ))}
                      </select>
                    </div>

                    {/* Cantidad */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Cantidad</label>
                      <input
                        type="number"
                        value={det.cantidadEditable}
                        onChange={e => actualizarDetectado(idx, { cantidadEditable: e.target.value })}
                        min={1}
                        className="w-full h-8 rounded-md border border-gray-200 text-xs px-2 focus:outline-none focus:ring-1 focus:ring-teal-400 text-center"
                      />
                    </div>

                    {/* Precio */}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Precio costo unitario</label>
                      <input
                        type="number"
                        value={det.precioEditable}
                        onChange={e => actualizarDetectado(idx, { precioEditable: e.target.value })}
                        placeholder="0"
                        className="w-full h-8 rounded-md border border-gray-200 text-xs px-2 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <Button variant="outline" onClick={() => setItemsDetectados(null)} className="flex-1">Cancelar</Button>
              <Button onClick={confirmarDetectados} className="flex-[2] bg-teal-500 hover:bg-teal-600 gap-2">
                <CheckCircle size={16} /> Agregar al ingreso
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DATOS DEL INGRESO ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del ingreso</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Proveedor *</Label>
            <Select value={proveedorId || '__none__'} onValueChange={v => setProveedorId(v === '__none__' ? '' : (v ?? ''))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar proveedor" />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>N° Remito</Label>
            <Input value={numeroRemito} onChange={e => setNumeroRemito(e.target.value)} placeholder="Ej: 0001-00012345" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* ── AGREGAR ARTÍCULOS MANUAL ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agregar artículos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar producto por nombre..."
              value={productoSeleccionado ? productoSeleccionado.nombre : busquedaProducto}
              onChange={e => { setBusquedaProducto(e.target.value); setProductoSeleccionado(null) }}
              className="pl-9"
            />
            {productosFiltrados.length > 0 && !productoSeleccionado && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto mt-1">
                {productosFiltrados.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                    onClick={() => seleccionarProducto(p)}
                  >
                    <span className="font-medium">{p.nombre}</span>
                    <span className="text-gray-400 ml-2 text-xs">{p.variantes?.length} talles</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {productoSeleccionado && (
            <div className="grid grid-cols-4 gap-3 items-end">
              <div className="col-span-1">
                <Label>Talle</Label>
                <Select value={varianteId} onValueChange={v => setVarianteId(v ?? '')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Talle" />
                  </SelectTrigger>
                  <SelectContent>
                    {productoSeleccionado.variantes?.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.talle} (stock: {v.stock})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input type="number" value={cantidadItem} onChange={e => setCantidadItem(e.target.value)} min="1" className="mt-1" />
              </div>
              <div>
                <Label>Precio costo</Label>
                <Input type="number" value={precioCostoItem} onChange={e => setPrecioCostoItem(e.target.value)} placeholder="0" className="mt-1" />
              </div>
              <Button onClick={agregarItem} className="bg-teal-500 hover:bg-teal-600">
                <Plus size={16} className="mr-1" /> Agregar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ITEMS DEL INGRESO ── */}
      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Items del ingreso</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Producto</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Talle</th>
                  <th className="text-center py-2 text-gray-500 font-medium">Cant.</th>
                  <th className="text-right py-2 text-gray-500 font-medium">P. Costo</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Subtotal</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.variante_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-800">{item.variante.producto?.nombre}</td>
                    <td className="py-2 text-center"><Badge variant="outline">{item.variante.talle}</Badge></td>
                    <td className="py-2 text-center">{item.cantidad}</td>
                    <td className="py-2 text-right text-gray-600">{formatPrecio(item.precio_costo)}</td>
                    <td className="py-2 text-right font-semibold">{formatPrecio(item.cantidad * item.precio_costo)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => quitarItem(item.variante_id)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Separator className="my-3" />
            <div className="flex justify-between items-center font-bold text-lg">
              <span>Total</span>
              <span className="text-gray-800">{formatPrecio(total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 justify-end">
        <Link href="/proveedores"><Button variant="outline">Cancelar</Button></Link>
        <Button onClick={guardar} disabled={guardando || items.length === 0} className="bg-teal-500 hover:bg-teal-600">
          {guardando ? 'Guardando...' : 'Registrar ingreso'}
        </Button>
      </div>
    </div>
  )
}
