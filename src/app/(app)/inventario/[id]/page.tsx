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
import { toast } from 'sonner'
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

export default function ProductoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [producto, setProducto] = useState<Producto | null>(null)
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; sistema_talles: string; activa: boolean }[]>([])
  const [marcas, setMarcas] = useState<{ id: string; nombre: string; activo: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [nuevoTalle, setNuevoTalle] = useState('')

  // Campos editables producto
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [temporada, setTemporada] = useState('')

  useEffect(() => {
    async function cargar() {
      const [{ data: prod }, { data: cats }, { data: provs }] = await Promise.all([
        supabase.from('productos').select('*, categoria:categorias(*), marca:marcas(*), variantes(*)').eq('id', id).single(),
        supabase.from('categorias').select('id, nombre, sistema_talles, activa').order('nombre'),
        supabase.from('marcas').select('id, nombre, activo').order('nombre'),
      ])
      if (prod) {
        setProducto(prod)
        setNombre(prod.nombre_base)
        setCategoriaId(prod.categoria_id || '')
        setMarcaId(prod.marca_id || '')
        setTemporada(prod.temporada || '')
        setVariantes(prod.variantes || [])
      }
      setCategorias(cats || [])
      setMarcas(provs || [])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    setGuardando(true)

    const { error } = await supabase.from('productos').update({
      nombre_base: nombre,
      categoria_id: categoriaId || null,
      marca_id: marcaId || null,
      temporada: temporada || null,
      actualizado_en: new Date().toISOString(),
    }).eq('id', id)

    if (error) { toast.error(`Error al guardar: ${error.message}`); setGuardando(false); return }

    toast.success('Producto actualizado')
    setGuardando(false)
  }

  async function actualizarVariante(varianteId: string, campo: string, valor: string | number | null) {
    const { error } = await supabase.from('variantes').update({ [campo]: valor }).eq('id', varianteId)
    if (error) {
      toast.error(`Error: ${error.message}`)
    } else {
      setVariantes(prev => prev.map(v => v.id === varianteId ? { ...v, [campo]: valor } : v))
    }
  }

  async function agregarVariante() {
    if (!nuevoTalle.trim()) return
    const { data, error } = await supabase.from('variantes').insert({
      producto_id: id,
      talle: nuevoTalle.trim(),
      stock: 0,
      stock_minimo: 0,
      precio_costo: 0,
      precio_venta: 0,
    }).select().single()
    if (!error && data) {
      setVariantes(prev => [...prev, data])
      setNuevoTalle('')
    }
  }

  async function eliminarVariante(varianteId: string) {
    const variante = variantes.find(v => v.id === varianteId)
    if (variante && variante.stock > 0) {
      if (!confirm(`Este talle tiene ${variante.stock} unidades en stock. ¿Eliminar igual?`)) return
    }
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

  const stockTotal = variantes.reduce((s, v) => s + v.stock, 0)
  const categoriaNombre = categorias.find(c => c.id === categoriaId)?.nombre || ''
  const marcaNombre = marcas.find(p => p.id === marcaId)?.nombre || ''

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventario">
            <Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{producto.nombre_base}</h1>
            <p className="text-gray-500 text-sm">
              {marcaNombre && <span>{marcaNombre}</span>}
              {marcaNombre && categoriaNombre && <span> · </span>}
              {categoriaNombre && <span>{categoriaNombre}</span>}
              {stockTotal > 0 && <span className="ml-2 text-teal-600 font-semibold">{stockTotal} uds total</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={archivarProducto}>
            Archivar
          </Button>
          <Button onClick={guardar} disabled={guardando} className="bg-teal-500 hover:bg-teal-600 gap-2">
            <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Datos generales */}
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
              <Select value={categoriaId || '__none__'} onValueChange={v => setCategoriaId(v === '__none__' ? '' : (v ?? ''))}>
                <SelectTrigger className="mt-1">
                  <SelectValue>
                    {categoriaId ? (categorias.find(c => c.id === categoriaId)?.nombre || 'Sin categoría') : 'Sin categoría'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin categoría</SelectItem>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{!c.activa ? ' (inactiva)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marca</Label>
              <Select value={marcaId || '__none__'} onValueChange={v => setMarcaId(v === '__none__' ? '' : (v ?? ''))}>
                <SelectTrigger className="mt-1">
                  <SelectValue>
                    {marcaId ? (marcas.find(p => p.id === marcaId)?.nombre || 'Sin marca') : 'Sin marca'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin marca</SelectItem>
                  {marcas.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}{!p.activo ? ' (inactivo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Temporada</Label>
            <Select value={temporada || '__none__'} onValueChange={v => setTemporada(v === '__none__' ? '' : (v ?? ''))}>
              <SelectTrigger className="mt-1">
                <SelectValue>
                  {temporada ? ({ verano: 'Verano', invierno: 'Invierno', todo_el_año: 'Todo el año', liquidacion: 'Liquidación' }[temporada] || temporada) : 'Sin temporada'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin temporada</SelectItem>
                <SelectItem value="verano">Verano</SelectItem>
                <SelectItem value="invierno">Invierno</SelectItem>
                <SelectItem value="todo_el_año">Todo el año</SelectItem>
                <SelectItem value="liquidacion">Liquidación</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Talles: stock + precios por talle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talles y precios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {variantes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No hay talles cargados</p>
          )}

          {variantes.map(v => {
            const costo = v.precio_costo
            const venta = v.precio_venta
            const margenV = costo > 0 && venta > 0 ? Math.round(((venta - costo) / costo) * 100) : null
            const efectivo = venta > 0 ? Math.round(venta * 0.8) : 0

            return (
              <div key={v.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                {/* Fila 1: Talle + Stock + Código */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-gray-800 min-w-[3rem]">{v.talle}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-gray-400">Stock:</span>
                    <Input
                      type="number"
                      value={v.stock}
                      onChange={e => actualizarVariante(v.id, 'stock', parseInt(e.target.value) || 0)}
                      className="h-8 w-20 text-xs text-center"
                      min={0}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Código:</span>
                    <Input
                      value={v.codigo_barras || ''}
                      onChange={e => actualizarVariante(v.id, 'codigo_barras', e.target.value || null)}
                      placeholder="—"
                      className="h-8 w-32 text-xs font-mono"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => eliminarVariante(v.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {/* Fila 2: Precios */}
                <div className="flex items-center gap-3 pl-[3rem]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Costo:</span>
                    <Input
                      type="number"
                      value={v.precio_costo}
                      onChange={e => actualizarVariante(v.id, 'precio_costo', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="h-8 w-24 text-xs"
                      min={0}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Venta:</span>
                    <Input
                      type="number"
                      value={v.precio_venta}
                      onChange={e => actualizarVariante(v.id, 'precio_venta', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="h-8 w-24 text-xs"
                      min={0}
                    />
                  </div>
                  {margenV !== null && (
                    <span className="text-xs font-bold" style={{ color: margenV >= 30 ? '#0d9488' : margenV >= 15 ? '#d97706' : '#ef4444' }}>
                      {margenV}%
                    </span>
                  )}
                  {efectivo > 0 && (
                    <span className="text-xs text-gray-400 ml-auto">
                      Etiq: {formatPrecio(venta)} · Efec: <span className="text-teal-600 font-semibold">{formatPrecio(efectivo)}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}

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
