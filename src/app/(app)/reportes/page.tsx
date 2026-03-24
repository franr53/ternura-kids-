'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Search, Download, FileSpreadsheet, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatPrecio, formatNombreConTalle } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface VentaReporte {
  id: string
  creado_en: string
  total: number
  cliente?: { nombre: string }
  pagos?: { metodo: string; monto: number }[]
}

interface StockBajo {
  id: string
  talle: string
  stock: number
  stock_minimo: number
  precio_venta: number
  producto?: { nombre_base: string }
}

interface VentaTemporada {
  total: number
  venta_items: { cantidad: number; subtotal: number; variante?: { producto?: { nombre_base: string } } }[]
}

interface TopProductoTemp {
  nombre: string
  cantidad: number
  total: number
}

interface RangoTemporada {
  label: string
  desde: string
  hasta: string
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transfer.', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}

function generarTemporadas(): RangoTemporada[] {
  const hoy = new Date()
  const añoActual = hoy.getFullYear()
  const result: RangoTemporada[] = []
  for (let año = añoActual; año >= añoActual - 2; año--) {
    result.push({
      label: `Invierno ${año}`,
      desde: `${año}-04-01`,
      hasta: `${año}-09-30`,
    })
    result.push({
      label: `Verano ${año}-${año + 1}`,
      desde: `${año}-10-01`,
      hasta: `${año + 1}-03-31`,
    })
  }
  return result.sort((a, b) => b.desde.localeCompare(a.desde))
}

const TEMPORADAS = generarTemporadas()

export default function ReportesPage() {
  const supabase = createClient()
  const hoy = new Date().toISOString().split('T')[0]
  const inicioMes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [ventas, setVentas] = useState<VentaReporte[]>([])
  const [stockBajo, setStockBajo] = useState<StockBajo[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [loadingStock, setLoadingStock] = useState(false)
  const [filtroTalleStock, setFiltroTalleStock] = useState('')
  const [buscado, setBuscado] = useState(false)

  // Temporadas
  const [temporadaSeleccionada, setTemporadaSeleccionada] = useState(TEMPORADAS[0]?.label || '')
  const [loadingTemp, setLoadingTemp] = useState(false)
  const [datosTemp, setDatosTemp] = useState<{ totalFacturado: number; unidades: number; topProductos: TopProductoTemp[]; totalAnterior: number; unidadesAnteriores: number } | null>(null)

  async function buscarVentas() {
    if (!desde || !hasta) { toast.error('Seleccioná las fechas'); return }
    setLoadingVentas(true)
    const { data, error } = await supabase
      .from('ventas')
      .select('*, cliente:clientes(nombre), pagos:venta_pagos(metodo, monto)')
      .eq('estado', 'completada')
      .gte('creado_en', `${desde}T00:00:00`)
      .lte('creado_en', `${hasta}T23:59:59`)
      .order('creado_en', { ascending: false })
    if (error) { toast.error('Error al buscar'); setLoadingVentas(false); return }
    setVentas(data || [])
    setBuscado(true)
    setLoadingVentas(false)
  }

  async function buscarStockBajo() {
    setLoadingStock(true)
    const { data: all } = await supabase
      .from('variantes')
      .select('*, producto:productos(nombre_base)')
      .order('stock')
    const bajos = (all || []).filter((v: StockBajo) => v.stock <= v.stock_minimo)
    setStockBajo(bajos)
    setLoadingStock(false)
  }

  async function buscarTemporada() {
    const temp = TEMPORADAS.find(t => t.label === temporadaSeleccionada)
    if (!temp) return
    setLoadingTemp(true)

    // Período actual
    const [{ data: ventasActuales }, { data: itemsActuales }] = await Promise.all([
      supabase.from('ventas').select('total').eq('estado', 'completada')
        .gte('creado_en', `${temp.desde}T00:00:00`)
        .lte('creado_en', `${temp.hasta}T23:59:59`),
      supabase.from('venta_items')
        .select('cantidad, subtotal, variante:variantes(producto:productos(nombre_base))')
        .gte('created_at', `${temp.desde}T00:00:00`)
        .lte('created_at', `${temp.hasta}T23:59:59`),
    ])

    // Período anterior (mismo temp, año anterior)
    const añoAnterior = (n: string) => {
      const d = new Date(n)
      d.setFullYear(d.getFullYear() - 1)
      return d.toISOString().split('T')[0]
    }
    const { data: ventasAnteriores } = await supabase.from('ventas').select('total').eq('estado', 'completada')
      .gte('creado_en', `${añoAnterior(temp.desde)}T00:00:00`)
      .lte('creado_en', `${añoAnterior(temp.hasta)}T23:59:59`)

    const totalFacturado = (ventasActuales || []).reduce((s: number, v: { total: number }) => s + v.total, 0)
    const unidades = (itemsActuales || []).reduce((s: number, i: { cantidad: number }) => s + i.cantidad, 0)
    const totalAnterior = (ventasAnteriores || []).reduce((s: number, v: { total: number }) => s + v.total, 0)

    // Top productos
    const porProd: Record<string, { cantidad: number; total: number }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(itemsActuales || []).forEach((item: any) => {
      const nombre = item.variante?.producto?.nombre_base || 'Sin nombre'
      if (!porProd[nombre]) porProd[nombre] = { cantidad: 0, total: 0 }
      porProd[nombre].cantidad += item.cantidad
      porProd[nombre].total += item.subtotal
    })
    const topProductos = Object.entries(porProd)
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .slice(0, 10)
      .map(([nombre, d]) => ({ nombre, ...d }))

    // Unidades anteriores aproximadas (solo contamos ventas anteriores)
    const unidadesAnteriores = 0 // no vamos a hacer otra query de items anterior para mantenerlo simple

    setDatosTemp({ totalFacturado, unidades, topProductos, totalAnterior, unidadesAnteriores })
    setLoadingTemp(false)
  }

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const porMetodo: Record<string, number> = {}
  ventas.forEach(v => v.pagos?.forEach(p => { porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto }))

  function exportarCSV() {
    if (ventas.length === 0) return
    const header = ['Fecha', 'Cliente', 'Total', 'Métodos de pago']
    const rows = ventas.map(v => [
      new Date(v.creado_en).toLocaleDateString('es-AR'),
      `"${v.cliente?.nombre || 'Sin cliente'}"`,
      v.total,
      `"${v.pagos?.map(p => `${METODO_LABELS[p.metodo] || p.metodo}: ${formatPrecio(p.monto)}`).join(' | ') || ''}"`,
    ])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${desde}_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportarExcel() {
    if (ventas.length === 0) return
    const XLSX = await import('xlsx')

    // Hoja 1: Detalle de ventas
    const detalle = ventas.map(v => ({
      Fecha: new Date(v.creado_en).toLocaleDateString('es-AR'),
      Hora: new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      Cliente: v.cliente?.nombre || 'Sin cliente',
      Total: v.total,
      'Métodos de pago': v.pagos?.map(p => `${METODO_LABELS[p.metodo] || p.metodo}: $${p.monto}`).join(' | ') || '',
    }))
    const wsDetalle = XLSX.utils.json_to_sheet(detalle)

    // Hoja 2: Resumen por método de pago
    const resumen = Object.entries(porMetodo).map(([metodo, total]) => ({
      Método: METODO_LABELS[metodo] || metodo,
      Total: total,
    }))
    resumen.push({ Método: 'TOTAL', Total: totalVentas })
    const wsResumen = XLSX.utils.json_to_sheet(resumen)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Ventas')
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')
    XLSX.writeFile(wb, `ventas_${desde}_${hasta}.xlsx`)
  }

  const diffPct = datosTemp && datosTemp.totalAnterior > 0
    ? ((datosTemp.totalFacturado - datosTemp.totalAnterior) / datosTemp.totalAnterior) * 100
    : null

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">Reportes</h1>

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">Ventas del período</TabsTrigger>
          <TabsTrigger value="temporadas">Por temporada</TabsTrigger>
          <TabsTrigger value="stock">Stock bajo</TabsTrigger>
        </TabsList>

        {/* Tab Ventas */}
        <TabsContent value="ventas" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ventas del período</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end flex-wrap">
                <div>
                  <Label>Desde</Label>
                  <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="mt-1 w-40" />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="mt-1 w-40" />
                </div>
                <Button onClick={buscarVentas} disabled={loadingVentas} className="bg-teal-500 hover:bg-teal-600 gap-2">
                  <Search size={16} /> {loadingVentas ? 'Buscando...' : 'Buscar'}
                </Button>
                {ventas.length > 0 && (
                  <>
                    <Button onClick={exportarCSV} variant="outline" className="gap-2">
                      <Download size={16} /> Exportar CSV
                    </Button>
                    <Button onClick={exportarExcel} variant="outline" className="gap-2">
                      <FileSpreadsheet size={16} /> Exportar Excel
                    </Button>
                  </>
                )}
              </div>

              {buscado && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <div className="bg-teal-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Total período</p>
                      <p className="text-xl font-bold text-teal-600">{formatPrecio(totalVentas)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">N° ventas</p>
                      <p className="text-xl font-bold text-gray-700">{ventas.length}</p>
                    </div>
                    {Object.entries(porMetodo).map(([metodo, total]) => (
                      <div key={metodo} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{METODO_LABELS[metodo] || metodo}</p>
                        <p className="text-xl font-bold text-gray-700">{formatPrecio(total)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Gráfico de ventas por día */}
                  {(() => {
                    const porDia: Record<string, number> = {}
                    ventas.forEach(v => {
                      const fecha = v.creado_en.split('T')[0]
                      porDia[fecha] = (porDia[fecha] || 0) + v.total
                    })
                    const dias = Object.keys(porDia).sort()
                    if (dias.length > 1) {
                      const chartData = dias.map(d => ({
                        fecha: d.slice(5),
                        total: porDia[d],
                      }))
                      return (
                        <div className="bg-gray-50 rounded-lg p-4 mt-2">
                          <p className="text-xs font-semibold text-gray-500 mb-3">Ventas por día</p>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                              <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                              <Tooltip formatter={(v) => [formatPrecio(Number(v)), 'Ventas']} contentStyle={{ borderRadius: '12px', border: '1px solid #f0f0f0', fontSize: 12 }} />
                              <Bar dataKey="total" fill="#4EC3BD" radius={[4, 4, 0, 0]} maxBarSize={24} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    }
                    return null
                  })()}

                  {ventas.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">No hay ventas en el período seleccionado</div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-3 text-gray-600 font-medium">Fecha</th>
                            <th className="text-left px-4 py-3 text-gray-600 font-medium">Cliente</th>
                            <th className="text-right px-4 py-3 text-gray-600 font-medium">Total</th>
                            <th className="text-left px-4 py-3 text-gray-600 font-medium">Métodos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {ventas.map(v => (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-600">
                                {new Date(v.creado_en).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                <span className="text-gray-400 text-xs ml-1">
                                  {new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-700">{v.cliente?.nombre || <span className="text-gray-400">Sin cliente</span>}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatPrecio(v.total)}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {v.pagos?.map((p, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">{METODO_LABELS[p.metodo] || p.metodo}</Badge>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Temporadas */}
        <TabsContent value="temporadas" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Análisis por temporada</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1 max-w-xs">
                  <Label>Temporada</Label>
                  <Select value={temporadaSeleccionada} onValueChange={v => { if (v) { setTemporadaSeleccionada(v); setDatosTemp(null) } }}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPORADAS.map(t => (
                        <SelectItem key={t.label} value={t.label}>
                          {t.label} <span className="text-gray-400 text-xs ml-1">({t.desde.slice(5)} → {t.hasta.slice(5)})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={buscarTemporada} disabled={loadingTemp} className="bg-teal-500 hover:bg-teal-600 gap-2">
                  <Search size={16} /> {loadingTemp ? 'Cargando...' : 'Ver temporada'}
                </Button>
              </div>

              {datosTemp && (
                <div className="space-y-4">
                  {/* KPIs de temporada */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-teal-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Total facturado</p>
                      <p className="text-2xl font-bold text-teal-700">{formatPrecio(datosTemp.totalFacturado)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
                      <p className="text-2xl font-bold text-gray-700">{datosTemp.unidades.toLocaleString('es-AR')}</p>
                    </div>
                    <div className={`rounded-lg p-4 ${diffPct === null ? 'bg-gray-50' : diffPct > 0 ? 'bg-green-50' : diffPct < 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">vs temporada anterior</p>
                      {diffPct === null ? (
                        <p className="text-lg font-bold text-gray-400">Sin datos</p>
                      ) : diffPct === 0 ? (
                        <p className="text-2xl font-bold text-gray-500 flex items-center gap-1"><Minus size={20} /> 0%</p>
                      ) : diffPct > 0 ? (
                        <p className="text-2xl font-bold text-green-600 flex items-center gap-1"><TrendingUp size={20} /> +{diffPct.toFixed(0)}%</p>
                      ) : (
                        <p className="text-2xl font-bold text-red-500 flex items-center gap-1"><TrendingDown size={20} /> {diffPct.toFixed(0)}%</p>
                      )}
                      {datosTemp.totalAnterior > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">Anterior: {formatPrecio(datosTemp.totalAnterior)}</p>
                      )}
                      {datosTemp.totalAnterior === 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">No hay datos del año anterior</p>
                      )}
                    </div>
                  </div>

                  {/* Top productos */}
                  {datosTemp.topProductos.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Top 10 productos de la temporada</p>
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-gray-600 font-medium">#</th>
                              <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Producto</th>
                              <th className="text-center px-4 py-2.5 text-gray-600 font-medium">Unidades</th>
                              <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Facturado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {datosTemp.topProductos.map((p, i) => (
                              <tr key={p.nombre} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-gray-400 text-xs w-8">{i + 1}</td>
                                <td className="px-4 py-2.5 font-medium text-gray-800">{p.nombre}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <Badge variant="secondary">{p.cantidad}</Badge>
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-700 font-semibold">{formatPrecio(p.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {datosTemp.totalFacturado === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      No hay ventas registradas en {temporadaSeleccionada}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Stock bajo */}
        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Stock bajo / sin stock</CardTitle>
                <Button onClick={buscarStockBajo} disabled={loadingStock} variant="outline" size="sm" className="gap-2">
                  <AlertTriangle size={14} /> {loadingStock ? 'Cargando...' : 'Ver stock bajo'}
                </Button>
              </div>
            </CardHeader>
            {stockBajo.length > 0 && (
              <CardContent>
                <div className="mb-3">
                  <Input
                    placeholder="Filtrar por talle..."
                    value={filtroTalleStock}
                    onChange={e => setFiltroTalleStock(e.target.value)}
                    className="w-32 text-sm"
                  />
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">Producto</th>
                        <th className="text-center px-4 py-3 text-gray-600 font-medium">Stock</th>
                        <th className="text-center px-4 py-3 text-gray-600 font-medium">Mínimo</th>
                        <th className="text-right px-4 py-3 text-gray-600 font-medium">Precio</th>
                        <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockBajo.filter(v => !filtroTalleStock.trim() || v.talle.toLowerCase().includes(filtroTalleStock.trim().toLowerCase())).map(v => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{formatNombreConTalle(v.producto?.nombre_base || '', v.talle)}</td>
                          <td className="px-4 py-2.5 text-center font-bold">{v.stock}</td>
                          <td className="px-4 py-2.5 text-center text-gray-500">{v.stock_minimo}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{formatPrecio(v.precio_venta || 0)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant={v.stock === 0 ? 'destructive' : 'outline'} className={v.stock === 0 ? '' : 'border-orange-300 text-orange-600'}>
                              {v.stock === 0 ? 'Sin stock' : 'Stock bajo'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
