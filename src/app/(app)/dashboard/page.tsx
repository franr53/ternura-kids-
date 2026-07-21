'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area, BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Users, Package, ShoppingCart,
  ArrowUpRight, DollarSign, Receipt, AlertTriangle,
} from 'lucide-react'
import { formatPrecio, formatNombreConTalle } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'
import { Cliente } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

interface DatosDia { fecha: string; ventas: number; unidades: number; ticket: number; countVentas: number }
interface TopProducto { nombre: string; cantidad: number }

type Periodo = 'hoy' | 'semana' | 'mes' | 'trimestre'
type MetricaChart = 'ventas' | 'unidades' | 'ticket'

// Solo para el gráfico: U / Unico / Único son el mismo talle → "Único".
// No modifica los datos (etiquetas ya impresas quedan como están).
function normalizarTalleChart(talle: string | null | undefined): string | null {
  if (!talle) return null
  const t = talle.trim()
  return ['u', 'unico', 'único'].includes(t.toLowerCase()) ? 'Único' : t
}

const METRICA_CONFIG: Record<MetricaChart, { label: string; color: string; dataKey: string; formatter: (v: number) => string }> = {
  ventas: { label: 'Ventas ($)', color: '#10B981', dataKey: 'ventas', formatter: v => formatPrecio(v) },
  unidades: { label: 'Unidades', color: '#93C5FD', dataKey: 'unidades', formatter: v => `${v} uds` },
  ticket: { label: 'Ticket prom.', color: '#A78BFA', dataKey: 'ticket', formatter: v => formatPrecio(v) },
}

function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
      <span className="text-teal-700 text-xs font-bold font-display">{initials}</span>
    </div>
  )
}

function ComparativoBadge({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0) return null
  const diff = ((actual - anterior) / anterior) * 100
  const up = diff >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {`${up ? '+' : ''}${diff.toFixed(0)}%`}
    </span>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' as const },
  }),
}

interface DashboardData {
  ventasHoy: number; ventasMes: number; clientesConDeuda: number; sinStock: number
  ventasAyer: number; ticketMesAnterior: number; ticketPromedio: number
  datosPorDia: DatosDia[]
  topProductos: TopProducto[]; topDeudores: Cliente[]
  stockCritico: { nombre: string; talle: string; stock: number }[]
  ventasPorTalle: { talle: string; unidades: number }[]
}

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { mask } = usePrivacyMode()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [metricaChart, setMetricaChart] = useState<MetricaChart>('ventas')

  const { data: d, loading } = useCache<DashboardData>(`dash:${periodo}`, async () => {
    const hoy = new Date()
    const inicioHoy = hoy.toISOString().split('T')[0]
    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1)
    const inicioAyer = ayer.toISOString().split('T')[0]
    const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
    const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const inicioMesAnterior = `${mesAnt.getFullYear()}-${String(mesAnt.getMonth() + 1).padStart(2, '0')}-01`
    const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    const finMesAnteriorStr = finMesAnterior.toISOString().split('T')[0]
    const diasAtras = periodo === 'hoy' ? 1 : periodo === 'semana' ? 7 : periodo === 'mes' ? 30 : 90
    const desde = new Date(hoy); desde.setDate(desde.getDate() - diasAtras)
    const desdeStr = desde.toISOString().split('T')[0]

    const [
      { data: kpisData }, { data: ventasDiaData },
      { data: topData }, { data: deudoresTop }, { data: unidadesData },
      { data: ventasMesAntData }, { data: ventasMesAntCount }, { data: stockCriticoData },
    ] = await Promise.all([
      supabase.rpc('dashboard_kpis', { p_fecha_hoy: inicioHoy, p_inicio_mes: inicioMes, p_inicio_ayer: inicioAyer }),
      supabase.from('ventas').select('creado_en, total').eq('estado', 'completada').gte('creado_en', `${desdeStr}T00:00:00`).order('creado_en'),
      supabase.from('venta_items').select('cantidad, variante:variantes(producto:productos(nombre_base)), venta:ventas!inner(creado_en)').gte('venta.creado_en', `${inicioMes}T00:00:00`),
      supabase.from('clientes').select('id, nombre, deuda_total').gt('deuda_total', 0).order('deuda_total', { ascending: false }).limit(5),
      supabase.from('venta_items').select('cantidad, variante:variantes(talle), venta:ventas!inner(estado, creado_en)').eq('venta.estado', 'completada').gte('venta.creado_en', `${desdeStr}T00:00:00`),
      supabase.from('ventas').select('total').eq('estado', 'completada').gte('creado_en', `${inicioMesAnterior}T00:00:00`).lte('creado_en', `${finMesAnteriorStr}T23:59:59`),
      supabase.from('ventas').select('id, total').eq('estado', 'completada').gte('creado_en', `${inicioMesAnterior}T00:00:00`).lte('creado_en', `${finMesAnteriorStr}T23:59:59`),
      supabase.from('variantes').select('id, talle, stock, producto:productos(nombre_base)').gte('stock', 0).lte('stock', 3).order('stock', { ascending: true }).limit(5),
    ])

    const kpis_result = kpisData as { ventas_hoy: number; ventas_ayer: number; ventas_mes: number; count_ventas_mes: number; clientes_deuda: number; variantes_sin_stock: number } | null
    const totalMes = kpis_result?.ventas_mes || 0
    const totalMesAnt: number = ventasMesAntData?.reduce((s: number, v: { total: number }) => s + v.total, 0) ?? 0
    const countMesAnt = ventasMesAntCount?.length || 0
    const countMes = kpis_result?.count_ventas_mes || 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scData = (stockCriticoData || []).map((v: any) => ({
      nombre: v.producto?.nombre_base || 'Sin nombre', talle: v.talle || '', stock: v.stock,
    }))

    // Datos por día
    const porDiaVentas: Record<string, number> = {}
    const porDiaCount: Record<string, number> = {}
    ventasDiaData?.forEach((v: { creado_en: string; total: number }) => {
      const fecha = v.creado_en.split('T')[0]
      porDiaVentas[fecha] = (porDiaVentas[fecha] || 0) + v.total
      porDiaCount[fecha] = (porDiaCount[fecha] || 0) + 1
    })
    const porDiaUnidades: Record<string, number> = {}
    const porTalle: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(unidadesData || []).forEach((item: any) => {
      const fecha = item.venta?.creado_en?.split('T')[0]
      if (fecha) porDiaUnidades[fecha] = (porDiaUnidades[fecha] || 0) + item.cantidad
      const talle = normalizarTalleChart(item.variante?.talle)
      if (talle) porTalle[talle] = (porTalle[talle] || 0) + item.cantidad
    })
    // Top talles por volumen (barras horizontales legibles, de mayor a menor).
    const ventasPorTalleArr = Object.entries(porTalle)
      .map(([talle, unidades]) => ({ talle, unidades }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 14)
    const diasArray: DatosDia[] = []
    for (let i = diasAtras - 1; i >= 0; i--) {
      const dd = new Date(hoy); dd.setDate(dd.getDate() - i)
      const key = dd.toISOString().split('T')[0]
      const ventas = porDiaVentas[key] || 0
      const count = porDiaCount[key] || 0
      diasArray.push({ fecha: key.slice(5), ventas, unidades: porDiaUnidades[key] || 0, ticket: count > 0 ? Math.round(ventas / count) : 0, countVentas: count })
    }

    // Top productos
    const porProd: Record<string, number> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topData?.forEach((item: any) => {
      const nombre = item.variante?.producto?.nombre_base || 'Sin nombre'
      porProd[nombre] = (porProd[nombre] || 0) + item.cantidad
    })
    const sorted = Object.entries(porProd).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const topProductosArr = sorted.map(([nombre, cantidad]) => ({ nombre: nombre.length > 20 ? nombre.slice(0, 20) + '…' : nombre, cantidad }))

    return {
      ventasHoy: kpis_result?.ventas_hoy || 0,
      ventasMes: totalMes,
      clientesConDeuda: kpis_result?.clientes_deuda || 0,
      sinStock: kpis_result?.variantes_sin_stock || 0,
      ventasAyer: kpis_result?.ventas_ayer || 0,
      ticketMesAnterior: countMesAnt > 0 ? totalMesAnt / countMesAnt : 0,
      ticketPromedio: countMes > 0 ? totalMes / countMes : 0,
      datosPorDia: diasArray,
      topProductos: topProductosArr,
      topDeudores: (deudoresTop || []) as Cliente[],
      stockCritico: scData,
      ventasPorTalle: ventasPorTalleArr,
    }
  })


  const ventasHoy = d?.ventasHoy ?? 0
  const ventasMes = d?.ventasMes ?? 0
  const clientesConDeuda = d?.clientesConDeuda ?? 0
  const sinStock = d?.sinStock ?? 0
  const ventasAyer = d?.ventasAyer ?? 0
  const ticketMesAnterior = d?.ticketMesAnterior ?? 0
  const ticketPromedio = d?.ticketPromedio ?? 0
  const datosPorDia = d?.datosPorDia ?? []
  const topProductos = d?.topProductos ?? []
  const topDeudores = d?.topDeudores ?? []
  const stockCritico = d?.stockCritico ?? []
  const ventasPorTalle = d?.ventasPorTalle ?? []
  const maxTalle = useMemo(() => Math.max(0, ...ventasPorTalle.map(t => t.unidades)), [ventasPorTalle])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const fechaHoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Total unidades en período
  const totalUnidades = useMemo(() => datosPorDia.reduce((s, d) => s + d.unidades, 0), [datosPorDia])

  const mc = METRICA_CONFIG[metricaChart]


  const kpis = [
    {
      label: 'Ventas Hoy',
      value: mask(formatPrecio(ventasHoy)),
      icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      badge: ventasAyer > 0 ? <ComparativoBadge actual={ventasHoy} anterior={ventasAyer} /> : null,
      badgeLabel: 'vs ayer',
      href: null as string | null,
    },
    {
      label: 'Ticket Promedio',
      value: mask(formatPrecio(ticketPromedio)),
      icon: Receipt,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-500',
      badge: ticketMesAnterior > 0 ? <ComparativoBadge actual={ticketPromedio} anterior={ticketMesAnterior} /> : null,
      badgeLabel: 'vs mes ant.',
      href: null,
    },
    {
      label: 'Unidades',
      value: totalUnidades.toString(),
      icon: Package,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      badge: null,
      badgeLabel: periodo === 'hoy' ? 'hoy' : `últimos ${periodo === 'semana' ? '7d' : periodo === 'mes' ? '30d' : '90d'}`,
      href: null,
    },
    {
      label: 'Clientes con Deuda',
      value: clientesConDeuda.toString(),
      icon: Users,
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-500',
      badge: null,
      badgeLabel: 'activos',
      href: '/clientes?filtro=con_deuda',
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-4">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400 capitalize tracking-wide">{fechaHoy}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5 leading-none">
            {saludo}
          </h1>
        </div>
        <Link href="/pos">
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105 active:scale-95 bg-emerald-500 hover:bg-emerald-600"
            style={{ boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
          >
            <ShoppingCart size={15} />
            Nueva venta
          </button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.label}
              custom={i}
              initial="hidden"
              animate={loading ? 'hidden' : 'visible'}
              variants={cardVariants}
              whileHover={{ scale: 1.02 }}
              className={`bg-white rounded-2xl p-5 transition-shadow ${kpi.href ? 'cursor-pointer' : ''}`}
              style={{ boxShadow: 'var(--card-shadow)' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--card-hover-shadow)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--card-shadow)')}
              onClick={() => kpi.href && router.push(kpi.href)}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {kpi.label}
                </p>
                <div className={`w-8 h-8 rounded-xl ${kpi.iconBg} flex items-center justify-center`}>
                  <Icon size={14} className={kpi.iconColor} />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {kpi.value}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {kpi.badge}
                    <span className="text-xs text-gray-400">{kpi.badgeLabel}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Gráfico de ventas — ancho completo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-white rounded-2xl p-5"
        style={{ boxShadow: 'var(--card-shadow)' }}
        >
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
              {(Object.keys(METRICA_CONFIG) as MetricaChart[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMetricaChart(m)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: metricaChart === m ? 'white' : 'transparent',
                    color: metricaChart === m ? METRICA_CONFIG[m].color : '#9ca3af',
                    boxShadow: metricaChart === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {METRICA_CONFIG[m].label}
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
              {([
                { key: 'hoy' as Periodo, label: 'Hoy' },
                { key: 'semana' as Periodo, label: '7d' },
                { key: 'mes' as Periodo, label: '30d' },
                { key: 'trimestre' as Periodo, label: '90d' },
              ]).map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: periodo === p.key ? 'white' : 'transparent',
                    color: periodo === p.key ? '#10B981' : '#9ca3af',
                    boxShadow: periodo === p.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={datosPorDia} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradEmerald" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={mc.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={mc.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => mask(metricaChart === 'unidades' ? `${v}` : `$${(v / 1000).toFixed(0)}k`)}
                />
                <Tooltip
                  formatter={(v) => [mask(mc.formatter(Number(v))), mc.label]}
                  contentStyle={{ borderRadius: '12px', border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Area
                  type="monotone"
                  dataKey={mc.dataKey}
                  stroke={mc.color}
                  strokeWidth={2.5}
                  fill="url(#gradEmerald)"
                  dot={false}
                  activeDot={{ r: 4, fill: mc.color }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>


      {/* Ventas por talle — decisión de reposición */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: loading ? 0 : 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="bg-white rounded-2xl p-5"
        style={{ boxShadow: 'var(--card-shadow)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Ventas por talle
          </h2>
          <span className="text-xs text-gray-400">
            {periodo === 'hoy' ? 'hoy' : `últimos ${periodo === 'semana' ? '7d' : periodo === 'mes' ? '30d' : '90d'}`}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Talles más vendidos — para decidir qué reponer</p>
        {loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : ventasPorTalle.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin ventas</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, ventasPorTalle.length * 30)}>
            <BarChart data={ventasPorTalle} layout="vertical" margin={{ top: 0, right: 44, left: 8, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="talle" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={70} interval={0} />
              <Tooltip
                cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                formatter={(v) => [`${v} uds`, 'Vendidas']}
                labelFormatter={(l) => `Talle ${l}`}
                contentStyle={{ borderRadius: '12px', border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="unidades" radius={[0, 6, 6, 0]} barSize={16}>
                {ventasPorTalle.map((e, i) => (
                  <Cell key={i} fill={e.unidades === maxTalle ? '#10B981' : '#A7F3D0'} />
                ))}
                <LabelList dataKey="unidades" position="right" style={{ fontSize: 10, fill: '#6b7280', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>


      {/* Bottom row: Stock Crítico + Top Productos + Top Deudores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pb-4">

        {/* Stock Crítico */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: loading ? 0 : 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="bg-white rounded-2xl p-5"
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Stock Crítico
            </h2>
            <Link href="/inventario?stock=sin_stock">
              <button className="text-xs text-emerald-500 hover:text-emerald-600 flex items-center gap-1 font-semibold transition-colors">
                Ver todos <ArrowUpRight size={11} />
              </button>
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : stockCritico.length === 0 ? (
            <div className="py-8 text-center">
              <Package size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Todo en stock</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockCritico.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <AlertTriangle size={14} className={item.stock === 0 ? 'text-red-400' : 'text-amber-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{formatNombreConTalle(item.nombre, item.talle)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    item.stock === 0 ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {item.stock === 0 ? 'Sin stock' : `${item.stock} uds`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Top Productos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: loading ? 0 : 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="bg-white rounded-2xl p-5"
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Top Productos
          </h2>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : topProductos.length === 0 ? (
            <div className="py-8 text-center">
              <Package size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin ventas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProductos.map((prod, i) => {
                const max = topProductos[0]?.cantidad || 1
                const pct = (prod.cantidad / max) * 100
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate">{prod.nombre}</span>
                      <span className="text-xs font-bold text-gray-700 ml-2">{prod.cantidad}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: i === 0 ? '#10B981' : i === 1 ? '#34D399' : '#6EE7B7',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Top Deudores */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: loading ? 0 : 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="bg-white rounded-2xl p-5"
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Top Deudores
            </h2>
            <Link href="/clientes?filtro=con_deuda">
              <button className="text-xs text-emerald-500 hover:text-emerald-600 flex items-center gap-1 font-semibold transition-colors">
                Ver todos <ArrowUpRight size={11} />
              </button>
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topDeudores.length === 0 ? (
            <div className="py-8 text-center">
              <Users size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin deudas</p>
            </div>
          ) : (
            <div className="space-y-1">
              {topDeudores.map((c) => (
                <Link key={c.id} href={`/clientes/${c.id}`}>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <InitialsAvatar name={c.nombre} />
                    <span className="flex-1 text-sm text-gray-700 truncate">{c.nombre}</span>
                    <span className="text-xs font-bold bg-red-50 text-red-500 px-2.5 py-1 rounded-full shrink-0">
                      {mask(formatPrecio(c.deuda_total))}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
