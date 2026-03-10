'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { TrendingUp, Users, Package, ShoppingCart, AlertCircle, ArrowUpRight } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'
import { Cliente } from '@/types'
import Link from 'next/link'

interface VentaDia { fecha: string; total: number }
interface PagoMetodo { metodo: string; total: number }
interface TopProducto { nombre: string; cantidad: number }

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}
const METODO_COLORS: Record<string, string> = {
  Efectivo: '#4EC3BD', Transferencia: '#6366f1', Débito: '#f97316',
  Crédito: '#8b5cf6', Fiado: '#ef4444',
}

type Periodo = 'semana' | 'mes' | 'año'

function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shrink-0">
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const [ventasHoy, setVentasHoy] = useState(0)
  const [ventasMes, setVentasMes] = useState(0)
  const [clientesConDeuda, setClientesConDeuda] = useState(0)
  const [sinStock, setSinStock] = useState(0)

  const [ventasPorDia, setVentasPorDia] = useState<VentaDia[]>([])
  const [ventasPorMetodo, setVentasPorMetodo] = useState<PagoMetodo[]>([])
  const [topProductos, setTopProductos] = useState<TopProducto[]>([])
  const [topDeudores, setTopDeudores] = useState<Cliente[]>([])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      const hoy = new Date()
      const inicioHoy = hoy.toISOString().split('T')[0]
      const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
      const diasAtras = periodo === 'semana' ? 7 : periodo === 'mes' ? 30 : 365
      const desde = new Date(hoy)
      desde.setDate(desde.getDate() - diasAtras)
      const desdeStr = desde.toISOString().split('T')[0]

      const [
        { data: ventasHoyData },
        { data: ventasMesData },
        { data: deudoresData },
        { data: sinStockData },
        { data: ventasDiaData },
        { data: pagosData },
        { data: topData },
        { data: deudoresTop },
      ] = await Promise.all([
        supabase.from('ventas').select('total').eq('estado', 'completada').gte('creado_en', `${inicioHoy}T00:00:00`),
        supabase.from('ventas').select('total').eq('estado', 'completada').gte('creado_en', `${inicioMes}T00:00:00`),
        supabase.from('clientes').select('id').gt('deuda_total', 0),
        supabase.from('variantes').select('id').eq('stock', 0),
        supabase.from('ventas').select('creado_en, total').eq('estado', 'completada').gte('creado_en', `${desdeStr}T00:00:00`).order('creado_en'),
        supabase.from('venta_pagos').select('metodo, monto').gte('created_at', `${inicioMes}T00:00:00`),
        supabase.from('venta_items').select('cantidad, variante:variantes(producto:productos(nombre))').gte('created_at', `${inicioMes}T00:00:00`),
        supabase.from('clientes').select('id, nombre, deuda_total').gt('deuda_total', 0).order('deuda_total', { ascending: false }).limit(5),
      ])

      setVentasHoy(ventasHoyData?.reduce((s, v) => s + v.total, 0) || 0)
      setVentasMes(ventasMesData?.reduce((s, v) => s + v.total, 0) || 0)
      setClientesConDeuda(deudoresData?.length || 0)
      setSinStock(sinStockData?.length || 0)
      setTopDeudores((deudoresTop || []) as Cliente[])

      const porDia: Record<string, number> = {}
      ventasDiaData?.forEach(v => {
        const fecha = v.creado_en.split('T')[0]
        porDia[fecha] = (porDia[fecha] || 0) + v.total
      })
      const diasArray: VentaDia[] = []
      for (let i = diasAtras - 1; i >= 0; i--) {
        const d = new Date(hoy)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        diasArray.push({ fecha: key.slice(5), total: porDia[key] || 0 })
      }
      setVentasPorDia(diasArray)

      const porMetodo: Record<string, number> = {}
      pagosData?.forEach((p: { metodo: string; monto: number }) => {
        porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto
      })
      setVentasPorMetodo(Object.entries(porMetodo).map(([metodo, total]) => ({ metodo: METODO_LABELS[metodo] || metodo, total })).sort((a, b) => b.total - a.total))

      const porProd: Record<string, number> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topData?.forEach((item: any) => {
        const nombre = item.variante?.producto?.nombre || 'Sin nombre'
        porProd[nombre] = (porProd[nombre] || 0) + item.cantidad
      })
      const sorted = Object.entries(porProd).sort((a, b) => b[1] - a[1]).slice(0, 8)
      setTopProductos(sorted.map(([nombre, cantidad]) => ({ nombre: nombre.length > 22 ? nombre.slice(0, 22) + '…' : nombre, cantidad })))

      setLoading(false)
    }
    cargar()
  }, [periodo, supabase])

  const totalMetodos = ventasPorMetodo.reduce((s, m) => s + m.total, 0)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-gray-400 capitalize">{fechaHoy}</p>
          <h1 className="text-2xl font-bold text-gray-800 mt-0.5">{saludo} 👋</h1>
        </div>
        <Link href="/pos">
          <Button className="bg-teal-500 hover:bg-teal-600 gap-2 shadow-sm shadow-teal-200">
            <ShoppingCart size={16} /> Nueva venta
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hero KPI — Ventas hoy */}
        <div className="col-span-2 relative overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}>
          <div className="relative z-10">
            <p className="text-sm text-teal-100 font-medium">Ventas hoy</p>
            {loading
              ? <Skeleton className="h-10 w-40 mt-2 bg-white/20" />
              : <p className="text-4xl font-bold text-white mt-1 tracking-tight">{formatPrecio(ventasHoy)}</p>
            }
          </div>
          <ShoppingCart className="absolute right-4 top-1/2 -translate-y-1/2 text-white opacity-10" size={80} />
        </div>

        {/* Ventas del mes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mes</p>
            <div className="p-1.5 bg-blue-50 rounded-lg"><TrendingUp size={14} className="text-blue-500" /></div>
          </div>
          {loading
            ? <Skeleton className="h-8 w-28 mt-2" />
            : <p className="text-2xl font-bold text-gray-800 mt-2">{formatPrecio(ventasMes)}</p>
          }
          <p className="text-xs text-gray-400 mt-1">este mes</p>
        </div>

        {/* Alertas agrupadas */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Alertas</p>
            <div className="p-1.5 bg-orange-50 rounded-lg"><AlertCircle size={14} className="text-orange-400" /></div>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-20 mt-2" />
          ) : (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><Users size={12} /> Con fiado</span>
                <Badge variant="secondary" className="text-xs">{clientesConDeuda}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><Package size={12} /> Sin stock</span>
                <Badge variant={sinStock > 0 ? 'destructive' : 'secondary'} className="text-xs">{sinStock}</Badge>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gráfico ventas + métodos de pago */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Área chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Ventas por día</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['semana', 'mes', 'año'] as Periodo[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    periodo === p
                      ? 'bg-white text-teal-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={ventasPorDia} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4EC3BD" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4EC3BD" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => [formatPrecio(Number(v)), 'Ventas']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #f0f0f0', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="total" stroke="#4EC3BD" strokeWidth={2.5} fill="url(#gradVentas)" dot={false} activeDot={{ r: 4, fill: '#4EC3BD' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Métodos de pago */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">Cobros del mes</h2>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : ventasPorMetodo.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
          ) : (
            <div className="space-y-3">
              {ventasPorMetodo.map(({ metodo, total }) => {
                const pct = totalMetodos > 0 ? (total / totalMetodos) * 100 : 0
                const color = METODO_COLORS[metodo] || '#9ca3af'
                return (
                  <div key={metodo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{metodo}</span>
                      <span className="text-xs font-semibold text-gray-700">{formatPrecio(total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-gray-400 pt-1">Total: {formatPrecio(totalMetodos)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Deudores + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top deudores */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Clientes con fiado</h2>
            <Link href="/clientes?filtro=con_deuda">
              <button className="text-xs text-teal-500 hover:text-teal-600 flex items-center gap-1">
                Ver todos <ArrowUpRight size={12} />
              </button>
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topDeudores.length === 0 ? (
            <div className="py-10 text-center">
              <Users size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin deudas pendientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topDeudores.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <span className="text-xs text-gray-300 w-4 shrink-0 text-right">{i + 1}</span>
                  <InitialsAvatar name={c.nombre} />
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate">{c.nombre}</span>
                  <Badge variant="destructive" className="text-xs shrink-0">{formatPrecio(c.deuda_total)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top productos */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">Top productos vendidos</h2>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : topProductos.length === 0 ? (
            <div className="py-10 text-center">
              <Package size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin ventas en el período</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProductos} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#6b7280' }} width={120} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f0f0f0', fontSize: 12 }} />
                <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} maxBarSize={14}>
                  {topProductos.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#4EC3BD' : i === 1 ? '#5fd4cf' : '#a7e8e5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
