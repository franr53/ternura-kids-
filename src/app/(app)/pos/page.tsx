'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Cliente, MetodoPago, Variante, Producto } from '@/types'
import { Input } from '@/components/ui/input'
import { Plus, ShoppingCart, ChevronRight, ChevronDown, Clock, User, Banknote, Smartphone, CreditCard, HandCoins, Calendar, RotateCcw, Receipt } from 'lucide-react'
import { formatPrecio, formatNombreConTalle, cn } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'
import NuevaVentaDialog from '@/components/pos/nueva-venta-dialog'
import CobroDeudaDialog from '@/components/pos/cobro-deuda-dialog'
import DevolucionDialog from '@/components/pos/devolucion-dialog'
import Link from 'next/link'

type Periodo = 'hoy' | 'semana' | 'mes' | 'fecha'

export interface ItemCarrito {
  varianteId: string
  productoId?: string
  productoNombre: string
  talle: string
  codigoBarras?: string
  precio: number
  descuentoItem: number
  cantidad: number
}

type VentaItem = {
  cantidad: number
  precio_unitario: number
  variante?: { talle: string; producto?: { nombre_base: string } }
}

type VentaHoy = {
  _tipo: 'venta'
  id: string
  total: number
  descuento: number
  creado_en: string
  cliente?: { id: string; nombre: string } | null
  venta_items?: VentaItem[]
  venta_pagos?: { metodo: string; monto: number; notas?: string }[]
}

type CobroHoy = {
  _tipo: 'cobro'
  id: string
  monto: number
  metodo_pago: string | null
  notas?: string | null
  venta_id?: string | null
  creado_en: string
  cliente_id: string
  cliente?: { id: string; nombre: string } | null
}

type RegistroHoy = VentaHoy | CobroHoy

const METODO_ICON: Record<string, React.ReactNode> = {
  efectivo:      <Banknote size={12} />,
  transferencia: <Smartphone size={12} />,
  debito:        <CreditCard size={12} />,
  credito:       <CreditCard size={12} />,
  fiado:         <HandCoins size={12} />,
}
const METODO_COLOR: Record<string, string> = {
  efectivo:      'bg-teal-100 text-teal-700',
  transferencia: 'bg-blue-100 text-blue-700',
  debito:        'bg-amber-100 text-amber-700',
  credito:       'bg-purple-100 text-purple-700',
  fiado:         'bg-red-100 text-red-600',
}

export default function PosPage() {
  const supabase = createClient()
  const { mask } = usePrivacyMode()
  const [mostrarNuevaVenta, _setMostrarNuevaVenta] = useState(() => {
    try { return sessionStorage.getItem('pos:dialog') === '1' } catch { return false }
  })
  function setMostrarNuevaVenta(v: boolean) {
    _setMostrarNuevaVenta(v)
    try { if (v) sessionStorage.setItem('pos:dialog', '1'); else sessionStorage.removeItem('pos:dialog') } catch {}
  }
  const [mostrarCobroDeuda, setMostrarCobroDeuda] = useState(false)
  const [mostrarDevolucion, setMostrarDevolucion] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  type CambioSimple = { id: string; creado_en: string; diferencia: number; resolucion_diferencia?: string; total_devuelto: number; total_nuevo: number }
  const [cambiosPorVenta, setCambiosPorVenta] = useState<Record<string, CambioSimple>>({})

  type DevolucionDetalle = { items: { nombre: string; talle: string; cantidad: number; precio: number }[]; total: number; loading: boolean }
  const [devolucionDetalles, setDevolucionDetalles] = useState<Record<string, DevolucionDetalle>>({})

  async function cargarDetalleDev(cobroId: string, ventaId: string) {
    if (devolucionDetalles[cobroId]) return
    setDevolucionDetalles(prev => ({ ...prev, [cobroId]: { items: [], total: 0, loading: true } }))
    const { data } = await supabase
      .from('venta_items')
      .select('cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre_base))')
      .eq('venta_id', ventaId)
    const { data: venta } = await supabase.from('ventas').select('total').eq('id', ventaId).single()
    const items = ((data as any[]) || []).map((i: any) => ({
      nombre: i.variante?.producto?.nombre_base || '—',
      talle: i.variante?.talle || '',
      cantidad: i.cantidad,
      precio: i.precio_unitario,
    }))
    setDevolucionDetalles(prev => ({ ...prev, [cobroId]: { items, total: venta?.total || 0, loading: false } }))
  }
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [fechaCustom, setFechaCustom] = useState(() => new Date().toISOString().split('T')[0])
  const [soloFacturar, setSoloFacturar] = useState(false)

  const METODOS_FACTURAR = new Set(['transferencia', 'debito', 'credito'])

  const cacheKey = periodo === 'fecha' ? `pos:registros:fecha:${fechaCustom}` : `pos:registros:${periodo}`
  const { data: _registros, loading, refresh: cargarVentas } = useCache<RegistroHoy[]>(cacheKey, async () => {
    const desde = new Date()
    if (periodo === 'hoy') {
      desde.setHours(0, 0, 0, 0)
    } else if (periodo === 'semana') {
      desde.setDate(desde.getDate() - desde.getDay())
      desde.setHours(0, 0, 0, 0)
    } else if (periodo === 'mes') {
      desde.setDate(1)
      desde.setHours(0, 0, 0, 0)
    } else {
      const [y, m, d] = fechaCustom.split('-').map(Number)
      desde.setFullYear(y, m - 1, d)
      desde.setHours(0, 0, 0, 0)
    }

    let ventasQuery = supabase
      .from('ventas')
      .select('id, total, descuento, creado_en, cliente:clientes(id, nombre), venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre_base))), venta_pagos(metodo, monto, notas)')
      .eq('estado', 'completada')
      .gte('creado_en', desde.toISOString())
      .order('creado_en', { ascending: false })

    let cobrosQuery = supabase
      .from('fiado_movimientos')
      .select('id, monto, metodo_pago, notas, venta_id, creado_en, cliente_id')
      .eq('tipo', 'abono')
      .gte('creado_en', desde.toISOString())
      .order('creado_en', { ascending: false })

    if (periodo === 'fecha') {
      const hasta = new Date(desde)
      hasta.setHours(23, 59, 59, 999)
      ventasQuery = ventasQuery.lte('creado_en', hasta.toISOString())
      cobrosQuery = cobrosQuery.lte('creado_en', hasta.toISOString())
    }

    const [{ data: ventasData }, { data: cobrosData, error: cobrosError }] = await Promise.all([ventasQuery, cobrosQuery])

    if (cobrosError) console.error('[POS] cobros query error:', cobrosError.message)

    // Join clientes manualmente para cobros
    type RawCobro = { id: string; monto: number; metodo_pago: string | null; notas?: string; venta_id?: string | null; creado_en: string; cliente_id: string }
    const rawCobros: RawCobro[] = (cobrosData as unknown as RawCobro[]) || []
    let clientesMap: Record<string, { id: string; nombre: string }> = {}
    if (rawCobros.length > 0) {
      const ids = [...new Set(rawCobros.map(c => c.cliente_id))]
      const { data: clientesData } = await supabase.from('clientes').select('id, nombre').in('id', ids)
      if (clientesData) clientesData.forEach((cl: { id: string; nombre: string }) => { clientesMap[cl.id] = cl })
    }

    const ventas: VentaHoy[] = ((ventasData as unknown as Omit<VentaHoy, '_tipo'>[]) || []).map(v => ({ ...v, _tipo: 'venta' as const }))
    const cobros: CobroHoy[] = rawCobros.map(c => ({ ...c, _tipo: 'cobro' as const, cliente: clientesMap[c.cliente_id] || null }))

    return [...ventas, ...cobros].sort((a, b) => b.creado_en.localeCompare(a.creado_en))
  })
  const registros = _registros ?? []
  const ventas = registros.filter((r): r is VentaHoy => r._tipo === 'venta')

  useEffect(() => {
    if (ventas.length === 0) return
    const ids = ventas.map(v => v.id)
    supabase
      .from('cambios')
      .select('id, venta_original_id, creado_en, diferencia, resolucion_diferencia, total_devuelto, total_nuevo')
      .in('venta_original_id', ids)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, CambioSimple> = {}
        ;(data as (CambioSimple & { venta_original_id: string })[]).forEach(c => { map[c.venta_original_id] = c })
        setCambiosPorVenta(map)
      })
  }, [ventas])

  const registrosFiltrados = soloFacturar
    ? registros.filter(r => {
        if (r._tipo === 'cobro') return !!r.metodo_pago && METODOS_FACTURAR.has(r.metodo_pago)
        return (r.venta_pagos || []).some(p => METODOS_FACTURAR.has(p.metodo))
      })
    : registros

  const totalDia = ventas.reduce((s, v) => s + v.total, 0)
  const cantVentas = ventas.length
  const promedio = cantVentas > 0 ? totalDia / cantVentas : 0

  const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1
            className="text-xl font-black text-gray-900 leading-none"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}
          >
            Punto de Venta
          </h1>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{fechaHoy}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarDevolucion(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95 border-2 border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <RotateCcw size={16} />
            Devolución
          </button>
          <button
            onClick={() => setMostrarCobroDeuda(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95 border-2 border-teal-400 text-teal-600 bg-white hover:bg-teal-50"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <HandCoins size={16} />
            Nuevo pago
          </button>
          <button
            onClick={() => setMostrarNuevaVenta(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
              color: 'white',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 16px rgba(78,195,189,0.35)',
            }}
          >
            <Plus size={16} />
            Nueva venta
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 pt-4 pb-0 flex items-center gap-2 shrink-0 flex-wrap">
        {(['hoy', 'semana', 'mes', 'fecha'] as Periodo[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={cn(
              'text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all',
              periodo === p
                ? 'bg-teal-500 border-teal-500 text-white shadow-sm shadow-teal-100'
                : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600'
            )}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : 'Fecha'}
          </button>
        ))}
        {periodo === 'fecha' && (
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-gray-400" />
            <Input
              type="date"
              value={fechaCustom}
              onChange={e => setFechaCustom(e.target.value)}
              className="h-7 text-xs w-36 border-gray-200"
            />
          </div>
        )}
        <button
          onClick={() => setSoloFacturar(v => !v)}
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all',
            soloFacturar
              ? 'bg-violet-500 border-violet-500 text-white shadow-sm shadow-violet-100'
              : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <Receipt size={11} />
          Para facturar
        </button>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-3 gap-3 shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide" style={{ fontFamily: 'var(--font-sans)' }}>
            {periodo === 'hoy' ? 'Total del día' : periodo === 'semana' ? 'Total semana' : periodo === 'mes' ? 'Total mes' : 'Total'}
          </p>
          <p className="text-2xl font-black text-teal-600 leading-none">
            {mask(formatPrecio(totalDia))}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide" style={{ fontFamily: 'var(--font-sans)' }}>
            Ventas
          </p>
          <p className="text-2xl font-black text-gray-800 leading-none">
            {cantVentas}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide" style={{ fontFamily: 'var(--font-sans)' }}>
            Promedio
          </p>
          <p className="text-2xl font-black text-gray-800 leading-none">
            {mask(formatPrecio(promedio))}
          </p>
        </div>
      </div>

      {/* Lista de ventas */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-1.5">
            {[0,1,2].map(i => (
              <div
                key={i}
                className="w-1.5 h-5 rounded-full bg-teal-300 animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 select-none">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <ShoppingCart size={32} strokeWidth={1.5} className="text-teal-300" />
            </div>
            <p className="text-base font-bold text-gray-500 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Sin ventas todavía
            </p>
            <p className="text-sm text-gray-400 mb-5">{soloFacturar ? 'No hay transferencias ni tarjetas en este período' : 'Tocá "Nueva venta" para empezar'}</p>
            <button
              onClick={() => setMostrarNuevaVenta(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-teal-500 text-white hover:bg-teal-600 transition-colors"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Plus size={15} /> Nueva venta
            </button>
          </div>
        ) : (
          registrosFiltrados.map((registro) => {
            if (registro._tipo === 'cobro') {
              const cobro = registro
              const esDevolucion = !!cobro.venta_id || !cobro.metodo_pago
              const abiertaCobro = expandida === `cobro-${cobro.id}`
              const detDev = devolucionDetalles[cobro.id]
              const fechaCobro = new Date(cobro.creado_en)
              const hora = fechaCobro.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
              const fechaCorta = fechaCobro.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
              return (
                <div key={`cobro-${cobro.id}`} className={cn('bg-white rounded-2xl border shadow-sm overflow-hidden', esDevolucion ? (abiertaCobro ? 'border-orange-200' : 'border-orange-100') : 'border-violet-100')}>
                  <button
                    className={cn('w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors', esDevolucion ? 'hover:bg-orange-50/40' : '')}
                    onClick={() => {
                      if (!esDevolucion) return
                      const nuevo = abiertaCobro ? null : `cobro-${cobro.id}`
                      setExpandida(nuevo)
                      if (nuevo && cobro.venta_id) cargarDetalleDev(cobro.id, cobro.venta_id)
                    }}
                    style={{ cursor: esDevolucion ? 'pointer' : 'default' }}
                  >
                    <div className="flex flex-col items-center shrink-0 w-14 text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        <span className="text-xs font-mono">{hora}</span>
                      </div>
                      {periodo !== 'hoy' && (
                        <span className="text-[10px] text-gray-400 font-medium">{fechaCorta}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {cobro.cliente ? (
                          <Link
                            href={`/clientes/${cobro.cliente.id}`}
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 min-w-0 transition-colors"
                          >
                            <User size={12} className={cn('shrink-0', esDevolucion ? 'text-orange-400' : 'text-violet-400')} />
                            <span className={cn('text-sm font-semibold text-gray-800 truncate underline-offset-2 hover:underline', esDevolucion ? 'hover:text-orange-600' : 'hover:text-violet-600')}>{cobro.cliente.nombre}</span>
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400">Sin cliente</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {esDevolucion ? (
                          <>
                            <RotateCcw size={10} className="text-orange-400" />
                            <p className="text-xs text-orange-500 font-medium">Devolución</p>
                            <span className="text-xs text-gray-400">· saldo a favor del cliente</span>
                          </>
                        ) : (
                          <>
                            <Receipt size={10} className="text-violet-400" />
                            <p className="text-xs text-violet-500 font-medium">Pago de cuenta</p>
                            {cobro.notas && <span className="text-xs text-gray-400">· {cobro.notas}</span>}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      {!esDevolucion && (
                        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold', cobro.metodo_pago ? (METODO_COLOR[cobro.metodo_pago] || 'bg-gray-100 text-gray-500') : 'bg-gray-100 text-gray-500')}>
                          {cobro.metodo_pago ? METODO_ICON[cobro.metodo_pago] : null}
                        </span>
                      )}
                    </div>

                    <div className="text-right shrink-0 min-w-[80px]">
                      <p className={cn('font-bold text-sm', esDevolucion ? 'text-orange-500' : 'text-violet-600')}>{mask(formatPrecio(cobro.monto))}</p>
                      {esDevolucion && <p className="text-[10px] text-gray-400">saldo a favor</p>}
                    </div>

                    {esDevolucion && (
                      abiertaCobro
                        ? <ChevronDown size={15} className="text-orange-400 shrink-0" />
                        : <ChevronRight size={15} className="text-gray-300 shrink-0" />
                    )}
                  </button>

                  {abiertaCobro && esDevolucion && (
                    <div className="border-t border-orange-100 px-4 py-3 bg-orange-50/30">
                      {detDev?.loading && <p className="text-xs text-gray-400 py-2">Cargando venta original...</p>}
                      {detDev && !detDev.loading && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Artículos de la venta original</p>
                          {detDev.items.map((item, j) => (
                            <div key={j} className="flex items-center justify-between">
                              <span className="text-sm text-gray-700">
                                {formatNombreConTalle(item.nombre, item.talle)}
                                {item.cantidad > 1 && <span className="text-gray-400"> ×{item.cantidad}</span>}
                              </span>
                              <span className="text-sm font-semibold text-gray-700 ml-4">{mask(formatPrecio(item.precio * item.cantidad))}</span>
                            </div>
                          ))}
                          <div className="pt-2 border-t border-orange-100 space-y-1">
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Total venta original</span>
                              <span className="font-semibold">{mask(formatPrecio(detDev.total))}</span>
                            </div>
                            <div className="flex justify-between text-xs text-orange-600 font-semibold">
                              <span>Saldo a favor generado</span>
                              <span>{mask(formatPrecio(cobro.monto))}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            const venta = registro as VentaHoy
            const abierta = expandida === venta.id
            const items = venta.venta_items || []
            const pagos = venta.venta_pagos || []
            const fechaVenta = new Date(venta.creado_en)
            const hora = fechaVenta.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            const fechaCorta = fechaVenta.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
            const resumen = items
              .slice(0, 2)
              .map(it => it.variante?.producto?.nombre_base || '—')
              .join(', ') + (items.length > 2 ? ` +${items.length - 2} más` : '')

            return (
              <div
                key={venta.id}
                className={cn(
                  'bg-white rounded-2xl border transition-all shadow-sm overflow-hidden',
                  abierta ? 'border-teal-200 shadow-teal-50' : 'border-gray-100'
                )}
              >
                <button
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandida(abierta ? null : venta.id)}
                >
                  <div className="flex flex-col items-center shrink-0 w-14 text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock size={11} />
                      <span className="text-xs font-mono">{hora}</span>
                    </div>
                    {periodo !== 'hoy' && (
                      <span className="text-[10px] text-gray-400 font-medium">{fechaCorta}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {venta.cliente ? (
                        <Link
                          href={`/clientes/${venta.cliente.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1.5 min-w-0 hover:text-teal-600 transition-colors"
                        >
                          <User size={12} className="text-teal-500 shrink-0" />
                          <span className="text-sm font-semibold text-gray-800 truncate hover:text-teal-600 underline-offset-2 hover:underline">{venta.cliente.nombre}</span>
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">Sin cliente</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {resumen || `${items.length} artículo${items.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {pagos.map((p, i) => (
                      <span
                        key={i}
                        className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold', METODO_COLOR[p.metodo] || 'bg-gray-100 text-gray-500')}
                      >
                        {METODO_ICON[p.metodo]}
                        {pagos.length > 1 && <span>{mask(formatPrecio(p.monto))}</span>}
                      </span>
                    ))}
                  </div>

                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className="font-bold text-gray-800 text-sm">
                      {mask(formatPrecio(venta.total))}
                    </p>
                    {venta.descuento > 0 && (
                      <p className="text-[10px] text-teal-500">−{mask(formatPrecio(venta.descuento))}</p>
                    )}
                  </div>

                  {abierta
                    ? <ChevronDown size={15} className="text-teal-400 shrink-0" />
                    : <ChevronRight size={15} className="text-gray-300 shrink-0" />
                  }
                </button>

                {abierta && items.length > 0 && (
                  <div className="border-t border-gray-50 px-4 py-3 bg-teal-50/40">
                    <div className="space-y-2">
                      {items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 font-medium">
                              {item.variante?.talle
                                ? formatNombreConTalle(item.variante?.producto?.nombre_base || '—', item.variante.talle)
                                : (item.variante?.producto?.nombre_base || '—')}
                            </span>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            {item.cantidad > 1 ? (
                              <div>
                                <p className="text-xs text-gray-400">{item.cantidad} × {mask(formatPrecio(item.precio_unitario))}</p>
                                <p className="text-sm font-bold text-gray-800" style={{ fontFamily: 'var(--font-display)' }}>
                                  {mask(formatPrecio(item.precio_unitario * item.cantidad))}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm font-bold text-gray-800" style={{ fontFamily: 'var(--font-display)' }}>
                                {mask(formatPrecio(item.precio_unitario))}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desglose de pagos */}
                    {pagos.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-teal-100 space-y-1">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pago</p>
                        {pagos.map((p, i) => {
                          const label: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' }
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-xs text-gray-600">
                                  {METODO_ICON[p.metodo]} {label[p.metodo] || p.metodo}
                                </span>
                                <span className="text-xs font-semibold text-gray-700">{mask(formatPrecio(p.monto))}</span>
                              </div>
                              {p.notas && (
                                <p className="text-[11px] text-blue-600 ml-5">→ {p.notas}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-teal-100 flex justify-between">
                      <span className="text-xs text-gray-400">{items.length} artículo{items.length !== 1 ? 's' : ''}</span>
                      <span className="text-sm font-bold text-teal-700">
                        {mask(formatPrecio(venta.total))}
                      </span>
                    </div>
                    {cambiosPorVenta[venta.id] && (() => {
                      const c = cambiosPorVenta[venta.id]
                      const resLabel: Record<string, string> = {
                        saldo_favor: 'saldo a favor', efectivo: 'efectivo',
                        transferencia: 'transferencia', fiado: 'fiado', ninguna: 'sin diferencia',
                      }
                      return (
                        <div className="mt-2 pt-2 border-t border-teal-100 flex items-center gap-1.5 text-xs text-violet-600">
                          <RotateCcw size={11} />
                          <span className="font-medium">Cambio registrado</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{new Date(c.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                          {c.diferencia !== 0 && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-400">dif. {mask(formatPrecio(Math.abs(c.diferencia)))} en {resLabel[c.resolucion_diferencia || ''] || c.resolucion_diferencia}</span>
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {mostrarNuevaVenta && (
        <NuevaVentaDialog
          onCerrar={() => setMostrarNuevaVenta(false)}
          onVentaCompletada={() => {
            cargarVentas()
          }}
        />
      )}
      {mostrarCobroDeuda && (
        <CobroDeudaDialog
          onCerrar={() => setMostrarCobroDeuda(false)}
          onCobroCompletado={() => cargarVentas()}
        />
      )}
      {mostrarDevolucion && (
        <DevolucionDialog onCerrar={() => setMostrarDevolucion(false)} />
      )}
    </div>
  )
}
