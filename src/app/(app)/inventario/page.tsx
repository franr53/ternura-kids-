'use client'

import { Suspense, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Producto, Categoria, Marca } from '@/types'
import { useCache } from '@/lib/hooks/use-cache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Package, AlertTriangle, Layers, X, ArrowUpDown, Copy, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatPrecio, formatNombreConTalle } from '@/lib/utils'

export default function InventarioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <InventarioContent />
    </Suspense>
  )
}

function InventarioContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  const { data: cachedData, loading, refresh: cargarDatos } = useCache('inv:datos:v4', async () => {
    const [{ data: prods, error: errProds }, { data: cats }, { data: provs }] = await Promise.all([
      supabase
        .from('productos')
        .select(`id, nombre_base, categoria_id, marca_id, temporada, activo, creado_en, actualizado_en, categoria:categorias(*), variantes(*)`)
        .eq('activo', true),
      supabase.from('categorias').select('*').eq('activa', true).order('nombre'),
      supabase.from('marcas').select('*').eq('activo', true).order('nombre'),
    ])
    if (errProds) console.error('[inventario] error cargando productos:', errProds.message)
    const marcasMap = Object.fromEntries((provs || []).map(m => [m.id, m]))
    const productos = (prods || []).map(p => ({ ...p, marca: marcasMap[p.marca_id] ?? null })) as unknown as Producto[]
    return {
      productos,
      categorias: (cats || []) as Categoria[],
      marcas: (provs || []) as Marca[],
    }
  })

  const productos = cachedData?.productos ?? []
  const categorias = cachedData?.categorias ?? []
  const marcas = cachedData?.marcas ?? []

  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroProveedor, setFiltroProveedor] = useState('todos')
  const stockParam = searchParams.get('stock')
  const [filtroStock, setFiltroStock] = useState(stockParam && ['sin_stock', 'stock_bajo', 'con_stock', 'exceso'].includes(stockParam) ? stockParam : 'todos')
  const [filtroTemporada, setFiltroTemporada] = useState('todas')
  const [filtroPrecioMin, setFiltroPrecioMin] = useState('')
  const [filtroPrecioMax, setFiltroPrecioMax] = useState('')
  const [orden, setOrden] = useState('nombre_asc')
  const [filtroAnomalia, setFiltroAnomalia] = useState<string | null>(null)
  const [filtroTalle, setFiltroTalle] = useState('todos')
  const [editandoCodigo, setEditandoCodigo] = useState<{ varianteId: string; valor: string } | null>(null)
  const [editandoPrecio, setEditandoPrecio] = useState<{ varianteId: string; precioCosto: string; precioVenta: string } | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpandidos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const [panelCodigos, setPanelCodigos] = useState(false)
  const [tabCodigos, setTabCodigos] = useState<'faltantes' | 'colisiones'>('faltantes')
  const [aplicandoCodigos, setAplicandoCodigos] = useState(false)
  const [sugerenciasEditadas, setSugerenciasEditadas] = useState<Record<string, string>>({})

  async function guardarCodigo(varianteId: string, nuevo: string) {
    const valor = nuevo.trim() || null
    const { error } = await supabase.from('variantes').update({ codigo_barras: valor }).eq('id', varianteId)
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        toast.error('Ese código ya está en uso por otra variante')
      } else {
        toast.error('Error al guardar: ' + error.message)
      }
    } else {
      toast.success(valor ? 'Código actualizado' : 'Código eliminado')
      cargarDatos()
    }
    setEditandoCodigo(null)
  }

  async function guardarPrecio(varianteId: string, precioCosto: string, precioVenta: string) {
    const costo = Math.round(parseFloat(precioCosto) || 0)
    const venta = Math.round(parseFloat(precioVenta) || 0)
    if (venta > 0 && costo > 0 && venta < costo) {
      toast.error('El precio de venta no puede ser menor al costo')
      return
    }
    const { error } = await supabase.from('variantes').update({ precio_costo: costo || null, precio_venta: venta || null }).eq('id', varianteId)
    if (error) { toast.error('Error al guardar: ' + error.message); return }
    toast.success('Precio actualizado')
    setEditandoPrecio(null)
    cargarDatos()
  }

  // Cálculo de anomalías (client-side)
  const todosLosCodigos = productos.flatMap(p => p.variantes?.map(v => v.codigo_barras).filter(Boolean) ?? [])
  const codigosDuplicados = new Set(
    todosLosCodigos.filter((c, i) => todosLosCodigos.indexOf(c) !== i)
  )
  const nombresContados = productos.reduce<Record<string, number>>((acc, p) => {
    const n = p.nombre_base.trim().toLowerCase()
    acc[n] = (acc[n] || 0) + 1
    return acc
  }, {})
  const nombresRepetidos = new Set(Object.entries(nombresContados).filter(([, c]) => c > 1).map(([n]) => n))

  const conteoAnomalias = {
    sin_codigo: productos.filter(p => p.variantes?.some(v => !v.codigo_barras)).length,
    cod_duplicado: productos.filter(p => p.variantes?.some(v => v.codigo_barras && codigosDuplicados.has(v.codigo_barras))).length,
    nombre_repetido: productos.filter(p => nombresRepetidos.has(p.nombre_base.trim().toLowerCase())).length,
    precio_invalido: productos.filter(p => p.variantes?.some(v => v.precio_venta === 0 || v.precio_venta < v.precio_costo)).length,
  }

  const todosCodigosUsados = useMemo(() =>
    new Set(productos.flatMap(p => p.variantes?.map(v => v.codigo_barras).filter((c): c is string => !!c) ?? [])),
  [productos])

  const colisionesDetalle = useMemo(() => {
    const mapa = new Map<string, Array<{ producto: Producto; varianteId: string; talle: string }>>()
    productos.forEach(p =>
      p.variantes?.forEach(v => {
        if (v.codigo_barras && codigosDuplicados.has(v.codigo_barras)) {
          const arr = mapa.get(v.codigo_barras) ?? []
          arr.push({ producto: p, varianteId: v.id, talle: v.talle })
          mapa.set(v.codigo_barras, arr)
        }
      })
    )
    return Array.from(mapa.entries())
  }, [productos, codigosDuplicados])

  const productosSinCodigo = useMemo(() =>
    productos
      .filter(p => p.variantes?.some(v => !v.codigo_barras))
      .map(p => ({
        producto: p,
        sinCodigo: (p.variantes ?? []).filter(v => !v.codigo_barras),
        conCodigo: (p.variantes ?? []).filter(v => !!v.codigo_barras),
      })),
  [productos])

  const productosFiltrados = productos.filter(p => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const matchBusqueda = busqueda === '' ||
      norm(p.nombre_base).includes(norm(busqueda)) ||
      p.variantes?.some(v => v.codigo_barras?.includes(busqueda))
    const matchCategoria = filtroCategoria === 'todas' || p.categoria_id === filtroCategoria
    const matchProveedor = filtroProveedor === 'todos' || p.marca_id === filtroProveedor
    const stockTotal = p.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0
    const matchStock =
      filtroStock === 'todos' ? true :
      filtroStock === 'con_stock' ? stockTotal > 0 :
      filtroStock === 'sin_stock' ? stockTotal === 0 :
      filtroStock === 'stock_bajo' ? stockTotal > 0 && p.variantes?.some(v => v.stock <= v.stock_minimo) :
      filtroStock === 'exceso' ? stockTotal > 10 :
      true
    const matchTemporada = filtroTemporada === 'todas' || p.temporada === filtroTemporada
    const precioMin = filtroPrecioMin ? Number(filtroPrecioMin) : 0
    const precioMax = filtroPrecioMax ? Number(filtroPrecioMax) : Infinity
    const matchPrecio = !filtroPrecioMin && !filtroPrecioMax ? true :
      (p.variantes?.some(v => v.precio_venta >= precioMin && v.precio_venta <= precioMax) ?? false)
    const matchAnomalia = !filtroAnomalia ? true :
      filtroAnomalia === 'sin_codigo' ? p.variantes?.some(v => !v.codigo_barras) :
      filtroAnomalia === 'cod_duplicado' ? p.variantes?.some(v => v.codigo_barras && codigosDuplicados.has(v.codigo_barras)) :
      filtroAnomalia === 'nombre_repetido' ? nombresRepetidos.has(p.nombre_base.trim().toLowerCase()) :
      filtroAnomalia === 'precio_invalido' ? p.variantes?.some(v => v.precio_venta === 0 || v.precio_venta < v.precio_costo) :
      true
    const matchTalle = filtroTalle === 'todos' || p.variantes?.some(v => v.talle === filtroTalle)
    return matchBusqueda && matchCategoria && matchProveedor && matchStock && matchTemporada && matchPrecio && matchAnomalia && matchTalle
  }).sort((a, b) => {
    const stockA = a.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0
    const stockB = b.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0
    switch (orden) {
      case 'nombre_desc': return b.nombre_base.localeCompare(a.nombre_base)
      case 'precio_asc': return (a.variantes?.[0]?.precio_venta ?? 0) - (b.variantes?.[0]?.precio_venta ?? 0)
      case 'precio_desc': return (b.variantes?.[0]?.precio_venta ?? 0) - (a.variantes?.[0]?.precio_venta ?? 0)
      case 'stock_asc': return stockA - stockB
      case 'stock_desc': return stockB - stockA
      case 'recientes': return b.creado_en.localeCompare(a.creado_en)
      default: return a.nombre_base.localeCompare(b.nombre_base)
    }
  })

  // Stats
  const totalProductos = productos.length
  const sinStock = productos.filter(p => (p.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0) === 0).length
  const stockBajo = productos.filter(p => p.variantes?.some(v => v.stock > 0 && v.stock <= v.stock_minimo)).length
  const totalAnomalias = Object.values(conteoAnomalias).reduce((a, b) => a + b, 0)

  // Talles únicos para el filtro
  const tallesUnicos = Array.from(new Set(
    productos.flatMap(p => p.variantes?.map(v => v.talle) ?? [])
  )).sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })

  const hayFiltrosActivos = busqueda !== '' || filtroCategoria !== 'todas' || filtroProveedor !== 'todos' ||
    filtroStock !== 'todos' || filtroTemporada !== 'todas' || filtroPrecioMin !== '' || filtroPrecioMax !== '' ||
    orden !== 'nombre_asc' || filtroAnomalia !== null || filtroTalle !== 'todos'

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroCategoria('todas')
    setFiltroProveedor('todos')
    setFiltroStock('todos')
    setFiltroTemporada('todas')
    setFiltroPrecioMin('')
    setFiltroPrecioMax('')
    setOrden('nombre_asc')
    setFiltroAnomalia(null)
    setFiltroTalle('todos')
  }

  // ── Helpers barcode ────────────────────────────────────────────
  function normTalle(t: string) { return t.replace(/[^a-z0-9]/gi, '').toUpperCase() }

  function extraerPrefijo(barcode: string, talle: string): string | null {
    const t = normTalle(talle)
    if (!t || !barcode.endsWith(t)) return null
    const prefix = barcode.slice(0, barcode.length - t.length)
    return prefix.length > 0 ? prefix : null
  }

  function inferirPrefijo(producto: Producto): string | null {
    const conCod = producto.variantes?.filter(v => v.codigo_barras) ?? []
    if (!conCod.length) return null
    const prefijos = conCod
      .map(v => extraerPrefijo(v.codigo_barras!, v.talle))
      .filter((p): p is string => p !== null)
    const unicos = [...new Set(prefijos)]
    return unicos.length === 1 ? unicos[0] : null
  }

  function sugerirCodigo(v: { talle: string; id: string }, producto: Producto, usados: Set<string>): string | null {
    const t = normTalle(v.talle)
    if (!t) return null
    const p = inferirPrefijo(producto)
    if (!p) return null
    const candidato = p + t
    return usados.has(candidato) ? null : candidato
  }

  async function aplicarSugerencias(items: { id: string; codigo: string }[]) {
    setAplicandoCodigos(true)
    await Promise.all(items.map(i =>
      supabase.from('variantes').update({ codigo_barras: i.codigo }).eq('id', i.id)
    ))
    setSugerenciasEditadas({})
    await cargarDatos()
    setAplicandoCodigos(false)
    toast.success(`${items.length} código${items.length > 1 ? 's' : ''} aplicado${items.length > 1 ? 's' : ''}`)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
          <p className="text-gray-500 text-sm mt-0.5">{totalProductos} productos activos</p>
        </div>
        <Link href="/inventario/nuevo">
          <Button className="bg-teal-500 hover:bg-teal-600 gap-2">
            <Plus size={16} /> Nuevo producto
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #ccfbf1, #99f6e4)' }}>
            <Package size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{totalProductos}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{sinStock}</p>
            <p className="text-xs text-gray-500">Sin stock</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-50">
            <Layers size={18} className="text-orange-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{stockBajo}</p>
            <p className="text-xs text-gray-500">Stock bajo</p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-opacity',
            totalAnomalias > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-gray-200 opacity-50'
          )}
          onClick={() => totalAnomalias > 0 && setFiltroAnomalia(filtroAnomalia ? null : 'precio_invalido')}
        >
          <div className="p-2 rounded-lg bg-amber-100">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{totalAnomalias}</p>
            <p className="text-xs text-gray-500">Anomalías</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o código de barras..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && busqueda.trim()) {
                  const exacto = productos.find(p =>
                    p.variantes?.some(v => v.codigo_barras === busqueda.trim())
                  )
                  if (exacto) router.push(`/inventario/${exacto.id}`)
                }
              }}
              className="pl-9"
            />
          </div>
          <Select value={filtroCategoria} onValueChange={v => setFiltroCategoria(v ?? 'todas')}>
            <SelectTrigger className="w-44">
              <span className="text-gray-400 text-xs mr-1">Cat:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroProveedor} onValueChange={v => setFiltroProveedor(v ?? 'todos')}>
            <SelectTrigger className="w-44">
              <span className="text-gray-400 text-xs mr-1">Marca:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {marcas.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <Select value={filtroStock} onValueChange={v => setFiltroStock(v ?? 'todos')}>
            <SelectTrigger className="w-44">
              <span className="text-gray-400 text-xs mr-1">Stock:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="con_stock">Con stock</SelectItem>
              <SelectItem value="sin_stock">Sin stock</SelectItem>
              <SelectItem value="stock_bajo">Stock bajo</SelectItem>
              <SelectItem value="exceso">Alto (&gt;10)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroTalle} onValueChange={v => setFiltroTalle(v ?? 'todos')}>
            <SelectTrigger className="w-44">
              <span className="text-gray-400 text-xs mr-1">Talle:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tallesUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroTemporada} onValueChange={v => setFiltroTemporada(v ?? 'todas')}>
            <SelectTrigger className="w-44">
              <span className="text-gray-400 text-xs mr-1">Temp:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="verano">Verano</SelectItem>
              <SelectItem value="invierno">Invierno</SelectItem>
              <SelectItem value="todo_el_año">Todo el año</SelectItem>
              <SelectItem value="liquidacion">Liquidación</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">$</span>
            <Input
              type="number"
              placeholder="Mín"
              value={filtroPrecioMin}
              onChange={e => setFiltroPrecioMin(e.target.value)}
              className="w-20"
            />
            <span className="text-gray-300">–</span>
            <Input
              type="number"
              placeholder="Máx"
              value={filtroPrecioMax}
              onChange={e => setFiltroPrecioMax(e.target.value)}
              className="w-20"
            />
          </div>
          <Select value={orden} onValueChange={v => setOrden(v ?? 'nombre_asc')}>
            <SelectTrigger className="w-48">
              <ArrowUpDown size={14} className="mr-1 text-gray-400 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nombre_asc">Nombre A-Z</SelectItem>
              <SelectItem value="nombre_desc">Nombre Z-A</SelectItem>
              <SelectItem value="precio_asc">Precio menor</SelectItem>
              <SelectItem value="precio_desc">Precio mayor</SelectItem>
              <SelectItem value="stock_asc">Menos stock</SelectItem>
              <SelectItem value="stock_desc">Más stock</SelectItem>
              <SelectItem value="recientes">Más recientes</SelectItem>
            </SelectContent>
          </Select>
          {hayFiltrosActivos && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-gray-500 hover:text-gray-700 gap-1">
              <X size={14} /> Limpiar
            </Button>
          )}
        </div>
        {hayFiltrosActivos && !loading && (
          <p className="text-xs text-gray-500">{productosFiltrados.length} de {productos.length} productos</p>
        )}
      </div>

      {/* Filtros de anomalías */}
      {(conteoAnomalias.sin_codigo > 0 || conteoAnomalias.cod_duplicado > 0 || conteoAnomalias.nombre_repetido > 0 || conteoAnomalias.precio_invalido > 0) && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 bg-amber-50 rounded-xl border border-amber-100">
          <span className="text-xs text-amber-700 font-semibold flex items-center gap-1.5 mr-1">
            <AlertTriangle size={13} /> Anomalías detectadas:
          </span>
          {([
            { key: 'sin_codigo', label: 'Sin código de barras', count: conteoAnomalias.sin_codigo, cls: 'bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200' },
            { key: 'cod_duplicado', label: 'Códigos duplicados', count: conteoAnomalias.cod_duplicado, cls: 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' },
            { key: 'nombre_repetido', label: 'Nombres repetidos', count: conteoAnomalias.nombre_repetido, cls: 'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200' },
            { key: 'precio_invalido', label: 'Precio inválido', count: conteoAnomalias.precio_invalido, cls: 'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200' },
          ] as const).filter(f => f.count > 0).map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroAnomalia(filtroAnomalia === f.key ? null : f.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                f.cls,
                filtroAnomalia === f.key && 'ring-2 ring-offset-1 ring-current'
              )}
            >
              {f.label}
              <span className="bg-white/60 px-1.5 py-0.5 rounded-full font-bold">{f.count}</span>
            </button>
          ))}
          {filtroAnomalia && (
            <button onClick={() => setFiltroAnomalia(null)} className="text-xs text-amber-600 hover:text-amber-800 ml-auto font-medium">
              × Limpiar filtro
            </button>
          )}
          {(conteoAnomalias.sin_codigo > 0 || conteoAnomalias.cod_duplicado > 0) && (
            <button
              onClick={() => setPanelCodigos(p => !p)}
              className="text-xs text-amber-700 underline hover:no-underline ml-2 font-medium shrink-0"
            >
              {panelCodigos ? 'Cerrar panel' : '🔧 Reparar códigos'}
            </button>
          )}
        </div>
      )}

      {/* Panel de reparación de códigos */}
      {panelCodigos && (
        <div className="border border-amber-200 rounded-xl bg-white overflow-hidden shadow-sm">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {(['faltantes', 'colisiones'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTabCodigos(tab)}
                className={cn(
                  'px-4 py-2.5 text-xs font-semibold transition-colors',
                  tabCodigos === tab
                    ? 'border-b-2 border-teal-500 text-teal-700 bg-teal-50/50'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab === 'faltantes'
                  ? `Sin código (${conteoAnomalias.sin_codigo} productos)`
                  : `Colisiones (${colisionesDetalle.length})`}
              </button>
            ))}
          </div>

          {/* Tab: Faltantes */}
          {tabCodigos === 'faltantes' && (
            <div className="p-4 space-y-3">
              {/* Header con "Aplicar todas" */}
              {(() => {
                const todasSugerencias = productosSinCodigo.flatMap(({ producto, sinCodigo }) => {
                  const codigosDeOtros = new Set(
                    productos.filter(p2 => p2.id !== producto.id)
                      .flatMap(p2 => p2.variantes?.map(v => v.codigo_barras).filter((c): c is string => !!c) ?? [])
                  )
                  const yaAsignados = new Set<string>()
                  return sinCodigo.map(v => {
                    const editado = sugerenciasEditadas[v.id]
                    const sugerido = editado !== undefined ? editado : sugerirCodigo(v, producto, codigosDeOtros)
                    if (sugerido && !codigosDeOtros.has(sugerido) && !yaAsignados.has(sugerido)) {
                      yaAsignados.add(sugerido)
                      return { id: v.id, codigo: sugerido }
                    }
                    return null
                  }).filter((x): x is { id: string; codigo: string } => x !== null)
                })
                return todasSugerencias.length > 0 ? (
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <p className="text-xs text-gray-500">
                      Sugerencias calculadas en base al prefijo de las otras variantes del mismo producto.
                    </p>
                    <button
                      onClick={() => aplicarSugerencias(todasSugerencias)}
                      disabled={aplicandoCodigos}
                      className="shrink-0 ml-4 px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-50 transition-opacity"
                      style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
                    >
                      {aplicandoCodigos ? 'Aplicando...' : `Aplicar ${todasSugerencias.length} sugerencia${todasSugerencias.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                ) : null
              })()}

              {productosSinCodigo.map(({ producto, sinCodigo, conCodigo }) => {
                // Códigos de otros productos (no de este) para detectar colisiones reales
                const codigosDeOtros = new Set(
                  productos.filter(p2 => p2.id !== producto.id)
                    .flatMap(p2 => p2.variantes?.map(v => v.codigo_barras).filter((c): c is string => !!c) ?? [])
                )
                // Rastrear sugerencias ya asignadas a hermanas en este batch (evitar duplicados intra-producto)
                const yaAsignados = new Set<string>()
                return (
                <div key={producto.id} className="border border-gray-100 rounded-lg p-3">
                  <p className="font-semibold text-sm text-gray-800 mb-2">{producto.nombre_base}</p>

                  {/* Variantes con código — referencia */}
                  {conCodigo.length > 0 && (
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {conCodigo.map(v => (
                        <span key={v.id} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-mono border border-green-100">
                          {/^\d+$/.test(v.talle) ? `T${v.talle}` : v.talle}: {v.codigo_barras}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Variantes sin código con input editable */}
                  <div className="space-y-1.5">
                    {sinCodigo.map(v => {
                      const sugerido = sugerirCodigo(v, producto, codigosDeOtros)
                      // Si ya se asignó este código a una hermana en este batch → no sugerir de nuevo
                      const sugeridoDisponible = sugerido && !yaAsignados.has(sugerido) ? sugerido : null
                      if (sugeridoDisponible) yaAsignados.add(sugeridoDisponible)
                      const editado = sugerenciasEditadas[v.id]
                      const valor = editado !== undefined ? editado : (sugeridoDisponible ?? '')
                      const colisiona = !!valor && codigosDeOtros.has(valor)
                      return (
                        <div key={v.id} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-8 shrink-0 font-mono">
                            {/^\d+$/.test(v.talle) ? `T${v.talle}` : v.talle}
                          </span>
                          <input
                            value={valor}
                            onChange={e => setSugerenciasEditadas(prev => ({ ...prev, [v.id]: e.target.value }))}
                            className={cn(
                              'font-mono text-xs border rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 min-w-0',
                              colisiona ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-teal-400'
                            )}
                            placeholder={
                              inferirPrefijo(producto)
                                ? `${inferirPrefijo(producto)}${normTalle(v.talle)}`
                                : 'Sin referencia — ingresá manualmente'
                            }
                          />
                          {colisiona && <span className="text-xs text-red-500 shrink-0">ya existe</span>}
                          <button
                            disabled={!valor || colisiona}
                            onClick={() => {
                              guardarCodigo(v.id, valor)
                              setSugerenciasEditadas(prev => { const n = { ...prev }; delete n[v.id]; return n })
                            }}
                            className="shrink-0 px-2.5 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Guardar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
              })}
            </div>
          )}

          {/* Tab: Colisiones */}
          {tabCodigos === 'colisiones' && (
            <div className="p-4 space-y-3">
              {colisionesDetalle.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No hay colisiones detectadas ✓</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    Estos códigos aparecen en más de una variante. Editá cada uno desde la tabla de inventario.
                  </p>
                  {colisionesDetalle.map(([codigo, entries]) => (
                    <div key={codigo} className="border border-red-200 rounded-lg p-3 bg-red-50">
                      <p className="font-mono text-sm font-bold text-red-700 mb-1.5">{codigo}</p>
                      {entries.map(({ producto, varianteId, talle }) => (
                        <div key={varianteId} className="text-xs text-gray-700">
                          • {producto.nombre_base} — talle {talle}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabla — una fila por variante (talle) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Cargando inventario...</p>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay productos que coincidan</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Producto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Marca</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Talles / Código</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Precio venta</th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productosFiltrados.map(producto => {
                const variantes = producto.variantes || []
                const variantesFiltradas = filtroTalle !== 'todos' ? variantes.filter(v => v.talle === filtroTalle) : variantes
                const stockTotal = variantesFiltradas.reduce((s, v) => s + v.stock, 0)
                const precioMin = variantesFiltradas.length ? Math.min(...variantesFiltradas.map(v => v.precio_venta)) : 0
                const precioMax = variantesFiltradas.length ? Math.max(...variantesFiltradas.map(v => v.precio_venta)) : 0
                const hayAlerta = variantesFiltradas.some(v => v.stock === 0 || v.stock <= v.stock_minimo)
                const expandido = expandidos.has(producto.id)
                // Detectar talles duplicados en este producto
                const tallesContados = variantesFiltradas.reduce<Record<string, number>>((acc, v) => {
                  acc[v.talle] = (acc[v.talle] || 0) + 1; return acc
                }, {})
                const tallesDuplicados = new Set(Object.entries(tallesContados).filter(([, c]) => c > 1).map(([t]) => t))
                const hayTallesDuplicados = tallesDuplicados.size > 0
                return [
                  // Fila padre (producto)
                  <tr
                    key={producto.id}
                    onClick={() => toggleExpand(producto.id)}
                    className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {hayAlerta && <AlertTriangle size={13} className="text-orange-400 shrink-0" />}
                        <span className="font-semibold text-gray-800">{producto.nombre_base}</span>
                        <span className="text-xs text-gray-400">({variantesFiltradas.length} {variantesFiltradas.length === 1 ? 'talle' : 'talles'})</span>
                        {hayTallesDuplicados && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-1.5 py-0.5 rounded-full font-medium">
                            ⚠ talles repetidos — contá en el local
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {producto.categoria ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: producto.categoria.color }}>
                          {producto.categoria.nombre}
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{producto.marca?.nombre ?? '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {variantesFiltradas.slice(0, 6).map(v => (
                          <span key={v.id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">{/^\d+$/.test(v.talle) ? `T${v.talle}` : v.talle}</span>
                        ))}
                        {variantesFiltradas.length > 6 && <span className="text-xs text-gray-400">+{variantesFiltradas.length - 6}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
                        stockTotal === 0 ? 'bg-red-100 text-red-600' : hayAlerta ? 'bg-orange-100 text-orange-600' : 'bg-teal-50 text-teal-700'
                      )}>{stockTotal}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/inventario/${producto.id}`} onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 opacity-0 group-hover:opacity-100 transition-opacity">Editar</Button>
                        </Link>
                        <span className="text-gray-300 text-xs">{expandido ? '▲' : '▼'}</span>
                      </div>
                    </td>
                  </tr>,
                  // Filas variante (visibles solo si expandido)
                  ...(expandido ? variantesFiltradas.flatMap(v => {
                    const precioInvalido = v.precio_venta === 0 || v.precio_venta < v.precio_costo
                    const editandoEstaVariante = editandoPrecio?.varianteId === v.id
                    const esDuplicado = tallesDuplicados.has(v.talle)
                    const rows = [
                      <tr key={v.id} className={cn('border-t-0 hover:bg-teal-50/30 transition-colors', esDuplicado ? 'bg-yellow-50/60' : 'bg-gray-50/70')}>
                        <td className="pl-10 pr-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-gray-700 font-mono">{/^\d+$/.test(v.talle) ? `T${v.talle}` : v.talle}</span>
                            {esDuplicado && <span className="text-xs text-yellow-700 bg-yellow-100 px-1 py-0.5 rounded font-medium">×{tallesContados[v.talle]}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">—</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">—</td>
                        <td className="hidden md:table-cell px-4 py-2">
                          {editandoCodigo?.varianteId === v.id ? (
                            <input
                              autoFocus
                              className="font-mono text-xs border border-teal-400 rounded px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-teal-400"
                              value={editandoCodigo.valor}
                              onChange={e => setEditandoCodigo({ varianteId: v.id, valor: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') guardarCodigo(v.id, editandoCodigo.valor)
                                if (e.key === 'Escape') setEditandoCodigo(null)
                              }}
                              onBlur={() => guardarCodigo(v.id, editandoCodigo.valor)}
                            />
                          ) : v.codigo_barras ? (
                            <div className="flex items-center gap-1 group/cod">
                              <button onClick={() => { navigator.clipboard.writeText(v.codigo_barras!); toast.success('Código copiado') }}
                                className="font-mono text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1">
                                <span className="text-gray-300">🏷</span>{v.codigo_barras}<Copy size={10} className="opacity-40" />
                              </button>
                              <button onClick={() => setEditandoCodigo({ varianteId: v.id, valor: v.codigo_barras! })}
                                className="opacity-0 group-hover/cod:opacity-100 text-gray-400 hover:text-gray-600">✏️</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditandoCodigo({ varianteId: v.id, valor: '' })}
                              className="text-xs text-gray-300 italic hover:text-teal-500">+ agregar</button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setEditandoPrecio(editandoEstaVariante ? null : { varianteId: v.id, precioCosto: String(v.precio_costo || ''), precioVenta: String(v.precio_venta || '') })
                            }}
                            className={cn('text-sm font-medium group/precio inline-flex items-center gap-1 hover:text-teal-600 transition-colors', precioInvalido ? 'text-red-500' : 'text-gray-700')}
                          >
                            {formatPrecio(v.precio_venta)}
                            <Pencil size={10} className="opacity-0 group-hover/precio:opacity-50 transition-opacity" />
                          </button>
                          {precioInvalido && v.precio_venta > 0 && (
                            <p className="text-xs text-red-400">costo: {formatPrecio(v.precio_costo)}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={cn(
                            'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold',
                            v.stock === 0 ? 'bg-red-100 text-red-600' : v.stock <= v.stock_minimo ? 'bg-orange-100 text-orange-600' : 'bg-teal-50 text-teal-700'
                          )}>{v.stock}</span>
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    ]
                    if (editandoEstaVariante && editandoPrecio) {
                      const c = parseFloat(editandoPrecio.precioCosto) || 0
                      const vv = parseFloat(editandoPrecio.precioVenta) || 0
                      const margenEdit = c > 0 && vv > 0 ? Math.round(((vv - c) / c) * 100) : null
                      const errorEdit = vv > 0 && c > 0 && vv < c
                      rows.push(
                        <tr key={`edit-${v.id}`} className="bg-teal-50/60 border-t border-teal-100">
                          <td colSpan={7} className="pl-10 pr-4 py-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide shrink-0">
                                Editar precios · {/^\d+$/.test(v.talle) ? `T${v.talle}` : v.talle}
                              </span>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 shrink-0">Costo:</label>
                                <input
                                  type="number"
                                  value={editandoPrecio.precioCosto}
                                  onChange={e => {
                                    const costo = e.target.value
                                    const sugerido = parseFloat(costo) > 0 ? String(Math.round(parseFloat(costo) * 2.2)) : ''
                                    setEditandoPrecio(prev => prev ? { ...prev, precioCosto: costo, precioVenta: sugerido || prev.precioVenta } : null)
                                  }}
                                  onKeyDown={e => { if (e.key === 'Escape') setEditandoPrecio(null) }}
                                  className="w-28 h-8 border border-gray-200 rounded-lg px-2 text-sm focus:ring-1 focus:ring-teal-400 focus:outline-none"
                                  placeholder="0"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500 shrink-0">Venta:</label>
                                <input
                                  type="number"
                                  value={editandoPrecio.precioVenta}
                                  onChange={e => setEditandoPrecio(prev => prev ? { ...prev, precioVenta: e.target.value } : null)}
                                  onKeyDown={e => { if (e.key === 'Enter') guardarPrecio(v.id, editandoPrecio.precioCosto, editandoPrecio.precioVenta); if (e.key === 'Escape') setEditandoPrecio(null) }}
                                  className="w-28 h-8 border border-gray-200 rounded-lg px-2 text-sm focus:ring-1 focus:ring-teal-400 focus:outline-none"
                                  placeholder="0"
                                  autoFocus
                                />
                              </div>
                              {margenEdit !== null && (
                                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0',
                                  errorEdit ? 'bg-red-100 text-red-600' : margenEdit < 20 ? 'bg-orange-100 text-orange-600' : 'bg-teal-50 text-teal-700')}>
                                  {errorEdit ? '⚠ venta < costo' : `${margenEdit}% margen`}
                                </span>
                              )}
                              <div className="flex gap-2 ml-auto">
                                <button
                                  onClick={() => setEditandoPrecio(null)}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => guardarPrecio(v.id, editandoPrecio.precioCosto, editandoPrecio.precioVenta)}
                                  disabled={errorEdit}
                                  className="px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-50 transition-opacity"
                                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>
                            {errorEdit && (
                              <p className="text-xs text-red-500 mt-1.5">⛔ El precio de venta no puede ser menor al costo</p>
                            )}
                          </td>
                        </tr>
                      )
                    }
                    return rows
                  }) : [])
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
