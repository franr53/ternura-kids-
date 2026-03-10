'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Categoria, Proveedor } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

const TALLES_POR_SISTEMA: Record<string, string[]> = {
  meses: ['RN', '0-3m', '3-6m', '6-9m', '9-12m', '12-18m', '18-24m'],
  numerico: ['2', '4', '6', '8', '10', '12', '14', '16'],
  letras: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  calzado: ['18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36'],
}

interface Variante {
  talle: string
  codigo_barras: string
  stock: number
  stock_minimo: number
}

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(false)

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [temporada, setTemporada] = useState('')
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [talleSugerido, setTalleSugerido] = useState('')

  const categoriaSeleccionada = categorias.find(c => c.id === categoriaId)
  const tallesSugeridos = categoriaSeleccionada ? TALLES_POR_SISTEMA[categoriaSeleccionada.sistema_talles] : []

  useEffect(() => {
    async function cargar() {
      const [{ data: cats }, { data: provs }] = await Promise.all([
        supabase.from('categorias').select('*').eq('activa', true).order('nombre'),
        supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      ])
      setCategorias(cats || [])
      setProveedores(provs || [])
    }
    cargar()
  }, [supabase])

  function agregarVariante(talle: string) {
    if (!talle || variantes.some(v => v.talle === talle)) return
    setVariantes(prev => [...prev, { talle, codigo_barras: '', stock: 0, stock_minimo: 2 }])
    setTalleSugerido('')
  }

  function actualizarVariante(idx: number, campo: keyof Variante, valor: string | number) {
    setVariantes(prev => prev.map((v, i) => i === idx ? { ...v, [campo]: valor } : v))
  }

  function eliminarVariante(idx: number) {
    setVariantes(prev => prev.filter((_, i) => i !== idx))
  }

  function agregarTodosLosTalles() {
    const nuevos = tallesSugeridos
      .filter(t => !variantes.some(v => v.talle === t))
      .map(t => ({ talle: t, codigo_barras: '', stock: 0, stock_minimo: 2 }))
    setVariantes(prev => [...prev, ...nuevos])
  }

  async function guardar() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    if (variantes.length === 0) { toast.error('Agregá al menos un talle'); return }

    setLoading(true)
    const { data: producto, error } = await supabase
      .from('productos')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        categoria_id: categoriaId || null,
        proveedor_id: proveedorId || null,
        precio_costo: parseFloat(precioCosto) || 0,
        precio_venta: parseFloat(precioVenta) || 0,
        temporada: temporada || null,
      })
      .select()
      .single()

    if (error || !producto) {
      toast.error('Error al guardar el producto')
      setLoading(false)
      return
    }

    const { error: errorVariantes } = await supabase.from('variantes').insert(
      variantes.map(v => ({
        producto_id: producto.id,
        talle: v.talle,
        codigo_barras: v.codigo_barras || null,
        stock: v.stock,
        stock_minimo: v.stock_minimo,
      }))
    )

    if (errorVariantes) {
      toast.error('Producto guardado pero hubo un error con los talles')
    } else {
      toast.success('Producto creado correctamente')
      router.push('/inventario')
    }
    setLoading(false)
  }

  const margen = precioCosto && precioVenta
    ? (((parseFloat(precioVenta) - parseFloat(precioCosto)) / parseFloat(precioCosto)) * 100).toFixed(0)
    : null

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventario">
          <Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Nuevo producto</h1>
          <p className="text-gray-500 text-sm">Completá los datos del producto y sus talles</p>
        </div>
      </div>

      {/* Datos generales */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos generales</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Remera M/C Niña" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoría</Label>
              <Select value={categoriaId} onValueChange={v => setCategoriaId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proveedor</Label>
              <Select value={proveedorId} onValueChange={v => setProveedorId(v ?? '')}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Precio costo</Label>
              <Input type="number" value={precioCosto} onChange={e => setPrecioCosto(e.target.value)} placeholder="0" className="mt-1" />
            </div>
            <div>
              <Label>Precio venta</Label>
              <Input type="number" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)} placeholder="0" className="mt-1" />
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
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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

      {/* Talles y stock */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Talles y stock</CardTitle>
            {tallesSugeridos.length > 0 && (
              <Button variant="outline" size="sm" onClick={agregarTodosLosTalles} className="text-xs">
                Agregar todos los talles
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Talles sugeridos */}
          {tallesSugeridos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tallesSugeridos.map(t => (
                <button
                  key={t}
                  onClick={() => agregarVariante(t)}
                  disabled={variantes.some(v => v.talle === t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    variantes.some(v => v.talle === t)
                      ? 'bg-pink-100 border-pink-300 text-pink-600 cursor-default'
                      : 'border-gray-300 text-gray-600 hover:border-pink-400 hover:text-pink-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Agregar talle manual */}
          <div className="flex gap-2">
            <Input
              placeholder="Talle personalizado (ej: T3, 37, RN...)"
              value={talleSugerido}
              onChange={e => setTalleSugerido(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarVariante(talleSugerido)}
              className="flex-1"
            />
            <Button variant="outline" onClick={() => agregarVariante(talleSugerido)} className="gap-1">
              <Plus size={16} /> Agregar
            </Button>
          </div>

          {/* Lista de variantes */}
          {variantes.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium px-1">
                <div className="col-span-2">Talle</div>
                <div className="col-span-4">Código de barras</div>
                <div className="col-span-2">Stock</div>
                <div className="col-span-2">Stock mín.</div>
                <div className="col-span-2"></div>
              </div>
              {variantes.map((v, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-2">
                    <Badge variant="outline" className="w-full justify-center">{v.talle}</Badge>
                  </div>
                  <div className="col-span-4">
                    <Input
                      placeholder="Código (opcional)"
                      value={v.codigo_barras}
                      onChange={e => actualizarVariante(idx, 'codigo_barras', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={v.stock}
                      onChange={e => actualizarVariante(idx, 'stock', parseInt(e.target.value) || 0)}
                      className="h-8 text-xs"
                      min={0}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={v.stock_minimo}
                      onChange={e => actualizarVariante(idx, 'stock_minimo', parseInt(e.target.value) || 0)}
                      className="h-8 text-xs"
                      min={0}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => eliminarVariante(idx)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex gap-3 justify-end">
        <Link href="/inventario">
          <Button variant="outline">Cancelar</Button>
        </Link>
        <Button onClick={guardar} disabled={loading} className="bg-pink-500 hover:bg-pink-600 min-w-[120px]">
          {loading ? 'Guardando...' : 'Guardar producto'}
        </Button>
      </div>
    </div>
  )
}
