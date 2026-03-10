'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CategoriaGasto, Gasto } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Plus, X, Settings2, Trash2, Banknote, Smartphone,
  CreditCard, TrendingUp, TrendingDown,
} from 'lucide-react'
import { formatPrecio, cn, calcularRango, Periodo } from '@/lib/utils'

const METODO_CONFIG: Record<Gasto['metodo_pago'], { label: string; icon: React.ReactNode; color: string }> = {
  efectivo:      { label: 'Efectivo',      icon: <Banknote size={13} />,   color: 'bg-green-100 border-green-400 text-green-700' },
  transferencia: { label: 'Transferencia', icon: <Smartphone size={13} />, color: 'bg-blue-100 border-blue-400 text-blue-700' },
  tarjeta:       { label: 'Tarjeta',       icon: <CreditCard size={13} />, color: 'bg-indigo-100 border-indigo-400 text-indigo-700' },
}

const periodoLabel: Record<Periodo, string> = {
  hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', fecha: 'Fecha'
}

export default function GastosPage() {
  const supabase = useRef(createClient()).current

  // Data
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])
  const [totalVentas, setTotalVentas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  // Filtros
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [fechaCustom, setFechaCustom] = useState(() => new Date().toISOString().split('T')[0])

  // Form nuevo gasto
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [metodo, setMetodo] = useState<Gasto['metodo_pago']>('efectivo')
  const [notas, setNotas] = useState('')
  const [fechaGasto, setFechaGasto] = useState(() => new Date().toISOString().split('T')[0])
  const [guardando, setGuardando] = useState(false)

  // Modal categorías
  const [mostrarCats, setMostrarCats] = useState(false)
  const [nuevaCatNombre, setNuevaCatNombre] = useState('')
  const [nuevaCatColor, setNuevaCatColor] = useState('#4EC3BD')
  const [guardandoCat, setGuardandoCat] = useState(false)

  // Cargar perfil (solo una vez)
  useEffect(() => {
    supabase.from('perfiles').select('rol').single().then(({ data, error }) => {
      if (!error) setEsAdmin(data?.rol === 'admin')
    })
  }, [supabase])

  // Cargar categorías (solo una vez, no dependen del período)
  useEffect(() => {
    supabase.from('categorias_gastos').select('*').order('nombre').then(({ data }) => {
      if (data) setCategorias(data)
    })
  }, [supabase])

  const cargar = useCallback(async () => {
    setLoading(true)
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

    setGastos((gastosData as unknown as Gasto[]) || [])
    setTotalVentas((ventasData || []).reduce((s: number, v: { total: number }) => s + v.total, 0))
    setLoading(false)
  }, [supabase, periodo, fechaCustom])

  useEffect(() => { cargar() }, [cargar])

  async function agregarGasto() {
    const montoNum = parseFloat(monto)
    if (!concepto.trim()) { toast.error('Ingresá un concepto'); return }
    if (!montoNum || montoNum <= 0) { toast.error('Ingresá un monto válido'); return }

    setGuardando(true)
    const { data, error } = await supabase.from('gastos').insert({
      concepto: concepto.trim(),
      monto: montoNum,
      categoria_id: categoriaId || null,
      metodo_pago: metodo,
      notas: notas.trim() || null,
      fecha: fechaGasto,
    }).select('*, categoria:categorias_gastos(*)').single()

    if (error) { toast.error('Error al guardar'); setGuardando(false); return }

    setGastos(prev => [data as unknown as Gasto, ...prev])
    setConcepto('')
    setMonto('')
    setNotas('')
    setCategoriaId('')
    toast.success('Gasto registrado')
    setGuardando(false)
  }

  async function eliminarGasto(id: string) {
    const { error } = await supabase.from('gastos').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setGastos(prev => prev.filter(g => g.id !== id))
    toast.success('Gasto eliminado')
  }

  async function agregarCategoria() {
    if (!nuevaCatNombre.trim()) { toast.error('Ingresá un nombre'); return }
    setGuardandoCat(true)
    const { data, error } = await supabase
      .from('categorias_gastos')
      .insert({ nombre: nuevaCatNombre.trim(), color: nuevaCatColor })
      .select().single()
    if (error) { toast.error('Error al crear categoría'); setGuardandoCat(false); return }
    setCategorias(prev => [...prev, data as CategoriaGasto].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setNuevaCatNombre('')
    setNuevaCatColor('#4EC3BD')
    setGuardandoCat(false)
    toast.success('Categoría creada')
  }

  async function eliminarCategoria(id: string) {
    const { error } = await supabase.from('categorias_gastos').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setCategorias(prev => prev.filter(c => c.id !== id))
    toast.success('Categoría eliminada')
  }

  // Cálculos derivados (memoizados)
  const totalGastos = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos])
  const neto = totalVentas - totalGastos

  const { porCategoria, sinCategoria, maxCategoria } = useMemo(() => {
    const totalesPorCat = new Map<string, number>()
    let sinCat = 0
    for (const g of gastos) {
      if (g.categoria_id) {
        totalesPorCat.set(g.categoria_id, (totalesPorCat.get(g.categoria_id) || 0) + g.monto)
      } else {
        sinCat += g.monto
      }
    }
    const porCat = categorias
      .map(cat => ({ cat, total: totalesPorCat.get(cat.id) || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
    const maxCat = Math.max(...porCat.map(x => x.total), sinCat || 0, 1)
    return { porCategoria: porCat, sinCategoria: sinCat, maxCategoria: maxCat }
  }, [gastos, categorias])

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-gray-800">Gastos</h1>
        <div className="flex items-center gap-2">
          {/* Filtros período */}
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
          {esAdmin && (
            <Button variant="outline" onClick={() => setMostrarCats(true)} className="gap-2 text-gray-600 h-8 text-xs">
              <Settings2 size={13} /> Categorías
            </Button>
          )}
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
                  placeholder="Ej: Factura luz octubre" className="mt-1" autoFocus />
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
                  onChange={e => setCategoriaId(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Fecha</Label>
                <Input type="date" value={fechaGasto} onChange={e => setFechaGasto(e.target.value)} className="mt-1" />
              </div>

              <div className="col-span-2">
                <Label className="text-xs text-gray-500 mb-1.5 block">Método de pago</Label>
                <div className="flex gap-2">
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

          {/* Desglose por categoría */}
          {porCategoria.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Por categoría</p>
              <div className="space-y-3">
                {porCategoria.map(({ cat, total }) => (
                  <div key={cat.id} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm text-gray-600 w-28 shrink-0 truncate">{cat.nombre}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(total / maxCategoria) * 100}%`, backgroundColor: cat.color }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 shrink-0 w-24 text-right">{formatPrecio(total)}</span>
                  </div>
                ))}
                {sinCategoria > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                    <span className="text-sm text-gray-400 w-28 shrink-0">Sin categoría</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-300 rounded-full" style={{ width: `${(sinCategoria / maxCategoria) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-500 shrink-0 w-24 text-right">{formatPrecio(sinCategoria)}</span>
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
                  const cfg = METODO_CONFIG[gasto.metodo_pago]
                  const fechaDisplay = new Date(gasto.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                    day: 'numeric', month: 'short',
                  })
                  return (
                    <div key={gasto.id} className={cn('flex items-center gap-3 px-5 py-3.5', i > 0 && 'border-t border-gray-50')}>
                      {/* Color categoría */}
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: gasto.categoria?.color || '#d1d5db' }}
                      />
                      {/* Info */}
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
                      {/* Método */}
                      {cfg && (
                        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium shrink-0', cfg.color)}>
                          {cfg.icon}
                        </span>
                      )}
                      {/* Monto */}
                      <p className="font-bold text-gray-800 shrink-0 w-24 text-right">{formatPrecio(gasto.monto)}</p>
                      {/* Eliminar (solo admin) */}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Settings2 size={16} className="text-teal-500" /> Categorías de gastos
              </h2>
              <button onClick={() => setMostrarCats(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
              {categorias.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin categorías todavía</p>
              )}
              {categorias.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm text-gray-700 flex-1">{cat.nombre}</span>
                  <button
                    onClick={() => eliminarCategoria(cat.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <Separator />

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nueva categoría</p>
              <div className="flex gap-2">
                <Input
                  value={nuevaCatNombre}
                  onChange={e => setNuevaCatNombre(e.target.value)}
                  placeholder="Nombre"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && agregarCategoria()}
                />
                <input
                  type="color"
                  value={nuevaCatColor}
                  onChange={e => setNuevaCatColor(e.target.value)}
                  className="w-10 h-9 rounded-md border border-gray-200 cursor-pointer p-0.5"
                  title="Color"
                />
              </div>
              <Button
                onClick={agregarCategoria}
                disabled={guardandoCat}
                className="w-full bg-teal-500 hover:bg-teal-600 gap-2 h-9"
              >
                <Plus size={14} /> {guardandoCat ? 'Creando...' : 'Crear categoría'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
