'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MetodoPago } from '@/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Pencil, CalendarDays, X, ChevronDown, ChevronRight } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'
import EditarPagoDialog, { VentaEditable } from '@/components/ventas/editar-pago-dialog'

interface VentaLista {
  id: string
  creado_en: string
  subtotal: number
  total: number
  descuento: number
  cliente_id?: string
  caja_id?: string
  cliente?: { nombre: string }
  pagos?: { metodo: string; monto: number }[]
  caja?: { id: string; estado: string }
  venta_items?: { variante_id?: string; cantidad: number; precio_unitario?: number; variante?: { talle: string; producto?: { nombre_base: string } } }[]
}

type DevolucionVenta = {
  id: string
  venta_id: string
  items_devueltos: { variante_id: string; cantidad: number; precio_unitario: number }[]
  total_devuelto: number
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transfer.', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}

const METODO_COLORS: Record<string, string> = {
  efectivo: 'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  debito: 'bg-indigo-100 text-indigo-700',
  credito: 'bg-purple-100 text-purple-700',
  fiado: 'bg-orange-100 text-orange-700',
}

type FiltroRapido = 'hoy' | '7dias' | 'mes' | 'custom'

function getRango(filtro: Exclude<FiltroRapido, 'custom'>): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = hoy.toISOString().split('T')[0]
  if (filtro === 'hoy') return { desde: hasta, hasta }
  if (filtro === '7dias') {
    const d = new Date(hoy); d.setDate(d.getDate() - 6)
    return { desde: d.toISOString().split('T')[0], hasta }
  }
  const d = new Date(hoy); d.setDate(d.getDate() - 29)
  return { desde: d.toISOString().split('T')[0], hasta }
}

function ventaAEditable(v: VentaLista): VentaEditable {
  return {
    id: v.id,
    subtotal: v.subtotal,
    total: v.total,
    descuento: v.descuento,
    cliente_id: v.cliente_id,
    caja_id: v.caja_id,
    creado_en: v.creado_en,
    pagos: (v.pagos || []).map(p => ({ metodo: p.metodo as MetodoPago, monto: p.monto })),
    caja: v.caja ? { estado: v.caja.estado } : undefined,
    venta_items: v.venta_items,
  }
}

const FILTROS: { key: FiltroRapido; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7dias', label: '7 días' },
  { key: 'mes', label: 'Mes' },
  { key: 'custom', label: 'Fechas' },
]

export default function VentasPage() {
  const supabase = createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [filtro, setFiltro] = useState<FiltroRapido>('hoy')
  const [customDesde, setCustomDesde] = useState(hoy)
  const [customHasta, setCustomHasta] = useState(hoy)
  const [busqueda, setBusqueda] = useState('')
  const [ventas, setVentas] = useState<VentaLista[]>([])
  const [loading, setLoading] = useState(false)
  const [ventaEditando, setVentaEditando] = useState<VentaLista | null>(null)
  const [devoluciones, setDevoluciones] = useState<DevolucionVenta[]>([])
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null)

  const fetchVentas = useCallback(async (desde: string, hasta: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, creado_en, subtotal, total, descuento, cliente_id, caja_id,
        cliente:clientes(nombre),
        pagos:venta_pagos(metodo, monto),
        caja:cajas(id, estado),
        venta_items(variante_id, cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre_base)))
      `)
      .eq('estado', 'completada')
      .gte('creado_en', `${desde}T00:00:00`)
      .lte('creado_en', `${hasta}T23:59:59`)
      .order('creado_en', { ascending: false })
    if (error) { setLoading(false); toast.error('Error al buscar: ' + error.message); return }
    const ventasData = (data || []) as unknown as VentaLista[]
    if (ventasData.length > 0) {
      const ids = ventasData.map(v => v.id)
      const { data: devs } = await supabase
        .from('devoluciones')
        .select('id, venta_id, items_devueltos, total_devuelto')
        .in('venta_id', ids)
      setDevoluciones((devs || []) as DevolucionVenta[])
    } else {
      setDevoluciones([])
    }
    setVentas(ventasData)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (filtro !== 'custom') {
      const { desde, hasta } = getRango(filtro)
      fetchVentas(desde, hasta)
    }
  }, [filtro, fetchVentas])

  function aplicarCustom() {
    if (!customDesde || !customHasta) { toast.error('Seleccioná las fechas'); return }
    fetchVentas(customDesde, customHasta)
  }

  const ventasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return ventas
    const q = busqueda.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return ventas.filter(v => {
      const nombre = (v.cliente?.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return nombre.includes(q)
    })
  }, [ventas, busqueda])

  const totalFacturado = ventasFiltradas.reduce((s, v) => s + v.total, 0)

  const devPorVenta = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    devoluciones.forEach(dev => {
      if (!m.has(dev.venta_id)) m.set(dev.venta_id, new Map())
      const inner = m.get(dev.venta_id)!
      dev.items_devueltos.forEach(it => inner.set(it.variante_id, (inner.get(it.variante_id) || 0) + it.cantidad))
    })
    return m
  }, [devoluciones])

  const totalDevPorVenta = useMemo(() => {
    const m = new Map<string, number>()
    devoluciones.forEach(dev => m.set(dev.venta_id, (m.get(dev.venta_id) || 0) + dev.total_devuelto))
    return m
  }, [devoluciones])

  return (
    <div className="p-4 max-w-3xl mx-auto pb-28">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Historial de ventas</h1>

      {/* Filtros rápidos */}
      <div className="flex gap-2 mb-3">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              filtro === f.key
                ? 'bg-teal-500 text-white border-teal-500'
                : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-600'
            }`}
          >
            {f.key === 'custom' && <CalendarDays size={13} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Rango personalizado */}
      {filtro === 'custom' && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Input
            type="date"
            value={customDesde}
            onChange={e => setCustomDesde(e.target.value)}
            className="h-8 text-sm w-36"
          />
          <span className="text-xs text-gray-400">→</span>
          <Input
            type="date"
            value={customHasta}
            onChange={e => setCustomHasta(e.target.value)}
            className="h-8 text-sm w-36"
          />
          <button
            onClick={aplicarCustom}
            disabled={loading}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      )}

      {/* Buscador por cliente */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Buscar por cliente..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full h-9 pl-9 pr-8 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </span>
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Resumen */}
      {ventasFiltradas.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Ventas</p>
            <p className="text-xl font-bold text-teal-600">{ventasFiltradas.length}</p>
          </div>
          <div className="flex-1 bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-teal-600">{formatPrecio(totalFacturado)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-sm text-gray-400">Cargando...</div>
      )}

      {/* Sin resultados */}
      {!loading && ventas.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          No hay ventas en ese período
        </div>
      )}
      {!loading && ventas.length > 0 && ventasFiltradas.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          No hay ventas para "{busqueda}"
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {ventasFiltradas.map(v => {
          const items = v.venta_items || []
          const devMap = devPorVenta.get(v.id)
          const totalDev = totalDevPorVenta.get(v.id) || 0
          const tieneDevolucion = totalDev > 0
          const expandida = ventaExpandida === v.id
          const resumen = items.length > 0
            ? items.slice(0, 2).map(it => it.variante?.producto?.nombre_base || '—').join(', ')
              + (items.length > 2 ? ` +${items.length - 2}` : '')
            : 'Sin detalle'
          const hora = new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const fecha = new Date(v.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

          return (
            <div key={v.id} className={`bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden ${expandida ? 'bg-teal-50/40' : ''}`}>
              <div
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setVentaExpandida(expandida ? null : v.id)}
              >
                {/* Badges izquierda */}
                <div className="shrink-0 flex flex-col gap-1 items-start">
                  <span className="text-xs bg-teal-100 text-teal-700 font-medium px-2 py-0.5 rounded-full">Compra</span>
                  {tieneDevolucion && (
                    <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">Devolución</span>
                  )}
                </div>

                {/* Contenido central */}
                <div className="flex-1 min-w-0">
                  {v.cliente?.nombre
                    ? <p className="text-sm text-gray-700 font-medium truncate">{v.cliente.nombre}</p>
                    : <p className="text-sm text-gray-700 truncate">{resumen}</p>
                  }
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fecha} {hora}
                    {v.caja?.estado === 'cerrada' && <span className="ml-2 text-amber-500">· Caja cerrada</span>}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {v.pagos?.map((p, i) => (
                      <Badge key={i} className={`text-xs border-0 ${METODO_COLORS[p.metodo] || 'bg-gray-100 text-gray-600'}`}>
                        {METODO_LABELS[p.metodo] || p.metodo} {formatPrecio(p.monto)}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Total + acciones */}
                <div className="flex items-center gap-1 shrink-0">
                  <div className="text-right">
                    {tieneDevolucion
                      ? <>
                          <p className="text-xs text-gray-400 line-through">{formatPrecio(v.total)}</p>
                          <p className="font-bold text-gray-800 text-sm">{formatPrecio(v.total - totalDev)}</p>
                        </>
                      : <p className="font-bold text-gray-800 text-sm">{formatPrecio(v.total)}</p>
                    }
                    {v.descuento > 0 && (
                      <p className="text-xs text-green-600">−{formatPrecio(v.descuento)}</p>
                    )}
                    {expandida
                      ? <ChevronDown size={13} className="text-gray-400 ml-auto mt-0.5" />
                      : <ChevronRight size={13} className="text-gray-400 ml-auto mt-0.5" />
                    }
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setVentaEditando(v) }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-teal-600 hover:bg-teal-50 transition-colors ml-1"
                    title="Editar pago"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              {/* Detalle expandido */}
              {expandida && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                  {tieneDevolucion && (
                    <div className="grid grid-cols-3 divide-x divide-gray-200 rounded-xl border border-gray-200 overflow-hidden text-xs">
                      <div className="px-3 py-2 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Compra</p>
                        <p className="font-bold text-gray-700 mt-0.5">{formatPrecio(v.total)}</p>
                      </div>
                      <div className="px-3 py-2 text-center bg-red-50">
                        <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold">Devuelto</p>
                        <p className="font-bold text-red-600 mt-0.5">{formatPrecio(totalDev)}</p>
                      </div>
                      <div className="px-3 py-2 text-center bg-green-50">
                        <p className="text-[10px] text-green-500 uppercase tracking-wide font-semibold">Quedan</p>
                        <p className="font-bold text-green-600 mt-0.5">{formatPrecio(v.total - totalDev)}</p>
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-teal-100 overflow-hidden">
                    {items.map((item, j) => {
                      const cantDevuelta = devMap?.get(item.variante_id ?? '') || 0
                      const esDevuelto = cantDevuelta > 0
                      const nombre = item.variante?.producto?.nombre_base || '—'
                      const talle = item.variante?.talle
                      const label = talle ? `${nombre} T.${talle}` : nombre
                      const precio = (item.precio_unitario || 0) * item.cantidad
                      return (
                        <div key={j} className={`flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0 ${esDevuelto ? 'bg-red-50/60' : ''}`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {tieneDevolucion && (esDevuelto
                              ? <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">↩ devuelto</span>
                              : <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">✓ queda</span>
                            )}
                            <p className={`text-sm truncate ${esDevuelto ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{label}</p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ml-3 ${esDevuelto ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                            {formatPrecio(precio)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <EditarPagoDialog
        venta={ventaEditando ? ventaAEditable(ventaEditando) : null}
        open={!!ventaEditando}
        onClose={() => setVentaEditando(null)}
        onSaved={() => {
          if (filtro !== 'custom') {
            const { desde, hasta } = getRango(filtro)
            fetchVentas(desde, hasta)
          } else {
            fetchVentas(customDesde, customHasta)
          }
        }}
      />
    </div>
  )
}
