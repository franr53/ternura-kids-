'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'
import { TrendingUp, Users, Package, ShoppingCart } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'
import { Cliente } from '@/types'

interface VentaDia { fecha: string; total: number }
interface PagoMetodo { metodo: string; total: number }
interface TopProducto { nombre: string; cantidad: number }

const COLORS = ['#ec4899', '#f97316', '#8b5cf6', '#06b6d4', '#22c55e']
const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}

type Periodo = 'semana' | 'mes' | 'año'

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

      // Ventas por día
      const porDia: Record<string, number> = {}
      ventasDiaData?.forEach(v => {
        const fecha = v.creado_en.split('T')[0]
        porDia[fecha] = (porDia[fecha] || 0) + v.total
      })
      // Llenar días vacíos
      const diasArray: VentaDia[] = []
      for (let i = diasAtras - 1; i >= 0; i--) {
        const d = new Date(hoy)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        diasArray.push({ fecha: key.slice(5), total: porDia[key] || 0 })
      }
      setVentasPorDia(diasArray)

      // Por método de pago
      const porMetodo: Record<string, number> = {}
      pagosData?.forEach((p: { metodo: string; monto: number }) => {
        porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto
      })
      setVentasPorMetodo(Object.entries(porMetodo).map(([metodo, total]) => ({ metodo: METODO_LABELS[metodo] || metodo, total })))

      // Top productos
      const porProd: Record<string, number> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topData?.forEach((item: any) => {
        const nombre = item.variante?.producto?.nombre || 'Sin nombre'
        porProd[nombre] = (porProd[nombre] || 0) + item.cantidad
      })
      const sorted = Object.entries(porProd).sort((a, b) => b[1] - a[1]).slice(0, 10)
      setTopProductos(sorted.map(([nombre, cantidad]) => ({ nombre: nombre.length > 20 ? nombre.slice(0, 20) + '…' : nombre, cantidad })))

      setLoading(false)
    }
    cargar()
  }, [periodo, supabase])

  const kpis = [
    { label: 'Ventas hoy', value: formatPrecio(ventasHoy), icon: ShoppingCart, color: 'bg-pink-100 text-pink-600' },
    { label: 'Ventas este mes', value: formatPrecio(ventasMes), icon: TrendingUp, color: 'bg-blue-100 text-blue-600' },
    { label: 'Clientes con deuda', value: clientesConDeuda.toString(), icon: Users, color: 'bg-orange-100 text-orange-600' },
    { label: 'Variantes sin stock', value: sinStock.toString(), icon: Package, color: 'bg-red-100 text-red-500' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Resumen de actividad de Ternura Kids</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${color}`}><Icon size={20} /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ventas por día */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Ventas por día</CardTitle>
            <div className="flex gap-1">
              {(['semana', 'mes', 'año'] as Periodo[]).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={periodo === p ? 'default' : 'ghost'}
                  onClick={() => setPeriodo(p)}
                  className={periodo === p ? 'bg-pink-500 hover:bg-pink-600 h-7 text-xs' : 'h-7 text-xs'}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={ventasPorDia} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatPrecio(Number(v))} labelStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pagos por método */}
        <Card>
          <CardHeader><CardTitle className="text-base">Métodos de pago (mes actual)</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : ventasPorMetodo.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={ventasPorMetodo} dataKey="total" nameKey="metodo" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {ventasPorMetodo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatPrecio(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top deudores */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top deudores</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : topDeudores.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Sin clientes con deuda</div>
            ) : (
              <div className="space-y-3">
                {topDeudores.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="text-sm font-medium text-gray-700">{c.nombre}</span>
                    </div>
                    <Badge variant="destructive">{formatPrecio(c.deuda_total)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top productos */}
      {topProductos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 productos vendidos (mes actual)</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProductos} layout="vertical" margin={{ top: 0, right: 30, left: 100, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill="#ec4899" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
