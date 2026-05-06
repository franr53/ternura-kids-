'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MetodoPago } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Search, Pencil } from 'lucide-react'
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
  venta_items?: { cantidad: number; variante?: { talle: string; producto?: { nombre_base: string } } }[]
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

export default function VentasPage() {
  const supabase = createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [ventas, setVentas] = useState<VentaLista[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [ventaEditando, setVentaEditando] = useState<VentaLista | null>(null)

  async function buscar() {
    if (!desde || !hasta) { toast.error('Seleccioná las fechas'); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id, creado_en, subtotal, total, descuento, cliente_id, caja_id,
        cliente:clientes(nombre),
        pagos:venta_pagos(metodo, monto),
        caja:cajas(id, estado),
        venta_items(cantidad, variante:variantes(talle, producto:productos(nombre_base)))
      `)
      .eq('estado', 'completada')
      .gte('creado_en', `${desde}T00:00:00`)
      .lte('creado_en', `${hasta}T23:59:59`)
      .order('creado_en', { ascending: false })
    if (error) { toast.error('Error al buscar: ' + error.message); setLoading(false); return }
    setVentas((data || []) as unknown as VentaLista[])
    setBuscado(true)
    setLoading(false)
  }

  const totalFacturado = ventas.reduce((s, v) => s + v.total, 0)

  return (
    <div className="p-4 max-w-3xl mx-auto pb-28">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Historial de ventas</h1>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Desde</span>
          <Input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="h-9 text-sm w-36"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Hasta</span>
          <Input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="h-9 text-sm w-36"
          />
        </div>
        <Button onClick={buscar} disabled={loading} className="h-9 bg-teal-500 hover:bg-teal-600 gap-1.5">
          <Search size={15} />
          {loading ? 'Buscando...' : 'Buscar'}
        </Button>
      </div>

      {/* Resumen */}
      {buscado && ventas.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Ventas</p>
            <p className="text-xl font-bold text-teal-600">{ventas.length}</p>
          </div>
          <div className="flex-1 bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-teal-600">{formatPrecio(totalFacturado)}</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {buscado && ventas.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">
          No hay ventas en ese período
        </div>
      )}

      <div className="space-y-2">
        {ventas.map(v => {
          const items = v.venta_items || []
          const resumen = items.length > 0
            ? items.slice(0, 2).map(it => it.variante?.producto?.nombre_base || '—').join(', ')
              + (items.length > 2 ? ` +${items.length - 2}` : '')
            : 'Sin detalle'
          const hora = new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const fecha = new Date(v.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

          return (
            <div key={v.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">{fecha} {hora}</span>
                    {v.caja?.estado === 'cerrada' && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Caja cerrada</span>
                    )}
                  </div>
                  {v.cliente?.nombre && (
                    <p className="text-sm font-semibold text-gray-700 truncate">{v.cliente.nombre}</p>
                  )}
                  <p className="text-xs text-gray-500 truncate">{resumen}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {v.pagos?.map((p, i) => (
                      <Badge key={i} className={`text-xs border-0 ${METODO_COLORS[p.metodo] || 'bg-gray-100 text-gray-600'}`}>
                        {METODO_LABELS[p.metodo] || p.metodo} {formatPrecio(p.monto)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{formatPrecio(v.total)}</p>
                    {v.descuento > 0 && (
                      <p className="text-xs text-green-600">−{formatPrecio(v.descuento)} desc.</p>
                    )}
                  </div>
                  <button
                    onClick={() => setVentaEditando(v)}
                    className="p-2 rounded-xl text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                    title="Editar pago"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <EditarPagoDialog
        venta={ventaEditando ? ventaAEditable(ventaEditando) : null}
        open={!!ventaEditando}
        onClose={() => setVentaEditando(null)}
        onSaved={buscar}
      />
    </div>
  )
}
