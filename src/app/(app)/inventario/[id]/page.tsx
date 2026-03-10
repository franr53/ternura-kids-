'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Producto, Variante } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Save, Trash2, Plus, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

export default function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [producto, setProducto] = useState<Producto | null>(null)
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; sistema_talles: string }[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [nuevoTalle, setNuevoTalle] = useState('')

  // Campos editables
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [temporada, setTemporada] = useState('')

  useEffect(() => {
    async function cargar() {
      const [{ data: prod }, { data: cats }, { data: provs }] = await Promise.all([
        supabase.from('productos').select('*, categoria:categorias(*), proveedor:proveedores(*), variantes(*)').eq('id', id).single(),
        supabase.from('categorias').select('id, nombre, sistema_talles').eq('activa', true).order('nombre'),
        supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      ])
      if (prod) {
        setProducto(prod)
        setNombre(prod.nombre)
        setCategoriaId(prod.categoria_id || '')
        setProveedorId(prod.proveedor_id || '')
        setPrecioCosto(String(prod.precio_costo))
        setPrecioVenta(String(prod.precio_venta))
        setTemporada(prod.temporada || '')
        setVariantes(prod.variantes || [])
      }
      setCategorias(cats || [])
      setProveedores(provs || [])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    setGuardando(true)
    const anteriorCosto = producto?.precio_costo
    const anteriorVenta = producto?.precio_venta
    const nuevoCosto = parseFloat(precioCosto) || 0
    const nuevoVenta = parseFloat(precioVenta) || 0

    const { error } = await supabase.from('productos').update({
      nombre,
      categoria_id: categoriaId || null,
      proveedor_id: proveedorId || null,
      precio_costo: nuevoCosto,
      precio_venta: nuevoVenta,
      temporada: temporada || null,
      actualizado_en: new Date().toISOString(),
    }).eq('id', id)

    if (error) { toast.error('Error al guardar'); setGuardando(false); return }

    // Registrar historial de precios si cambiaron
    if (anteriorCosto !== nuevoCosto || anteriorVenta !== nuevoVenta) {
      await supabase.from('historial_precios').insert({
        producto_id: id,
        precio_costo_anterior: anteriorCosto,
        precio_venta_anterior: anteriorVenta,
        precio_costo_nuevo: nuevoCosto,
        precio_venta_nuevo: nuevoVenta,
      })
    }

    toast.success('Producto actualizado')
    setGuardando(false)
  }

  async function actualizarVariante(varianteId: string, campo: string, valor: string | number) {
    const { error } = await supabase.from('variantes').update({ [campo]: valor }).eq('id', varianteId)
    if (!error) {
      setVariantes(prev => prev.map(v => v.id === varianteId ? { ...v, [campo]: valor } : v))
    }
  }

  async function agregarVariante() {
    if (!nuevoTalle.trim()) return
    const { data, error } = await supabase.from('variantes').insert({
      producto_id: id,
      talle: nuevoTalle.trim(),
      stock: 0,
      stock_minimo: 2,
    }).select().single()
    if (!error && data) {
      setVariantes(prev => [...prev, data])
      setNuevoTalle('')
    }
  }

  async function eliminarVariante(varianteId: string) {
    const { error } = await supabase.from('variantes').delete().eq('id', varianteId)
    if (!error) setVariantes(prev => prev.filter(v => v.id !== varianteId))
  }

  async function archivarProducto() {
    if (!confirm('¿Archivar este producto? No aparecerá más en el inventario activo.')) return
    await supabase.from('productos').update({ activo: false }).eq('id', id)
    toast.success('Producto archivado')
    router.push('/inventario')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!producto) return <div className="p-8 text-center text-gray-500">Producto no encontrado</div>

  const margen = precioCosto && precioVenta
    ? (((parseFloat(precioVenta) - parseFloat(precioCosto)) / parseFloat(precioCosto)) * 100).toFixed(0)
    : null

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventario">
            <Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{producto.nombre}</h1>
            <p className="text-gray-500 text-sm">Editar producto</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={archivarProducto}>
            Archivar
          </Button>
          <Button onClick={guardar} disabled={guardando} className="bg-pink-500 hover:bg-pink-600 gap-2">
            <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Datos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos generales</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoría</Label>
              <Select value={categoriaId} onValueChange={v => setCategoriaId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proveedor</Label>
              <Select value={proveedorId} onValueChange={v => setProveedorId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Precio costo</Label>
              <Input type="number" value={precioCosto} onChange={e => setPrecioCosto(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Precio venta</Label>
              <Input type="number" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)} className="mt-1" />
            </div>
            <div className="flex flex-col justify-end pb-1">
              {margen !== null && (
                <div className="text-center">
                  <span className="text-2xl font-bold text-green-600">{margen}%</span>
                  <p className="text-xs text-gray-500">margen</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Temporada</Label>
            <Select value={temporada} onValueChange={v => setTemporada(v ?? '')}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Sin temporada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="verano">Verano</SelectItem>
                <SelectItem value="invierno">Invierno</SelectItem>
                <SelectItem value="todo_el_año">Todo el año</SelectItem>
                <SelectItem value="liquidacion">Liquidación</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Variantes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talles y stock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium px-1">
            <div className="col-span-2">Talle</div>
            <div className="col-span-4">Código de barras</div>
            <div className="col-span-2">Stock</div>
            <div className="col-span-2">Stock mín.</div>
            <div className="col-span-2"></div>
          </div>
          {variantes.map(v => (
            <div key={v.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2 flex items-center gap-1">
                <Badge variant="outline">{v.talle}</Badge>
                {v.stock <= v.stock_minimo && <AlertTriangle size={12} className="text-orange-400" />}
              </div>
              <div className="col-span-4">
                <Input
                  value={v.codigo_barras || ''}
                  onChange={e => actualizarVariante(v.id, 'codigo_barras', e.target.value)}
                  onBlur={e => actualizarVariante(v.id, 'codigo_barras', e.target.value)}
                  placeholder="Código"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  value={v.stock}
                  onChange={e => actualizarVariante(v.id, 'stock', parseInt(e.target.value) || 0)}
                  className="h-8 text-xs"
                  min={0}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  value={v.stock_minimo}
                  onChange={e => actualizarVariante(v.id, 'stock_minimo', parseInt(e.target.value) || 0)}
                  className="h-8 text-xs"
                  min={0}
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-600"
                  onClick={() => eliminarVariante(v.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Input
              placeholder="Nuevo talle..."
              value={nuevoTalle}
              onChange={e => setNuevoTalle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarVariante()}
              className="flex-1"
            />
            <Button variant="outline" onClick={agregarVariante} className="gap-1">
              <Plus size={16} /> Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
