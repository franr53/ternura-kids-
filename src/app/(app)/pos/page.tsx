'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, MetodoPago, Variante, Producto } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, ShoppingCart, ChevronRight, ChevronDown, Clock, User, Banknote, Smartphone, CreditCard, HandCoins, Calendar } from 'lucide-react'
import { formatPrecio, cn } from '@/lib/utils'
import NuevaVentaDialog from '@/components/pos/nueva-venta-dialog'

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
  variante?: { talle: string; producto?: { nombre: string } }
}

type VentaHoy = {
  id: string
  total: number
  descuento: number
  creado_en: string
  cliente?: { nombre: string } | null
  venta_items?: VentaItem[]
  venta_pagos?: { metodo: string; monto: number }[]
}

const METODO_ICON: Record<string, React.ReactNode> = {
  efectivo:      <Banknote size={12} />,
  transferencia: <Smartphone size={12} />,
  debito:        <CreditCard size={12} />,
  credito:       <CreditCard size={12} />,
  fiado:         <HandCoins size={12} />,
}
const METODO_COLOR: Record<string, string> = {
  efectivo:      'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  debito:        'bg-indigo-100 text-indigo-700',
  credito:       'bg-purple-100 text-purple-700',
  fiado:         'bg-orange-100 text-orange-700',
}

export default function PosPage() {
  const supabase = createClient()
  const [ventas, setVentas] = useState<VentaHoy[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarNuevaVenta, setMostrarNuevaVenta] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [fechaCustom, setFechaCustom] = useState(() => new Date().toISOString().split('T')[0])

  const cargarVentas = useCallback(async () => {
    setLoading(true)
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
      // fecha custom: rango del día seleccionado
      const [y, m, d] = fechaCustom.split('-').map(Number)
      desde.setFullYear(y, m - 1, d)
      desde.setHours(0, 0, 0, 0)
    }

    let query = supabase
      .from('ventas')
      .select('id, total, descuento, creado_en, cliente:clientes(nombre), venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre))), venta_pagos(metodo, monto)')
      .eq('estado', 'completada')
      .gte('creado_en', desde.toISOString())
      .order('creado_en', { ascending: false })

    if (periodo === 'fecha') {
      const hasta = new Date(desde)
      hasta.setHours(23, 59, 59, 999)
      query = query.lte('creado_en', hasta.toISOString())
    }

    const { data } = await query
    setVentas((data as unknown as VentaHoy[]) || [])
    setLoading(false)
  }, [supabase, periodo, fechaCustom])

  useEffect(() => { cargarVentas() }, [cargarVentas])

  const totalDia = ventas.reduce((s, v) => s + v.total, 0)
  const cantVentas = ventas.length
  const promedio = cantVentas > 0 ? totalDia / cantVentas : 0

  const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Punto de Venta</h1>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{fechaHoy}</p>
        </div>
        <Button
          onClick={() => setMostrarNuevaVenta(true)}
          className="bg-teal-500 hover:bg-teal-600 gap-2 h-10 px-5 font-semibold shadow-sm shadow-teal-100"
        >
          <Plus size={16} /> Nueva venta
        </Button>
      </div>

      {/* Filtros de período */}
      <div className="px-6 pt-3 pb-0 flex items-center gap-2 shrink-0 flex-wrap">
        {(['hoy', 'semana', 'mes', 'fecha'] as Periodo[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={cn(
              'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
              periodo === p
                ? 'bg-teal-500 border-teal-500 text-white'
                : 'border-gray-200 text-gray-500 hover:border-teal-300 bg-white'
            )}
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
      </div>

      {/* Stats del período */}
      <div className="px-6 py-4 grid grid-cols-3 gap-3 shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-medium text-gray-400 mb-1">
            {periodo === 'hoy' ? 'Total del día' : periodo === 'semana' ? 'Total semana' : periodo === 'mes' ? 'Total mes' : 'Total del día'}
          </p>
          <p className="text-2xl font-bold text-teal-600 leading-none">{formatPrecio(totalDia)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-medium text-gray-400 mb-1">Ventas</p>
          <p className="text-2xl font-bold text-gray-800 leading-none">{cantVentas}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
          <p className="text-xs font-medium text-gray-400 mb-1">Promedio</p>
          <p className="text-2xl font-bold text-gray-800 leading-none">{formatPrecio(promedio)}</p>
        </div>
      </div>

      {/* Lista de ventas */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-300">
            <p className="text-sm">Cargando...</p>
          </div>
        ) : ventas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300 select-none">
            <ShoppingCart size={56} strokeWidth={1} />
            <p className="text-base font-medium mt-4 text-gray-400">Sin ventas hoy todavía</p>
            <p className="text-sm text-gray-300 mt-1">Tocá "Nueva venta" para empezar</p>
            <Button
              onClick={() => setMostrarNuevaVenta(true)}
              className="mt-5 bg-teal-500 hover:bg-teal-600 gap-2"
            >
              <Plus size={15} /> Nueva venta
            </Button>
          </div>
        ) : (
          ventas.map((venta) => {
            const abierta = expandida === venta.id
            const items = venta.venta_items || []
            const pagos = venta.venta_pagos || []
            const hora = new Date(venta.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            const resumen = items
              .slice(0, 2)
              .map(it => it.variante?.producto?.nombre || '—')
              .join(', ') + (items.length > 2 ? ` +${items.length - 2} más` : '')

            return (
              <div
                key={venta.id}
                className={cn(
                  'bg-white rounded-2xl border transition-all shadow-sm overflow-hidden',
                  abierta ? 'border-teal-200' : 'border-gray-100'
                )}
              >
                {/* Fila principal */}
                <button
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandida(abierta ? null : venta.id)}
                >
                  {/* Hora */}
                  <div className="flex items-center gap-1.5 text-gray-400 shrink-0 w-14">
                    <Clock size={12} />
                    <span className="text-xs font-mono">{hora}</span>
                  </div>

                  {/* Cliente + resumen artículos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {venta.cliente ? (
                        <>
                          <User size={12} className="text-teal-500 shrink-0" />
                          <span className="text-sm font-semibold text-gray-800 truncate">{venta.cliente.nombre}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">Sin cliente</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{resumen || `${items.length} artículo${items.length !== 1 ? 's' : ''}`}</p>
                  </div>

                  {/* Métodos de pago */}
                  <div className="flex gap-1 shrink-0">
                    {pagos.map((p, i) => (
                      <span key={i} className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', METODO_COLOR[p.metodo] || 'bg-gray-100 text-gray-500')}>
                        {METODO_ICON[p.metodo]}
                        {pagos.length > 1 && <span>{formatPrecio(p.monto)}</span>}
                      </span>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className="font-bold text-gray-800 text-sm">{formatPrecio(venta.total)}</p>
                    {venta.descuento > 0 && (
                      <p className="text-[10px] text-teal-500">−{formatPrecio(venta.descuento)}</p>
                    )}
                  </div>

                  {abierta ? <ChevronDown size={15} className="text-gray-300 shrink-0" /> : <ChevronRight size={15} className="text-gray-300 shrink-0" />}
                </button>

                {/* Detalle de artículos */}
                {abierta && items.length > 0 && (
                  <div className="border-t border-gray-50 px-4 py-3 bg-teal-50/30">
                    <div className="space-y-2">
                      {items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 font-medium">
                              {item.variante?.producto?.nombre || '—'}
                            </span>
                            {item.variante?.talle && (
                              <span className="text-xs text-gray-400 ml-2">T. {item.variante.talle}</span>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            {item.cantidad > 1 ? (
                              <div>
                                <p className="text-xs text-gray-400">{item.cantidad} × {formatPrecio(item.precio_unitario)}</p>
                                <p className="text-sm font-semibold text-gray-800">{formatPrecio(item.precio_unitario * item.cantidad)}</p>
                              </div>
                            ) : (
                              <p className="text-sm font-semibold text-gray-800">{formatPrecio(item.precio_unitario)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-2 border-t border-teal-100 flex justify-between">
                      <span className="text-xs text-gray-400">{items.length} artículo{items.length !== 1 ? 's' : ''}</span>
                      <span className="text-sm font-bold text-teal-700">{formatPrecio(venta.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Botón flotante cuando hay ventas */}
      {ventas.length > 0 && (
        <div className="fixed bottom-6 right-6">
          <button
            onClick={() => setMostrarNuevaVenta(true)}
            className="w-14 h-14 bg-teal-500 hover:bg-teal-600 text-white rounded-full shadow-lg shadow-teal-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          >
            <Plus size={24} />
          </button>
        </div>
      )}

      {mostrarNuevaVenta && (
        <NuevaVentaDialog
          onCerrar={() => setMostrarNuevaVenta(false)}
          onVentaCompletada={() => {
            setMostrarNuevaVenta(false)
            cargarVentas()
          }}
        />
      )}
    </div>
  )
}
