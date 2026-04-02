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
import { ArrowLeft, Save, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
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
  const [varianteAbierta, setVarianteAbierta] = useState<string | null>(null)

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

  async function actualizarVariante(varianteId: string, campos: Record<string, string | number | null>) {
    const { error } = await supabase.from('variantes').update(campos).eq('id', varianteId)
    if (error) {
      toast.error(`Error: ${error.message}`)
    } else {
      setVariantes(prev => prev.map(v => v.id === varianteId ? { ...v, ...campos } : v))
    }
  }

  function generarBarcode(talle: string): string {
    const normalize = (t: string) => t.replace(/[^a-z0-9]/gi, '').toUpperCase()
    const talleCode = normalize(talle)
    for (const v of variantes) {
      if (!v.codigo_barras || !v.talle) continue
      const existingCode = normalize(v.talle)
      if (!existingCode) continue
      const bc = v.codigo_barras.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const bcBase = bc.replace(/\d+$/, '')
      const suffix = bcBase.endsWith(existingCode) ? bcBase.slice(0, bcBase.length - existingCode.length)
                    : bc.endsWith(existingCode) ? bc.slice(0, bc.length - existingCode.length)
                    : null
      if (suffix) return `${suffix}${talleCode}`
    }
    // Fallback: iniciales del nombre del producto
    const prefijo = nombre.toUpperCase().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 4)
    return `${prefijo}${talleCode}`
  }

  async function agregarVariante() {
    if (!nuevoTalle.trim()) return
    const talle = nuevoTalle.trim()
    const codigoBarras = generarBarcode(talle)
    const { data, error } = await supabase.from('variantes').insert({
      producto_id: id,
      talle,
      stock: 0,
      stock_minimo: 0,
      precio_costo: 0,
      precio_venta: 0,
      codigo_barras: codigoBarras || null,
    }).select().single()
    if (!error && data) {
      setVariantes(prev => [...prev, data])
      setNuevoTalle('')
      toast.success(`Talle ${talle} agregado — código: ${codigoBarras}`)
    } else if (error) {
      toast.error(`Error: ${error.message}`)
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
        <CardContent className="space-y-2">
          {variantes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No hay talles cargados</p>
          )}

          {variantes.map(v => {
            const abierta = varianteAbierta === v.id
            const costo = v.precio_costo
            const venta = v.precio_venta
            const margenV = costo > 0 && venta > 0 ? Math.round(((venta - costo) / costo) * 100) : null
            const sugerido = costo > 0 ? Math.round(costo * 2.2) : 0

            return (
              <div key={v.id} className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Fila colapsada — click para abrir */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setVarianteAbierta(abierta ? null : v.id)}
                >
                  <span className="text-sm font-black text-gray-800 w-12 shrink-0">{v.talle}</span>
                  <span className="text-xs text-gray-400">Stock: <span className="font-semibold text-gray-700">{v.stock}</span></span>
                  {venta > 0 && (
                    <span className="text-xs text-gray-400 ml-auto mr-2">
                      {formatPrecio(venta)}
                      {margenV !== null && (
                        <span className="ml-1.5 font-bold" style={{ color: margenV >= 30 ? '#0d9488' : margenV >= 15 ? '#d97706' : '#ef4444' }}>
                          {margenV}%
                        </span>
                      )}
                    </span>
                  )}
                  {abierta ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                </button>

                {/* Panel expandido */}
                {abierta && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Stock</label>
                        <Input
                          type="number"
                          value={v.stock}
                          onChange={e => actualizarVariante(v.id, { stock: parseInt(e.target.value) || 0 })}
                          className="h-9 text-sm"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Código de barras</label>
                        <Input
                          value={v.codigo_barras || ''}
                          onChange={e => actualizarVariante(v.id, { codigo_barras: e.target.value || null })}
                          placeholder="—"
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Precio costo</label>
                        <Input
                          type="number"
                          value={v.precio_costo || ''}
                          onChange={e => {
                            const nuevoCosto = parseFloat(e.target.value) || 0
                            const campos: Record<string, number> = { precio_costo: nuevoCosto }
                            if (nuevoCosto > 0) campos.precio_venta = Math.round(nuevoCosto * 2.2)
                            actualizarVariante(v.id, campos)
                          }}
                          placeholder="0"
                          className="h-9 text-sm"
                          min={0}
                        />
                        {sugerido > 0 && <p className="mt-1 text-xs text-gray-400">Venta auto: {formatPrecio(sugerido)}</p>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1 block">Precio venta</label>
                        <Input
                          type="number"
                          value={v.precio_venta || ''}
                          onChange={e => actualizarVariante(v.id, { precio_venta: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="h-9 text-sm"
                          min={0}
                        />
                        {venta > 0 && (
                          <p className="mt-1 text-xs text-gray-400">
                            Efec: <span className="text-teal-600 font-semibold">{formatPrecio(Math.round(venta * 0.8))}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs gap-1.5"
                        onClick={() => eliminarVariante(v.id)}
                      >
                        <Trash2 size={13} /> Eliminar talle
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Input
              placeholder="Nuevo talle (ej: XL, 6, 3-6m)..."
              value={nuevoTalle}
              onChange={e => setNuevoTalle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarVariante()}
              className="flex-1"
            />
            <Button variant="outline" onClick={agregarVariante} className="gap-1 shrink-0">
              <Plus size={16} /> Agregar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
