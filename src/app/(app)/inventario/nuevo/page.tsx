'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Categoria, Proveedor } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle2, Package } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

const TALLES_POR_SISTEMA: Record<string, string[]> = {
  meses:    ['RN', '0-3m', '3-6m', '6-9m', '9-12m', '12-18m', '18-24m'],
  numerico: ['2', '4', '6', '8', '10', '12', '14', '16'],
  letras:   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  calzado:  ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36'],
}

interface VarianteInput {
  talle: string
  codigo_barras: string
  stock: number
  stock_minimo: number
}

interface ProductoGuardado {
  nombre: string
  categoriaNombre: string
  cantVariantes: number
  precioVenta: number
}

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(false)

  // Wizard state
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [direccion, setDireccion] = useState<'forward' | 'backward'>('forward')
  const [productosGuardados, setProductosGuardados] = useState(0)
  const [ultimoProducto, setUltimoProducto] = useState<ProductoGuardado | null>(null)

  // Paso 1
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [temporada, setTemporada] = useState('')

  // Paso 2
  const [variantes, setVariantes] = useState<VarianteInput[]>([])
  const [talleManual, setTalleManual] = useState('')

  const categoriaSeleccionada = categorias.find(c => c.id === categoriaId)
  const tallesSugeridos = categoriaSeleccionada ? (TALLES_POR_SISTEMA[categoriaSeleccionada.sistema_talles] || []) : []

  const margen = precioCosto && precioVenta
    ? (((parseFloat(precioVenta) - parseFloat(precioCosto)) / parseFloat(precioCosto)) * 100).toFixed(0)
    : null

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

  function irA(nuevoPaso: 1 | 2 | 3, dir: 'forward' | 'backward') {
    setDireccion(dir)
    setPaso(nuevoPaso)
  }

  function agregarVariante(talle: string) {
    const t = talle.trim()
    if (!t || variantes.some(v => v.talle === t)) return
    setVariantes(prev => [...prev, { talle: t, codigo_barras: '', stock: 0, stock_minimo: 2 }])
    setTalleManual('')
  }

  function agregarTodos() {
    const nuevos = tallesSugeridos
      .filter(t => !variantes.some(v => v.talle === t))
      .map(t => ({ talle: t, codigo_barras: '', stock: 0, stock_minimo: 2 }))
    setVariantes(prev => [...prev, ...nuevos])
  }

  function actualizarVariante(idx: number, campo: keyof VarianteInput, valor: string | number) {
    setVariantes(prev => prev.map((v, i) => i === idx ? { ...v, [campo]: valor } : v))
  }

  function eliminarVariante(idx: number) {
    setVariantes(prev => prev.filter((_, i) => i !== idx))
  }

  function siguientePaso() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    irA(2, 'forward')
  }

  async function guardar() {
    if (variantes.length === 0) { toast.error('Agregá al menos un talle'); return }
    setLoading(true)

    const { data: producto, error } = await supabase
      .from('productos')
      .insert({
        nombre: nombre.trim(),
        categoria_id: categoriaId || null,
        proveedor_id: proveedorId || null,
        precio_costo: parseFloat(precioCosto) || 0,
        precio_venta: parseFloat(precioVenta) || 0,
        temporada: temporada || null,
      })
      .select()
      .single()

    if (error || !producto) {
      toast.error(`Error al guardar: ${error?.message}`)
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
      toast.error(`Producto guardado pero error en talles: ${errorVariantes.message}`)
    }

    setUltimoProducto({
      nombre: nombre.trim(),
      cantVariantes: variantes.length,
      precioVenta: parseFloat(precioVenta) || 0,
      categoriaNombre: categoriaSeleccionada?.nombre || '',
    })
    setProductosGuardados(n => n + 1)
    setLoading(false)
    irA(3, 'forward')
  }

  function cargarOtro() {
    setNombre('')
    setCategoriaId('')
    setProveedorId('')
    setPrecioCosto('')
    setPrecioVenta('')
    setTemporada('')
    setVariantes([])
    setTalleManual('')
    irA(1, 'backward')
  }

  // Estilo de card base
  const cardStyle = {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }

  const inputStyle = 'h-10 rounded-xl border-gray-200 text-sm focus:ring-teal-400'

  return (
    <div className="min-h-full bg-gray-50 pb-16">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6 overflow-x-hidden">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/inventario">
            <button className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 transition-colors">
              <ArrowLeft size={16} className="text-gray-500" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 leading-none" style={{ fontFamily: 'var(--font-display)' }}>
              Nuevo producto
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {productosGuardados > 0 && `${productosGuardados} producto${productosGuardados > 1 ? 's' : ''} cargado${productosGuardados > 1 ? 's' : ''} esta sesión · `}
              Paso {paso} de 3
            </p>
          </div>
        </div>

        {/* Indicador de progreso */}
        <div className="flex items-center gap-0">
          {[
            { n: 1, label: 'Datos' },
            { n: 2, label: 'Talles' },
            { n: 3, label: '¡Listo!' },
          ].map((p, i) => (
            <div key={p.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                  style={{
                    background: paso >= p.n ? '#4EC3BD' : '#f3f4f6',
                    color: paso >= p.n ? 'white' : '#9ca3af',
                    boxShadow: paso === p.n ? '0 0 0 4px rgba(78,195,189,0.2)' : 'none',
                  }}
                >
                  {paso > p.n ? <CheckCircle2 size={16} /> : p.n}
                </div>
                <span className="text-[10px] font-medium" style={{ color: paso >= p.n ? '#4EC3BD' : '#9ca3af' }}>
                  {p.label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className="flex-1 h-0.5 mx-2 mb-4 rounded transition-all"
                  style={{ background: paso > p.n ? '#4EC3BD' : '#e5e7eb' }}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── PASO 1: DATOS ─────────────────────────────────── */}
        {paso === 1 && (
          <div className={direccion === 'forward' ? 'tk-slide-forward' : 'tk-slide-backward'} style={cardStyle}>
            <h2 className="text-base font-bold text-gray-800 mb-5" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos del producto
            </h2>

            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre *</Label>
                <Input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && siguientePaso()}
                  placeholder="Ej: Remera M/C Niña"
                  className={`mt-1.5 ${inputStyle}`}
                  autoFocus
                />
              </div>

              {/* Categoría + Proveedor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</Label>
                  <Select value={categoriaId || '__none__'} onValueChange={v => setCategoriaId(v === '__none__' ? '' : (v ?? ''))}>
                    <SelectTrigger className={`mt-1.5 ${inputStyle}`}>
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin categoría</SelectItem>
                      {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Proveedor</Label>
                  <Select value={proveedorId || '__none__'} onValueChange={v => setProveedorId(v === '__none__' ? '' : (v ?? ''))}>
                    <SelectTrigger className={`mt-1.5 ${inputStyle}`}>
                      <SelectValue placeholder="Sin proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin proveedor</SelectItem>
                      {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Precio costo</Label>
                  <Input
                    type="number"
                    value={precioCosto}
                    onChange={e => setPrecioCosto(e.target.value)}
                    placeholder="0"
                    className={`mt-1.5 ${inputStyle}`}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Precio venta</Label>
                  <Input
                    type="number"
                    value={precioVenta}
                    onChange={e => setPrecioVenta(e.target.value)}
                    placeholder="0"
                    className={`mt-1.5 ${inputStyle}`}
                  />
                </div>
                <div className="h-10 flex items-center justify-center rounded-xl" style={{ background: '#f0fdfb', border: '1px solid #ccfbf1' }}>
                  {margen !== null ? (
                    <div className="text-center">
                      <p className="text-lg font-black leading-none" style={{ color: Number(margen) >= 30 ? '#0d9488' : Number(margen) >= 15 ? '#d97706' : '#ef4444', fontFamily: 'var(--font-display)' }}>
                        {margen}%
                      </p>
                      <p className="text-[9px] text-gray-400">margen</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300">margen</p>
                  )}
                </div>
              </div>

              {/* Temporada */}
              <div>
                <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Temporada</Label>
                <Select value={temporada || '__none__'} onValueChange={v => setTemporada(v === '__none__' ? '' : (v ?? ''))}>
                  <SelectTrigger className={`mt-1.5 ${inputStyle}`}>
                    <SelectValue placeholder="Sin temporada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin temporada</SelectItem>
                    <SelectItem value="todo_el_año">Todo el año</SelectItem>
                    <SelectItem value="verano">Verano</SelectItem>
                    <SelectItem value="invierno">Invierno</SelectItem>
                    <SelectItem value="liquidacion">Liquidación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Botón siguiente */}
            <div className="flex justify-end mt-6 pt-4" style={{ borderTop: '1px solid #f3f4f6' }}>
              <button
                onClick={siguientePaso}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
                  color: 'white',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: '0 4px 14px rgba(78,195,189,0.3)',
                }}
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 2: TALLES ────────────────────────────────── */}
        {paso === 2 && (
          <div className={direccion === 'forward' ? 'tk-slide-forward' : 'tk-slide-backward'} style={cardStyle}>
            <h2 className="text-base font-bold text-gray-800 mb-1" style={{ fontFamily: 'var(--font-sans)' }}>
              Talles y stock
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              {nombre} · {precioCosto ? `Costo ${formatPrecio(parseFloat(precioCosto))}` : ''}{precioVenta ? ` · Venta ${formatPrecio(parseFloat(precioVenta))}` : ''}
            </p>

            <div className="space-y-5">
              {/* Talles sugeridos */}
              {tallesSugeridos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Talles sugeridos
                    </p>
                    <button
                      onClick={agregarTodos}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                    >
                      + Agregar todos
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tallesSugeridos.map(t => {
                      const agregado = variantes.some(v => v.talle === t)
                      return (
                        <button
                          key={t}
                          onClick={() => agregado ? eliminarVariante(variantes.findIndex(v => v.talle === t)) : agregarVariante(t)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                          style={{
                            background: agregado ? 'rgba(78,195,189,0.12)' : 'white',
                            borderColor: agregado ? '#4EC3BD' : '#e5e7eb',
                            color: agregado ? '#0d9488' : '#6b7280',
                          }}
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Talle manual */}
              <div className="flex gap-2">
                <Input
                  placeholder="Talle personalizado (ej: T3, 37, Único...)"
                  value={talleManual}
                  onChange={e => setTalleManual(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && agregarVariante(talleManual)}
                  className={inputStyle}
                />
                <button
                  onClick={() => agregarVariante(talleManual)}
                  className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-teal-600 transition-all text-sm font-medium flex items-center gap-1.5"
                >
                  <Plus size={14} /> Agregar
                </button>
              </div>

              {/* Lista de variantes */}
              {variantes.length > 0 && (
                <div>
                  <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-1 mb-2">
                    <div className="col-span-2">Talle</div>
                    <div className="col-span-4">Código barras</div>
                    <div className="col-span-2">Stock</div>
                    <div className="col-span-2">Mín.</div>
                    <div className="col-span-2"></div>
                  </div>
                  <div className="space-y-2">
                    {variantes.map((v, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl" style={{ background: '#fafafa' }}>
                        <div className="col-span-2">
                          <Badge className="w-full justify-center bg-teal-50 text-teal-700 border-teal-200 text-xs font-bold">
                            {v.talle}
                          </Badge>
                        </div>
                        <div className="col-span-4">
                          <Input
                            placeholder="Código..."
                            value={v.codigo_barras}
                            onChange={e => actualizarVariante(idx, 'codigo_barras', e.target.value)}
                            className="h-7 text-xs border-gray-200 rounded-lg"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            value={v.stock}
                            onChange={e => actualizarVariante(idx, 'stock', parseInt(e.target.value) || 0)}
                            className="h-7 text-xs border-gray-200 rounded-lg text-center"
                            min={0}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            value={v.stock_minimo}
                            onChange={e => actualizarVariante(idx, 'stock_minimo', parseInt(e.target.value) || 0)}
                            className="h-7 text-xs border-gray-200 rounded-lg text-center"
                            min={0}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button
                            onClick={() => eliminarVariante(idx)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-right">{variantes.length} talle{variantes.length !== 1 ? 's' : ''}</p>
                </div>
              )}

              {variantes.length === 0 && (
                <div className="py-8 text-center rounded-xl" style={{ background: '#fafafa' }}>
                  <Package size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">Agregá al menos un talle para continuar</p>
                </div>
              )}
            </div>

            {/* Botones */}
            <div className="flex justify-between mt-6 pt-4" style={{ borderTop: '1px solid #f3f4f6' }}>
              <button
                onClick={() => irA(1, 'backward')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={15} /> Anterior
              </button>
              <button
                onClick={guardar}
                disabled={loading || variantes.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                style={{
                  background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
                  color: 'white',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: '0 4px 14px rgba(78,195,189,0.3)',
                }}
              >
                {loading ? 'Guardando...' : <><CheckCircle2 size={15} /> Guardar</>}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3: CONFIRMACIÓN ──────────────────────────── */}
        {paso === 3 && ultimoProducto && (
          <div className={direccion === 'forward' ? 'tk-slide-forward' : 'tk-slide-backward'}>

            {/* Card éxito */}
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(78,195,189,0.12)', border: '2px solid rgba(78,195,189,0.3)' }}
              >
                <CheckCircle2 size={32} style={{ color: '#4EC3BD' }} />
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                ¡Guardado!
              </h2>
              {productosGuardados > 1 && (
                <p className="text-xs font-bold mb-3" style={{ color: '#4EC3BD' }}>
                  {productosGuardados} productos cargados esta sesión
                </p>
              )}

              {/* Resumen */}
              <div
                className="rounded-2xl p-4 mt-4 text-left space-y-2"
                style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs text-gray-500">Producto</span>
                  <span className="text-sm font-bold text-gray-800 text-right max-w-[200px]">{ultimoProducto.nombre}</span>
                </div>
                {ultimoProducto.categoriaNombre && (
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Categoría</span>
                    <span className="text-xs font-medium text-gray-700">{ultimoProducto.categoriaNombre}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Talles</span>
                  <span className="text-xs font-medium text-gray-700">{ultimoProducto.cantVariantes} talle{ultimoProducto.cantVariantes !== 1 ? 's' : ''}</span>
                </div>
                {ultimoProducto.precioVenta > 0 && (
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Precio venta</span>
                    <span className="text-sm font-bold" style={{ color: '#4EC3BD', fontFamily: 'var(--font-display)' }}>
                      {formatPrecio(ultimoProducto.precioVenta)}
                    </span>
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-3 mt-6">
                <button
                  onClick={cargarOtro}
                  className="w-full py-3 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
                    color: 'white',
                    fontFamily: 'var(--font-sans)',
                    boxShadow: '0 4px 14px rgba(78,195,189,0.3)',
                  }}
                >
                  + Cargar otro producto
                </button>
                <button
                  onClick={() => router.push('/inventario')}
                  className="w-full py-3 rounded-2xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Ir al inventario
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
