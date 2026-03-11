'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Search, ChevronDown, ChevronUp, CheckCircle, AlertCircle, X } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

interface ItemIngreso {
  variante_id: string
  variante: Variante & { producto?: Producto }
  cantidad: number
  precio_costo: number
}

interface ItemEscaneado {
  nombreOriginal: string
  talle?: string
  cantidad: number
  precio_unitario?: number
  confianza: 'alta' | 'baja'
  // campos de matching
  productoId?: string
  varianteId?: string
}

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyScore(haystack: string, needle: string): number {
  const h = normalizar(haystack)
  const words = normalizar(needle).split(' ').filter(Boolean)
  if (words.length === 0) return 0
  const matches = words.filter(w => h.includes(w))
  return matches.length / words.length
}

/** Parser de lista de texto tipo WhatsApp */
function parsearLista(texto: string, productos: (Producto & { variantes?: Variante[] })[]): ItemEscaneado[] {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const items: ItemEscaneado[] = []

  for (const linea of lineas) {
    // Buscar cantidad: "x5", "5 unid", "cant 5"
    const matchCantidad = linea.match(/\bx\s*(\d+)\b|\b(\d+)\s*(?:un?i?d?\.?|pares?|pcs?)\b|\bcant\.?\s*(\d+)\b/i)
    const cantidad = matchCantidad ? parseInt(matchCantidad[1] || matchCantidad[2] || matchCantidad[3]) : 1

    // Buscar precio: "$1200", "1200 pesos", "precio 1200"
    const matchPrecio = linea.match(/\$\s*([\d.,]+)|\b([\d.,]+)\s*(?:pesos|peso)\b|\bprecio\s*([\d.,]+)\b/i)
    const precio = matchPrecio
      ? parseFloat((matchPrecio[1] || matchPrecio[2] || matchPrecio[3]).replace(/\./g, '').replace(',', '.'))
      : undefined

    // Buscar talle: "talle 6", "t6", "talle M", "T: XL", "6 meses"
    const matchTalle = linea.match(/\bt(?:alle)?\.?\s*:?\s*([A-Z0-9]+)\b|\b(\d+)\s*meses?\b/i)
    const talle = matchTalle ? (matchTalle[1] || matchTalle[2]) : undefined

    // Nombre: quitar las partes de cantidad, precio y talle
    let nombre = linea
      .replace(/\bx\s*\d+\b|\b\d+\s*(?:un?i?d?\.?|pares?|pcs?)\b|\bcant\.?\s*\d+\b/ig, '')
      .replace(/\$\s*[\d.,]+|\b[\d.,]+\s*(?:pesos|peso)\b|\bprecio\s*[\d.,]+\b/ig, '')
      .replace(/\bt(?:alle)?\.?\s*:?\s*[A-Z0-9]+\b|\b\d+\s*meses?\b/ig, '')
      .replace(/[-–—:,*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!nombre || nombre.length < 2) continue

    // Fuzzy match contra productos
    let mejorScore = 0
    let mejorProducto: (Producto & { variantes?: Variante[] }) | undefined
    for (const p of productos) {
      const score = fuzzyScore(p.nombre, nombre)
      if (score > mejorScore) { mejorScore = score; mejorProducto = p }
    }

    let varianteId: string | undefined
    let productoId: string | undefined
    if (mejorProducto && mejorScore >= 0.5) {
      productoId = mejorProducto.id
      // Intentar matchear talle
      if (talle && mejorProducto.variantes) {
        const v = mejorProducto.variantes.find(v =>
          normalizar(v.talle) === normalizar(talle)
        )
        if (v) varianteId = v.id
      }
      // Si solo hay una variante y no se indicó talle, auto-seleccionar
      if (!varianteId && mejorProducto.variantes?.length === 1) {
        varianteId = mejorProducto.variantes[0].id
      }
    }

    const confianza: 'alta' | 'baja' = (mejorScore >= 0.6 && varianteId) ? 'alta' : 'baja'

    items.push({
      nombreOriginal: nombre,
      talle,
      cantidad,
      precio_unitario: isNaN(precio as number) ? undefined : precio,
      confianza,
      productoId,
      varianteId,
    })
  }

  return items
}

export default function IngresoMercaderiaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
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

  // Scanner de lista
  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [textoLista, setTextoLista] = useState('')
  const [itemsEscaneados, setItemsEscaneados] = useState<ItemEscaneado[]>([])
  const [modoOverlay, setModoOverlay] = useState(false)

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

  // --- Scanner ---
  function analizarLista() {
    if (!textoLista.trim()) { toast.error('Pegá la lista primero'); return }
    const result = parsearLista(textoLista, productos)
    if (result.length === 0) { toast.error('No se detectaron artículos. Revisá el formato.'); return }
    setItemsEscaneados(result)
    setModoOverlay(true)
  }

  function actualizarItemEscaneado(idx: number, campo: keyof ItemEscaneado, valor: string | number | undefined) {
    setItemsEscaneados(prev => {
      const copy = [...prev]
      const item = { ...copy[idx], [campo]: valor }

      // Si cambia producto, resetear variante
      if (campo === 'productoId') {
        item.varianteId = undefined
        const prod = productos.find(p => p.id === valor)
        if (prod?.variantes?.length === 1) item.varianteId = prod.variantes[0].id
      }

      copy[idx] = item
      return copy
    })
  }

  function eliminarItemEscaneado(idx: number) {
    setItemsEscaneados(prev => prev.filter((_, i) => i !== idx))
  }

  function confirmarEscaneados() {
    let agregados = 0
    for (const item of itemsEscaneados) {
      if (!item.varianteId || item.cantidad <= 0) continue
      if (items.find(i => i.variante_id === item.varianteId)) continue

      const prod = productos.find(p => p.id === item.productoId)
      const variante = prod?.variantes?.find(v => v.id === item.varianteId)
      if (!variante || !prod) continue

      setItems(prev => [...prev, {
        variante_id: item.varianteId!,
        variante: { ...variante, producto: prod },
        cantidad: item.cantidad,
        precio_costo: item.precio_unitario ?? prod.precio_costo ?? 0,
      }])
      agregados++
    }
    setModoOverlay(false)
    setItemsEscaneados([])
    setTextoLista('')
    setScannerAbierto(false)
    toast.success(`${agregados} artículos agregados al ingreso`)
  }

  async function guardar() {
    if (!proveedorId) { toast.error('Seleccioná un proveedor'); return }
    if (items.length === 0) { toast.error('Agregá al menos un artículo'); return }
    setGuardando(true)

    const { data: ingreso, error: errIngreso } = await supabase.from('ingresos_mercaderia').insert({
      proveedor_id: proveedorId,
      numero_remito: numeroRemito || null,
      total,
    }).select().single()

    if (errIngreso || !ingreso) {
      toast.error(`Error al guardar ingreso: ${errIngreso?.message || 'Error desconocido'}`)
      setGuardando(false)
      return
    }

    const itemsInsert = items.map(i => ({
      ingreso_id: ingreso.id,
      variante_id: i.variante_id,
      cantidad: i.cantidad,
      precio_costo: i.precio_costo,
      subtotal: i.cantidad * i.precio_costo,
    }))

    const { error: errItems } = await supabase.from('ingreso_items').insert(itemsInsert)
    if (errItems) {
      toast.error(`Error al guardar items: ${errItems.message}`)
      setGuardando(false)
      return
    }

    // Actualizar stock usando la función RPC (bypassa RLS, SECURITY DEFINER)
    for (const item of items) {
      const { error: errStock } = await supabase.rpc('incrementar_stock', {
        p_variante_id: item.variante_id,
        p_cantidad: item.cantidad,
      })
      if (errStock) {
        toast.error(`Error actualizando stock: ${errStock.message}`)
        setGuardando(false)
        return
      }
    }

    // Actualizar deuda del proveedor
    const { data: prov, error: errProv } = await supabase.from('proveedores').select('deuda_total').eq('id', proveedorId).single()
    if (errProv) {
      // Si falla por RLS (vendedor no puede modificar proveedor), continuar igual
      console.warn('No se pudo actualizar deuda del proveedor:', errProv.message)
    } else if (prov) {
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

      {/* Scanner de lista */}
      <Card className="border-teal-200">
        <CardHeader className="pb-3">
          <button
            onClick={() => setScannerAbierto(v => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base text-teal-700">Cargar desde lista de WhatsApp</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">Pegá la lista que te mandó el proveedor</p>
            </div>
            {scannerAbierto ? <ChevronUp size={18} className="text-teal-500" /> : <ChevronDown size={18} className="text-teal-500" />}
          </button>
        </CardHeader>
        {scannerAbierto && (
          <CardContent className="space-y-3">
            <Textarea
              value={textoLista}
              onChange={e => setTextoLista(e.target.value)}
              placeholder={`Pegá la lista del proveedor, por ejemplo:\nRemera rayada talle 6 x5 $1200\nCampera azul t8 x3 $2500\nShort niño talle 10 x10 $800`}
              rows={6}
              className="font-mono text-sm"
            />
            <Button onClick={analizarLista} className="bg-teal-500 hover:bg-teal-600 gap-2">
              <Search size={16} /> Analizar lista
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Overlay de confirmación de items escaneados */}
      {modoOverlay && (
        <Card className="border-2 border-teal-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Se detectaron {itemsEscaneados.length} artículos — revisá y confirmá</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="text-green-600 font-medium">{itemsEscaneados.filter(i => i.confianza === 'alta').length} confirmados</span>
                  {' · '}
                  <span className="text-amber-600 font-medium">{itemsEscaneados.filter(i => i.confianza === 'baja').length} para revisar</span>
                </p>
              </div>
              <button onClick={() => setModoOverlay(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {itemsEscaneados.map((item, idx) => {
              const prod = productos.find(p => p.id === item.productoId)
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 space-y-2 ${
                    item.confianza === 'alta' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.confianza === 'alta'
                      ? <CheckCircle size={15} className="text-green-600 shrink-0" />
                      : <AlertCircle size={15} className="text-amber-500 shrink-0" />
                    }
                    <span className="text-sm font-medium text-gray-700">"{item.nombreOriginal}"</span>
                    {item.talle && <Badge variant="outline" className="text-xs">{item.talle}</Badge>}
                    <button onClick={() => eliminarItemEscaneado(idx)} className="ml-auto text-gray-300 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div className="col-span-2">
                      <Label className="text-xs">Producto</Label>
                      <select
                        value={item.productoId || ''}
                        onChange={e => actualizarItemEscaneado(idx, 'productoId', e.target.value || undefined)}
                        className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                      >
                        <option value="">-- Seleccionar --</option>
                        {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Talle</Label>
                      <select
                        value={item.varianteId || ''}
                        onChange={e => actualizarItemEscaneado(idx, 'varianteId', e.target.value || undefined)}
                        className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                        disabled={!item.productoId}
                      >
                        <option value="">--</option>
                        {prod?.variantes?.map(v => <option key={v.id} value={v.id}>{v.talle} (stock: {v.stock})</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Cant.</Label>
                      <Input
                        type="number"
                        value={item.cantidad}
                        onChange={e => actualizarItemEscaneado(idx, 'cantidad', parseInt(e.target.value) || 0)}
                        min="1"
                        className="mt-1 h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Precio costo</Label>
                      <Input
                        type="number"
                        value={item.precio_unitario ?? ''}
                        onChange={e => actualizarItemEscaneado(idx, 'precio_unitario', parseFloat(e.target.value) || undefined)}
                        placeholder="0"
                        className="mt-1 h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setModoOverlay(false)} className="flex-1">Cancelar</Button>
              <Button onClick={confirmarEscaneados} className="flex-1 bg-teal-500 hover:bg-teal-600">
                Agregar al ingreso ({itemsEscaneados.filter(i => i.varianteId && i.cantidad > 0).length} listos)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Datos del ingreso */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del ingreso</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Proveedor *</Label>
            <Select value={proveedorId} onValueChange={v => setProveedorId(v ?? '')}>
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

      {/* Agregar productos */}
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

      {/* Lista de items */}
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
