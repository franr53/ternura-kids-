'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { CategoriaGasto, Gasto, Marca } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Plus, X, Settings2, Trash2, Banknote, Smartphone,
  CreditCard, TrendingUp, TrendingDown, ChevronRight, ChevronDown,
} from 'lucide-react'
import { formatPrecio, cn, calcularRango, Periodo } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const METODO_CONFIG: Record<Gasto['metodo_pago'], { label: string; icon: React.ReactNode; color: string }> = {
  efectivo:      { label: 'Efectivo',      icon: <Banknote size={13} />,   color: 'bg-green-100 border-green-400 text-green-700' },
  transferencia: { label: 'Transferencia', icon: <Smartphone size={13} />, color: 'bg-blue-100 border-blue-400 text-blue-700' },
  debito:        { label: 'Débito',        icon: <CreditCard size={13} />, color: 'bg-purple-100 border-purple-400 text-purple-700' },
  credito:       { label: 'Crédito',       icon: <CreditCard size={13} />, color: 'bg-orange-100 border-orange-400 text-orange-700' },
}

function normalizarMetodo(m: string): Gasto['metodo_pago'] {
  if (m === 'tarjeta') return 'debito'
  if (m in METODO_CONFIG) return m as Gasto['metodo_pago']
  return 'efectivo'
}

const periodoLabel: Record<Periodo, string> = {
  hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', fecha: 'Fecha'
}

type PeriodoCorto = 'hoy' | 'semana' | 'mes'

function MiniPeriodoSelector({ value, onChange }: { value: PeriodoCorto; onChange: (v: PeriodoCorto) => void }) {
  return (
    <div className="flex items-center gap-1">
      {(['hoy', 'semana', 'mes'] as PeriodoCorto[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all',
            value === p ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-400 hover:border-teal-300 bg-white'
          )}
        >
          {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Semana' : 'Mes'}
        </button>
      ))}
    </div>
  )
}

export default function GastosPage() {
  const supabase = useRef(createClient()).current

  // Data
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [totalVentas, setTotalVentas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  // Filtros del listado
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [fechaCustom, setFechaCustom] = useState(() => new Date().toISOString().split('T')[0])

  // Filtros independientes de gráficos
  const [periodoBar, setPeriodoBar] = useState<PeriodoCorto>('mes')
  const [periodoPie, setPeriodoPie] = useState<PeriodoCorto>('mes')
  const [gastosBar, setGastosBar] = useState<Gasto[]>([])
  const [gastosPieData, setGastosPieData] = useState<Gasto[]>([])

  // Form nuevo gasto
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [metodo, setMetodo] = useState<Gasto['metodo_pago']>('efectivo')
  const [fuentePago, setFuentePago] = useState<'caja_hoy' | 'retiro_anterior'>('caja_hoy')
  const [proveedorGastoId, setProveedorGastoId] = useState('')
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [notas, setNotas] = useState('')
  const [fechaGasto, setFechaGasto] = useState(() => new Date().toISOString().split('T')[0])
  const [guardando, setGuardando] = useState(false)

  // Modal categorías — estado SEPARADO para grupo vs subcategoría
  const [mostrarCats, setMostrarCats] = useState(false)
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('')
  const [nuevaSubNombre, setNuevaSubNombre] = useState('')
  const [nuevaSubPadreId, setNuevaSubPadreId] = useState<string | null>(null)
  const [guardandoCat, setGuardandoCat] = useState(false)
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set())

  // Desglose categoría expandida
  const [desgloseExpandido, setDesgloseExpandido] = useState<Set<string>>(new Set())

  // Cargar perfil
  useEffect(() => {
    supabase.from('perfiles').select('rol').single().then(({ data, error }) => {
      if (!error) setEsAdmin(data?.rol === 'admin')
    })
  }, [supabase])

  // Cargar categorías
  useEffect(() => {
    supabase.from('categorias_gastos').select('*').order('nombre').then(({ data }) => {
      if (data) setCategorias(data)
    })
  }, [supabase])

  // Cargar proveedores/marcas para el selector de pago a proveedor
  useEffect(() => {
    supabase.from('marcas').select('id, nombre, alias_cbu, deuda_total').eq('activo', true).order('nombre').then(({ data }) => {
      if (data) setMarcas(data as Marca[])
    })
  }, [supabase])

  // Helpers para categorías jerárquicas
  const COLOR_PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#6b7280','#84cc16','#06b6d4','#f43f5e']
  function elegirColor(): string {
    const usados = categorias.map(c => c.color).filter(Boolean)
    return COLOR_PALETTE.find(c => !usados.includes(c)) ?? COLOR_PALETTE[categorias.length % COLOR_PALETTE.length]
  }

  const gruposRaiz = useMemo(() => categorias.filter(c => !c.padre_id), [categorias])

  // Mostrar selector de proveedor solo cuando la categoría (o su grupo padre) es "Insumos"
  const mostrarSelectorProveedor = useMemo(() => {
    if (!categoriaId) return false
    const cat = categorias.find(c => c.id === categoriaId)
    if (!cat) return false
    const nombre = cat.nombre.toLowerCase()
    if (nombre.includes('insumo')) return true
    if (cat.padre_id) {
      const padre = categorias.find(c => c.id === cat.padre_id)
      return (padre?.nombre.toLowerCase().includes('insumo')) ?? false
    }
    return false
  }, [categoriaId, categorias])

  const subcategorias = useMemo(() => {
    const map = new Map<string, CategoriaGasto[]>()
    for (const c of categorias) {
      if (c.padre_id) {
        const arr = map.get(c.padre_id) || []
        arr.push(c)
        map.set(c.padre_id, arr)
      }
    }
    return map
  }, [categorias])

  // Cargar listado principal
  const gastosKey = periodo === 'fecha' ? `gastos:${periodo}:${fechaCustom}` : `gastos:${periodo}`
  const { data: gastosCache, loading: loadingGastos, refresh: cargar } = useCache<{ gastos: Gasto[]; totalVentas: number }>(gastosKey, async () => {
    const { desde, hasta } = calcularRango(periodo, fechaCustom)

    const [{ data: gastosData }, { data: ventasData }] = await Promise.all([
      supabase
        .from('gastos')
        .select('*, categoria:categorias_gastos(*)')
        .gte('fecha', desde.toISOString().split('T')[0])
        .lte('fecha', hasta.toISOString().split('T')[0])
        .order('creado_en', { ascending: false }),
      supabase
        .from('ventas')
        .select('total')
        .eq('estado', 'completada')
        .gte('creado_en', desde.toISOString())
        .lte('creado_en', hasta.toISOString()),
    ])

    return {
      gastos: (gastosData as unknown as Gasto[]) || [],
      totalVentas: (ventasData || []).reduce((s: number, v: { total: number }) => s + v.total, 0),
    }
  })

  useEffect(() => {
    if (gastosCache) {
      setGastos(gastosCache.gastos)
      setTotalVentas(gastosCache.totalVentas)
      setLoading(false)
    }
  }, [gastosCache])

  // Fetch para BarChart (independiente)
  const cargarBar = useCallback(async () => {
    const { desde, hasta } = calcularRango(periodoBar, '')
    const { data } = await supabase
      .from('gastos')
      .select('fecha, monto, metodo_pago, categoria_id')
      .gte('fecha', desde.toISOString().split('T')[0])
      .lte('fecha', hasta.toISOString().split('T')[0])
    setGastosBar((data as unknown as Gasto[]) || [])
  }, [supabase, periodoBar])

  useEffect(() => { cargarBar() }, [cargarBar])

  // Fetch para PieChart (independiente)
  const cargarPie = useCallback(async () => {
    const { desde, hasta } = calcularRango(periodoPie, '')
    const { data } = await supabase
      .from('gastos')
      .select('monto, metodo_pago')
      .gte('fecha', desde.toISOString().split('T')[0])
      .lte('fecha', hasta.toISOString().split('T')[0])
    setGastosPieData((data as unknown as Gasto[]) || [])
  }, [supabase, periodoPie])

  useEffect(() => { cargarPie() }, [cargarPie])

  async function agregarGasto() {
    const montoNum = Math.round(parseFloat(monto))
    if (!concepto.trim()) { toast.error('Ingresá un concepto'); return }
    if (concepto.length > 200) { toast.error('El concepto no puede tener más de 200 caracteres'); return }
    if (!montoNum || montoNum <= 0) { toast.error('Ingresá un monto válido'); return }
    if (montoNum > 99999999) { toast.error('El monto no puede superar $99.999.999'); return }

    setGuardando(true)
    const { data, error } = await supabase.from('gastos').insert({
      concepto: concepto.trim(),
      monto: montoNum,
      categoria_id: categoriaId || null,
      metodo_pago: metodo,
      fuente_pago: metodo === 'efectivo' ? fuentePago : 'caja_hoy',
      proveedor_id: proveedorGastoId || null,
      notas: notas.trim() || null,
      fecha: fechaGasto,
    }).select('*, categoria:categorias_gastos(*)').single()

    if (error) { toast.error('Error al guardar: ' + error.message); setGuardando(false); return }

    // Si hay proveedor vinculado: registrar pago en historial del proveedor
    if (proveedorGastoId && data) {
      const metodoPagoProveedor = metodo === 'efectivo' ? 'efectivo'
        : metodo === 'transferencia' ? 'transferencia' : 'otro'

      await supabase.from('pagos_proveedores').insert({
        proveedor_id: proveedorGastoId,
        monto: montoNum,
        metodo: metodoPagoProveedor,
        gasto_id: (data as unknown as Gasto).id,
        notas: concepto.trim(),
      })

      // Reducir deuda del proveedor (ajuste atómico vía RPC)
      const { data: nuevaDeuda } = await supabase.rpc('ajustar_deuda_marca', { p_marca_id: proveedorGastoId, p_delta: -montoNum })
      setMarcas(prev => prev.map(m => m.id === proveedorGastoId ? { ...m, deuda_total: nuevaDeuda ?? Math.max(0, (m.deuda_total || 0) - montoNum) } : m))
    }

    setGastos(prev => [data as unknown as Gasto, ...prev])
    setConcepto('')
    setMonto('')
    setNotas('')
    setCategoriaId('')
    setProveedorGastoId('')
    setFuentePago('caja_hoy')
    toast.success(proveedorGastoId ? 'Gasto registrado y pago enviado al proveedor' : 'Gasto registrado')
    setGuardando(false)
    cargarBar()
    cargarPie()
  }

  async function eliminarGasto(id: string) {
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar: ' + error.message); return }
    setGastos(prev => prev.filter(g => g.id !== id))
    toast.success('Gasto eliminado')
    cargarBar()
    cargarPie()
  }

  // Crear grupo (sin padre)
  async function crearGrupo() {
    if (!nuevoGrupoNombre.trim()) { toast.error('Ingresá un nombre para el grupo'); return }
    setGuardandoCat(true)
    const { data, error } = await supabase
      .from('categorias_gastos')
      .insert({ nombre: nuevoGrupoNombre.trim(), color: elegirColor() })
      .select().single()
    if (error) { toast.error('Error al crear grupo: ' + error.message); setGuardandoCat(false); return }
    setCategorias(prev => [...prev, data as CategoriaGasto].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setNuevoGrupoNombre('')
    setGuardandoCat(false)
    toast.success('Grupo creado')
  }

  // Crear subcategoría (con padre)
  async function crearSubcategoria(padreId: string) {
    if (!nuevaSubNombre.trim()) { toast.error('Ingresá un nombre'); return }
    setGuardandoCat(true)
    const { data, error } = await supabase
      .from('categorias_gastos')
      .insert({ nombre: nuevaSubNombre.trim(), color: elegirColor(), padre_id: padreId })
      .select().single()
    if (error) { toast.error('Error al crear subcategoría: ' + error.message); setGuardandoCat(false); return }
    setCategorias(prev => [...prev, data as CategoriaGasto].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setNuevaSubNombre('')
    setNuevaSubPadreId(null)
    setGuardandoCat(false)
    toast.success('Subcategoría creada')
  }

  async function eliminarCategoria(id: string) {
    const { error } = await supabase.from('categorias_gastos').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar: ' + error.message); return }
    setCategorias(prev => prev.filter(c => c.id !== id && c.padre_id !== id))
    toast.success('Categoría eliminada')
  }

  function toggleGrupo(id: string) {
    setGruposExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDesglose(id: string) {
    setDesgloseExpandido(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Cálculos derivados
  const totalGastos = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos])
  const neto = totalVentas - totalGastos

  // BarChart data (independiente)
  const gastosPorDia = useMemo(() => {
    const porDia: Record<string, number> = {}
    for (const g of gastosBar) {
      porDia[g.fecha] = (porDia[g.fecha] || 0) + g.monto
    }
    return Object.entries(porDia)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({ fecha: fecha.slice(5), total }))
  }, [gastosBar])

  // PieChart data (independiente)
  const gastosPorMetodo = useMemo(() => {
    const porMet: Record<string, number> = {}
    for (const g of gastosPieData) {
      const m = normalizarMetodo(g.metodo_pago)
      porMet[m] = (porMet[m] || 0) + g.monto
    }
    return Object.entries(porMet)
      .filter(([, v]) => v > 0)
      .map(([metodo, total]) => ({ metodo: METODO_CONFIG[metodo as Gasto['metodo_pago']]?.label || metodo, total }))
      .sort((a, b) => b.total - a.total)
  }, [gastosPieData])

  const PIE_COLORS = ['#4EC3BD', '#60a5fa', '#8b5cf6', '#fb923c']

  // Desglose por categoría con agrupación por padre
  const desgloseData = useMemo(() => {
    const totalesPorCat = new Map<string, number>()
    let sinCat = 0
    for (const g of gastos) {
      if (g.categoria_id) {
        totalesPorCat.set(g.categoria_id, (totalesPorCat.get(g.categoria_id) || 0) + g.monto)
      } else {
        sinCat += g.monto
      }
    }

    const gruposConTotal: { padre: CategoriaGasto; total: number; hijos: { cat: CategoriaGasto; total: number }[] }[] = []
    for (const padre of gruposRaiz) {
      const hijosArr = subcategorias.get(padre.id) || []
      const hijos = hijosArr
        .map(cat => ({ cat, total: totalesPorCat.get(cat.id) || 0 }))
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total)
      const totalGrupo = hijosArr.length > 0
        ? hijos.reduce((s, h) => s + h.total, 0)
        : (totalesPorCat.get(padre.id) || 0)
      if (totalGrupo > 0) {
        gruposConTotal.push({ padre, total: totalGrupo, hijos })
      }
    }
    gruposConTotal.sort((a, b) => b.total - a.total)

    const maxTotal = Math.max(
      ...gruposConTotal.map(g => g.total),
      sinCat || 0,
      1
    )

    return { gruposConTotal, sinCategoria: sinCat, maxTotal }
  }, [gastos, gruposRaiz, subcategorias])

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-gray-800">Gastos</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {(['hoy', 'semana', 'mes', 'fecha'] as Periodo[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                  periodo === p ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-500 hover:border-teal-300 bg-white'
                )}
              >
                {periodoLabel[p]}
              </button>
            ))}
            {periodo === 'fecha' && (
              <Input type="date" value={fechaCustom} onChange={e => setFechaCustom(e.target.value)}
                className="h-7 text-xs w-36" />
            )}
          </div>
          <Button variant="outline" onClick={() => setMostrarCats(true)} className="gap-2 text-gray-600 h-8 text-xs">
            <Settings2 size={13} /> Categorías
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-5">

          {/* Formulario nuevo gasto */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Plus size={15} className="text-teal-500" /> Registrar gasto
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs text-gray-500">Concepto *</Label>
                <Input value={concepto} onChange={e => setConcepto(e.target.value)}
                  placeholder="Ej: Factura luz octubre" className="mt-1" autoFocus maxLength={200} />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Monto *</Label>
                <Input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                  placeholder="0" className="mt-1" />
              </div>

              <div>
                <Label className="text-xs text-gray-500">Categoría</Label>
                <select
                  value={categoriaId}
                  onChange={e => { setCategoriaId(e.target.value); setProveedorGastoId('') }}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Sin categoría</option>
                  {gruposRaiz.map(grupo => {
                    const hijos = subcategorias.get(grupo.id) || []
                    if (hijos.length > 0) {
                      return (
                        <optgroup key={grupo.id} label={grupo.nombre}>
                          {hijos.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.nombre}</option>
                          ))}
                        </optgroup>
                      )
                    }
                    return <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
                  })}
                </select>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Fecha</Label>
                <Input type="date" value={fechaGasto} onChange={e => setFechaGasto(e.target.value)} className="mt-1" />
              </div>

              <div className="col-span-2">
                <Label className="text-xs text-gray-500 mb-1.5 block">Método de pago</Label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(METODO_CONFIG) as [Gasto['metodo_pago'], typeof METODO_CONFIG[Gasto['metodo_pago']]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setMetodo(key)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                        metodo === key ? cfg.color : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fuente de pago — solo cuando método es efectivo */}
              {metodo === 'efectivo' && (
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500 mb-1.5 block">¿De dónde sale la plata?</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFuentePago('caja_hoy')}
                      className={cn(
                        'flex flex-col items-start px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                        fuentePago === 'caja_hoy'
                          ? 'bg-green-50 border-green-400 text-green-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      <span>Caja de hoy</span>
                      <span className="font-normal text-[10px] opacity-70">Descuenta del efectivo del día</span>
                    </button>
                    <button
                      onClick={() => setFuentePago('retiro_anterior')}
                      className={cn(
                        'flex flex-col items-start px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
                        fuentePago === 'retiro_anterior'
                          ? 'bg-amber-50 border-amber-400 text-amber-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      <span>Retiro anterior</span>
                      <span className="font-normal text-[10px] opacity-70">Plata retirada en días previos</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Proveedor vinculado — solo visible cuando categoría es Insumos */}
              {mostrarSelectorProveedor && (
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">Proveedor</Label>
                  <select
                    value={proveedorGastoId}
                    onChange={e => setProveedorGastoId(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  >
                    <option value="">Sin proveedor</option>
                    {marcas.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                  {proveedorGastoId && (
                    <p className="text-[10px] text-teal-600 mt-1">
                      El pago quedará registrado en el historial de este proveedor y reducirá su deuda.
                    </p>
                  )}
                </div>
              )}

              <div className="col-span-2">
                <Label className="text-xs text-gray-500">Notas (opcional)</Label>
                <Input value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Algún detalle adicional..." className="mt-1" />
              </div>
            </div>

            <Button
              onClick={agregarGasto}
              disabled={guardando}
              className="w-full mt-4 bg-teal-500 hover:bg-teal-600 gap-2 h-10"
            >
              <Plus size={16} /> {guardando ? 'Guardando...' : 'Agregar gasto'}
            </Button>
          </div>

          {/* Stats del período */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Gastos</p>
              <p className="text-xl font-bold text-red-500">{formatPrecio(totalGastos)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Ventas</p>
              <p className="text-xl font-bold text-teal-600">{formatPrecio(totalVentas)}</p>
            </div>
            <div className={cn(
              'rounded-2xl border shadow-sm p-4 text-center',
              neto >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            )}>
              <p className="text-xs text-gray-400 mb-1">Neto</p>
              <div className="flex items-center justify-center gap-1">
                {neto >= 0
                  ? <TrendingUp size={15} className="text-green-600" />
                  : <TrendingDown size={15} className="text-red-500" />}
                <p className={cn('text-xl font-bold', neto >= 0 ? 'text-green-600' : 'text-red-500')}>
                  {formatPrecio(Math.abs(neto))}
                </p>
              </div>
            </div>
          </div>

          {/* Gráficos con filtros independientes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Gastos por día */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-700">Gastos por día</p>
                <MiniPeriodoSelector value={periodoBar} onChange={setPeriodoBar} />
              </div>
              {gastosPorDia.length > 1 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={gastosPorDia} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [formatPrecio(Number(v)), 'Gastos']} contentStyle={{ borderRadius: '12px', border: '1px solid #f0f0f0', fontSize: 12 }} />
                    <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={24} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-sm text-gray-300">
                  {gastosPorDia.length === 1 ? 'Solo 1 día con gastos' : 'Sin datos en este período'}
                </div>
              )}
            </div>

            {/* Gastos por método */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-700">Por método</p>
                <MiniPeriodoSelector value={periodoPie} onChange={setPeriodoPie} />
              </div>
              {gastosPorMetodo.length > 0 ? (
                <>
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={gastosPorMetodo} dataKey="total" nameKey="metodo"
                          cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                          {gastosPorMetodo.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatPrecio(Number(v))} contentStyle={{ borderRadius: '12px', border: '1px solid #f0f0f0', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {gastosPorMetodo.map((m, i) => (
                      <div key={m.metodo} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {m.metodo}: {formatPrecio(m.total)}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[160px] flex items-center justify-center text-sm text-gray-300">Sin datos</div>
              )}
            </div>
          </div>

          {/* Desglose por categoría */}
          {(desgloseData.gruposConTotal.length > 0 || desgloseData.sinCategoria > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Por categoría</p>
              <div className="space-y-2">
                {desgloseData.gruposConTotal.map(({ padre, total, hijos }) => (
                  <div key={padre.id}>
                    <button
                      onClick={() => toggleDesglose(padre.id)}
                      className="w-full flex items-center gap-3 py-1.5 hover:bg-gray-50 rounded-lg px-1 transition-colors"
                    >
                      {desgloseExpandido.has(padre.id)
                        ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                        : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: padre.color }} />
                      <span className="text-sm font-semibold text-gray-700 w-28 shrink-0 truncate text-left">{padre.nombre}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(total / desgloseData.maxTotal) * 100}%`, backgroundColor: padre.color }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 shrink-0 w-24 text-right">{formatPrecio(total)}</span>
                    </button>
                    {desgloseExpandido.has(padre.id) && hijos.length > 0 && (
                      <div className="ml-8 mt-1 space-y-1.5 mb-2">
                        {hijos.map(({ cat, total: subTotal }) => (
                          <div key={cat.id} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color, opacity: 0.7 }} />
                            <span className="text-xs text-gray-500 w-24 shrink-0 truncate">{cat.nombre}</span>
                            <div className="flex-1 h-1.5 bg-gray-50 rounded-full overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{ width: `${(subTotal / total) * 100}%`, backgroundColor: cat.color, opacity: 0.6 }} />
                            </div>
                            <span className="text-xs font-medium text-gray-500 shrink-0 w-20 text-right">{formatPrecio(subTotal)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {desgloseData.sinCategoria > 0 && (
                  <div className="flex items-center gap-3 pl-6">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                    <span className="text-sm text-gray-400 w-28 shrink-0">Sin categoría</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-300 rounded-full" style={{ width: `${(desgloseData.sinCategoria / desgloseData.maxTotal) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-500 shrink-0 w-24 text-right">{formatPrecio(desgloseData.sinCategoria)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lista de gastos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-700">
                {gastos.length > 0 ? `${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} — ${periodoLabel[periodo].toLowerCase()}` : `Sin gastos — ${periodoLabel[periodo].toLowerCase()}`}
              </p>
            </div>
            {loading ? (
              <div className="py-12 text-center text-gray-300 text-sm">Cargando...</div>
            ) : gastos.length === 0 ? (
              <div className="py-12 text-center text-gray-300 text-sm">No hay gastos en este período</div>
            ) : (
              <div>
                {gastos.map((gasto, i) => {
                  const cfg = METODO_CONFIG[normalizarMetodo(gasto.metodo_pago)]
                  const fechaDisplay = new Date(gasto.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                    day: 'numeric', month: 'short',
                  })
                  return (
                    <div key={gasto.id} className={cn('flex items-center gap-3 px-5 py-3.5', i > 0 && 'border-t border-gray-50')}>
                      <div className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: gasto.categoria?.color || '#d1d5db' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{gasto.concepto}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{fechaDisplay}</span>
                          {gasto.categoria && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: gasto.categoria.color + '20', color: gasto.categoria.color }}>
                              {gasto.categoria.nombre}
                            </span>
                          )}
                          {gasto.notas && (
                            <span className="text-xs text-gray-400 truncate max-w-[120px]">{gasto.notas}</span>
                          )}
                        </div>
                      </div>
                      {cfg && (
                        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium shrink-0', cfg.color)}>
                          {cfg.icon}
                        </span>
                      )}
                      <p className="font-bold text-gray-800 shrink-0 w-24 text-right">{formatPrecio(gasto.monto)}</p>
                      {esAdmin && (
                        <button
                          onClick={() => eliminarGasto(gasto.id)}
                          className="text-gray-200 hover:text-red-400 transition-colors shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Categorías */}
      {mostrarCats && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Settings2 size={16} className="text-teal-500" /> Categorías de gastos
              </h2>
              <button onClick={() => setMostrarCats(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-2 overflow-y-auto flex-1">
              {gruposRaiz.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin grupos todavía. Creá uno abajo.</p>
              )}

              {gruposRaiz.map(padre => {
                const hijos = subcategorias.get(padre.id) || []
                const expandido = gruposExpandidos.has(padre.id)
                return (
                  <div key={padre.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                      <button onClick={() => toggleGrupo(padre.id)} className="flex items-center gap-3 flex-1 min-w-0">
                        {expandido
                          ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                          : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                        <div className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm" style={{ backgroundColor: padre.color }} />
                        <span className="text-sm font-semibold text-gray-700 flex-1 text-left truncate">{padre.nombre}</span>
                        <span className="text-xs text-gray-400 shrink-0">{hijos.length} sub</span>
                      </button>
                      <button
                        onClick={() => eliminarCategoria(padre.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                        title="Eliminar grupo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {expandido && (
                      <div className="border-t border-gray-50 bg-gray-50/50">
                        {hijos.map(sub => (
                          <div key={sub.id} className="flex items-center gap-3 px-4 pl-10 py-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                            <span className="text-sm text-gray-600 flex-1">{sub.nombre}</span>
                            <button
                              onClick={() => eliminarCategoria(sub.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        {/* Input para agregar subcategoría — estado independiente */}
                        <div className="flex items-center gap-2 px-4 pl-10 py-2 border-t border-gray-100">
                          <Input
                            value={nuevaSubPadreId === padre.id ? nuevaSubNombre : ''}
                            onFocus={() => { setNuevaSubPadreId(padre.id); setNuevaSubNombre('') }}
                            onChange={e => { setNuevaSubPadreId(padre.id); setNuevaSubNombre(e.target.value) }}
                            placeholder="Nueva subcategoría..."
                            className="flex-1 h-7 text-xs"
                            onKeyDown={e => { if (e.key === 'Enter') crearSubcategoria(padre.id) }}
                          />
                          <Button
                            size="sm"
                            onClick={() => crearSubcategoria(padre.id)}
                            disabled={guardandoCat}
                            className="h-7 px-2 bg-teal-500 hover:bg-teal-600"
                          >
                            <Plus size={12} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Separator />

            {/* Crear nuevo grupo — estado INDEPENDIENTE */}
            <div className="px-5 py-4 space-y-3 shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nuevo grupo</p>
              <div className="flex gap-2">
                <Input
                  value={nuevoGrupoNombre}
                  onChange={e => setNuevoGrupoNombre(e.target.value)}
                  placeholder="Ej: Personal, Local..."
                  className="flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') crearGrupo() }}
                />
              </div>
              <Button
                onClick={crearGrupo}
                disabled={guardandoCat}
                className="w-full bg-teal-500 hover:bg-teal-600 gap-2 h-9"
              >
                <Plus size={14} /> {guardandoCat ? 'Creando...' : 'Crear grupo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
