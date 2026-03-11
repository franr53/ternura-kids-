'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { TrendingUp, Users, Package, ShoppingCart, AlertCircle, ArrowUpRight, Tag } from 'lucide-react'
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
  Efectivo: '#4EC3BD', Transferencia: '#60a5fa', Débito: '#fb923c',
  Crédito: '#8b5cf6', Fiado: '#f87171',
}

type Periodo = 'semana' | 'mes' | 'año'

function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
      <span className="text-teal-700 text-xs font-bold" style={{ fontFamily: 'var(--font-display)' }}>{initials}</span>
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
  const [paraLiquidar, setParaLiquidar] = useState(0)
  const [margenPromedio, setMargenPromedio] = useState<number | null>(null)

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

      const mesActual = hoy.getMonth() + 1
      const esVerano = mesActual >= 10 || mesActual <= 3
      const temporadaFuera = esVerano ? 'invierno' : 'verano'

      const [
        { data: ventasHoyData },
        { data: ventasMesData },
        { data: deudoresData },
        { data: sinStockData },
        { data: ventasDiaData },
        { data: pagosData },
        { data: topData },
        { data: deudoresTop },
        { data: liquidarData },
        { data: productosMargen },
      ] = await Promise.all([
        supabase.from('ventas').select('total').eq('estado', 'completada').gte('creado_en', `${inicioHoy}T00:00:00`),
        supabase.from('ventas').select('total').eq('estado', 'completada').gte('creado_en', `${inicioMes}T00:00:00`),
        supabase.from('clientes').select('id').gt('deuda_total', 0),
        supabase.from('variantes').select('id').eq('stock', 0),
        supabase.from('ventas').select('creado_en, total').eq('estado', 'completada').gte('creado_en', `${desdeStr}T00:00:00`).order('creado_en'),
        supabase.from('venta_pagos').select('metodo, monto').gte('created_at', `${inicioMes}T00:00:00`),
        supabase.from('venta_items').select('cantidad, variante:variantes(producto:productos(nombre))').gte('created_at', `${inicioMes}T00:00:00`),
        supabase.from('clientes').select('id, nombre, deuda_total').gt('deuda_total', 0).order('deuda_total', { ascending: false }).limit(5),
        supabase.from('productos').select('id').eq('temporada', temporadaFuera).eq('activo', true),
        supabase.from('productos').select('precio_costo, precio_venta').eq('activo', true).gt('precio_venta', 0).gt('precio_costo', 0),
      ])

      setVentasHoy(ventasHoyData?.reduce((s, v) => s + v.total, 0) || 0)
      setVentasMes(ventasMesData?.reduce((s, v) => s + v.total, 0) || 0)
      setClientesConDeuda(deudoresData?.length || 0)
      setSinStock(sinStockData?.length || 0)
      setTopDeudores((deudoresTop || []) as Cliente[])
      setParaLiquidar(liquidarData?.length || 0)

      if (productosMargen && productosMargen.length > 0) {
        const margenes = (productosMargen as { precio_costo: number; precio_venta: number }[])
          .map(p => (p.precio_venta - p.precio_costo) / p.precio_venta * 100)
        setMargenPromedio(margenes.reduce((s, m) => s + m, 0) / margenes.length)
      }

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
    <div className="p-6 space-y-5 max-w-7xl mx-auto bg-gray-50 min-h-full">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400 capitalize tracking-wide">{fechaHoy}</p>
          <h1
            className="text-3xl font-black text-gray-900 mt-0.5 leading-none"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.5px' }}
          >
            {saludo} 👋
          </h1>
        </div>
        <Link href="/pos">
          <button
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
              color: 'white',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 16px rgba(78,195,189,0.35)',
            }}
          >
            <ShoppingCart size={15} />
            Nueva venta
          </button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Hero: ventas hoy */}
        <div
          className="col-span-2 relative overflow-hidden rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)',
            boxShadow: '0 8px 32px rgba(78,195,189,0.3)',
          }}
        >
          <p className="text-teal-100 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-sans)' }}>
            Ventas hoy
          </p>
          {loading
            ? <Skeleton className="h-12 w-48 mt-2 bg-white/20" />
            : (
              <p
                className="text-5xl font-black text-white mt-2 leading-none"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-1px' }}
              >
                {formatPrecio(ventasHoy)}
              </p>
            )
          }
          <ShoppingCart className="absolute right-5 bottom-5 text-white opacity-10" size={72} />
        </div>

        {/* Ventas del mes */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-sans)' }}>
              Mes
            </p>
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
              <TrendingUp size={14} className="text-teal-500" />
            </div>
          </div>
          {loading
            ? <Skeleton className="h-8 w-32 mt-1" />
            : (
              <p className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPrecio(ventasMes)}
              </p>
            )
          }
          <p className="text-xs text-gray-400 mt-1">este mes</p>
          {!loading && margenPromedio !== null && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs text-gray-400">Margen promedio</p>
              <p className={`text-lg font-bold mt-0.5 ${margenPromedio < 20 ? 'text-red-500' : margenPromedio < 35 ? 'text-amber-500' : 'text-teal-500'}`}
                style={{ fontFamily: 'var(--font-display)' }}>
                {margenPromedio.toFixed(0)}%
              </p>
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-sans)' }}>
              Alertas
            </p>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertCircle size={14} className="text-amber-400" />
            </div>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><Users size={11} /> Con fiado</span>
                <span className="text-xs font-bold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">{clientesConDeuda}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><Package size={11} /> Sin stock</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sinStock > 0 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}`}>
                  {sinStock}
                </span>
              </div>
              {paraLiquidar > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-amber-600"><Tag size={11} /> Liquidar</span>
                  <span className="text-xs font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">{paraLiquidar}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chart + métodos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Área chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-700 text-sm" style={{ fontFamily: 'var(--font-sans)' }}>
              Ventas por día
            </h2>
            <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
              {(['semana', 'mes', 'año'] as Periodo[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: periodo === p ? 'white' : 'transparent',
                    color: periodo === p ? '#0d9488' : '#9ca3af',
                    boxShadow: periodo === p ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {p === 'semana' ? '7d' : p === 'mes' ? '30d' : '365d'}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={ventasPorDia} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4EC3BD" stopOpacity={0.2} />
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
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 text-sm mb-5" style={{ fontFamily: 'var(--font-sans)' }}>
            Cobros del mes
          </h2>
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : ventasPorMetodo.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
          ) : (
            <div className="space-y-4">
              {ventasPorMetodo.map(({ metodo, total }) => {
                const pct = totalMetodos > 0 ? (total / totalMetodos) * 100 : 0
                const color = METODO_COLORS[metodo] || '#9ca3af'
                return (
                  <div key={metodo}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-600 font-medium">{metodo}</span>
                      <span className="text-xs font-bold text-gray-700">{formatPrecio(total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-4">

        {/* Top deudores */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 text-sm" style={{ fontFamily: 'var(--font-sans)' }}>
              Clientes con fiado
            </h2>
            <Link href="/clientes?filtro=con_deuda">
              <button className="text-xs text-teal-500 hover:text-teal-600 flex items-center gap-1 font-semibold transition-colors">
                Ver todos <ArrowUpRight size={11} />
              </button>
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topDeudores.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin deudas pendientes</p>
            </div>
          ) : (
            <div className="space-y-1">
              {topDeudores.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <span className="text-xs text-gray-300 w-4 shrink-0 text-right" style={{ fontFamily: 'var(--font-display)' }}>{i + 1}</span>
                  <InitialsAvatar name={c.nombre} />
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate">{c.nombre}</span>
                  <span className="text-xs font-bold bg-red-50 text-red-500 px-2.5 py-1 rounded-full shrink-0">
                    {formatPrecio(c.deuda_total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top productos */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 text-sm mb-4" style={{ fontFamily: 'var(--font-sans)' }}>
            Top productos vendidos
          </h2>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : topProductos.length === 0 ? (
            <div className="py-12 text-center">
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
                    <Cell key={i} fill={i === 0 ? '#4EC3BD' : i === 1 ? '#6dd4cf' : '#a7e8e5'} />
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
