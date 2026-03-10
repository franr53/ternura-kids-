'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Search, Download, AlertTriangle } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

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
  producto?: { nombre: string; precio_venta: number }
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transfer.', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}

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
  const [buscado, setBuscado] = useState(false)

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
      .select('*, producto:productos(nombre, precio_venta)')
      .order('stock')
    const bajos = (all || []).filter((v: StockBajo) => v.stock <= v.stock_minimo)
    setStockBajo(bajos)
    setLoadingStock(false)
  }

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const porMetodo: Record<string, number> = {}
  ventas.forEach(v => v.pagos?.forEach(p => { porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto }))

  function exportarCSV() {
    if (ventas.length === 0) return
    const header = ['Fecha', 'Cliente', 'Total', 'Métodos de pago']
    const rows = ventas.map(v => [
      new Date(v.creado_en).toLocaleDateString('es-AR'),
      v.cliente?.nombre || 'Sin cliente',
      v.total,
      v.pagos?.map(p => `${METODO_LABELS[p.metodo] || p.metodo}: ${formatPrecio(p.monto)}`).join(' | ') || '',
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

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">Reportes</h1>

      {/* Filtro de fechas */}
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
              <Button onClick={exportarCSV} variant="outline" className="gap-2">
                <Download size={16} /> Exportar CSV
              </Button>
            )}
          </div>

          {buscado && (
            <>
              {/* Resumen */}
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

              {/* Tabla de ventas */}
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

      {/* Stock actual */}
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
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Producto</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Talle</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Stock</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Mínimo</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Precio</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockBajo.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{v.producto?.nombre}</td>
                      <td className="px-4 py-2.5 text-center"><Badge variant="outline">{v.talle}</Badge></td>
                      <td className="px-4 py-2.5 text-center font-bold">{v.stock}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{v.stock_minimo}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatPrecio(v.producto?.precio_venta || 0)}</td>
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
    </div>
  )
}
