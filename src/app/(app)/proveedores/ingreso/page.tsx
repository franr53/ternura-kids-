'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

interface ItemIngreso {
  variante_id: string
  variante: Variante & { producto?: Producto }
  cantidad: number
  precio_costo: number
}

export default function IngresoMercaderiaPage() {
  const router = useRouter()
  const supabase = createClient()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<(Producto & { variantes?: Variante[] })[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [numeroRemito, setNumeroRemito] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [items, setItems] = useState<ItemIngreso[]>([])
  const [guardando, setGuardando] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto & { variantes?: Variante[] } | null>(null)
  const [varianteId, setVarianteId] = useState('')
  const [cantidadItem, setCantidadItem] = useState('1')
  const [precioCostoItem, setPrecioCostoItem] = useState('')

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

    // Actualizar stock de variantes
    for (const item of items) {
      const { data: variante } = await supabase.from('variantes').select('stock').eq('id', item.variante_id).single()
      if (variante) {
        await supabase.from('variantes').update({ stock: variante.stock + item.cantidad }).eq('id', item.variante_id)
      }
    }

    // Actualizar deuda del proveedor
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
              <Button onClick={agregarItem} className="bg-pink-500 hover:bg-pink-600">
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
        <Button onClick={guardar} disabled={guardando || items.length === 0} className="bg-pink-500 hover:bg-pink-600">
          {guardando ? 'Guardando...' : 'Registrar ingreso'}
        </Button>
      </div>
    </div>
  )
}
